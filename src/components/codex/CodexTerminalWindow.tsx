import React from "react";
import { FileText, FolderOpen, ListTodo, Save, Send, Sparkles, Square } from "lucide-react";
import type { CodexApprovalPolicy, CodexModelSummary, CodexSandboxPolicy, CodexSessionInfo, CodexThreadSummary, CodexUiActivity, CodexUiMessage, DesktopPetApi } from "../../../shared/types";
import { applyCodexThreadEventToSession, applyCodexUiEvent, getCodexActiveThreadSettings, getCodexEventThreadId, getCodexInputSuggestions, getNextCodexInputHistory, handleLocalCodexCommand, rememberCodexInput } from "../../utils/codexHelpers";
import { getWorkspaceSelectedText, isSelectionPopoverBlockedTarget } from "../../utils/domHelpers";
import { MarkdownText } from "./MarkdownText";
import { CodexRequestCard } from "./CodexRequestCard";
import { CodexResumePicker, CodexSuggestionPicker, CodexThinkingMessage, CodexThreadBadges } from "./CodexUIComponents";

export function CodexTerminalWindow({
  api,
  sessionId,
  initialPrompt,
  initialDraft,
  sandbox,
  approval,
  themeStyle
}: {
  api?: DesktopPetApi;
  sessionId: string;
  initialPrompt: string;
  initialDraft: string;
  sandbox: CodexSandboxPolicy;
  approval: CodexApprovalPolicy;
  themeStyle: React.CSSProperties;
}) {
  const startedRef = React.useRef(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const activeThreadIdRef = React.useRef<string | undefined>(undefined);
  const [session, setSession] = React.useState<CodexSessionInfo | null>(null);
  const [status, setStatus] = React.useState<"starting" | "running" | "exited" | "error">("starting");
  const [statusText, setStatusText] = React.useState("正在启动 Codex...");
  const [saving, setSaving] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [inputHistory, setInputHistory] = React.useState<string[]>([]);
  const [inputHistoryIndex, setInputHistoryIndex] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<CodexUiMessage[]>([]);
  const [activity, setActivity] = React.useState<CodexUiActivity[]>([]);
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
    if (initialDraft && !input.trim()) setInput(initialDraft);
  }, [initialDraft]);

  React.useEffect(() => {
    if (!api || !sessionId) return;
    let disposed = false;
    void api.codex.getSession(sessionId).then((info) => {
      if (!disposed) {
        setSession(info);
        activeThreadIdRef.current = info.activeThreadId;
        setMessages(info.history?.messages ?? []);
        setActivity(info.history?.activity ?? []);
      }
    }).catch((error) => {
      if (!disposed) {
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "读取会话失败。");
      }
    });
    return () => {
      disposed = true;
    };
  }, [api, sessionId]);

  React.useEffect(() => {
    if (!api || !sessionId || (!messages.length && !activity.length)) return;
    const timeout = window.setTimeout(() => {
      void api.codex.updateSessionHistory(sessionId, { messages, activity }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [api, sessionId, messages, activity]);

  React.useEffect(() => {
    if (!api || startedRef.current) return;
    startedRef.current = true;
    void api.codex.startSession(sessionId, { initialPrompt, sandbox, approval })
      .then(() => {
        setStatus("running");
        setStatusText("Codex 已连接");
        void api.codex.listModels(sessionId).then(setModels).catch(() => undefined);
      })
      .catch((error) => {
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "Codex 启动失败。");
      });
  }, [api, approval, initialPrompt, sandbox, sessionId]);

  React.useEffect(() => {
    if (!api) return;
    const off = api.events.onCodexEvent((event) => {
      if (event.sessionId !== sessionId) return;
      const eventThreadId = getCodexEventThreadId(event.payload);
      if (event.kind === "thread" && eventThreadId) {
        activeThreadIdRef.current = eventThreadId;
        setSession((current) => current ? applyCodexThreadEventToSession(current, event.payload, eventThreadId) : current);
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
  }, [api, session?.activeThreadId, sessionId]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, activity.length, requests.length, responding]);

  async function saveSession() {
    if (!api || saving || !session) return;
    setSaving(true);
    try {
      await api.codex.updateSessionHistory(session.id, { messages, activity });
      const next = await api.codex.saveSession(session.id);
      setSession(next);
      setStatusText("会话已保存");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "保存会话失败。");
    } finally {
      setSaving(false);
    }
  }

  async function stopSession() {
    if (!api || !session) return;
    await api.codex.stopSession(session.id);
  }

  async function newThread() {
    if (!api || !session) return;
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
      setStatus("running");
      setStatusText("新 Thread 已创建");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "新建 Thread 失败。");
    }
  }

  async function openResumePicker() {
    if (!api || !session) return;
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
    if (!api || !session) return;
    setResumeBusy(true);
    setStatus("starting");
    setStatusText("正在切换 Thread...");
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
      setStatusText("Thread 已切换");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "切换 Thread 失败。");
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
      setResponding(true);
      await api.codex.sendInput(sessionId, text);
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "发送失败。");
    }
  }

  async function resolveRequest(requestId: number | string, response: unknown) {
    if (!api) return;
    await api.codex.respondRequest(sessionId, requestId, response);
    setRequests((current) => current.filter((request) => request.id !== requestId));
  }

  return (
    <main
      className="codex-window"
      style={themeStyle}
      onMouseUpCapture={(event) => {
        if (isSelectionPopoverBlockedTarget(event.target)) return;
        window.setTimeout(() => {
          const capture = getWorkspaceSelectedText();
          if (!capture) return;
          void api?.selection.openCapturePopover(capture.text, event.clientX, event.clientY).catch(() => undefined);
        }, 0);
      }}
      onKeyUpCapture={(event) => {
        if (isSelectionPopoverBlockedTarget(event.target)) return;
        window.setTimeout(() => {
          const capture = getWorkspaceSelectedText();
          if (!capture) return;
          const rect = capture.rect;
          void api?.selection.openCapturePopover(
            capture.text,
            rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
            rect ? rect.bottom : window.innerHeight / 2
          ).catch(() => undefined);
        }, 0);
      }}
    >
      <header className="codex-window-header">
        <div>
          <strong>Linnea Codex</strong>
          <span>{session?.workspacePath ?? "加载工作目录..."}</span>
        </div>
        <div className={`codex-status ${status}`}>{statusText}</div>
        <CodexThreadBadges settings={activeSettings} models={models} />
      </header>
      <section className="codex-window-body">
        <aside className="codex-session-panel">
          <strong>{session?.copiedItems.length ? "副本文件" : "临时提问"}</strong>
          <div className="codex-session-items">
            {session?.copiedItems.map((item) => (
              <div key={item.copiedPath}>
                <FileText size={13} />
                <span>{item.copiedName}</span>
              </div>
            )) ?? <span>加载中...</span>}
          </div>
          <div className="codex-session-meta">
            <span>Sandbox: {sandbox}</span>
            <span>Approval: {approval}</span>
            {session?.savedPath && <span>已保存: {session.savedPath}</span>}
          </div>
          <button type="button" onClick={() => session && void api?.codex.openWorkspace(session.id)} disabled={!session}>
            <FolderOpen size={14} /> 打开目录
          </button>
          <button type="button" onClick={() => void saveSession()} disabled={!session || session.saved || saving}>
            <Save size={14} /> {session?.saved ? "已保存" : saving ? "保存中..." : "保存会话"}
          </button>
          <button type="button" onClick={() => void openResumePicker()} disabled={!session || status === "starting"}>
            <ListTodo size={14} /> 线程
          </button>
          <button type="button" onClick={() => void newThread()} disabled={!session || status === "starting"}>
            <Sparkles size={14} /> 新建 Thread
          </button>
          <button type="button" onClick={() => void stopSession()} disabled={!session || status !== "running"}>
            <Square size={14} /> 停止
          </button>
        </aside>
        <section className="codex-conversation">
          <div className="codex-message-list">
            {messages.length === 0 && activity.length === 0 && <div className="codex-empty">Codex 正在准备会话。</div>}
            {messages.map((message) => (
              <div key={message.id} className={`codex-chat-message ${message.role}`}>
                <strong>{message.role === "user" ? "你" : message.role === "assistant" ? "Codex" : "系统"}</strong>
                <MarkdownText text={message.text} />
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
                    <strong>{item.title}</strong>
                    {item.status && <span>{item.status}</span>}
                    {item.text && <pre>{item.text}</pre>}
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
              <button type="submit" disabled={!input.trim() || status === "error"}>
                <Send size={16} />
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
