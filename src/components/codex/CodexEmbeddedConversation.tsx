import React from "react";
import { FolderOpen, ListTodo, Send, Sparkles, Square } from "lucide-react";
import type { CodexApprovalPolicy, CodexModelSummary, CodexSandboxPolicy, CodexSessionInfo, CodexThreadSummary, CodexUiActivity, CodexUiMessage, DesktopPetApi } from "../../../shared/types";
import { applyCodexThreadEventToSession, applyCodexUiEvent, getCodexActiveThreadSettings, getCodexEventThreadId, getCodexInputSuggestions, getNextCodexInputHistory, handleLocalCodexCommand, rememberCodexInput, resolveCodexDisplayPath } from "../../utils/codexHelpers";
import { MarkdownText } from "./MarkdownText";
import { CodexRequestCard } from "./CodexRequestCard";
import { ActivityItemContent, CodexResumePicker, CodexSuggestionPicker, CodexThinkingMessage, CodexThreadBadges } from "./CodexUIComponents";

export function CodexEmbeddedConversation({
  api,
  sessionInfo,
  sandbox,
  approval,
  onSessionChange
}: {
  api?: DesktopPetApi;
  sessionInfo: CodexSessionInfo;
  sandbox: CodexSandboxPolicy;
  approval: CodexApprovalPolicy;
  onSessionChange(session: CodexSessionInfo): void;
}) {
  const startedRef = React.useRef(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const activeThreadIdRef = React.useRef<string | undefined>(sessionInfo.activeThreadId);
  const [session, setSession] = React.useState(sessionInfo);
  const [status, setStatus] = React.useState<"starting" | "running" | "exited" | "error">("starting");
  const [statusText, setStatusText] = React.useState("Codex 未启动");
  const [input, setInput] = React.useState("");
  const [inputHistory, setInputHistory] = React.useState<string[]>([]);
  const [inputHistoryIndex, setInputHistoryIndex] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<CodexUiMessage[]>(sessionInfo.history?.messages ?? []);
  const [activity, setActivity] = React.useState<CodexUiActivity[]>(sessionInfo.history?.activity ?? []);
  const [requests, setRequests] = React.useState<Array<{ id: number | string; method: string; params: any }>>([]);
  const [rawEvents, setRawEvents] = React.useState<string[]>([]);
  const [responding, setResponding] = React.useState(false);
  const [models, setModels] = React.useState<CodexModelSummary[]>([]);
  const [resumeThreads, setResumeThreads] = React.useState<CodexThreadSummary[]>([]);
  const [resumeBusy, setResumeBusy] = React.useState(false);
  const [resumeIndex, setResumeIndex] = React.useState(0);
  const [suggestionIndex, setSuggestionIndex] = React.useState(0);
  const suggestions = getCodexInputSuggestions(input, session, models);
  const activeSettings = getCodexActiveThreadSettings(session);

  React.useEffect(() => {
    setSuggestionIndex(0);
  }, [input, suggestions.length]);

  React.useEffect(() => {
    setSession(sessionInfo);
    activeThreadIdRef.current = sessionInfo.activeThreadId;
    setMessages(sessionInfo.history?.messages ?? []);
    setActivity(sessionInfo.history?.activity ?? []);
    setRequests([]);
    setRawEvents([]);
    setResponding(false);
    setStatus("starting");
    setStatusText("Codex 未启动");
    startedRef.current = false;
  }, [sessionInfo.id]);

  React.useEffect(() => {
    if (!api || startedRef.current) return;
    startedRef.current = true;
    void api.codex.startSession(session.id, { sandbox, approval })
      .then(() => {
        setStatus("running");
        setStatusText("Codex 已连接");
        void api.codex.listModels(session.id).then(setModels).catch(() => undefined);
      })
      .catch((error) => {
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "Codex 启动失败。");
      });
  }, [api, approval, sandbox, session.id]);

  React.useEffect(() => {
    if (!api || (!messages.length && !activity.length)) return;
    const timeout = window.setTimeout(() => {
      void api.codex.updateSessionHistory(session.id, { messages, activity }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [api, session.id, messages, activity]);

  React.useEffect(() => {
    if (!api) return;
    const off = api.events.onCodexEvent((event) => {
      if (event.sessionId !== session.id) return;
      const eventThreadId = getCodexEventThreadId(event.payload);
      if (event.kind === "thread" && eventThreadId) {
        activeThreadIdRef.current = eventThreadId;
        setSession((current) => applyCodexThreadEventToSession(current, event.payload, eventThreadId));
      }
      const activeThreadId = activeThreadIdRef.current;
      if (eventThreadId && activeThreadId && eventThreadId !== activeThreadId) return;
      applyCodexUiEvent(event.kind, event.payload, {
        setMessages,
        setActivity,
        setRequests,
        setRawEvents,
        setStatus,
        setStatusText,
        setResponding
      });
    });
    return off;
  }, [api, session.id]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, activity.length, requests.length, responding]);

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!api || !text) return;
    setInput("");
    rememberCodexInput(text, setInputHistory);
    setInputHistoryIndex(null);
    try {
      if (text === "/resume") {
        await openResumePicker();
        return;
      }
      const handledCommand = await handleLocalCodexCommand({
        api,
        session,
        text,
        models,
        setSession: (next) => setSession(next),
        setStatusText
      });
      if (handledCommand) return;
      if (status !== "running") {
        setStatus("starting");
        setStatusText("正在重新连接 Codex...");
        await api.codex.startSession(session.id, { sandbox, approval });
        setStatus("running");
        setStatusText("Codex 已连接");
      }
      setResponding(true);
      await api.codex.sendInput(session.id, text);
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "发送失败。");
    }
  }

  async function openResumePicker() {
    if (!api) return;
    setResumeBusy(true);
    setStatusText("正在读取可恢复线程...");
    try {
      await api.codex.updateSessionHistory(session.id, { messages, activity });
      const threads = await api.codex.listThreads(session.id);
      setResumeThreads(threads);
      setResumeIndex(0);
      setStatusText(threads.length ? "选择要恢复的线程" : "没有找到可恢复线程");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "读取可恢复线程失败。");
    } finally {
      setResumeBusy(false);
    }
  }

  async function resumeThread(threadId: string) {
    if (!api) return;
    setResumeBusy(true);
    setStatus("starting");
    setStatusText("正在恢复线程...");
    try {
      const next = await api.codex.resumeThread(session.id, threadId);
      activeThreadIdRef.current = next.activeThreadId;
      setSession(next);
      setMessages(next.history?.messages ?? []);
      setActivity(next.history?.activity ?? []);
      setRequests([]);
      setRawEvents([]);
      setResumeThreads([]);
      setStatus("running");
      setStatusText("线程已恢复");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "恢复线程失败。");
    } finally {
      setResumeBusy(false);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (resumeThreads.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setResumeIndex((current) => Math.min(resumeThreads.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setResumeIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const thread = resumeThreads[resumeIndex];
        if (thread) void resumeThread(thread.id);
      } else if (event.key === "Escape") {
        setResumeThreads([]);
      }
      return;
    }
    if (suggestions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestionIndex((current) => Math.min(suggestions.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestionIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        const suggestion = suggestions[suggestionIndex] ?? suggestions[0];
        if (suggestion) {
          setInput(suggestion.value);
          setInputHistoryIndex(null);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setInput("");
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const next = getNextCodexInputHistory(inputHistory, inputHistoryIndex, event.key === "ArrowUp" ? -1 : 1);
      if (next) {
        event.preventDefault();
        setInputHistoryIndex(next.index);
        setInput(next.value);
      }
    }
  }

  async function resolveRequest(requestId: number | string, response: unknown) {
    if (!api) return;
    await api.codex.respondRequest(session.id, requestId, response);
    setRequests((current) => current.filter((request) => request.id !== requestId));
  }

  async function openWorkspace() {
    if (!api) return;
    await api.codex.openWorkspace(session.id);
  }

  async function newThread() {
    if (!api) return;
    if (messages.length === 0 && activity.length === 0) {
      setStatusText("当前 Thread 还是空的");
      return;
    }
    setStatus("starting");
    setStatusText("正在新建 Thread...");
    try {
      await api.codex.updateSessionHistory(session.id, { messages, activity });
      const next = await api.codex.newThread(session.id);
      activeThreadIdRef.current = next.activeThreadId;
      setSession(next);
      setMessages([]);
      setActivity([]);
      setRequests([]);
      setRawEvents([]);
      setResumeThreads([]);
      setStatus("running");
      setStatusText("新 Thread 已创建");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "新建 Thread 失败。");
    }
  }

  async function stopSession() {
    if (!api) return;
    await api.codex.stopSession(session.id);
    setStatus("exited");
    setStatusText("Codex 已停止");
  }

  const handleOpenPath = React.useCallback((path: string) => {
    if (!api?.app.openPath) {
      setStatusText("当前窗口没有可用的打开路径 API，请重启应用。");
      return;
    }
    const targetPath = resolveCodexDisplayPath(path, session.workspacePath);
    void api.app.openPath(targetPath).then((result) => {
      if (!result.ok) setStatusText(result.message ?? "打开路径失败。");
    }).catch((error) => {
      setStatusText(error instanceof Error ? error.message : "打开路径失败。");
    });
  }, [api, session.workspacePath]);

  React.useEffect(() => {
    onSessionChange({ ...session, history: { messages, activity } });
  }, [activity, messages, onSessionChange, session]);

  return (
    <div className="codex-embedded">
      <header className="codex-embedded-header">
        <div>
          <strong>{session.copiedItems[0]?.copiedName ?? "Codex 对话"}</strong>
          <span>{session.workspacePath}</span>
        </div>
        <div className="codex-embedded-actions">
          <CodexThreadBadges settings={activeSettings} models={models} />
          <button type="button" onClick={() => void openWorkspace()}><FolderOpen size={14} /> 打开目录</button>
          <button type="button" onClick={() => void openResumePicker()} disabled={status === "starting"}><ListTodo size={14} /> 线程</button>
          <button type="button" onClick={() => void newThread()} disabled={status === "starting"}><Sparkles size={14} /> 新建 Thread</button>
          <button type="button" onClick={() => void stopSession()} disabled={status !== "running"}><Square size={14} /> 停止</button>
          <span className={`codex-status ${status}`}>{statusText}</span>
        </div>
      </header>
      <div className="codex-message-list">
        {messages.length === 0 && activity.length === 0 && <div className="codex-empty">输入指令后开始和 Codex 对话。</div>}
        {messages.map((message) => (
          <div key={message.id} className={`codex-chat-message ${message.role}`}>
            <strong>{message.role === "user" ? "你" : message.role === "assistant" ? "Codex" : "系统"}</strong>
            <MarkdownText text={message.text} onOpenPath={handleOpenPath} />
          </div>
        ))}
        {requests.map((request) => (
          <CodexRequestCard key={request.id} request={request} onResolve={(response) => void resolveRequest(request.id, response)} />
        ))}
        {responding && <CodexThinkingMessage />}
        <details className="codex-activity-log">
          <summary>活动详情 {activity.length ? `(${activity.length})` : ""}</summary>
          <div>
            {activity.length === 0 ? <span>暂无命令或文件活动。</span> : activity.map((item) => (
              <div key={item.id} className={`codex-activity ${item.type}`}>
                <div className="codex-activity-header">
                  <strong>{item.title}</strong>
                  {item.status && <span className={`codex-activity-status ${item.status}`}>{item.status}</span>}
                </div>
                <ActivityItemContent item={item} workspacePath={session.workspacePath} onOpenPath={handleOpenPath} />
              </div>
            ))}
          </div>
        </details>
        <details className="codex-raw-log">
          <summary>调试事件</summary>
          <pre>{rawEvents.slice(-40).join("\n\n")}</pre>
        </details>
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>
      <form className="codex-composer" onSubmit={sendMessage}>
        {resumeThreads.length > 0 && (
          <CodexResumePicker
            threads={resumeThreads}
            busy={resumeBusy}
            activeIndex={resumeIndex}
            onHover={setResumeIndex}
            onResume={(threadId) => void resumeThread(threadId)}
            onClose={() => setResumeThreads([])}
          />
        )}
        {suggestions.length > 0 && (
          <CodexSuggestionPicker
            suggestions={suggestions}
            activeIndex={suggestionIndex}
            onHover={setSuggestionIndex}
            onApply={(suggestion) => {
              setInput(suggestion.value);
              setInputHistoryIndex(null);
            }}
          />
        )}
        <div>
          <textarea value={input} rows={Math.min(10, Math.max(2, input.split(/\r?\n/).length))} onKeyDown={handleComposerKeyDown} onChange={(event) => {
            setInput(event.target.value);
            setInputHistoryIndex(null);
          }} placeholder="输入指令，支持 /model、/review、/compact、@文件名..." />
          <button type="submit" disabled={!input.trim() || status === "starting"}>
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
