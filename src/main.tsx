import React from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, BarChart3, Bell, CalendarDays, Check, Clock, FileText, FolderOpen, Image as ImageIcon, Inbox, KeyRound, Languages, ListTodo, MessageCircle, Paperclip, Pencil, RotateCcw, Save, Search, Send, Settings, Sparkles, Square, Tag, Trash2, X } from "lucide-react";
import type { AppSettings, CodexApprovalPolicy, CodexDropItem, CodexModelSummary, CodexReasoningEffort, CodexSandboxPolicy, CodexSavedSession, CodexSessionInfo, CodexThreadSettings, CodexThreadSummary, CodexUiActivity, CodexUiMessage, ConversationMessage, DesktopPetApi, PetMood, PlanProposal, ReminderItem, SelectionAskDraft, SelectionCapture, SelectionTextResult, TodoCandidate, TodoItem, TodoPriority } from "../shared/types";
import confusedImage from "./assets/pet/linnea_state/_Confused_.png";
import draggingImage from "./assets/pet/linnea_state/_Dragging_.png";
import happyImage from "./assets/pet/linnea_state/_Happy_.png";
import idleImage from "./assets/pet/linnea_state/_Idle_.png";
import reminderImage from "./assets/pet/linnea_state/_Reminder_.png";
import restImage from "./assets/pet/linnea_state/_Rest_.png";
import sleepyImage from "./assets/pet/linnea_state/_Sleepy_.png";
import talkingImage from "./assets/pet/linnea_state/_Talking_.png";
import thinkingImage from "./assets/pet/linnea_state/_Thinking_.png";
import urgentImage from "./assets/pet/linnea_state/_Urgent_.png";
import "./styles.css";

type PetVisualState = PetMood | "confused" | "dragging" | "urgent" | "rest" | "sleepy";
type LocalPetMood = PetMood | "confused";
type SelectionAction = "summarize" | "translate" | "todo" | "ask" | "ask-submit";

const petStateImages: Record<PetVisualState, string> = {
  idle: idleImage,
  talking: talkingImage,
  happy: happyImage,
  thinking: thinkingImage,
  reminder: reminderImage,
  confused: confusedImage,
  dragging: draggingImage,
  urgent: urgentImage,
  rest: restImage,
  sleepy: sleepyImage
};

const workspaceThemePresets = ["#5aa982", "#4d8fc8", "#d59a3a", "#c56c86", "#8a75c9", "#5c8f7a"];
const codexSlashCommands = [
  { command: "/permissions", description: "检查或调整 Codex 能做什么。" },
  { command: "/sandbox-add-read-dir", description: "把文件夹加入只读访问范围。" },
  { command: "/agent", description: "创建或管理自定义 agent。" },
  { command: "/apps", description: "连接并使用外部应用。" },
  { command: "/plugins", description: "列出或加载插件。" },
  { command: "/clear", description: "清空当前上下文。" },
  { command: "/compact", description: "压缩上下文，保留摘要继续会话。" },
  { command: "/copy", description: "复制最近一条 Codex 回复。" },
  { command: "/diff", description: "查看工作区差异。" },
  { command: "/exit", description: "退出 Codex。" },
  { command: "/experimental", description: "查看实验功能。" },
  { command: "/feedback", description: "发送反馈。" },
  { command: "/init", description: "生成或更新 AGENTS.md。" },
  { command: "/logout", description: "退出登录。" },
  { command: "/mcp", description: "查看 MCP 服务和工具。" },
  { command: "/mention", description: "打开文件选择器并引用文件。" },
  { command: "/model", description: "切换模型和推理强度。" },
  { command: "/fast", description: "切换到低推理模型。" },
  { command: "/plan", description: "进入计划模式。" },
  { command: "/personality", description: "切换回复风格。" },
  { command: "/ps", description: "查看后台 agent 任务。" },
  { command: "/stop", description: "停止当前响应。" },
  { command: "/fork", description: "从当前点 fork 会话。" },
  { command: "/side", description: "开启 side task。" },
  { command: "/resume", description: "打开会话选择器恢复会话。" },
  { command: "/new", description: "开始新会话。" },
  { command: "/quit", description: "退出 Codex。" },
  { command: "/review", description: "让 Codex 审查当前改动。" },
  { command: "/status", description: "显示当前会话和配置。" },
  { command: "/debug-config", description: "输出调试配置。" },
  { command: "/statusline", description: "管理 statusline。" },
  { command: "/title", description: "设置会话标题。" },
  { command: "/keymap", description: "打开快捷键帮助。" }
];
const aiProviderPresets: Record<AppSettings["aiProvider"], { label: string; baseUrl: string; model: string }> = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  custom: { label: "自定义提供商", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }
};

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const windowMode = searchParams.get("window");
  const isWorkspaceWindow = windowMode === "workspace";
  const isSelectionResultWindow = windowMode === "selection-result";
  const isSelectionPopoverWindow = windowMode === "selection-popover";
  const isCodexWindow = windowMode === "codex";
  const selectionResultId = searchParams.get("id") ?? "";
  const selectionCaptureId = searchParams.get("id") ?? "";
  const selectionPopoverPlacement = searchParams.get("placement") === "left" ? "left" : "right";
  const codexSessionId = searchParams.get("id") ?? "";
  const codexInitialPrompt = searchParams.get("prompt") ?? "";
  const codexInitialDraft = searchParams.get("draft") ?? "";
  const codexInitialSandbox = normalizeCodexSandbox(searchParams.get("sandbox"));
  const codexInitialApproval = normalizeCodexApproval(searchParams.get("approval"));
  const api = window.desktopPet;
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [todos, setTodos] = React.useState<TodoItem[]>([]);
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [input, setInput] = React.useState("");
  const [mood, setMood] = React.useState<LocalPetMood>("idle");
  const [chatOpen, setChatOpen] = React.useState(false);
  const [bubble, setBubble] = React.useState("今天也一起把事情整理清楚。");
  const [busy, setBusy] = React.useState(false);
  const [pendingPlan, setPendingPlan] = React.useState<PlanProposal | null>(null);
  const [planBusy, setPlanBusy] = React.useState(false);
  const [thinkingPlaceholder, setThinkingPlaceholder] = React.useState<ConversationMessage | null>(null);
  const [miniMessage, setMiniMessage] = React.useState<ConversationMessage | null>(null);
  const [activeReminder, setActiveReminder] = React.useState<ReminderItem | null>(null);
  const [focusedTodoId, setFocusedTodoId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState("");
  const [now, setNow] = React.useState(() => Date.now());
  const [dragging, setDragging] = React.useState(false);
  const [codexDragActive, setCodexDragActive] = React.useState(false);
  const [codexBasketOpen, setCodexBasketOpen] = React.useState(false);
  const [codexItems, setCodexItems] = React.useState<CodexDropItem[]>([]);
  const [codexSandbox, setCodexSandbox] = React.useState<CodexSandboxPolicy>("workspace-write");
  const [codexApproval, setCodexApproval] = React.useState<CodexApprovalPolicy>("on-request");
  const [codexCreateBusy, setCodexCreateBusy] = React.useState(false);
  const [codexError, setCodexError] = React.useState("");
  const [lastInteractionAt, setLastInteractionAt] = React.useState(() => Date.now());
  const clickTimerRef = React.useRef<number | null>(null);
  const miniCloseTimerRef = React.useRef<number | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const miniInputRef = React.useRef<HTMLInputElement | null>(null);
  const pointerStartRef = React.useRef<{ screenX: number; screenY: number } | null>(null);
  const didDragRef = React.useRef(false);
  const hasOverdueOpenTodo = React.useMemo(
    () => todos.some((todo) => isOverdueOpenTodo(todo, now)),
    [todos, now]
  );
  const visualState = React.useMemo(
    () => getPetVisualState({
      mood,
      dragging,
      hasOverdueOpenTodo,
      idleMs: now - lastInteractionAt,
      chatOpen
    }),
    [chatOpen, dragging, hasOverdueOpenTodo, lastInteractionAt, mood, now]
  );
  const themeStyle = React.useMemo(
    () => createWorkspaceThemeStyle(settings?.workspaceThemeColor),
    [settings?.workspaceThemeColor]
  );
  const currentPetImages = React.useMemo(
    () => mergePetImages(settings?.petAppearance?.images),
    [settings?.petAppearance?.images]
  );

  React.useEffect(() => {
    if (!api || (!isSelectionResultWindow && !isSelectionPopoverWindow && !isCodexWindow)) return;
    void api.settings.get().then(setSettings).catch(() => {
      // Keep the default theme if settings cannot be read in a transient utility window.
    });
  }, [api, isCodexWindow, isSelectionPopoverWindow, isSelectionResultWindow]);

  if (isSelectionResultWindow) {
    return <SelectionResultWindow api={api} resultId={selectionResultId} themeStyle={themeStyle} />;
  }

  if (isSelectionPopoverWindow) {
    return <GlobalSelectionPopoverWindow api={api} captureId={selectionCaptureId} placement={selectionPopoverPlacement} themeStyle={themeStyle} />;
  }

  if (isCodexWindow) {
    return (
      <CodexTerminalWindow
        api={api}
        sessionId={codexSessionId}
        initialPrompt={codexInitialPrompt}
        initialDraft={codexInitialDraft}
        sandbox={codexInitialSandbox}
        approval={codexInitialApproval}
        themeStyle={themeStyle}
      />
    );
  }

  function markInteraction() {
    setLastInteractionAt(Date.now());
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 1800);
  }

  function scheduleMiniClose(delay = 3000) {
    if (miniCloseTimerRef.current) window.clearTimeout(miniCloseTimerRef.current);
    miniCloseTimerRef.current = window.setTimeout(() => {
      setChatOpen(false);
      setMiniMessage(null);
      miniCloseTimerRef.current = null;
    }, delay);
  }

  const refreshSnapshot = React.useCallback(async () => {
    if (!api) return;
    const snapshot = await api.app.snapshot();
    setMessages(snapshot.messages);
    setTodos(snapshot.todos);
    setSettings(snapshot.settings);
  }, [api]);

  React.useEffect(() => {
    if (!api) {
      setBubble("桌宠界面已加载，但 Electron preload API 暂未就绪。");
      return;
    }
    void refreshSnapshot();
    return api.events.onReminderFired((reminder) => {
      markInteraction();
      setMood("reminder");
      setActiveReminder(reminder.todoId ? reminder : null);
      setBubble(reminder.message);
      setMiniMessage(null);
      setChatOpen(false);
      void api.todo.list().then(setTodos);
      void api.reminder.list();
    });
  }, [api, refreshSnapshot]);

  React.useEffect(() => {
    if (!api) return;
    return api.events.onSnapshotUpdated(() => {
      void refreshSnapshot();
    });
  }, [api, refreshSnapshot]);

  React.useEffect(() => {
    if (isWorkspaceWindow || dragging || !chatOpen || input.trim() || busy || activeReminder || miniMessage?.taskDraftProposal) return;
    const timer = window.setTimeout(() => setChatOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [activeReminder, busy, chatOpen, dragging, input, isWorkspaceWindow, miniMessage?.taskDraftProposal]);

  React.useEffect(() => {
    if (!api || !isWorkspaceWindow) return;
    return api.events.onTodoFocus((todoId) => {
      setFocusedTodoId(todoId);
    });
  }, [api, isWorkspaceWindow]);

  React.useEffect(() => {
    if (isWorkspaceWindow || !api || dragging) return;
    void api.app.setPetWindowExpanded(chatOpen || codexBasketOpen);
  }, [api, chatOpen, codexBasketOpen, dragging, isWorkspaceWindow]);

  React.useEffect(() => {
    return () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
      if (miniCloseTimerRef.current) window.clearTimeout(miniCloseTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (mood === "idle" || mood === "thinking") return;
    const duration = getTransientMoodDuration(mood);
    const timer = window.setTimeout(() => {
      setMood((current) => (current === mood ? "idle" : current));
    }, duration);
    return () => window.clearTimeout(timer);
  }, [mood]);

  async function sendText(text: string, placeholderText = "我在整理你刚刚说的内容...") {
    if (!text || busy) return;
    setBusy(true);
    if (!isWorkspaceWindow) {
      setMiniMessage(null);
      if (miniCloseTimerRef.current) {
        window.clearTimeout(miniCloseTimerRef.current);
        miniCloseTimerRef.current = null;
      }
    }
    markInteraction();
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, userMessage]);
    const placeholder: ConversationMessage = {
      id: `thinking-${crypto.randomUUID()}`,
      role: "assistant",
      text: placeholderText,
      createdAt: new Date().toISOString()
    };
    setThinkingPlaceholder(placeholder);
    setMood("thinking");
    setBubble(placeholderText);
    try {
      if (!api) {
        const assistantMessage: ConversationMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "界面已显示，但桌面端 API 未连接。请重启 npm run dev。",
          createdAt: new Date().toISOString()
        };
        setMessages((current) => [...current, assistantMessage]);
        setMood("idle");
        setBubble(assistantMessage.text);
        if (!isWorkspaceWindow) setMiniMessage(assistantMessage);
        return;
      }
      const result = await api.chat.sendMessage(text);
      setMessages(await api.chat.listMessages());
      setMood(result.mood);
      setBubble(result.assistantMessage.text);
      if (!isWorkspaceWindow) setMiniMessage(result.assistantMessage);
      setPendingPlan(null);
    } catch (error) {
      setMood("confused");
      setBubble(error instanceof Error ? error.message : "对话失败，请稍后再试。");
    } finally {
      setThinkingPlaceholder(null);
      setBusy(false);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendText(text);
  }

  React.useEffect(() => {
    if (!api || !isWorkspaceWindow) return;
    return api.events.onSelectedTextTodo((text) => {
      void sendText(
        `请根据下面这段从全局选区捕获的文字生成待办。如果它是复杂目标，请拆成可确认的计划步骤；如果只是单个事项，请生成一条待办：\n\n${text}`,
        "我在从选中文字里整理待办..."
      );
    });
  }, [api, isWorkspaceWindow, busy]);

  React.useEffect(() => {
    if (!api || isWorkspaceWindow) return;
    return api.events.onQuickAiRecord(() => {
      markInteraction();
      setChatOpen(true);
      setMiniMessage(null);
      setMood("talking");
      setBubble("要记录什么？直接告诉我。");
      window.setTimeout(() => miniInputRef.current?.focus(), 80);
    });
  }, [api, isWorkspaceWindow]);

  React.useEffect(() => {
    if (!settings) return;
    setCodexSandbox(settings.codexDefaultSandbox);
    setCodexApproval(settings.codexDefaultApproval);
  }, [settings?.codexDefaultApproval, settings?.codexDefaultSandbox]);

  async function toggleTodo(todo: TodoItem) {
    if (!api) return;
    markInteraction();
    const status = todo.status === "done" ? "open" : "done";
    const updated = await api.todo.update(todo.id, {
      status,
      completedAt: status === "done" ? new Date().toISOString() : undefined
    });
    setTodos((current) => current.map((item) => (item.id === todo.id ? updated : item)));
    showToast(status === "done" ? "已完成任务" : "已恢复任务");
  }

  async function deleteTodo(todo: TodoItem) {
    if (!api) return;
    markInteraction();
    const removed = await api.todo.delete(todo.id);
    setTodos((current) => current.filter((item) => item.id !== removed.id));
    setMood("idle");
    setBubble(`已删除：${removed.title}`);
    showToast("已删除任务");
  }

  async function updateTodo(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "notes" | "project" | "tags" | "priority" | "status" | "remindAt" | "dueAt" | "scheduledStartAt" | "scheduledEndAt" | "isAllDayScheduled" | "repeatRule" | "subtasks" | "attachments" | "completedAt">>) {
    if (!api) return;
    markInteraction();
    const updated = await api.todo.update(todo.id, patch);
    setTodos((current) => current.map((item) => (item.id === todo.id ? updated : item)));
    setMood("happy");
    setBubble(`已更新：${updated.title}`);
    showToast("保存成功");
  }

  async function acceptPendingPlan() {
    if (!api || !pendingPlan || planBusy) return;
    markInteraction();
    setPlanBusy(true);
    try {
      const saved = await api.todo.acceptPlanProposal(pendingPlan.items, pendingPlan.sourceMessage);
      setTodos(await api.todo.list());
      setPendingPlan(null);
      setMood("happy");
      setBubble(`已写入 ${saved.todos.length} 个待办。`);
      showToast("已保存待办");
    } catch (error) {
      setMood("confused");
      setBubble(error instanceof Error ? error.message : "写入计划失败，请稍后再试。");
    } finally {
      setPlanBusy(false);
    }
  }

  function dismissPendingPlan() {
    markInteraction();
    setPendingPlan(null);
    setBubble("好的，这个计划先不写入。");
  }

  function updatePendingPlanItems(items: TodoCandidate[]) {
    setPendingPlan((current) => current ? { ...current, items } : current);
  }

  async function acceptMessageDraft(message: ConversationMessage) {
    const plan = message.taskDraftProposal;
    if (!api || !plan || message.taskDraftStatus !== "pending" || planBusy) return;
    markInteraction();
    setPlanBusy(true);
    try {
      const saved = await api.todo.acceptPlanProposal(plan.items, plan.sourceMessage, message.id);
      setTodos(await api.todo.list());
      setMessages(await api.chat.listMessages());
      setMood("happy");
      setBubble(`已写入 ${saved.todos.length} 个待办。`);
      showToast("已保存待办");
    } catch (error) {
      setMood("confused");
      setBubble(error instanceof Error ? error.message : "写入计划失败，请稍后再试。");
    } finally {
      setPlanBusy(false);
    }
  }

  async function acceptMiniDraft(message: ConversationMessage) {
    await acceptMessageDraft(message);
    setMiniMessage({ ...message, taskDraftStatus: "accepted" });
    scheduleMiniClose();
  }

  async function dismissMessageDraft(message: ConversationMessage) {
    if (!api || !message.taskDraftProposal || message.taskDraftStatus !== "pending") return;
    markInteraction();
    await api.chat.updateTaskDraft(message.id, {
      taskDraftProposal: {
        ...message.taskDraftProposal,
        needsConfirmation: false
      },
      taskDraftStatus: "dismissed"
    });
    setMessages(await api.chat.listMessages());
    setBubble("好的，这个草案已标记为未采纳。");
  }

  async function dismissMiniDraft(message: ConversationMessage) {
    await dismissMessageDraft(message);
    setMiniMessage({ ...message, taskDraftStatus: "dismissed" });
    scheduleMiniClose();
  }

  async function updateMessageDraftItems(message: ConversationMessage, items: TodoCandidate[]) {
    if (!api || !message.taskDraftProposal || message.taskDraftStatus !== "pending") return;
    const nextProposal = { ...message.taskDraftProposal, items };
    setMessages((current) => current.map((item) => item.id === message.id
      ? { ...item, taskDraftProposal: nextProposal, taskDraftStatus: "pending" }
      : item));
    await api.chat.updateTaskDraft(message.id, {
      taskDraftProposal: nextProposal,
      taskDraftStatus: "pending"
    });
  }

  function updateSelectionPopover(mousePosition?: { x: number; y: number }) {
    if (!api) return;
    window.setTimeout(() => {
      const capture = getWorkspaceSelectedText();
      if (!capture) return;
      const fallbackX = capture.rect ? capture.rect.left + capture.rect.width / 2 : window.innerWidth / 2;
      const fallbackY = capture.rect ? capture.rect.bottom : window.innerHeight / 2;
      const anchorX = mousePosition?.x ?? fallbackX;
      const anchorY = mousePosition?.y ?? fallbackY;
      void api.selection.openCapturePopover(capture.text, anchorX, anchorY).catch(() => {
        // The selection popover is optional UI; do not surface transient window load failures while editing.
      });
    }, 0);
  }

  async function updateSettings(patch: Partial<AppSettings>) {
    if (!api) return;
    markInteraction();
    const next = await api.settings.set(patch);
    setSettings(next);
  }

  async function clearMessages() {
    if (!api) return;
    markInteraction();
    await api.chat.clearMessages();
    setMessages([]);
    setBubble("对话记录已清除。");
  }

  async function selectPetAppearance() {
    if (!api) return;
    markInteraction();
    const appearance = await api.appearance.selectFolder();
    if (!appearance) return;
    setSettings((current) => current ? { ...current, petAppearance: appearance } : current);
    setMood("happy");
    setBubble(`已切换形象：${appearance.name}`);
  }

  async function resetPetAppearance() {
    if (!api) return;
    markInteraction();
    const next = await api.appearance.reset();
    setSettings(next);
    setMood("happy");
    setBubble("已恢复默认形象。");
  }

  async function completeActiveReminder() {
    if (!api || !activeReminder) return;
    markInteraction();
    await api.reminder.complete(activeReminder.id);
    setTodos(await api.todo.list());
    setActiveReminder(null);
    setChatOpen(false);
    setMood("happy");
    setBubble(`已完成：${activeReminder.title}`);
  }

  async function snoozeActiveReminder(minutes: number) {
    if (!api || !activeReminder) return;
    markInteraction();
    await api.reminder.snooze(activeReminder.id, minutes);
    setActiveReminder(null);
    setChatOpen(false);
    setMood("idle");
    setBubble(`${minutes} 分钟后再提醒你。`);
  }

  function openActiveReminderTodo() {
    if (!activeReminder?.todoId) return;
    markInteraction();
    void api?.app.openWorkspaceWindow(activeReminder.todoId);
  }

  function handlePetPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    markInteraction();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartRef.current = { screenX: event.screenX, screenY: event.screenY };
    didDragRef.current = false;
    void api?.app.beginWindowDrag();
  }

  function handlePetPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!api || !pointerStartRef.current) return;
    const totalDx = Math.abs(event.screenX - pointerStartRef.current.screenX);
    const totalDy = Math.abs(event.screenY - pointerStartRef.current.screenY);
    if (!didDragRef.current && totalDx < 5 && totalDy < 5) return;
    didDragRef.current = true;
    setDragging(true);
    void api.app.dragWindowToCursor();
  }

  function handlePetPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    pointerStartRef.current = null;
    void api?.app.endWindowDrag();
  }

  function handlePetClick() {
    markInteraction();
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (clickTimerRef.current) return;
    clickTimerRef.current = window.setTimeout(() => {
      setChatOpen((open) => {
        const next = !open;
        if (next) {
          setMiniMessage(null);
          window.setTimeout(() => miniInputRef.current?.focus(), 80);
        }
        return next;
      });
      clickTimerRef.current = null;
    }, 180);
  }

  function handlePetDoubleClick() {
    markInteraction();
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    void api?.app.openWorkspaceWindow();
  }

  function handleCodexDragOver(event: React.DragEvent) {
    if (!hasFileDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setCodexDragActive(true);
  }

  function handleCodexDragLeave(event: React.DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setCodexDragActive(false);
    }
  }

  function handleCodexDrop(event: React.DragEvent) {
    if (!hasFileDrop(event)) return;
    event.preventDefault();
    setCodexDragActive(false);
    const items = getDropItems(event.dataTransfer, api);
    if (!items.length) return;
    setCodexItems((current) => dedupeCodexItems([...current, ...items]));
    setCodexBasketOpen(true);
    setChatOpen(false);
    setMiniMessage(null);
    setCodexError("");
    setMood("talking");
    setBubble(`已加入 ${items.length} 个项目，确认后再交给 Codex。`);
    markInteraction();
  }

  async function startCodexFromBasket() {
    if (!api || !codexItems.length || codexCreateBusy) return;
    setCodexCreateBusy(true);
    setCodexError("");
    try {
      await api.codex.createSession(codexItems, {
        sandbox: codexSandbox,
        approval: codexApproval
      });
      setCodexBasketOpen(false);
      setCodexItems([]);
      setMood("happy");
      setBubble("Codex 会话已打开。");
    } catch (error) {
      setMood("confused");
      setCodexError(error instanceof Error ? error.message : "启动 Codex 失败。");
    } finally {
      setCodexCreateBusy(false);
    }
  }

  if (isWorkspaceWindow) {
    return (
      <WorkspaceWindow
        api={api}
        messages={messages}
        todos={todos}
        settings={settings}
        toast={toast}
        pendingPlan={pendingPlan}
        planBusy={planBusy}
        thinkingPlaceholder={thinkingPlaceholder}
        input={input}
        busy={busy}
        onInputChange={setInput}
        onSendMessage={sendMessage}
        onToggleTodo={toggleTodo}
        onUpdateTodo={updateTodo}
        onDeleteTodo={deleteTodo}
        onAcceptPlan={acceptPendingPlan}
        onDismissPlan={dismissPendingPlan}
        onChangePlanItems={updatePendingPlanItems}
        onAcceptMessageDraft={(message) => void acceptMessageDraft(message)}
        onDismissMessageDraft={(message) => void dismissMessageDraft(message)}
        onChangeMessageDraftItems={(message, items) => void updateMessageDraftItems(message, items)}
        onQuickTodoText={(text) => void sendText(text, "我在整理任务草案...")}
        onSelectionUpdate={updateSelectionPopover}
        onUpdateSettings={updateSettings}
        onClearMessages={clearMessages}
        onSelectPetAppearance={selectPetAppearance}
        onResetPetAppearance={resetPetAppearance}
        focusedTodoId={focusedTodoId}
        onTestReminder={async () => {
          const reminder = await api?.reminder.test();
          if (reminder) setBubble(reminder.message);
        }}
      />
    );
  }

  return (
    <main
      className={`shell pet-only ${chatOpen ? "chat-open" : ""} ${codexBasketOpen ? "codex-basket-open" : ""} ${codexDragActive ? "codex-drag-active" : ""}`}
      style={themeStyle}
      onDragEnter={handleCodexDragOver}
      onDragOver={handleCodexDragOver}
      onDragLeave={handleCodexDragLeave}
      onDrop={handleCodexDrop}
    >
      <section className="pet-stage">
        {codexDragActive && (
          <div className="codex-drop-overlay">
            <Paperclip size={18} />
            <strong>松开加入 Codex 文件篮</strong>
          </div>
        )}
        {codexBasketOpen && (
          <CodexBasketPopover
            items={codexItems}
            sandbox={codexSandbox}
            approval={codexApproval}
            busy={codexCreateBusy}
            error={codexError}
            onSandboxChange={setCodexSandbox}
            onApprovalChange={setCodexApproval}
            onRemove={(path) => setCodexItems((current) => current.filter((item) => item.path !== path))}
            onClear={() => setCodexItems([])}
            onClose={() => setCodexBasketOpen(false)}
            onStart={() => void startCodexFromBasket()}
          />
        )}
        {!chatOpen && activeReminder && bubble && (
          <div className="reminder-bubble">
            {bubble}
          </div>
        )}
        {chatOpen && (
          <section className="chat-popover">
            {miniMessage?.taskDraftProposal ? (
              <PlanProposalCard
                plan={miniMessage.taskDraftProposal}
                compact
                busy={planBusy}
                status={miniMessage.taskDraftStatus}
                onAccept={() => void acceptMiniDraft(miniMessage)}
                onDismiss={() => void dismissMiniDraft(miniMessage)}
                onChangeItems={(items) => {
                  setMiniMessage((current) => current?.id === miniMessage.id && current.taskDraftProposal
                    ? { ...current, taskDraftProposal: { ...current.taskDraftProposal, items } }
                    : current);
                  void updateMessageDraftItems(miniMessage, items);
                }}
              />
            ) : (
              (miniMessage?.text || activeReminder) && <div className="speech-bubble">{miniMessage?.text ?? bubble}</div>
            )}
            {activeReminder?.todoId && (
              <div className="reminder-actions" aria-label="提醒操作">
                <button type="button" onClick={() => void completeActiveReminder()}>
                  <Check size={14} /> 完成
                </button>
                <button type="button" onClick={() => void snoozeActiveReminder(10)}>
                  <Bell size={14} /> 10 分钟后
                </button>
                <button type="button" onClick={openActiveReminderTodo}>
                  <ListTodo size={14} /> 打开待办
                </button>
              </div>
            )}
            {thinkingPlaceholder && !miniMessage && (
              <div className="mini-thinking">
                <span className="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                {thinkingPlaceholder.text}
              </div>
            )}
            {!busy && !miniMessage && !activeReminder && (
              <form className="mini-composer" onSubmit={sendMessage}>
                <input
                  ref={miniInputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="和 Linnea 说话..."
                />
                <button type="submit" disabled={busy} aria-label="发送">
                  <Send size={16} />
                </button>
              </form>
            )}
          </section>
        )}

        <button
          className="pet-button"
          onPointerDown={handlePetPointerDown}
          onPointerMove={handlePetPointerMove}
          onPointerUp={handlePetPointerUp}
          onPointerCancel={handlePetPointerUp}
          onClick={handlePetClick}
          onDoubleClick={handlePetDoubleClick}
          aria-label="单击对话，双击打开待办，拖动移动位置"
        >
          <LinneaPet state={visualState} images={currentPetImages} showAlert={hasOverdueOpenTodo} />
        </button>
        {!api && <div className="debug-banner">Electron API 未连接，当前显示静态桌宠。</div>}
      </section>
    </main>
  );
}

function getWorkspaceSelectedText(): { text: string; rect: DOMRect | null } | null {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return null;
  }

  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";
  if (!selection || text.length < 2 || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { text: text.slice(0, 8000), rect };
}

function isSelectionPopoverBlockedTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, button, [contenteditable='true'], [data-selection-popover='off']"));
}

function WorkspaceWindow({
  api,
  messages,
  todos,
  settings,
  toast,
  pendingPlan,
  planBusy,
  thinkingPlaceholder,
  input,
  busy,
  onInputChange,
  onSendMessage,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onAcceptPlan,
  onDismissPlan,
  onChangePlanItems,
  onAcceptMessageDraft,
  onDismissMessageDraft,
  onChangeMessageDraftItems,
  onSelectionUpdate,
  onQuickTodoText,
  onUpdateSettings,
  onClearMessages,
  onSelectPetAppearance,
  onResetPetAppearance,
  focusedTodoId,
  onTestReminder
}: {
  api?: DesktopPetApi;
  messages: ConversationMessage[];
  todos: TodoItem[];
  settings: AppSettings | null;
  toast: string;
  pendingPlan: PlanProposal | null;
  planBusy: boolean;
  thinkingPlaceholder: ConversationMessage | null;
  input: string;
  busy: boolean;
  onInputChange(value: string): void;
  onSendMessage(event: React.FormEvent): void;
  onToggleTodo(todo: TodoItem): void;
  onUpdateTodo(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "notes" | "project" | "tags" | "priority" | "status" | "remindAt" | "dueAt" | "scheduledStartAt" | "scheduledEndAt" | "isAllDayScheduled" | "repeatRule" | "subtasks" | "attachments" | "completedAt">>): void;
  onDeleteTodo(todo: TodoItem): void;
  onAcceptPlan(): void;
  onDismissPlan(): void;
  onChangePlanItems(items: TodoCandidate[]): void;
  onAcceptMessageDraft(message: ConversationMessage): void;
  onDismissMessageDraft(message: ConversationMessage): void;
  onChangeMessageDraftItems(message: ConversationMessage, items: TodoCandidate[]): void;
  onSelectionUpdate(mousePosition?: { x: number; y: number }): void;
  onQuickTodoText(text: string): void;
  onUpdateSettings(patch: Partial<AppSettings>): void | Promise<void>;
  onClearMessages(): void;
  onSelectPetAppearance(): void;
  onResetPetAppearance(): void;
  focusedTodoId: string | null;
  onTestReminder(): Promise<void>;
}) {
  const [activeTab, setActiveTab] = React.useState<"quickstart" | "workspace" | "todos" | "calendar" | "summary" | "codex" | "settings">("workspace");
  const [summaryText, setSummaryText] = React.useState("");
  const [summaryBusy, setSummaryBusy] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const themeStyle = React.useMemo(
    () => createWorkspaceThemeStyle(settings?.workspaceThemeColor),
    [settings?.workspaceThemeColor]
  );

  React.useEffect(() => {
    if (focusedTodoId) setActiveTab("todos");
  }, [focusedTodoId]);

  React.useEffect(() => {
    if (activeTab !== "workspace") return;
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeTab, messages.length, pendingPlan, thinkingPlaceholder?.id]);

  async function generateSummary() {
    if (!api || summaryBusy) return;
    setSummaryBusy(true);
    setSummaryError("");
    try {
      setSummaryText(await api.summary.generate());
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "生成总结失败。");
    } finally {
      setSummaryBusy(false);
    }
  }

  return (
    <main
      className="workspace-shell"
      style={themeStyle}
      onMouseUpCapture={(event) => {
        if (isSelectionPopoverBlockedTarget(event.target)) return;
        onSelectionUpdate({ x: event.clientX, y: event.clientY });
      }}
      onKeyUpCapture={(event) => {
        if (isSelectionPopoverBlockedTarget(event.target)) return;
        onSelectionUpdate();
      }}
    >
      {toast && <div className="workspace-toast">{toast}</div>}
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <strong>Linnea</strong>
          <span>桌宠助手</span>
        </div>
        <nav className="workspace-nav" aria-label="Linnea 工作窗口导航">
          <button
            className={`workspace-nav-item ${activeTab === "quickstart" ? "active" : ""}`}
            onClick={() => setActiveTab("quickstart")}
          >
            <FileText size={17} />
            快速入门
          </button>
          <button
            className={`workspace-nav-item ${activeTab === "workspace" ? "active" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            <MessageCircle size={17} />
            对话
          </button>
          <button
            className={`workspace-nav-item ${activeTab === "todos" ? "active" : ""}`}
            onClick={() => setActiveTab("todos")}
          >
            <ListTodo size={17} />
            待办
          </button>
          <button
            className={`workspace-nav-item ${activeTab === "calendar" ? "active" : ""}`}
            onClick={() => setActiveTab("calendar")}
          >
            <CalendarDays size={17} />
            日历
          </button>
          <button
            className={`workspace-nav-item ${activeTab === "summary" ? "active" : ""}`}
            onClick={() => setActiveTab("summary")}
          >
            <BarChart3 size={17} />
            总结
          </button>
          <button
            className={`workspace-nav-item ${activeTab === "codex" ? "active" : ""}`}
            onClick={() => setActiveTab("codex")}
          >
            <Sparkles size={17} />
            Codex
          </button>
          <button
            className={`workspace-nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={17} />
            设置
          </button>
        </nav>
      </aside>

      <section className="workspace-content">
        {activeTab === "quickstart" ? (
          <QuickStartPanel
            onOpenTab={setActiveTab}
          />
        ) : activeTab === "workspace" ? (
          <section className="workspace-grid chat-only-grid">
            <section className="workspace-card chat-card">
              <div className="section-title">
                <span>对话</span>
              </div>
              <div className="workspace-messages">
                {messages.length === 0 && <div className="empty">还没有对话。</div>}
                {messages.slice(-20).map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    busy={planBusy}
                    onAccept={() => onAcceptMessageDraft(message)}
                    onDismiss={() => onDismissMessageDraft(message)}
                    onChangeItems={(items) => onChangeMessageDraftItems(message, items)}
                  />
                ))}
                {thinkingPlaceholder && (
                  <div className="message assistant thinking-message">
                    <span className="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                    {thinkingPlaceholder.text}
                  </div>
                )}
                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
              <form className="workspace-composer" onSubmit={onSendMessage}>
                <input
                  value={input}
                  onChange={(event) => onInputChange(event.target.value)}
                  placeholder="和 Linnea 说话，或让她记录待办..."
                />
                <button type="submit" disabled={busy} aria-label="发送">
                  <Send size={17} />
                </button>
              </form>
            </section>
          </section>
        ) : activeTab === "todos" ? (
          <TodoList
            todos={todos}
            focusedTodoId={focusedTodoId}
            onToggle={onToggleTodo}
            onUpdate={onUpdateTodo}
            onDelete={onDeleteTodo}
            onQuickAdd={(text) => {
              setActiveTab("workspace");
              onQuickTodoText(text);
            }}
          />
        ) : activeTab === "calendar" ? (
          <CalendarPanel
            todos={todos}
            onToggle={onToggleTodo}
            onUpdate={onUpdateTodo}
            onDelete={onDeleteTodo}
            onQuickAdd={(text) => {
              setActiveTab("workspace");
              onQuickTodoText(text);
            }}
          />
        ) : activeTab === "summary" ? (
          <SummaryPanel
            todos={todos}
            summaryText={summaryText}
            summaryBusy={summaryBusy}
            summaryError={summaryError}
            onGenerateSummary={() => void generateSummary()}
            onToggleTodo={onToggleTodo}
            onUpdateTodo={onUpdateTodo}
            onQuickAdd={(text) => {
              setActiveTab("workspace");
              onQuickTodoText(text);
            }}
          />
        ) : activeTab === "codex" ? (
          <CodexWorkspacePanel api={api} settings={settings} />
        ) : (
          <section className="workspace-card settings-card">
            <div className="section-title">
              <span>设置</span>
            </div>
            {settings ? (
              <SettingsPanel
                settings={settings}
                onChange={onUpdateSettings}
                onClearMessages={onClearMessages}
                onSelectPetAppearance={onSelectPetAppearance}
                onResetPetAppearance={onResetPetAppearance}
                onTestReminder={onTestReminder}
                api={api}
              />
            ) : (
              <div className="empty">设置加载中。</div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

type WorkspaceTab = "quickstart" | "workspace" | "todos" | "calendar" | "summary" | "codex" | "settings";
type QuickStartStage = "capture" | "draft" | "plan" | "review";

const quickStartExamples = [
  "明天下午 3 点提醒我交周报，并把客户反馈整理成三条要点",
  "下周一上午安排 45 分钟复盘项目进度，标记为高优先级",
  "今晚 9 点提醒我检查论文图表，把缺失数据列成待办"
];

const quickStartTours: Array<{ tab: WorkspaceTab; title: string; detail: string; action: string }> = [
  { tab: "workspace", title: "对话记录任务", detail: "直接告诉 Linnea 要做什么，她会先生成待办草案，确认后才写入列表。", action: "打开对话" },
  { tab: "todos", title: "整理待办", detail: "在待办页按项目、标签、优先级筛选，并在右侧编辑截止、提醒、子任务和备注。", action: "查看待办" },
  { tab: "calendar", title: "拖入日历", detail: "把任务池里的任务安排到日/周/月视图，区分截止时间和实际计划时间。", action: "打开日历" },
  { tab: "summary", title: "复盘风险", detail: "总结页会聚合今日计划、未来重点和风险任务，适合每天收尾时检查。", action: "查看总结" },
  { tab: "codex", title: "交给 Codex", detail: "拖拽文件到桌宠或在 Codex 页选择文件夹，创建隔离副本后再开始代码任务。", action: "打开 Codex" },
  { tab: "settings", title: "调整偏好", detail: "设置 AI 服务、快捷键、系统通知、主题色和桌宠形象。", action: "打开设置" }
];

function QuickStartPanel({
  onOpenTab
}: {
  onOpenTab(tab: WorkspaceTab): void;
}) {
  const [stage, setStage] = React.useState<QuickStartStage>("capture");
  const [completed, setCompleted] = React.useState<string[]>([]);
  const [selectedExample, setSelectedExample] = React.useState(quickStartExamples[0]);
  const [draftReady, setDraftReady] = React.useState(false);
  const [todoAccepted, setTodoAccepted] = React.useState(false);
  const [scheduledSlot, setScheduledSlot] = React.useState("");
  const [taskDone, setTaskDone] = React.useState(false);
  const [codexBasket, setCodexBasket] = React.useState<string[]>([]);
  const [demoNotifications, setDemoNotifications] = React.useState(true);
  const [demoTopMost, setDemoTopMost] = React.useState(true);
  const [demoAccent, setDemoAccent] = React.useState(workspaceThemePresets[0]);

  const stageIndex = ["capture", "draft", "plan", "review"].indexOf(stage);
  const progress = Math.min(100, Math.round((completed.length / 8) * 100));
  const demoTitle = selectedExample.includes("周报")
    ? "交周报并整理客户反馈"
    : selectedExample.includes("项目")
      ? "复盘项目进度"
      : "检查论文图表";
  const demoDue = selectedExample.includes("周报") ? "明天 15:00" : selectedExample.includes("项目") ? "下周一 09:00" : "今晚 21:00";

  function complete(id: string) {
    setCompleted((current) => current.includes(id) ? current : [...current, id]);
  }

  function moveStage(next: QuickStartStage) {
    setStage(next);
    complete(next);
  }

  function resetQuickStart() {
    setStage("capture");
    setCompleted([]);
    setSelectedExample(quickStartExamples[0]);
    setDraftReady(false);
    setTodoAccepted(false);
    setScheduledSlot("");
    setTaskDone(false);
    setCodexBasket([]);
    setDemoNotifications(true);
    setDemoTopMost(true);
    setDemoAccent(workspaceThemePresets[0]);
  }

  function createDraft() {
    setDraftReady(true);
    moveStage("draft");
    complete("workspace");
    complete("draft");
  }

  function acceptTodo() {
    if (!draftReady) return;
    setTodoAccepted(true);
    moveStage("plan");
    complete("todos");
  }

  function scheduleTodo(slot: string) {
    if (!todoAccepted) return;
    setScheduledSlot(slot);
    moveStage("plan");
    complete("calendar");
  }

  function addCodexItem(path: string) {
    setCodexBasket((current) => current.includes(path) ? current : [...current, path]);
    complete("codex");
  }

  return (
    <section className="workspace-card quickstart-card">
      <div className="section-title">
        <span>快速入门</span>
        <button type="button" className="summary-generate-button" onClick={resetQuickStart}>
          <RotateCcw size={14} /> 重置
        </button>
      </div>
      <div className="quickstart-body">
        <section className="quickstart-hero">
          <div>
            <strong>在这里体验 Linnea 的完整工作流</strong>
            <span>不用离开快速入门：生成草案、确认待办、拖入日历、复盘、试 Codex 文件篮和设置偏好。</span>
          </div>
          <div className="quickstart-progress" aria-label={`入门进度 ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="quickstart-layout">
          <aside className="quickstart-examples">
            <strong>试一个真实输入</strong>
            {quickStartExamples.map((example) => (
              <button
                key={example}
                type="button"
                className={selectedExample === example ? "active" : ""}
                onClick={() => {
                  setSelectedExample(example);
                  complete("example");
                }}
              >
                <MessageCircle size={14} />
                <span>{example}</span>
              </button>
            ))}
            <button type="button" className="quickstart-primary" onClick={createDraft}>
              <Send size={15} /> 在本页生成草案
            </button>
          </aside>

          <section className="quickstart-flow" aria-label="拖动观察任务工作流">
            <div className="quickstart-flow-header">
              <strong>拖动观察工作流</strong>
              <span>把任务卡拖到下一步，Linnea 会展示每个阶段发生了什么。</span>
            </div>
            <div className="quickstart-flow-grid">
              <QuickStartDropZone
                active={stage === "capture"}
                done={stageIndex > 0}
                title="1. 捕获"
                detail="从对话、快捷键或选中文字开始记录。"
                onDropStage={() => moveStage("capture")}
              />
              <QuickStartDropZone
                active={stage === "draft"}
                done={stageIndex > 1}
                title="2. 草案"
                detail="AI 先拆解任务，等待你确认，不会直接写入。"
                onDropStage={() => moveStage("draft")}
              />
              <QuickStartDropZone
                active={stage === "plan"}
                done={stageIndex > 2}
                title="3. 排程"
                detail="确认后的任务进入待办，可拖到日历时间块。"
                onDropStage={() => moveStage("plan")}
              />
              <QuickStartDropZone
                active={stage === "review"}
                done={stageIndex > 3}
                title="4. 复盘"
                detail="总结页检查完成度、风险和明天重点。"
                onDropStage={() => moveStage("review")}
              />
            </div>
            <button
              type="button"
              className="quickstart-drag-card"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", stage);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <ListTodo size={15} />
              <span>{selectedExample}</span>
            </button>
            <div className="quickstart-stage-note">
              {stage === "capture" && "当前阶段：先把脑中的事项说出来，Linnea 会负责整理结构。"}
              {stage === "draft" && "当前阶段：检查 AI 草案，确认标题、时间、优先级是否正确。"}
              {stage === "plan" && "当前阶段：在待办或日历里安排真正执行的时间。"}
              {stage === "review" && "当前阶段：用总结页回看完成情况和风险任务。"}
            </div>
            <div className="quickstart-demo-lab">
              <article className="quickstart-demo-card">
                <div className="quickstart-demo-title">
                  <MessageCircle size={15} />
                  <strong>对话与草案</strong>
                </div>
                <div className="quickstart-chat-sim user">{selectedExample}</div>
                {draftReady ? (
                  <div className="quickstart-chat-sim assistant">
                    <strong>{demoTitle}</strong>
                    <span>截止：{demoDue} · 优先级：{selectedExample.includes("高优先级") ? "P1 高" : "P2 中"}</span>
                    <small>这是草案，确认后才会写入待办。</small>
                  </div>
                ) : (
                  <button type="button" onClick={createDraft}>生成 AI 草案</button>
                )}
              </article>

              <article className="quickstart-demo-card">
                <div className="quickstart-demo-title">
                  <ListTodo size={15} />
                  <strong>待办确认</strong>
                </div>
                <button type="button" className={`quickstart-todo-sim ${todoAccepted ? "done" : ""}`} onClick={acceptTodo} disabled={!draftReady}>
                  <span>{todoAccepted ? <Check size={13} /> : null}</span>
                  <div>
                    <strong>{demoTitle}</strong>
                    <small>{draftReady ? "点击确认写入待办" : "先生成草案"}</small>
                  </div>
                </button>
              </article>

              <article className="quickstart-demo-card quickstart-calendar-sim">
                <div className="quickstart-demo-title">
                  <CalendarDays size={15} />
                  <strong>日历排程</strong>
                </div>
                <button
                  type="button"
                  className="quickstart-mini-task"
                  draggable={todoAccepted}
                  disabled={!todoAccepted}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", "demo-task")}
                >
                  {demoTitle}
                </button>
                <div className="quickstart-slots">
                  {["上午 09:00", "下午 15:00"].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={scheduledSlot === slot ? "active" : ""}
                      onClick={() => scheduleTodo(slot)}
                      onDragOver={(event) => {
                        if (!todoAccepted) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        scheduleTodo(slot);
                      }}
                    >
                      <Clock size={13} />
                      <span>{scheduledSlot === slot ? demoTitle : slot}</span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="quickstart-demo-card">
                <div className="quickstart-demo-title">
                  <BarChart3 size={15} />
                  <strong>总结复盘</strong>
                </div>
                <div className="quickstart-kpis">
                  <span><strong>{todoAccepted ? 1 : 0}</strong> 已确认</span>
                  <span><strong>{scheduledSlot ? 1 : 0}</strong> 已排程</span>
                  <span><strong>{taskDone ? 0 : 1}</strong> 待关注</span>
                </div>
                <button type="button" onClick={() => {
                  setTaskDone(true);
                  moveStage("review");
                  complete("summary");
                }} disabled={!scheduledSlot}>
                  标记完成并复盘
                </button>
              </article>

              <article className="quickstart-demo-card">
                <div className="quickstart-demo-title">
                  <Paperclip size={15} />
                  <strong>Codex 文件篮</strong>
                </div>
                <div className="quickstart-file-row">
                  {["src/main.tsx", "README.md"].map((path) => (
                    <button
                      key={path}
                      type="button"
                      draggable
                      onClick={() => addCodexItem(path)}
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", path)}
                    >
                      <FileText size={13} /> {path}
                    </button>
                  ))}
                </div>
                <div
                  className={`quickstart-basket ${codexBasket.length ? "filled" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    addCodexItem(event.dataTransfer.getData("text/plain"));
                  }}
                >
                  {codexBasket.length ? `${codexBasket.length} 个文件已加入隔离副本` : "拖文件到这里"}
                </div>
              </article>

              <article className="quickstart-demo-card">
                <div className="quickstart-demo-title">
                  <Settings size={15} />
                  <strong>设置偏好</strong>
                </div>
                <div className="quickstart-setting-row">
                  <button type="button" className={demoNotifications ? "active" : ""} onClick={() => {
                    setDemoNotifications((value) => !value);
                    complete("settings");
                  }}>系统通知</button>
                  <button type="button" className={demoTopMost ? "active" : ""} onClick={() => {
                    setDemoTopMost((value) => !value);
                    complete("settings");
                  }}>始终置顶</button>
                </div>
                <div className="quickstart-theme-row">
                  {workspaceThemePresets.slice(0, 4).map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={demoAccent === color ? "active" : ""}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setDemoAccent(color);
                        complete("settings");
                      }}
                      aria-label={`体验主题色 ${color}`}
                    />
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="quickstart-tour">
            <strong>功能巡览</strong>
            {quickStartTours.map((item) => (
              <article key={item.tab} className={completed.includes(item.tab) ? "done" : ""}>
                <div>
                  <span className="quickstart-check">{completed.includes(item.tab) ? <Check size={13} /> : null}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
                <button type="button" onClick={() => {
                  complete(item.tab);
                  onOpenTab(item.tab);
                }}>
                  {item.action}
                </button>
              </article>
            ))}
          </section>
        </section>
      </div>
    </section>
  );
}

function QuickStartDropZone({
  active,
  done,
  title,
  detail,
  onDropStage
}: {
  active: boolean;
  done: boolean;
  title: string;
  detail: string;
  onDropStage(): void;
}) {
  return (
    <button
      type="button"
      className={`quickstart-zone ${active ? "active" : ""} ${done ? "done" : ""}`}
      onClick={onDropStage}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropStage();
      }}
    >
      <span>{done ? <Check size={13} /> : null}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </button>
  );
}

function LinneaPet({ state, images, showAlert }: { state: PetVisualState; images: Record<PetVisualState, string>; showAlert: boolean }) {
  return (
    <span className={`pet-image-wrap pet-${state}`}>
      <img className="pet-image" src={images[state]} alt={`Q版桌宠 ${state} 状态`} draggable={false} />
      {showAlert && <span className="reminder-star" aria-hidden="true">!</span>}
    </span>
  );
}

function CodexWorkspacePanel({ api, settings }: { api?: DesktopPetApi; settings: AppSettings | null }) {
  const [savedSessions, setSavedSessions] = React.useState<CodexSavedSession[]>([]);
  const [activeSession, setActiveSession] = React.useState<CodexSessionInfo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [openingId, setOpeningId] = React.useState("");
  const [deletingIds, setDeletingIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [editingId, setEditingId] = React.useState("");
  const [editingName, setEditingName] = React.useState("");
  const sandbox = settings?.codexDefaultSandbox ?? "workspace-write";
  const approval = settings?.codexDefaultApproval ?? "on-request";

  const refresh = React.useCallback(async () => {
    if (!api) return;
    setSavedSessions(await api.codex.listSavedSessions());
  }, [api]);

  React.useEffect(() => {
    void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "读取 Codex 会话失败。"));
  }, [refresh]);

  async function startFromFolder() {
    if (!api || busy) return;
    setBusy(true);
      setError("");
    try {
      const session = await api.codex.createSessionFromFolder({ sandbox, approval });
      await refresh();
      if (session) setActiveSession(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "启动 Codex 失败。");
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(session: CodexSavedSession) {
    if (!api || deletingIds.includes(session.id)) return;
    setOpeningId(session.id);
    setError("");
    try {
      const next = await api.codex.openSavedSession(session.id, { sandbox, approval });
      setActiveSession(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "打开保存会话失败。");
    } finally {
      setOpeningId("");
    }
  }

  async function commitRename(session: CodexSavedSession) {
    if (!api || editingId !== session.id) return;
    const nextName = editingName.trim();
    setEditingId("");
    if (!nextName || nextName === session.name) return;
    try {
      await api.codex.renameSavedSession(session.id, nextName);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重命名失败。");
    }
  }

  async function deleteSaved(session: CodexSavedSession) {
    if (!api || deletingIds.includes(session.id)) return;
    const confirmed = window.confirm(`删除 Codex 对话“${session.name}”？对应的副本文件夹也会被删除。`);
    if (!confirmed) return;
    setError("");
    setDeletingIds((current) => [...current, session.id]);
    setSavedSessions((current) => current.filter((item) => item.id !== session.id));
    if (activeSession?.savedPath === session.rootPath || activeSession?.workspacePath === session.workspacePath) setActiveSession(null);
    try {
      await api.codex.deleteSavedSession(session.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
      await refresh();
    } finally {
      setDeletingIds((current) => current.filter((id) => id !== session.id));
    }
  }

  return (
    <section className="workspace-card codex-workspace-card">
      <div className="section-title">
        <span>Codex</span>
        <button type="button" className="summary-generate-button" onClick={() => void refresh()} disabled={busy}>
          <RotateCcw size={14} /> 刷新
        </button>
      </div>
      <div className="codex-workspace-body">
        <aside className="codex-workspace-sidebar">
          <div className="codex-start-panel">
          <button type="button" onClick={() => void startFromFolder()} disabled={!api || busy}>
              <FolderOpen size={15} /> 选择文件夹
          </button>
          {error && <div className="codex-error">{error}</div>}
          </div>
          <div className="codex-saved-panel">
          <strong>保存的对话</strong>
          <div className="codex-saved-list">
            {savedSessions.length === 0 ? (
              <div className="summary-empty">还没有保存的 Codex 会话。</div>
            ) : savedSessions.map((session) => (
              <article key={session.id} className={`codex-saved-item ${activeSession?.savedPath === session.rootPath || activeSession?.workspacePath === session.workspacePath ? "active" : ""}`}>
                <button type="button" className="codex-saved-main" onClick={() => void openSaved(session)} disabled={deletingIds.includes(session.id)}>
                  {editingId === session.id ? (
                    <input
                      value={editingName}
                      autoFocus
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setEditingName(event.target.value)}
                      onBlur={() => void commitRename(session)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") setEditingId("");
                      }}
                    />
                  ) : (
                    <strong
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingId(session.id);
                        setEditingName(session.name);
                      }}
                    >
                      {session.name}
                    </strong>
                  )}
                  <span>{openingId === session.id ? "正在打开..." : new Date(session.createdAt).toLocaleString()}</span>
                  <small>{session.workspacePath}</small>
                </button>
                <button type="button" className="codex-saved-delete" onClick={() => void deleteSaved(session)} disabled={deletingIds.includes(session.id)} aria-label={`删除 ${session.name}`}>
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
          </div>
          </div>
        </aside>
        <section className="codex-workspace-conversation">
          {activeSession ? (
            <CodexEmbeddedConversation
              key={activeSession.id}
              api={api}
              sessionInfo={activeSession}
              sandbox={sandbox}
              approval={approval}
              onSessionChange={setActiveSession}
            />
          ) : (
            <div className="codex-empty codex-workspace-empty">选择一个历史对话，或先选择文件夹开始。</div>
          )}
        </section>
      </div>
    </section>
  );
}

function mergePetImages(customImages?: Partial<Record<string, string>>): Record<PetVisualState, string> {
  const images = { ...petStateImages };
  if (!customImages) return images;
  for (const state of Object.keys(images) as PetVisualState[]) {
    const customImage = customImages[state];
    if (customImage) images[state] = customImage;
  }
  return images;
}

function hasFileDrop(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function getDropItems(dataTransfer: DataTransfer, api?: DesktopPetApi): CodexDropItem[] {
  return Array.from(dataTransfer.files)
    .map<CodexDropItem | null>((file) => {
      const path = api?.app.getPathForFile(file) || (file as File & { path?: string }).path;
      if (!path) return null;
      return {
        path,
        name: file.name || path.split(/[\\/]/).pop() || path,
        kind: "unknown" as const
      };
    })
    .filter((item): item is CodexDropItem => item !== null);
}

function dedupeCodexItems(items: CodexDropItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCodexSandbox(value: string | null | undefined): CodexSandboxPolicy {
  if (value === "read-only" || value === "danger-full-access") return value;
  return "workspace-write";
}

function normalizeCodexApproval(value: string | null | undefined): CodexApprovalPolicy {
  return value === "never" ? "never" : "on-request";
}

function CodexBasketPopover({
  items,
  sandbox,
  approval,
  busy,
  error,
  onSandboxChange,
  onApprovalChange,
  onRemove,
  onClear,
  onClose,
  onStart
}: {
  items: CodexDropItem[];
  sandbox: CodexSandboxPolicy;
  approval: CodexApprovalPolicy;
  busy: boolean;
  error: string;
  onSandboxChange(value: CodexSandboxPolicy): void;
  onApprovalChange(value: CodexApprovalPolicy): void;
  onRemove(path: string): void;
  onClear(): void;
  onClose(): void;
  onStart(): void;
}) {
  return (
    <section className="codex-basket" aria-label="Codex 文件篮">
      <div className="codex-basket-header">
        <div>
          <strong>Codex 文件篮</strong>
          <span>{items.length ? `${items.length} 个项目等待处理` : "继续拖入文件或文件夹"}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭">
          <X size={15} />
        </button>
      </div>
      <div className="codex-basket-list">
        {items.length === 0 ? (
          <div className="codex-empty">拖入文件或文件夹后，会先加入这里。</div>
        ) : items.map((item) => (
          <div className="codex-basket-item" key={item.path}>
            <FileText size={14} />
            <div>
              <strong>{item.name}</strong>
              <span>{item.path}</span>
            </div>
            <button type="button" onClick={() => onRemove(item.path)} aria-label={`移除 ${item.name}`}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="codex-policy-grid">
        <label>
          Sandbox
          <select value={sandbox} onChange={(event) => onSandboxChange(event.target.value as CodexSandboxPolicy)}>
            <option value="read-only">只读分析</option>
            <option value="workspace-write">允许修改副本</option>
            <option value="danger-full-access">完全权限</option>
          </select>
        </label>
        <label>
          Approval
          <select value={approval} onChange={(event) => onApprovalChange(event.target.value as CodexApprovalPolicy)}>
            <option value="on-request">需要时询问</option>
            <option value="never">不询问</option>
          </select>
        </label>
      </div>
      {error && <div className="codex-error">{error}</div>}
      <div className="codex-basket-actions">
        <button type="button" onClick={onClear} disabled={!items.length || busy}>清空</button>
        <button type="button" onClick={onStart} disabled={!items.length || busy}>
          <Sparkles size={14} /> {busy ? "创建中..." : "开始 Codex"}
        </button>
      </div>
    </section>
  );
}

function CodexTerminalWindow({
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

function CodexEmbeddedConversation({
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
          <button type="submit" disabled={!input.trim() || status === "starting"}>
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

type CodexInputSuggestion = {
  value: string;
  label: string;
  description?: string;
};

function CodexSuggestionPicker({
  suggestions,
  activeIndex,
  onHover,
  onApply
}: {
  suggestions: CodexInputSuggestion[];
  activeIndex: number;
  onHover(index: number): void;
  onApply(suggestion: CodexInputSuggestion): void;
}) {
  return (
    <div className="codex-suggestions">
      <div className="codex-suggestions-header">
        <div>
          <strong>指令补全</strong>
          <span>{suggestions.length} 个匹配项，使用 ↑ ↓ 选择，Tab 或 Enter 补全。</span>
        </div>
      </div>
      <div className="codex-suggestions-list">
        {suggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.value}-${index}`}
            type="button"
            className={index === activeIndex ? "active" : ""}
            onMouseEnter={() => onHover(index)}
            onClick={() => onApply(suggestion)}
          >
            <span aria-hidden="true" className="codex-suggestion-marker">{index === activeIndex ? <Check size={12} /> : null}</span>
            <span className="codex-suggestion-main">
              <strong>{suggestion.label}</strong>
              {suggestion.description && <span>{suggestion.description}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="codex-suggestions-footer">
        <span>Esc 关闭</span>
        <span>Tab / Enter 补全</span>
      </div>
    </div>
  );
}

function CodexThinkingMessage() {
  return (
    <div className="codex-chat-message assistant codex-thinking-message">
      <span className="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>Codex 正在输出...</span>
    </div>
  );
}

function CodexResumePicker({
  threads,
  busy,
  activeIndex,
  onHover,
  onResume,
  onClose
}: {
  threads: CodexThreadSummary[];
  busy: boolean;
  activeIndex: number;
  onHover(index: number): void;
  onResume(threadId: string): void;
  onClose(): void;
}) {
  return (
    <div className="codex-resume-picker">
      <div className="codex-resume-picker-header">
        <div>
          <strong>恢复 Codex 线程</strong>
          <span>{threads.length} 个可恢复线程，使用 ↑ ↓ 选择，Enter 恢复。</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭恢复列表">
          <X size={13} />
        </button>
      </div>
      <div className="codex-resume-picker-list">
        {threads.map((thread, index) => {
          const title = thread.name || thread.preview || thread.id;
          const updatedAt = new Date((thread.updatedAt || thread.createdAt) * 1000).toLocaleString();
          return (
            <button
              key={thread.id}
              type="button"
              className={index === activeIndex ? "active" : ""}
              onMouseEnter={() => onHover(index)}
              onClick={() => onResume(thread.id)}
              disabled={busy}
            >
              <span aria-hidden="true" className="codex-resume-marker">{index === activeIndex ? <Check size={12} /> : null}</span>
              <span className="codex-resume-main">
                <span className="codex-resume-title-row">
                  <strong>{title}</strong>
                  <small>{updatedAt}</small>
                </span>
                {thread.preview && thread.preview !== title && <span className="codex-resume-preview">{thread.preview}</span>}
                <span className="codex-resume-path">{thread.cwd}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="codex-resume-picker-footer">
        <span>Esc 关闭</span>
        <span>{busy ? "正在恢复..." : "点击任意线程继续"}</span>
      </div>
    </div>
  );
}

function CodexThreadBadges({ settings, models }: { settings: CodexThreadSettings; models: CodexModelSummary[] }) {
  const model = settings.model;
  const modelLabel = model ? getCodexModelLabel(model, models) : "默认模型";
  return (
    <div className="codex-thread-badges">
      <span>{modelLabel}</span>
      {settings.reasoningEffort && <span>{settings.reasoningEffort}</span>}
      <span>{settings.mode === "plan" ? "Plan" : "Default"}</span>
    </div>
  );
}

function getCodexActiveThreadSettings(session: CodexSessionInfo | null): CodexThreadSettings {
  if (!session) return {};
  const threadId = session.activeThreadId;
  return (threadId ? session.threads?.[threadId]?.settings : undefined) ?? session.history?.settings ?? {};
}

function applyCodexThreadEventToSession(session: CodexSessionInfo, payload: unknown, threadId: string): CodexSessionInfo {
  const value = payload as any;
  if (value?.type !== "threadSettings") return { ...session, activeThreadId: threadId };
  const settings = sanitizeClientCodexThreadSettings(value.settings);
  const threads = { ...(session.threads ?? {}) };
  const history = threads[threadId] ?? session.history ?? { messages: [], activity: [] };
  threads[threadId] = { ...history, settings };
  return {
    ...session,
    activeThreadId: threadId,
    history: threadId === session.activeThreadId || !session.activeThreadId ? threads[threadId] : session.history,
    threads
  };
}

function sanitizeClientCodexThreadSettings(value: unknown): CodexThreadSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<CodexThreadSettings>;
  const settings: CodexThreadSettings = {};
  if (typeof input.model === "string" && input.model.trim()) settings.model = input.model.trim();
  if (isCodexReasoningEffort(input.reasoningEffort)) settings.reasoningEffort = input.reasoningEffort;
  if (input.mode === "plan") settings.mode = "plan";
  return Object.keys(settings).length ? settings : undefined;
}

async function handleLocalCodexCommand({
  api,
  session,
  text,
  models,
  setSession,
  setStatusText
}: {
  api: DesktopPetApi;
  session: CodexSessionInfo | null;
  text: string;
  models: CodexModelSummary[];
  setSession(session: CodexSessionInfo): void;
  setStatusText: React.Dispatch<React.SetStateAction<string>>;
}) {
  if (!session) return false;
  const [command, ...parts] = text.split(/\s+/);
  if (command === "/model") {
    if (!parts.length) {
      setStatusText("请选择模型，或输入 /model <model> [effort]");
      return true;
    }
    const model = parts[0];
    const effort = parts.find(isCodexReasoningEffort);
    const selected = models.find((item) => item.id === model || item.displayName === model);
    const next = await api.codex.setThreadSettings(session.id, {
      model: selected?.id ?? model,
      ...(effort ? { reasoningEffort: effort } : {})
    });
    setSession(next);
    setStatusText(`当前 Thread 已切换到 ${getCodexModelLabel(selected?.id ?? model, models)}${effort ? ` / ${effort}` : ""}`);
    return true;
  }
  if (command === "/plan") {
    const current = getCodexActiveThreadSettings(session);
    const explicit = parts[0]?.toLowerCase();
    const mode = explicit === "off" || explicit === "default" || explicit === "false"
      ? "default"
      : current.mode === "plan" && (explicit === "toggle" || !explicit)
        ? "default"
        : "plan";
    const next = await api.codex.setThreadSettings(session.id, { mode });
    setSession(next);
    setStatusText(mode === "plan" ? "当前 Thread 已进入 Plan 模式" : "当前 Thread 已退出 Plan 模式");
    return true;
  }
  return false;
}

function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function getCodexModelLabel(modelId: string, models: CodexModelSummary[]) {
  const model = models.find((item) => item.id === modelId);
  return model?.displayName ? `${model.displayName}` : modelId;
}

function rememberCodexInput(text: string, setHistory: React.Dispatch<React.SetStateAction<string[]>>) {
  setHistory((current) => {
    const deduped = current.filter((item) => item !== text);
    return [...deduped, text].slice(-80);
  });
}

function getNextCodexInputHistory(history: string[], currentIndex: number | null, direction: -1 | 1) {
  if (!history.length) return null;
  if (currentIndex === null) {
    if (direction === 1) return null;
    const index = direction === -1 ? history.length - 1 : 0;
    return { index, value: history[index] };
  }
  if (direction === 1 && currentIndex >= history.length - 1) {
    return { index: null, value: "" };
  }
  const index = Math.min(history.length - 1, Math.max(0, currentIndex + direction));
  return { index, value: history[index] };
}

function applyCodexUiEvent(
  kind: string,
  payload: any,
  state: {
    setMessages: React.Dispatch<React.SetStateAction<CodexUiMessage[]>>;
    setActivity: React.Dispatch<React.SetStateAction<CodexUiActivity[]>>;
    setRequests: React.Dispatch<React.SetStateAction<Array<{ id: number | string; method: string; params: any }>>>;
    setRawEvents: React.Dispatch<React.SetStateAction<string[]>>;
    setStatus: React.Dispatch<React.SetStateAction<"starting" | "running" | "exited" | "error">>;
    setStatusText: React.Dispatch<React.SetStateAction<string>>;
    setResponding: React.Dispatch<React.SetStateAction<boolean>>;
  }
) {
  const method = payload?.method;
  state.setRawEvents((current) => [...current.slice(-80), JSON.stringify(payload)]);
  if (kind === "request") {
    state.setResponding(false);
    state.setRequests((current) => [...current, { id: payload.id, method, params: payload.params }]);
    return;
  }
  if (kind === "error") {
    state.setStatus("error");
    state.setStatusText(payload?.params?.message ?? payload?.message ?? "Codex 出错");
    state.setResponding(false);
    return;
  }
  if (method === "thread/status/changed") {
    const status = payload.params?.status?.type ?? "running";
    state.setStatus(status === "idle" ? "running" : "running");
    state.setStatusText(status === "idle" ? "Codex 空闲" : "Codex 正在处理");
    state.setResponding(status !== "idle");
    return;
  }
  if (kind === "thread") {
    state.setStatus("running");
    state.setStatusText("Codex 已连接");
    return;
  }
  if (kind === "status") {
    const status = payload?.status;
    if (status === "startingAppServer") state.setStatusText("正在启动 Codex app-server...");
    else if (status === "connected") state.setStatusText("正在连接 Codex...");
    else if (status === "socketClosed") {
      state.setStatus("exited");
      state.setStatusText("Codex 连接已关闭");
      state.setResponding(false);
    } else if (status === "stopped") {
      state.setStatus("exited");
      state.setStatusText("Codex 已停止");
      state.setResponding(false);
    }
    else if (status === "exited") {
      state.setStatus("exited");
      state.setStatusText("Codex app-server 已退出");
      state.setResponding(false);
    }
    return;
  }
  if (method === "item/started" || method === "item/completed") {
    const item = payload.params?.item;
    if (!item?.id) return;
    if (method === "item/started" && item.type !== "userMessage") state.setResponding(true);
    if (item.type === "userMessage") {
      const text = stripCodexPlanModeInstruction((item.content ?? []).map((part: any) => part.text).filter(Boolean).join("\n"));
      upsertCodexMessage(state.setMessages, item.id, "user", text);
    } else if (item.type === "agentMessage") {
      upsertCodexMessage(state.setMessages, item.id, "assistant", item.text ?? "");
    } else if (item.type === "commandExecution") {
      upsertCodexActivity(state.setActivity, item.id, "command", `命令：${item.command}`, item.aggregatedOutput ?? "", item.status);
    } else if (item.type === "fileChange") {
      upsertCodexActivity(state.setActivity, item.id, "file", "文件变更", JSON.stringify(item.changes ?? [], null, 2), item.status);
    } else if (item.type === "plan") {
      upsertCodexActivity(state.setActivity, item.id, "plan", "计划", item.text ?? "", method === "item/completed" ? "完成" : "更新中");
    } else if (item.type === "reasoning") {
      const text = [...(item.summary ?? []), ...(item.content ?? [])].join("\n");
      upsertCodexActivity(state.setActivity, item.id, "reasoning", "推理过程", text, method === "item/completed" ? "完成" : "思考中");
    } else {
      upsertCodexActivity(state.setActivity, item.id, item.type, item.type, JSON.stringify(item, null, 2), method === "item/completed" ? "完成" : "进行中");
    }
    return;
  }
  if (method === "item/agentMessage/delta") {
    state.setResponding(true);
    appendCodexMessage(state.setMessages, payload.params.itemId, "assistant", payload.params.delta ?? "");
  } else if (method === "item/commandExecution/outputDelta" || method === "command/exec/outputDelta") {
    state.setResponding(true);
    appendCodexActivity(state.setActivity, payload.params.itemId ?? payload.params.commandId ?? crypto.randomUUID(), "command", "命令输出", payload.params.delta ?? "");
  } else if (method === "item/fileChange/patchUpdated") {
    state.setResponding(true);
    upsertCodexActivity(state.setActivity, payload.params.itemId, "file", "文件变更", JSON.stringify(payload.params.changes ?? [], null, 2), "待确认");
  } else if (method === "turn/completed") {
    state.setStatusText("Codex 空闲");
    state.setResponding(false);
  }
}

function stripCodexPlanModeInstruction(text: string) {
  const prefix = "Plan mode is enabled for this thread. First produce a concise implementation plan and do not modify files or run mutating commands unless the user explicitly asks you to proceed.\n\n";
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

function getCodexEventThreadId(payload: unknown) {
  const value = payload as any;
  if (typeof value?.params?.threadId === "string") return value.params.threadId;
  if (typeof value?.threadId === "string") return value.threadId;
  if (typeof value?.thread?.id === "string") return value.thread.id;
  return undefined;
}

function upsertCodexMessage(setter: React.Dispatch<React.SetStateAction<CodexUiMessage[]>>, id: string, role: "user" | "assistant" | "system", text: string) {
  setter((current) => current.some((item) => item.id === id)
    ? current.map((item) => item.id === id ? { ...item, role, text } : item)
    : [...current, { id, role, text }]);
}

function appendCodexMessage(setter: React.Dispatch<React.SetStateAction<CodexUiMessage[]>>, id: string, role: "user" | "assistant" | "system", delta: string) {
  setter((current) => current.some((item) => item.id === id)
    ? current.map((item) => item.id === id ? { ...item, text: item.text + delta } : item)
    : [...current, { id, role, text: delta }]);
}

function upsertCodexActivity(setter: React.Dispatch<React.SetStateAction<CodexUiActivity[]>>, id: string, type: string, title: string, text: string, status?: string) {
  setter((current) => current.some((item) => item.id === id)
    ? current.map((item) => item.id === id ? { ...item, type, title, text, status } : item)
    : [...current, { id, type, title, text, status }]);
}

function appendCodexActivity(setter: React.Dispatch<React.SetStateAction<CodexUiActivity[]>>, id: string, type: string, title: string, delta: string) {
  setter((current) => current.some((item) => item.id === id)
    ? current.map((item) => item.id === id ? { ...item, text: item.text + delta } : item)
    : [...current, { id, type, title, text: delta, status: "运行中" }]);
}

function CodexRequestCard({ request, onResolve }: { request: { id: number | string; method: string; params: any }; onResolve(response: unknown): void }) {
  const command = request.params?.command;
  const reason = request.params?.reason;
  const isFileChange = request.method === "item/fileChange/requestApproval";
  const isPermissions = request.method === "item/permissions/requestApproval";
  function accept() {
    if (request.method === "item/commandExecution/requestApproval") onResolve({ decision: "accept" });
    else if (isFileChange) onResolve({ decision: "accept" });
    else if (isPermissions) onResolve({ permissions: request.params?.permissions ?? { type: "none" }, scope: "turn" });
    else onResolve({ action: "accept" });
  }
  function acceptForSession() {
    if (request.method === "item/commandExecution/requestApproval") onResolve({ decision: "acceptForSession" });
    else if (isFileChange) onResolve({ decision: "acceptForSession" });
    else accept();
  }
  function decline() {
    if (request.method === "item/commandExecution/requestApproval" || isFileChange) onResolve({ decision: "decline" });
    else onResolve({ action: "decline" });
  }
  return (
    <div className="codex-request-card">
      <strong>{isFileChange ? "允许文件变更？" : isPermissions ? "权限请求" : "允许执行命令？"}</strong>
      {reason && <p>{reason}</p>}
      {command && <pre>{command}</pre>}
      {request.params?.cwd && <span>{request.params.cwd}</span>}
      <div>
        <button type="button" onClick={accept}>允许</button>
        <button type="button" onClick={acceptForSession}>本会话允许</button>
        <button type="button" onClick={decline}>拒绝</button>
      </div>
    </div>
  );
}

function getCodexInputSuggestions(input: string, session: CodexSessionInfo | null, models: CodexModelSummary[]): CodexInputSuggestion[] {
  if (input.startsWith("/")) {
    const normalized = input.toLowerCase();
    const commandSuggestions = codexSlashCommands
      .filter((command) => command.command.startsWith(normalized))
      .map((command) => ({
        value: command.command,
        label: command.command,
        description: command.description
      }));
    if (normalized.startsWith("/model")) {
      const modelPrefix = input.slice("/model".length).trim().toLowerCase();
      const matchingModels = models
        .filter((model) => !model.hidden)
        .filter((model) => {
          const modelName = model.displayName ?? "";
          return model.id.toLowerCase().includes(modelPrefix) || modelName.toLowerCase().includes(modelPrefix);
        })
        .slice(0, 8);
      const modelSuggestions = matchingModels.map((model) => ({
          value: `/model ${model.id}${model.defaultReasoningEffort ? ` ${model.defaultReasoningEffort}` : ""}`,
          label: model.displayName ? `${model.displayName} (${model.id})` : model.id,
          description: model.isDefault ? "默认模型" : model.defaultReasoningEffort ? `默认推理强度: ${model.defaultReasoningEffort}` : "模型"
        }));
      return [...modelSuggestions, ...commandSuggestions].slice(0, 8);
    }
    return commandSuggestions.slice(0, 8);
  }
  if (input.includes("@")) {
    const prefix = input.slice(input.lastIndexOf("@") + 1).toLowerCase();
    return (session?.copiedItems ?? [])
      .map((item) => ({
        value: `${input.slice(0, input.lastIndexOf("@"))}@${item.copiedName}`,
        label: item.copiedName,
        description: item.path
      }))
      .filter((item) => item.value.toLowerCase().includes(prefix))
      .slice(0, 6);
  }
  return [];
}

function MarkdownText({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseMarkdownBlocks(text), [text]);
  return (
    <div className="codex-markdown">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <figure key={index} className="codex-code-block">
              {block.language && <figcaption>{block.language}</figcaption>}
              <pre><code>{block.text}</code></pre>
            </figure>
          );
        }
        if (block.type === "heading") {
          const Heading = `h${Math.min(3, block.level)}` as "h1" | "h2" | "h3";
          return <Heading key={index}>{renderCodexInlineMarkdown(block.text)}</Heading>;
        }
        if (block.type === "quote") return <blockquote key={index}>{renderCodexInlineMarkdown(block.text)}</blockquote>;
        if (block.type === "table") {
          return (
            <div key={index} className="codex-table-wrap">
              <table>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => rowIndex === 0
                        ? <th key={cellIndex}>{renderCodexInlineMarkdown(cell)}</th>
                        : <td key={cellIndex}>{renderCodexInlineMarkdown(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderCodexInlineMarkdown(item)}</li>)}
            </ul>
          );
        }
        return <p key={index}>{renderCodexInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

type CodexMarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "code"; text: string; language?: string };

function parseMarkdownBlocks(text: string): CodexMarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: CodexMarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];
  let table: string[][] = [];
  let code: string[] | null = null;
  let codeLanguage = "";
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list });
    list = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: "quote", text: quote.join("\n") });
    quote = [];
  };
  const flushTable = () => {
    if (table.length) blocks.push({ type: "table", rows: table });
    table = [];
  };
  const flushFlow = () => {
    flushParagraph();
    flushList();
    flushQuote();
    flushTable();
  };

  for (const line of lines) {
    const fence = line.trim().match(/^```([A-Za-z0-9_.+-]*)/);
    if (fence) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n"), language: codeLanguage || undefined });
        code = null;
        codeLanguage = "";
      } else {
        flushFlow();
        code = [];
        codeLanguage = fence[1] || "";
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const indentedCode = line.match(/^(?: {4}|\t)(.*)$/);
    if (indentedCode) {
      flushFlow();
      blocks.push({ type: "code", text: indentedCode[1] });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushFlow();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      flushTable();
      list.push(bullet[1]);
      continue;
    }
    const quoteLine = line.match(/^>\s?(.*)$/);
    if (quoteLine) {
      flushParagraph();
      flushList();
      flushTable();
      quote.push(quoteLine[1]);
      continue;
    }
    if (isMarkdownTableLine(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      const row = parseMarkdownTableRow(line);
      if (!isMarkdownTableSeparator(row)) table.push(row);
      continue;
    }
    if (!line.trim()) {
      flushFlow();
      continue;
    }
    flushList();
    flushQuote();
    flushTable();
    paragraph.push(line);
  }
  if (code) blocks.push({ type: "code", text: code.join("\n"), language: codeLanguage || undefined });
  flushFlow();
  return blocks;
}

function isMarkdownTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.split("|").filter((cell) => cell.trim()).length >= 2;
}

function parseMarkdownTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(row: string[]) {
  return row.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderCodexInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function splitDraftList(value: string) {
  return value
    .split(/[,，;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPriority(priority?: TodoPriority) {
  if (priority === "urgent") return "紧急";
  if (priority === "high") return "高";
  if (priority === "low") return "低";
  return "中";
}

function ChatMessage({
  message,
  compact = false,
  busy,
  onAccept,
  onDismiss,
  onChangeItems
}: {
  message: ConversationMessage;
  compact?: boolean;
  busy: boolean;
  onAccept(): void;
  onDismiss(): void;
  onChangeItems(items: TodoCandidate[]): void;
}) {
  return (
    <div className={`message ${message.role} ${message.taskDraftProposal ? "with-draft" : ""}`}>
      <span>{message.text}</span>
      {message.taskDraftProposal && (
        <PlanProposalCard
          plan={message.taskDraftProposal}
          compact={compact}
          busy={busy}
          status={message.taskDraftStatus ?? "pending"}
          onAccept={onAccept}
          onDismiss={onDismiss}
          onChangeItems={onChangeItems}
        />
      )}
    </div>
  );
}

function PlanProposalCard({
  plan,
  compact = false,
  busy,
  status = "pending",
  onAccept,
  onDismiss,
  onChangeItems
}: {
  plan: PlanProposal;
  compact?: boolean;
  busy: boolean;
  status?: "pending" | "accepted" | "dismissed";
  onAccept(): void;
  onDismiss(): void;
  onChangeItems(items: TodoCandidate[]): void;
}) {
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const visibleItems = compact ? plan.items.slice(0, 4) : plan.items;

  function updateItem(index: number, patch: Partial<TodoCandidate>) {
    onChangeItems(plan.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function discardItem(index: number) {
    const next = plan.items.filter((_, itemIndex) => itemIndex !== index);
    onChangeItems(next);
    setEditingIndex(null);
    if (!next.length) onDismiss();
  }

  return (
    <section className={`plan-card ${compact ? "compact" : ""}`}>
      <div className="plan-card-header">
        <div>
          <strong>{plan.summary || "任务草案"}</strong>
          <span>
            {status === "accepted"
              ? "已确认保存"
              : status === "dismissed"
                ? "未采纳，保留为历史草案"
                : "AI 只生成草案，确认后才会保存"}
          </span>
        </div>
        <Sparkles size={16} />
      </div>
      <div className="plan-items">
        {visibleItems.map((item, index) => (
          <div key={`${item.title}-${index}`} className="plan-item draft-item">
            <span className="plan-index">{index + 1}</span>
            <div>
              {editingIndex === index && status === "pending" ? (
                <div className="draft-edit-form">
                  <input
                    value={item.title}
                    onChange={(event) => updateItem(index, { title: event.target.value })}
                    placeholder="任务内容"
                  />
                  <div className="draft-edit-grid">
                    <input
                      value={item.project ?? ""}
                      onChange={(event) => updateItem(index, { project: event.target.value || undefined })}
                      placeholder="项目"
                    />
                    <select
                      value={item.priority ?? "medium"}
                      onChange={(event) => updateItem(index, { priority: event.target.value as TodoPriority })}
                    >
                      <option value="low">低</option>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                      <option value="urgent">紧急</option>
                    </select>
                  </div>
                  <div className="draft-edit-grid">
                    <input
                      value={toDatetimeLocalValue(item.dueAt)}
                      onChange={(event) => updateItem(index, { dueAt: fromDatetimeLocalValue(event.target.value) })}
                      type="datetime-local"
                      title="截止时间"
                    />
                    <input
                      value={item.repeatRule ?? ""}
                      onChange={(event) => updateItem(index, { repeatRule: event.target.value || undefined })}
                      placeholder="重复，例如每周五"
                    />
                  </div>
                  <input
                    value={(item.tags ?? []).join(", ")}
                    onChange={(event) => updateItem(index, { tags: splitDraftList(event.target.value) })}
                    placeholder="标签，用逗号分隔"
                  />
                  <textarea
                    value={item.notes ?? ""}
                    onChange={(event) => updateItem(index, { notes: event.target.value || undefined })}
                    placeholder="备注"
                    rows={2}
                  />
                  <input
                    value={(item.subtasks ?? []).map((subtask) => subtask.title).join(", ")}
                    onChange={(event) => updateItem(index, { subtasks: splitDraftList(event.target.value).map((title) => ({ title, done: false })) })}
                    placeholder="子任务，用逗号分隔"
                  />
                  <input
                    value={(item.attachments ?? []).join(", ")}
                    onChange={(event) => updateItem(index, { attachments: splitDraftList(event.target.value) })}
                    placeholder="备注附件名称/路径，用逗号分隔"
                  />
                  <div className="draft-actions">
                    <button type="button" onClick={() => setEditingIndex(null)} disabled={busy}>
                      <Check size={14} /> 完成
                    </button>
                    <button type="button" onClick={() => discardItem(index)} disabled={busy}>
                      <Trash2 size={14} /> 丢弃
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>{item.title}</strong>
                  <div className="draft-meta">
                    {item.project && <small>项目：{item.project}</small>}
                    <small>优先级：{formatPriority(item.priority)}</small>
                    {(item.remindAt || item.dueAt) && <small>截止：{formatPlanTime(item.dueAt ?? item.remindAt)}</small>}
                    {item.repeatRule && <small>重复：{item.repeatRule}</small>}
                    {!!item.tags?.length && <small>标签：{item.tags.join(" / ")}</small>}
                  </div>
                  {item.notes && !compact && <p>{item.notes}</p>}
                  {!!item.subtasks?.length && !compact && <p>子任务：{item.subtasks.map((subtask) => subtask.title).join("；")}</p>}
                  {!!item.attachments?.length && !compact && <p>附件：{item.attachments.join("；")}</p>}
                  <div className="draft-actions">
                    <button type="button" onClick={() => setEditingIndex(index)} disabled={busy || status !== "pending"}>
                      <Pencil size={14} /> 编辑
                    </button>
                    <button type="button" onClick={() => discardItem(index)} disabled={busy || status !== "pending"}>
                      <Trash2 size={14} /> 丢弃
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {compact && plan.items.length > visibleItems.length && (
          <div className="plan-more">还有 {plan.items.length - visibleItems.length} 个步骤</div>
        )}
      </div>
      {status === "pending" ? (
        <div className="plan-actions">
          <button type="button" onClick={onAccept} disabled={busy || !plan.items.length}>
            <Check size={14} /> {busy ? "写入中..." : "确认写入"}
          </button>
          <button type="button" onClick={onDismiss} disabled={busy}>
            <X size={14} /> 暂不写入
          </button>
        </div>
      ) : (
        <div className={`draft-status ${status}`}>
          {status === "accepted" ? <Check size={14} /> : <X size={14} />}
          {status === "accepted" ? "用户已确认保存" : "用户未采纳"}
        </div>
      )}
    </section>
  );
}

const translationLanguageOptions = [
  { value: "auto", label: "自动" },
  { value: "中文", label: "中文" },
  { value: "English", label: "English" },
  { value: "日本語", label: "日本語" },
  { value: "한국어", label: "한국어" },
  { value: "Français", label: "Français" },
  { value: "Deutsch", label: "Deutsch" }
];

function SelectionResultWindow({
  api,
  resultId,
  themeStyle
}: {
  api?: DesktopPetApi;
  resultId: string;
  themeStyle: React.CSSProperties;
}) {
  const [result, setResult] = React.useState<SelectionTextResult | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!api) {
      setError("Electron API 未连接。");
      return;
    }
    if (!resultId) {
      setError("结果 ID 缺失。");
      return;
    }
    let disposed = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const value = await api.selection.getResult(resultId);
        if (disposed) return;
        if (!value) {
          setError("没有找到这次处理结果。");
          return;
        }
        setResult(value);
        if (value.status === "pending") {
          timer = window.setTimeout(load, 500);
        } else if (value.status === "error") {
          setError(value.error ?? "处理失败。");
        }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : "读取结果失败。");
      }
    };
    void load();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [api, resultId]);

  React.useEffect(() => {
    if (!api || !resultId || result?.status !== "pending") return;
    const timer = window.setInterval(() => {
      void api.selection.getResult(resultId).then((value) => {
        if (value) {
          setResult(value);
          if (value.status === "error") setError(value.error ?? "处理失败。");
        }
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [api, result?.status, resultId]);

  const loadingText = result?.action === "translate" ? "正在翻译中..." : result?.action === "summarize" ? "正在总结中..." : "正在加载结果...";

  async function changeTargetLanguage(targetLanguage: string) {
    if (!api || !result || result.action !== "translate" || result.status === "pending") return;
    setError("");
    const pending = await api.selection.retranslate(result.id, targetLanguage);
    setResult(pending);
  }

  return (
    <main
      className="selection-result-shell"
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
      <header className="selection-result-header">
        <div className="selection-result-title">
          <strong>{result?.title ?? "Linnea"}</strong>
          {result?.action === "translate" && (
            <label className="translation-target">
              <span>目标语言</span>
              <select
                value={result.targetLanguage ?? "auto"}
                disabled={result.status === "pending"}
                onChange={(event) => void changeTargetLanguage(event.target.value)}
              >
                {translationLanguageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {result && <span>{new Date(result.createdAt).toLocaleString()}</span>}
      </header>
      <section className="selection-result-body">
        {error ? (
          <div className="summary-error">{error}</div>
        ) : result && result.status !== "pending" && result.markdown ? (
          <MarkdownView markdown={result.markdown} />
        ) : (
          <div className="selection-result-loading">
            <span className="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            {loadingText}
          </div>
        )}
      </section>
    </main>
  );
}

function GlobalSelectionPopoverWindow({
  api,
  captureId,
  placement,
  themeStyle
}: {
  api?: DesktopPetApi;
  captureId: string;
  placement: "right" | "left";
  themeStyle: React.CSSProperties;
}) {
  const [capture, setCapture] = React.useState<SelectionCapture | null>(null);
  const [busyAction, setBusyAction] = React.useState<SelectionAction | null>(null);
  const [askDraft, setAskDraft] = React.useState<SelectionAskDraft>({ count: 0, text: "" });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!api) {
      setError("API 未连接");
      return;
    }
    if (!captureId) {
      setError("选区丢失");
      return;
    }
    void api.selection.getCapture(captureId)
      .then((value) => {
        if (value) setCapture(value);
        else setError("选区已失效");
      })
      .catch(() => setError("读取选区失败"));
    void api.selection.getAskDraft().then(setAskDraft).catch(() => undefined);
  }, [api, captureId]);

  React.useEffect(() => {
    if (busyAction) return;
    const timer = window.setTimeout(() => window.close(), 4500);
    return () => window.clearTimeout(timer);
  }, [busyAction]);

  React.useEffect(() => {
    return () => {
      void api?.selection.resizePopover(false);
    };
  }, [api]);

  async function runAction(action: SelectionAction) {
    if (!api || !capture || busyAction) return;
    setBusyAction(action);
    setError("");
    try {
      const resolvedCapture = await api.selection.resolveCapture(capture.id);
      setCapture(resolvedCapture);
      if (action === "todo") {
        await api.selection.createTodoFromCapture(resolvedCapture.id);
      } else if (action === "ask") {
        setAskDraft(await api.selection.addAskCapture(resolvedCapture.id));
        setBusyAction(null);
        return;
      } else if (action === "ask-submit") {
        if (askDraft.count === 0) await api.selection.addAskCapture(resolvedCapture.id);
        await api.selection.submitAskDraft();
      } else {
        await api.selection.process(action, resolvedCapture.text);
      }
      window.close();
    } catch (reason) {
      if (reason instanceof Error && /没有读取到选中文字|Selected text is empty/i.test(reason.message)) {
        window.close();
        return;
      }
      setError(reason instanceof Error ? reason.message : "处理失败");
      setBusyAction(null);
    }
  }

  return (
    <main
      className={`global-selection-popover-shell ${placement === "left" ? "expand-left" : "expand-right"}`}
      style={themeStyle}
      onMouseEnter={() => void api?.selection.resizePopover(true)}
      onMouseLeave={() => void api?.selection.resizePopover(false)}
      onFocus={() => void api?.selection.resizePopover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          void api?.selection.resizePopover(false);
        }
      }}
    >
      {error ? (
        <div className="global-selection-error">{error}</div>
      ) : (
        <>
          <span className="selection-popover-dot" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <div className="selection-toolbar" aria-label="选中文字操作">
            <button type="button" title="总结" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("summarize")}>
              <FileText size={14} /> {busyAction === "summarize" ? "总结中..." : "总结"}
            </button>
            <button type="button" title="翻译" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("translate")}>
              <Languages size={14} /> {busyAction === "translate" ? "翻译中..." : "翻译"}
            </button>
            <button type="button" title="生成待办" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("todo")}>
              <ListTodo size={14} /> {busyAction === "todo" ? "整理中..." : "待办"}
            </button>
            <button type="button" title="加入提问" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("ask")}>
              <MessageCircle size={14} /> {busyAction === "ask" ? "加入中..." : `加入${askDraft.count ? ` ${askDraft.count}` : ""}`}
            </button>
            <button type="button" title="提交提问" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("ask-submit")}>
              <Sparkles size={14} /> {busyAction === "ask-submit" ? "打开中..." : "提问"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function MarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {listItems.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = renderInlineMarkdown(heading[2]);
      blocks.push(level === 1
        ? <h1 key={index}>{content}</h1>
        : level === 2
          ? <h2 key={index}>{content}</h2>
          : <h3 key={index}>{content}</h3>);
      return;
    }
    const list = /^[-*]\s+(.+)$/.exec(trimmed) ?? /^\d+\.\s+(.+)$/.exec(trimmed);
    if (list) {
      listItems.push(list[1]);
      return;
    }
    flushList();
    blocks.push(<p key={index}>{renderInlineMarkdown(trimmed)}</p>);
  });
  flushList();

  return <article className="markdown-output">{blocks}</article>;
}

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${token}-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={`${token}-${match.index}`}>{token.slice(1, -1)}</code>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function SummaryPanel({
  todos,
  summaryText,
  summaryBusy,
  summaryError,
  onGenerateSummary,
  onToggleTodo,
  onUpdateTodo,
  onQuickAdd
}: {
  todos: TodoItem[];
  summaryText: string;
  summaryBusy: boolean;
  summaryError: string;
  onGenerateSummary(): void;
  onToggleTodo(todo: TodoItem): void;
  onUpdateTodo(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "notes" | "project" | "tags" | "priority" | "status" | "remindAt" | "dueAt" | "scheduledStartAt" | "scheduledEndAt" | "isAllDayScheduled" | "repeatRule" | "subtasks" | "attachments" | "completedAt">>): void;
  onQuickAdd(text: string): void;
}) {
  type SummaryRange = "today" | "week" | "month";
  const [range, setRange] = React.useState<SummaryRange>("today");
  const [searchText, setSearchText] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState<TodoPriority | "all">("all");
  const [quickText, setQuickText] = React.useState("");
  const data = React.useMemo(() => getSummaryDashboardData(todos, { searchText, priorityFilter }), [priorityFilter, searchText, todos]);

  function submitQuickAdd(event: React.FormEvent) {
    event.preventDefault();
    const text = quickText.trim();
    if (!text) return;
    onQuickAdd(text);
    setQuickText("");
  }

  function scheduleToday(todo: TodoItem) {
    const start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (start.getTime() < Date.now()) start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 60 * 60_000);
    onUpdateTodo(todo, {
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      isAllDayScheduled: false
    });
  }

  function postponeTomorrow(todo: TodoItem) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(18, 0, 0, 0);
    onUpdateTodo(todo, { dueAt: date.toISOString() });
  }

  return (
    <section className="summary-page">
      <div className="summary-toolbar">
        <div className="summary-range-controls">
          {(["today", "week", "month"] as SummaryRange[]).map((item) => (
            <button key={item} type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)}>
              {item === "today" ? "今天" : item === "week" ? "本周" : "本月"}
            </button>
          ))}
          <strong>{formatSummaryRangeTitle(range)}</strong>
        </div>
        <label className="summary-search">
          <Search size={14} />
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索任务" />
        </label>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as TodoPriority | "all")}>
          <option value="all">全部优先级</option>
          <option value="urgent">P0</option>
          <option value="high">P1</option>
          <option value="medium">P2</option>
          <option value="low">P3</option>
        </select>
        <form className="summary-quick-add" onSubmit={submitQuickAdd}>
          <input value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="快速新建：明天 5 点 @项目 #标签" />
          <button type="submit"><Send size={14} /></button>
        </form>
      </div>

      <div className="summary-main-column">
        <section className="summary-card summary-plan-card">
          <div className="summary-card-title">
            <CalendarDays size={17} />
            Plan
          </div>
          <SummaryPlanGroup title="今日已计划" items={data.scheduledToday} emptyText="今天还没有安排时间块。" onComplete={onToggleTodo} onScheduleToday={scheduleToday} onPostpone={postponeTomorrow} />
          <SummaryPlanGroup title="今日到期但未计划" items={data.dueTodayUnscheduled} emptyText="今天没有到期未计划任务。" onComplete={onToggleTodo} onScheduleToday={scheduleToday} onPostpone={postponeTomorrow} />
          <SummaryPlanGroup title="接下来 7 天重点" items={data.next7Focus.slice(0, 5)} emptyText="未来 7 天没有需要提前关注的任务。" collapsible onComplete={onToggleTodo} onScheduleToday={scheduleToday} onPostpone={postponeTomorrow} />
        </section>

        <section className="summary-card summary-review-card">
          <div className="summary-card-title">
            <BarChart3 size={17} />
            Review
          </div>
          <div className="summary-kpi-strip">
            <Metric label="新增" value={data.todayCreated.length} />
            <Metric label="完成" value={data.todayDone.length} />
            <Metric label="未完成" value={data.openTodos.length} />
            <Metric label="完成率" value={data.completionRate} suffix="%" />
            <Metric label="计划兑现率" value={data.scheduleCompletionRate} suffix="%" />
          </div>
          <div className="summary-ai-review">
            <div className="summary-card-title">
              <Sparkles size={17} />
              今日复盘
              <button className="summary-generate-button" onClick={onGenerateSummary} disabled={summaryBusy}>
                {summaryBusy ? "生成中..." : "生成/刷新"}
              </button>
            </div>
            {summaryError && <div className="summary-error">{summaryError}</div>}
            {summaryText ? (
              <p className="summary-text">{summaryText}</p>
            ) : (
              <div className="summary-empty">模板：今天完成了什么、哪些计划没兑现、明天最重要的三件事。</div>
            )}
          </div>
        </section>
      </div>

      <aside className="summary-risk-inbox">
        <div className="summary-card-title">
          <AlertTriangle size={17} />
          Risk Inbox
        </div>
        {data.risks.length === 0 ? (
          <div className="summary-empty">暂无高风险任务。</div>
        ) : (
          data.risks.slice(0, 5).map((risk) => (
            <div key={`${risk.type}-${risk.todo.id}`} className="summary-risk-item">
              <strong>{risk.todo.title}</strong>
              <span>{risk.label}</span>
              {risk.detail && <small>{risk.detail}</small>}
              <div>
                <button type="button" onClick={() => scheduleToday(risk.todo)}>安排到今天</button>
                <button type="button" onClick={() => postponeTomorrow(risk.todo)}>延后</button>
                <button type="button" onClick={() => onToggleTodo(risk.todo)}>完成</button>
              </div>
            </div>
          ))
        )}
      </aside>
    </section>
  );
}

function CalendarPanel({
  todos,
  onToggle,
  onUpdate,
  onDelete,
  onQuickAdd
}: {
  todos: TodoItem[];
  onToggle(todo: TodoItem): void;
  onUpdate(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "notes" | "project" | "tags" | "priority" | "status" | "remindAt" | "dueAt" | "scheduledStartAt" | "scheduledEndAt" | "isAllDayScheduled" | "repeatRule" | "subtasks" | "attachments" | "completedAt">>): void;
  onDelete(todo: TodoItem): void;
  onQuickAdd(text: string): void;
}) {
  type CalendarView = "day" | "week" | "month";
  const [currentTime, setCurrentTime] = React.useState(() => new Date());
  const [view, setView] = React.useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = React.useState(() => startOfDay(new Date()));
  const [selectedTodoId, setSelectedTodoId] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState<TodoPriority | "all">("all");
  const [quickText, setQuickText] = React.useState("");

  React.useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const weekStart = React.useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const visibleDays = React.useMemo(() => {
    const dayCount = view === "day" ? 1 : 7;
    const start = view === "day" ? startOfDay(anchorDate) : weekStart;
    return Array.from({ length: dayCount }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [anchorDate, view, weekStart]);
  const filteredTodos = React.useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return todos.filter((todo) => {
      if (priorityFilter !== "all" && todo.priority !== priorityFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [todo.title, todo.notes, todo.project, ...(todo.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [priorityFilter, searchText, todos]);
  const backlogTodos = React.useMemo(() => filteredTodos
    .filter((todo) => todo.status === "open" && !todo.scheduledStartAt)
    .sort(compareTodosForWork), [filteredTodos]);
  const selectedTodo = todos.find((todo) => todo.id === selectedTodoId) ?? null;
  const rangeTitle = formatCalendarRange(view, anchorDate, visibleDays);
  const calendarDataVersion = React.useMemo(
    () => todos.map((todo) => [
      todo.id,
      todo.status,
      todo.dueAt,
      todo.remindAt,
      todo.scheduledStartAt,
      todo.scheduledEndAt,
      todo.isAllDayScheduled
    ].join(":")).join("|"),
    [todos]
  );

  function moveRange(delta: number) {
    if (view === "month") {
      setAnchorDate((date) => startOfMonth(new Date(date.getFullYear(), date.getMonth() + delta, 1)));
      return;
    }
    const days = view === "day" ? 1 : 7;
    setAnchorDate((date) => startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta * days)));
  }

  function submitQuickAdd(event: React.FormEvent) {
    event.preventDefault();
    const text = quickText.trim();
    if (!text) return;
    onQuickAdd(text);
    setQuickText("");
  }

  function scheduleTodo(todo: TodoItem, day: Date, hour = 9, allDay = false) {
    const start = new Date(day);
    start.setHours(allDay ? 0 : hour, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + (allDay ? 24 * 60 - 1 : 60));
    onUpdate(todo, {
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      isAllDayScheduled: allDay
    });
    setSelectedTodoId(todo.id);
  }

  function unscheduleTodo(todo: TodoItem) {
    onUpdate(todo, {
      scheduledStartAt: undefined,
      scheduledEndAt: undefined,
      isAllDayScheduled: false
    });
  }

  return (
    <section className="calendar-page">
      <div className="calendar-toolbar">
        <div className="calendar-range-controls">
          <button type="button" onClick={() => setAnchorDate(startOfDay(new Date()))}>今天</button>
          <button type="button" onClick={() => moveRange(-1)} aria-label="上一段">‹</button>
          <strong>{rangeTitle}</strong>
          <button type="button" onClick={() => moveRange(1)} aria-label="下一段">›</button>
        </div>
        <div className="calendar-view-switch">
          {(["day", "week", "month"] as CalendarView[]).map((item) => (
            <button key={item} type="button" className={view === item ? "active" : ""} onClick={() => setView(item)}>
              {item === "day" ? "日" : item === "week" ? "周" : "月"}
            </button>
          ))}
        </div>
        <label className="calendar-search">
          <Search size={14} />
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索任务" />
        </label>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as TodoPriority | "all")}>
          <option value="all">全部优先级</option>
          <option value="urgent">P0</option>
          <option value="high">P1</option>
          <option value="medium">P2</option>
          <option value="low">P3</option>
        </select>
        <form className="calendar-quick-add" onSubmit={submitQuickAdd}>
          <input value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="新建任务：@项目 #标签 !P0" />
          <button type="submit"><Send size={14} /></button>
        </form>
      </div>

      <aside className="calendar-backlog">
        <div className="calendar-backlog-header">
          <strong>任务池</strong>
          <span>{currentTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <section>
          <div className="calendar-pool-title">智能队列</div>
          <div className="calendar-quick-picks">
            <span>逾期 {backlogTodos.filter((todo) => isOverdueOpenTodo(todo, Date.now())).length}</span>
            <span>24h {backlogTodos.filter((todo) => {
              const time = getTodoTargetTime(todo);
              return typeof time === "number" && time <= Date.now() + 24 * 60 * 60_000;
            }).length}</span>
            <span>P0 {backlogTodos.filter((todo) => todo.priority === "urgent").length}</span>
          </div>
        </section>
        <section>
          <div className="calendar-pool-title">待安排</div>
          <div className="calendar-backlog-list">
            {backlogTodos.length === 0 && <div className="calendar-empty">没有待安排任务。</div>}
            {backlogTodos.map((todo) => (
              <button
                key={todo.id}
                type="button"
                className={`calendar-backlog-task ${selectedTodoId === todo.id ? "selected" : ""}`}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", todo.id)}
                onClick={() => setSelectedTodoId(todo.id)}
              >
                <strong>{todo.title}</strong>
                <span>
                  <small className={`priority-chip priority-${todo.priority ?? "medium"}`}>{formatPriority(todo.priority)}</small>
                  {todo.dueAt && <small>截止 {formatRelativeTodoTime(todo)}</small>}
                  {todo.project && <small>@{todo.project}</small>}
                  {!!todo.subtasks?.length && <small>{todo.subtasks.length} 子任务</small>}
                  {!!todo.attachments?.length && <Paperclip size={12} />}
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className={`calendar-canvas ${view}`}>
        {view === "month" ? (
          <CalendarMonthCanvas
            key={`${formatDateKey(startOfMonth(anchorDate))}-${calendarDataVersion}`}
            anchorDate={anchorDate}
            todos={filteredTodos}
            now={currentTime.getTime()}
            selectedTodoId={selectedTodoId}
            onSelectTodo={setSelectedTodoId}
            onSelectDate={(date) => {
              setAnchorDate(date);
              setView("day");
            }}
          />
        ) : (
          <CalendarTimeCanvas
            days={visibleDays}
            todos={filteredTodos}
            now={currentTime.getTime()}
            selectedTodoId={selectedTodoId}
            onSelectTodo={setSelectedTodoId}
            onSchedule={scheduleTodo}
            onUnschedule={unscheduleTodo}
          />
        )}
      </section>

      <TaskDetailPanel
        todo={selectedTodo}
        onSave={(todo, patch) => onUpdate(todo, patch)}
        onDelete={(todo) => onDelete(todo)}
      />
    </section>
  );
}

function CalendarTimeCanvas({
  days,
  todos,
  now,
  selectedTodoId,
  onSelectTodo,
  onSchedule,
  onUnschedule
}: {
  days: Date[];
  todos: TodoItem[];
  now: number;
  selectedTodoId: string | null;
  onSelectTodo(id: string): void;
  onSchedule(todo: TodoItem, day: Date, hour?: number, allDay?: boolean): void;
  onUnschedule(todo: TodoItem): void;
}) {
  const hours = Array.from({ length: 14 }, (_, index) => index + 8);
  const scheduledTodos = todos.filter((todo) => todo.scheduledStartAt);

  function readDraggedTodo(event: React.DragEvent) {
    const id = event.dataTransfer.getData("text/plain");
    return todos.find((todo) => todo.id === id);
  }

  return (
    <div className="calendar-time-canvas">
      <div className="calendar-time-head-spacer" />
      {days.map((day) => (
        <div key={formatDateKey(day)} className="calendar-day-heading">
          <strong>{day.toLocaleDateString(undefined, { weekday: "short" })}</strong>
          <span>{day.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })}</span>
        </div>
      ))}
      <div className="calendar-all-day-label">全天</div>
      {days.map((day) => (
        <div
          key={`${formatDateKey(day)}-all`}
          className="calendar-all-day-cell"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const todo = readDraggedTodo(event);
            if (todo) onSchedule(todo, day, 0, true);
          }}
        >
          {scheduledTodos
            .filter((todo) => todo.isAllDayScheduled && isSameDay(new Date(todo.scheduledStartAt!), day))
            .map((todo) => (
              <CalendarBlock key={todo.id} todo={todo} now={now} selected={selectedTodoId === todo.id} onSelect={onSelectTodo} onUnschedule={onUnschedule} />
            ))}
        </div>
      ))}
      {hours.map((hour) => (
        <React.Fragment key={hour}>
          <div className="calendar-hour-label">{String(hour).padStart(2, "0")}:00</div>
          {days.map((day) => (
            <div
              key={`${formatDateKey(day)}-${hour}`}
              className="calendar-hour-cell"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const todo = readDraggedTodo(event);
                if (todo) onSchedule(todo, day, hour, false);
              }}
            >
              {scheduledTodos
                .filter((todo) => !todo.isAllDayScheduled && isSameDay(new Date(todo.scheduledStartAt!), day) && new Date(todo.scheduledStartAt!).getHours() === hour)
                .map((todo) => (
                  <CalendarBlock key={todo.id} todo={todo} now={now} selected={selectedTodoId === todo.id} onSelect={onSelectTodo} onUnschedule={onUnschedule} />
                ))}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function CalendarBlock({
  todo,
  now,
  selected,
  onSelect,
  onUnschedule
}: {
  todo: TodoItem;
  now: number;
  selected: boolean;
  onSelect(id: string): void;
  onUnschedule(todo: TodoItem): void;
}) {
  const risk = getCalendarRisk(todo, now);
  return (
    <button
      type="button"
      className={`calendar-block priority-${todo.priority ?? "medium"} ${risk ? "risk" : ""} ${todo.status === "done" ? "done" : ""} ${selected ? "selected" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(todo.id);
      }}
    >
      {risk && <b className="calendar-risk-mark" aria-label={risk}>!</b>}
      <strong>{todo.title}</strong>
      <span>{todo.isAllDayScheduled ? "全天" : formatScheduledTime(todo)}</span>
      <i
        role="button"
        tabIndex={0}
        aria-label="移回任务池"
        onClick={(event) => {
          event.stopPropagation();
          onUnschedule(todo);
        }}
      >
        ×
      </i>
    </button>
  );
}

function CalendarMonthCanvas({
  anchorDate,
  todos,
  now,
  selectedTodoId,
  onSelectTodo,
  onSelectDate
}: {
  anchorDate: Date;
  todos: TodoItem[];
  now: number;
  selectedTodoId: string | null;
  onSelectTodo(id: string): void;
  onSelectDate(date: Date): void;
}) {
  const monthStart = startOfMonth(anchorDate);
  const days = getCalendarMonthDays(monthStart);
  return (
    <div className="calendar-month-canvas">
      {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day} className="calendar-month-weekday">{day}</span>)}
      {days.map((day) => {
        const dayTodos = todos
          .filter((todo) => isSameDay(getCalendarDisplayDate(todo), day))
          .sort(compareTodosForWork);
        return (
          <button
            key={formatDateKey(day)}
            type="button"
            className={`calendar-month-day ${day.getMonth() === monthStart.getMonth() ? "" : "muted"} ${isSameDay(day, new Date()) ? "today" : ""}`}
            onClick={() => onSelectDate(day)}
          >
            <strong>{day.getDate()}</strong>
            <div>
              {dayTodos.slice(0, 3).map((todo) => (
                <span key={todo.id} className={`${getCalendarMonthTodoClass(todo, now)} ${selectedTodoId === todo.id ? "selected" : ""}`} onClick={(event) => {
                  event.stopPropagation();
                  onSelectTodo(todo.id);
                }}>
                  {getCalendarRisk(todo, now) && <b>!</b>}
                  {todo.title}
                </span>
              ))}
              {dayTodos.length > 3 && <small>+{dayTodos.length - 3} 更多</small>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function getCalendarMonthTodoClass(todo: TodoItem, now: number) {
  const classes = ["calendar-month-todo"];
  if (todo.status === "done") classes.push("done");
  else if (getCalendarRisk(todo, now)) classes.push("risk");
  else if (todo.scheduledStartAt) classes.push("scheduled");
  else classes.push("open");
  return classes.join(" ");
}

function getCalendarRisk(todo: TodoItem, now: number) {
  if (todo.status !== "open") return "";
  const due = getTodoTime(todo.dueAt);
  const remind = getTodoTime(todo.remindAt);
  const scheduledStart = getTodoTime(todo.scheduledStartAt);
  const scheduledEnd = getTodoTime(todo.scheduledEndAt) ?? scheduledStart;
  if (typeof due === "number" && ((typeof scheduledStart === "number" && scheduledStart > due) || (typeof scheduledEnd === "number" && scheduledEnd > due))) {
    return "计划晚于截止";
  }
  const target = scheduledEnd ?? due ?? remind;
  if (typeof target === "number" && target <= now) return "已超过当前时间";
  return "";
}

function getTodoTime(value: string | undefined) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function SummaryPlanGroup({
  title,
  items,
  emptyText,
  collapsible = false,
  onComplete,
  onScheduleToday,
  onPostpone
}: {
  title: string;
  items: TodoItem[];
  emptyText: string;
  collapsible?: boolean;
  onComplete(todo: TodoItem): void;
  onScheduleToday(todo: TodoItem): void;
  onPostpone(todo: TodoItem): void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <section className="summary-plan-group">
      <button type="button" className="summary-plan-group-title" onClick={() => collapsible && setCollapsed((value) => !value)}>
        <span>{title}</span>
        <small>{items.length}</small>
      </button>
      {!collapsed && (
        <div className="summary-action-list">
          {items.length === 0 && <div className="summary-empty">{emptyText}</div>}
          {items.map((todo) => (
            <div key={todo.id} className="summary-action-item">
              <div>
                <strong>{todo.title}</strong>
                <span>
                  {todo.scheduledStartAt ? formatScheduledTime(todo) : todo.dueAt ? formatRelativeTodoTime(todo) : "无日期"}
                  {todo.project ? ` · ${todo.project}` : ""}
                </span>
              </div>
              <div>
                <button type="button" onClick={() => onComplete(todo)}>完成</button>
                <button type="button" onClick={() => onScheduleToday(todo)}>安排</button>
                <button type="button" onClick={() => onPostpone(todo)}>延后</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function getSummaryDashboardData(todos: TodoItem[], filters: { searchText: string; priorityFilter: TodoPriority | "all" }) {
  const now = Date.now();
  const todayStart = startOfDay(new Date()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  const next7End = todayStart + 8 * 24 * 60 * 60_000;
  const weekStart = startOfWeek(new Date()).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60_000;
  const normalizedSearch = filters.searchText.trim().toLowerCase();
  const scopedTodos = todos.filter((todo) => {
    if (filters.priorityFilter !== "all" && todo.priority !== filters.priorityFilter) return false;
    if (!normalizedSearch) return true;
    return [todo.title, todo.notes, todo.project, ...(todo.tags ?? [])].join(" ").toLowerCase().includes(normalizedSearch);
  });
  const unfinished = scopedTodos.filter((todo) => todo.status === "open");
  const scheduledToday = unfinished
    .filter((todo) => scheduledIntersects(todo, todayStart, tomorrowStart))
    .sort((a, b) => (getScheduleStartTime(a) ?? 0) - (getScheduleStartTime(b) ?? 0));
  const scheduledTodayIds = new Set(scheduledToday.map((todo) => todo.id));
  const dueTodayUnscheduled = unfinished
    .filter((todo) => isDueInRange(todo, todayStart, tomorrowStart) && !scheduledTodayIds.has(todo.id))
    .sort(compareTodosForWork);
  const dueTodayIds = new Set(dueTodayUnscheduled.map((todo) => todo.id));
  const next7Focus = unfinished
    .filter((todo) => isDueInRange(todo, tomorrowStart, next7End) && !scheduledInRange(todo, todayStart, next7End) && !scheduledTodayIds.has(todo.id) && !dueTodayIds.has(todo.id))
    .sort(compareTodosForWork);
  const todayCreated = scopedTodos.filter((todo) => isTimeInRange(todo.createdAt, todayStart, tomorrowStart));
  const todayDone = scopedTodos.filter((todo) => todo.status === "done" && isTimeInRange(todo.completedAt ?? todo.createdAt, todayStart, tomorrowStart));
  const openTodos = scopedTodos.filter((todo) => todo.status === "open");
  const plannedToday = scopedTodos.filter((todo) => scheduledIntersects(todo, todayStart, tomorrowStart));
  const completedPlannedToday = plannedToday.filter((todo) => todo.status === "done");
  const completionRate = Math.round((todayDone.length / Math.max(1, todayDone.length + openTodos.length)) * 100);
  const scheduleCompletionRate = Math.round((completedPlannedToday.length / Math.max(1, plannedToday.length)) * 100);
  const risks = buildSummaryRisks(unfinished, now, weekStart, weekEnd);
  return { scheduledToday, dueTodayUnscheduled, next7Focus, todayCreated, todayDone, openTodos, completionRate, scheduleCompletionRate, risks };
}

function buildSummaryRisks(todos: TodoItem[], now: number, weekStart: number, weekEnd: number) {
  const risks: Array<{ todo: TodoItem; type: string; label: string; detail?: string }> = [];
  for (const todo of todos) {
    const due = todo.dueAt ? new Date(todo.dueAt).getTime() : undefined;
    const remind = todo.remindAt ? new Date(todo.remindAt).getTime() : undefined;
    const scheduledThisWeek = scheduledInRange(todo, weekStart, weekEnd);
    if (typeof due === "number" && due < now) risks.push({ todo, type: "overdue", label: "逾期未完成", detail: formatRelativeTodoTime(todo) });
    else if (typeof due === "number" && due < now + 24 * 60 * 60_000 && !todo.scheduledStartAt) risks.push({ todo, type: "due24", label: "24h 内到期且未计划", detail: formatRelativeTodoTime(todo) });
    else if (typeof remind === "number" && remind <= now) risks.push({ todo, type: "reminder", label: "提醒已到" });
    else if ((todo.priority === "urgent" || todo.priority === "high") && !scheduledThisWeek) risks.push({ todo, type: "priority", label: "高优先级但本周未计划" });
  }
  return risks.slice(0, 12);
}

function scheduledIntersects(todo: TodoItem, start: number, end: number) {
  const scheduledStart = getScheduleStartTime(todo);
  const scheduledEnd = todo.scheduledEndAt ? new Date(todo.scheduledEndAt).getTime() : scheduledStart;
  if (typeof scheduledStart !== "number" || !Number.isFinite(scheduledEnd ?? NaN)) return false;
  return scheduledStart < end && (scheduledEnd ?? scheduledStart) >= start;
}

function scheduledInRange(todo: TodoItem, start: number, end: number) {
  const scheduledStart = getScheduleStartTime(todo);
  return typeof scheduledStart === "number" && scheduledStart >= start && scheduledStart < end;
}

function getScheduleStartTime(todo: TodoItem) {
  if (!todo.scheduledStartAt) return undefined;
  const time = new Date(todo.scheduledStartAt).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function isDueInRange(todo: TodoItem, start: number, end: number) {
  if (!todo.dueAt) return false;
  const time = new Date(todo.dueAt).getTime();
  return Number.isFinite(time) && time >= start && time < end;
}

function formatSummaryRangeTitle(range: "today" | "week" | "month") {
  const now = new Date();
  if (range === "week") {
    const start = startOfWeek(now);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
  if (range === "month") return now.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  return now.toLocaleDateString();
}

function Metric({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="summary-metric">
      <strong>{value}{suffix}</strong>
      <span>{label}</span>
    </div>
  );
}

function CompactTodoList({ todos, emptyText, urgent = false }: { todos: TodoItem[]; emptyText: string; urgent?: boolean }) {
  if (todos.length === 0) return <div className="summary-empty">{emptyText}</div>;
  return (
    <div className="summary-todo-list">
      {todos.slice(0, 5).map((todo) => (
        <div key={todo.id} className={`summary-todo ${urgent ? "urgent" : ""}`}>
          <span>{todo.title}</span>
          {(todo.remindAt || todo.dueAt) && <small>{new Date(todo.remindAt ?? todo.dueAt!).toLocaleString()}</small>}
        </div>
      ))}
    </div>
  );
}

function getPetVisualState({
  mood,
  dragging,
  hasOverdueOpenTodo,
  idleMs,
  chatOpen
}: {
  mood: LocalPetMood;
  dragging: boolean;
  hasOverdueOpenTodo: boolean;
  idleMs: number;
  chatOpen: boolean;
}): PetVisualState {
  if (dragging) return "dragging";
  if (hasOverdueOpenTodo) return "urgent";
  if (mood === "confused") return "confused";
  if (mood !== "idle") return mood;
  if (idleMs >= 10 * 60_000) return "sleepy";
  if (idleMs >= 5 * 60_000) return "rest";
  return "idle";
}

function getTransientMoodDuration(mood: LocalPetMood) {
  switch (mood) {
    case "reminder":
      return 4000;
    case "happy":
      return 2500;
    case "talking":
      return 3500;
    case "confused":
      return 3500;
    default:
      return 3000;
  }
}

function isOverdueOpenTodo(todo: TodoItem, now: number) {
  if (todo.status !== "open") return false;
  const target = todo.dueAt ?? todo.remindAt;
  if (!target) return false;
  const targetTime = new Date(target).getTime();
  return Number.isFinite(targetTime) && targetTime <= now;
}

function getSummaryStats(todos: TodoItem[]) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  const sevenDaysLater = todayStart + 8 * 24 * 60 * 60_000;
  const openTodos = todos.filter((todo) => todo.status !== "done");
  const todayCreated = todos.filter((todo) => isTimeInRange(todo.createdAt, todayStart, tomorrowStart));
  const todayDone = todos.filter((todo) => todo.status === "done" && isTimeInRange(todo.createdAt, todayStart, tomorrowStart));
  const todayOpen = openTodos.filter((todo) => isTimeInRange(todo.createdAt, todayStart, tomorrowStart));
  const overdueTodos = openTodos.filter((todo) => {
    const time = getTodoTargetTime(todo);
    return typeof time === "number" && time <= now.getTime();
  });
  const todayReminders = openTodos.filter((todo) => {
    const time = getTodoTargetTime(todo);
    return typeof time === "number" && time > now.getTime() && time < tomorrowStart;
  });
  const upcomingTodos = openTodos
    .filter((todo) => {
      const time = getTodoTargetTime(todo);
      return typeof time === "number" && time >= tomorrowStart && time < sevenDaysLater;
    })
    .sort((a, b) => (getTodoTargetTime(a) ?? 0) - (getTodoTargetTime(b) ?? 0));

  return { openTodos, todayCreated, todayDone, todayOpen, overdueTodos, todayReminders, upcomingTodos };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const base = startOfDay(date);
  const mondayOffset = (base.getDay() + 6) % 7;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - mondayOffset);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getCalendarMonthDays(month: Date) {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getTodoCalendarDateKey(todo: TodoItem) {
  const source = todo.scheduledStartAt ?? todo.dueAt ?? todo.remindAt ?? todo.createdAt;
  const date = new Date(source);
  return Number.isFinite(date.getTime()) ? formatDateKey(date) : undefined;
}

function getTodoCalendarTime(todo: TodoItem) {
  const source = todo.remindAt ?? todo.dueAt;
  if (!source) return undefined;
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.getHours() * 60 + date.getMinutes();
}

function formatTodoTimelineTime(todo: TodoItem) {
  const source = todo.scheduledStartAt ?? todo.remindAt ?? todo.dueAt;
  if (!source) return "全天";
  const date = new Date(source);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "全天";
}

function getCalendarDisplayDate(todo: TodoItem) {
  const source = todo.scheduledStartAt ?? todo.dueAt ?? todo.remindAt ?? todo.createdAt;
  const date = new Date(source);
  return Number.isFinite(date.getTime()) ? date : new Date(todo.createdAt);
}

function formatScheduledTime(todo: TodoItem) {
  if (!todo.scheduledStartAt) return "";
  const start = new Date(todo.scheduledStartAt);
  const end = todo.scheduledEndAt ? new Date(todo.scheduledEndAt) : null;
  if (!Number.isFinite(start.getTime())) return "";
  const startText = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (!end || !Number.isFinite(end.getTime())) return startText;
  return `${startText}-${end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function formatCalendarRange(view: "day" | "week" | "month", anchorDate: Date, visibleDays: Date[]) {
  if (view === "month") return anchorDate.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (view === "day") return anchorDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const first = visibleDays[0] ?? anchorDate;
  const last = visibleDays[visibleDays.length - 1] ?? anchorDate;
  return `${first.toLocaleDateString(undefined, { month: "long", day: "numeric" })} - ${last.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

function formatPlanTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isTimeInRange(value: string | undefined, start: number, end: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start && time < end;
}

function getTodoTargetTime(todo: TodoItem) {
  const target = todo.remindAt ?? todo.dueAt;
  if (!target) return undefined;
  const time = new Date(target).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function TodoList({
  todos,
  focusedTodoId,
  onToggle,
  onUpdate,
  onDelete,
  onQuickAdd
}: {
  todos: TodoItem[];
  focusedTodoId?: string | null;
  onToggle(todo: TodoItem): void;
  onUpdate(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "notes" | "project" | "tags" | "priority" | "status" | "remindAt" | "dueAt" | "scheduledStartAt" | "scheduledEndAt" | "isAllDayScheduled" | "repeatRule" | "subtasks" | "attachments" | "completedAt">>): void;
  onDelete(todo: TodoItem): void;
  onQuickAdd(text: string): void;
}) {
  type TodoScope = "inbox" | "today" | "next7" | "overdue" | "all" | "done" | "repeating";
  type TodoViewMode = "list" | "grouped" | "compact";
  const [scope, setScope] = React.useState<TodoScope>("inbox");
  const [viewMode, setViewMode] = React.useState<TodoViewMode>("list");
  const [selectedTodoId, setSelectedTodoId] = React.useState<string | null>(focusedTodoId ?? null);
  const [selectedProject, setSelectedProject] = React.useState<string | null>(null);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = React.useState<TodoPriority | "all">("all");
  const [searchText, setSearchText] = React.useState("");
  const [quickText, setQuickText] = React.useState("");
  const now = Date.now();
  const todayStart = startOfDay(new Date()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  const nextWeekEnd = todayStart + 8 * 24 * 60 * 60_000;
  const openTodos = todos.filter((todo) => todo.status === "open");
  const doneTodos = todos.filter((todo) => todo.status === "done");
  const projects = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const todo of openTodos) {
      if (!todo.project) continue;
      counts.set(todo.project, (counts.get(todo.project) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [openTodos]);
  const tags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const todo of openTodos) {
      for (const tagName of todo.tags ?? []) counts.set(tagName, (counts.get(tagName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [openTodos]);
  const visibleTodos = React.useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return todos
      .filter((todo) => {
        const targetTime = getTodoTargetTime(todo);
        if (scope === "inbox" && (todo.status !== "open" || todo.project)) return false;
        if (scope === "today" && (todo.status !== "open" || typeof targetTime !== "number" || targetTime < todayStart || targetTime >= tomorrowStart)) return false;
        if (scope === "next7" && (todo.status !== "open" || typeof targetTime !== "number" || targetTime < tomorrowStart || targetTime >= nextWeekEnd)) return false;
        if (scope === "overdue" && (todo.status !== "open" || typeof targetTime !== "number" || targetTime > now)) return false;
        if (scope === "all" && todo.status !== "open") return false;
        if (scope === "done" && todo.status !== "done") return false;
        if (scope === "repeating" && !todo.repeatRule) return false;
        if (selectedProject && todo.project !== selectedProject) return false;
        if (selectedTags.length && !selectedTags.every((tagName) => todo.tags?.includes(tagName))) return false;
        if (priorityFilter !== "all" && todo.priority !== priorityFilter) return false;
        if (normalizedSearch) {
          const haystack = [todo.title, todo.notes, todo.project, ...(todo.tags ?? [])].join(" ").toLowerCase();
          if (!haystack.includes(normalizedSearch)) return false;
        }
        return true;
      })
      .sort(compareTodosForWork);
  }, [nextWeekEnd, now, priorityFilter, scope, searchText, selectedProject, selectedTags, todayStart, todos, tomorrowStart]);
  const selectedTodo = todos.find((todo) => todo.id === selectedTodoId) ?? visibleTodos[0] ?? null;
  const scopeItems: Array<{ id: TodoScope; label: string; count: number; icon: React.ReactNode }> = [
    { id: "inbox", label: "收件箱", count: openTodos.filter((todo) => !todo.project).length, icon: <Inbox size={15} /> },
    { id: "today", label: "今天", count: openTodos.filter((todo) => {
      const time = getTodoTargetTime(todo);
      return typeof time === "number" && time >= todayStart && time < tomorrowStart;
    }).length, icon: <Clock size={15} /> },
    { id: "next7", label: "接下来 7 天", count: openTodos.filter((todo) => {
      const time = getTodoTargetTime(todo);
      return typeof time === "number" && time >= tomorrowStart && time < nextWeekEnd;
    }).length, icon: <CalendarDays size={15} /> },
    { id: "overdue", label: "逾期", count: openTodos.filter((todo) => {
      const time = getTodoTargetTime(todo);
      return typeof time === "number" && time <= now;
    }).length, icon: <AlertTriangle size={15} /> },
    { id: "all", label: "全部", count: openTodos.length, icon: <ListTodo size={15} /> },
    { id: "done", label: "已完成", count: doneTodos.length, icon: <Check size={15} /> },
    { id: "repeating", label: "重复任务", count: todos.filter((todo) => todo.repeatRule).length, icon: <RotateCcw size={15} /> }
  ];

  React.useEffect(() => {
    if (focusedTodoId) setSelectedTodoId(focusedTodoId);
  }, [focusedTodoId]);

  React.useEffect(() => {
    if (selectedTodoId && todos.some((todo) => todo.id === selectedTodoId)) return;
    setSelectedTodoId(visibleTodos[0]?.id ?? null);
  }, [selectedTodoId, todos, visibleTodos]);

  function submitQuickAdd(event: React.FormEvent) {
    event.preventDefault();
    const text = quickText.trim();
    if (!text) return;
    onQuickAdd(text);
    setQuickText("");
  }

  function toggleTagFilter(tagName: string) {
    setSelectedTags((current) =>
      current.includes(tagName) ? current.filter((item) => item !== tagName) : [...current, tagName]
    );
  }

  function clearFilters() {
    setSelectedProject(null);
    setSelectedTags([]);
    setPriorityFilter("all");
    setSearchText("");
  }

  function renderTodoRow(todo: TodoItem) {
    const selected = selectedTodo?.id === todo.id;
    return (
      <button
        key={todo.id}
        type="button"
        data-todo-id={todo.id}
        className={`todo-work-row ${todo.status} ${selected ? "selected" : ""} ${viewMode === "compact" ? "compact" : ""}`}
        onClick={() => setSelectedTodoId(todo.id)}
      >
        <span
          className="check"
          role="checkbox"
          aria-checked={todo.status === "done"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(todo);
          }}
        >
          {todo.status === "done" ? <Check size={14} /> : null}
        </span>
        <span className="todo-work-main">
          <strong>{todo.title}</strong>
          {viewMode !== "compact" && (
            <span className="todo-work-meta">
              <small className={`priority-chip priority-${todo.priority ?? "medium"}`}>{formatPriority(todo.priority)}</small>
              {todo.project && <small>@{todo.project}</small>}
              {(todo.dueAt || todo.remindAt) && <small>{formatRelativeTodoTime(todo)}</small>}
              {!!todo.subtasks?.length && <small>{todo.subtasks.filter((subtask) => subtask.done).length}/{todo.subtasks.length} 子任务</small>}
              {todo.repeatRule && <small><RotateCcw size={11} /> {todo.repeatRule}</small>}
              {!!todo.attachments?.length && <small><Paperclip size={11} /> {todo.attachments.length}</small>}
              {!!todo.notes && <small><FileText size={11} /> 备注</small>}
            </span>
          )}
        </span>
        {viewMode !== "compact" && (
          <span className="todo-work-tags">
            {(todo.tags ?? []).slice(0, 2).map((tagName) => <small key={tagName}>#{tagName}</small>)}
          </span>
        )}
      </button>
    );
  }

  const groupedTodos = groupTodosForDisplay(visibleTodos);

  return (
    <section className="todo-workspace">
      <aside className="todo-scope-panel">
        <div className="todo-scope-section">
          <strong>范围</strong>
          {scopeItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`todo-scope-button ${scope === item.id ? "active" : ""}`}
              onClick={() => setScope(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </div>
        <div className="todo-scope-section">
          <strong>项目</strong>
          {projects.length === 0 && <span className="todo-filter-empty">暂无项目</span>}
          {projects.map(([project, count]) => (
            <button
              key={project}
              type="button"
              className={`todo-scope-button ${selectedProject === project ? "active" : ""}`}
              onClick={() => setSelectedProject(selectedProject === project ? null : project)}
            >
              <FolderOpen size={15} />
              <span>{project}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
        <div className="todo-scope-section">
          <strong>标签</strong>
          <div className="todo-tag-filter">
            {tags.slice(0, 12).map(([tagName, count]) => (
              <button
                key={tagName}
                type="button"
                className={selectedTags.includes(tagName) ? "active" : ""}
                onClick={() => toggleTagFilter(tagName)}
              >
                <Tag size={12} /> {tagName} <small>{count}</small>
              </button>
            ))}
            {tags.length === 0 && <span className="todo-filter-empty">暂无标签</span>}
          </div>
        </div>
        <div className="todo-scope-section">
          <strong>过滤</strong>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as TodoPriority | "all")}>
            <option value="all">全部优先级</option>
            <option value="urgent">P0 紧急</option>
            <option value="high">P1 高</option>
            <option value="medium">P2 中</option>
            <option value="low">P3 低</option>
          </select>
          <button type="button" className="todo-clear-filter" onClick={clearFilters}>清除过滤</button>
        </div>
      </aside>

      <section className="todo-list-panel">
        <div className="todo-list-toolbar">
          <form className="todo-quick-add" onSubmit={submitQuickAdd}>
            <input
              value={quickText}
              onChange={(event) => setQuickText(event.target.value)}
              placeholder="快速添加：明天 5 点 #标签 @项目 !P0"
            />
            <button type="submit"><Send size={14} /></button>
          </form>
          <label className="todo-search">
            <Search size={14} />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索任务" />
          </label>
          <div className="todo-view-switch" aria-label="待办视图">
            <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>列表</button>
            <button type="button" className={viewMode === "grouped" ? "active" : ""} onClick={() => setViewMode("grouped")}>分组</button>
            <button type="button" className={viewMode === "compact" ? "active" : ""} onClick={() => setViewMode("compact")}>紧凑</button>
          </div>
        </div>
        <div className={`todo-work-list ${viewMode}`}>
          {visibleTodos.length === 0 && <div className="empty">当前范围没有任务。</div>}
          {viewMode === "grouped"
            ? groupedTodos.map((group) => (
                <section key={group.title} className="todo-group">
                  <div className="todo-group-title">{group.title}<span>{group.items.length}</span></div>
                  {group.items.map(renderTodoRow)}
                </section>
              ))
            : visibleTodos.map(renderTodoRow)}
        </div>
      </section>

      <TaskDetailPanel
        todo={selectedTodo}
        onSave={(todo, patch) => onUpdate(todo, patch)}
        onDelete={(todo) => onDelete(todo)}
      />
    </section>
  );
}

function compareTodosForWork(left: TodoItem, right: TodoItem) {
  const leftPriority = priorityRank(left.priority);
  const rightPriority = priorityRank(right.priority);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;
  const leftTime = getTodoTargetTime(left) ?? Number.POSITIVE_INFINITY;
  const rightTime = getTodoTargetTime(right) ?? Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function priorityRank(priority?: TodoPriority) {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function groupTodosForDisplay(todos: TodoItem[]) {
  const groups = [
    { title: "逾期", items: [] as TodoItem[] },
    { title: "今天", items: [] as TodoItem[] },
    { title: "接下来", items: [] as TodoItem[] },
    { title: "无日期", items: [] as TodoItem[] }
  ];
  const todayStart = startOfDay(new Date()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  for (const todo of todos) {
    const time = getTodoTargetTime(todo);
    if (typeof time !== "number") groups[3].items.push(todo);
    else if (time < Date.now()) groups[0].items.push(todo);
    else if (time < tomorrowStart) groups[1].items.push(todo);
    else groups[2].items.push(todo);
  }
  return groups.filter((group) => group.items.length);
}

function formatRelativeTodoTime(todo: TodoItem) {
  const source = todo.dueAt ?? todo.remindAt;
  if (!source) return "";
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) return "";
  const todayStart = startOfDay(new Date()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  const dayAfterTomorrowStart = tomorrowStart + 24 * 60 * 60_000;
  const timeText = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (date.getTime() < Date.now()) return `逾期 ${date.toLocaleString()}`;
  if (date.getTime() < tomorrowStart) return `今天 ${timeText}`;
  if (date.getTime() < dayAfterTomorrowStart) return `明天 ${timeText}`;
  return date.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function TaskDetailPanel({
  todo,
  onSave,
  onDelete
}: {
  todo: TodoItem | null;
  onSave(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "notes" | "project" | "tags" | "priority" | "status" | "remindAt" | "dueAt" | "scheduledStartAt" | "scheduledEndAt" | "isAllDayScheduled" | "repeatRule" | "subtasks" | "attachments" | "completedAt">>): void;
  onDelete(todo: TodoItem): void;
}) {
  const [title, setTitle] = React.useState("");
  const [status, setStatus] = React.useState<TodoItem["status"]>("open");
  const [project, setProject] = React.useState("");
  const [priority, setPriority] = React.useState<TodoPriority>("medium");
  const [tags, setTags] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [remindAt, setRemindAt] = React.useState("");
  const [scheduledStartAt, setScheduledStartAt] = React.useState("");
  const [scheduledEndAt, setScheduledEndAt] = React.useState("");
  const [isAllDayScheduled, setIsAllDayScheduled] = React.useState(false);
  const [repeatRule, setRepeatRule] = React.useState("");
  const [subtasks, setSubtasks] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [attachments, setAttachments] = React.useState("");

  React.useEffect(() => {
    setTitle(todo?.title ?? "");
    setStatus(todo?.status ?? "open");
    setProject(todo?.project ?? "");
    setPriority(todo?.priority ?? "medium");
    setTags((todo?.tags ?? []).join(", "));
    setDueAt(toDatetimeLocalValue(todo?.dueAt));
    setRemindAt(toDatetimeLocalValue(todo?.remindAt));
    setScheduledStartAt(toDatetimeLocalValue(todo?.scheduledStartAt));
    setScheduledEndAt(toDatetimeLocalValue(todo?.scheduledEndAt));
    setIsAllDayScheduled(todo?.isAllDayScheduled === true);
    setRepeatRule(todo?.repeatRule ?? "");
    setSubtasks((todo?.subtasks ?? []).map((subtask) => subtask.title).join("\n"));
    setNotes(todo?.notes ?? "");
    setAttachments((todo?.attachments ?? []).join("\n"));
  }, [todo]);

  function save() {
    if (!todo) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    onSave(todo, {
      title: normalizedTitle,
      status,
      completedAt: status === "done" ? (todo.completedAt ?? new Date().toISOString()) : undefined,
      project: project.trim() || undefined,
      priority,
      tags: splitDraftList(tags),
      dueAt: fromDatetimeLocalValue(dueAt),
      remindAt: fromDatetimeLocalValue(remindAt),
      scheduledStartAt: fromDatetimeLocalValue(scheduledStartAt),
      scheduledEndAt: fromDatetimeLocalValue(scheduledEndAt),
      isAllDayScheduled,
      repeatRule: repeatRule.trim() || undefined,
      subtasks: splitDraftList(subtasks).map((item, index) => ({
        id: todo.subtasks?.[index]?.id,
        title: item,
        done: todo.subtasks?.[index]?.done === true
      })),
      notes: notes.trim() || undefined,
      attachments: splitDraftList(attachments)
    });
  }

  if (!todo) {
    return (
      <aside className="todo-detail-panel empty-detail">
        <ListTodo size={24} />
        <strong>选择一个任务</strong>
        <span>在中间列表选择任务后，可以在这里修改所有属性。</span>
      </aside>
    );
  }

  return (
    <aside className="todo-detail-panel">
      <div className="todo-detail-header">
        <div>
          <strong>任务详情</strong>
          <span>{todo.confirmedAt ? `确认于 ${new Date(todo.confirmedAt).toLocaleString()}` : `创建于 ${new Date(todo.createdAt).toLocaleString()}`}</span>
        </div>
        <button type="button" onClick={save}>
          <Save size={14} /> 保存
        </button>
      </div>
      <label>
        内容
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="task-pane-grid">
        <label>
          状态
          <select value={status} onChange={(event) => setStatus(event.target.value as TodoItem["status"])}>
            <option value="open">未完成</option>
            <option value="done">已完成</option>
            <option value="dismissed">已丢弃</option>
          </select>
        </label>
        <label>
          优先级
          <select value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}>
            <option value="urgent">P0 紧急</option>
            <option value="high">P1 高</option>
            <option value="medium">P2 中</option>
            <option value="low">P3 低</option>
          </select>
        </label>
      </div>
      <div className="todo-date-shortcuts">
        <button type="button" onClick={() => setDueAt(toDatetimeLocalValue(new Date().toISOString()))}>今天</button>
        <button type="button" onClick={() => setDueAt(toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60_000).toISOString()))}>明天</button>
        <button type="button" onClick={() => setDueAt(toDatetimeLocalValue(nextMondayIso()))}>下周一</button>
        <button type="button" onClick={() => setDueAt("")}>清除</button>
      </div>
      <div className="task-pane-grid">
        <label>
          截止
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>
        <label>
          提醒
          <input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} />
        </label>
      </div>
      <div className="calendar-detail-schedule">
        <strong>计划块</strong>
        <label className="calendar-all-day-toggle">
          <input type="checkbox" checked={isAllDayScheduled} onChange={(event) => setIsAllDayScheduled(event.target.checked)} />
          全天安排
        </label>
        <div className="task-pane-grid">
          <label>
            开始
            <input type="datetime-local" value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} />
          </label>
          <label>
            结束
            <input type="datetime-local" value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={() => {
          setScheduledStartAt("");
          setScheduledEndAt("");
          setIsAllDayScheduled(false);
          onSave(todo, {
            scheduledStartAt: undefined,
            scheduledEndAt: undefined,
            isAllDayScheduled: false
          });
        }}>移回任务池</button>
      </div>
      <label>
        项目
        <input value={project} onChange={(event) => setProject(event.target.value)} />
      </label>
      <label>
        标签
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔" />
      </label>
      <label>
        重复
        <input value={repeatRule} onChange={(event) => setRepeatRule(event.target.value)} placeholder="例如 每周五，或留空" />
      </label>
      <label>
        子任务
        <textarea value={subtasks} onChange={(event) => setSubtasks(event.target.value)} rows={4} placeholder="每行一个子任务" />
      </label>
      <label>
        备注
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
      </label>
      <label>
        附件
        <textarea value={attachments} onChange={(event) => setAttachments(event.target.value)} rows={2} placeholder="每行一个附件名称或路径" />
      </label>
      <div className="todo-detail-log">
        <span>创建：{new Date(todo.createdAt).toLocaleString()}</span>
        {todo.sourceMessage && <span>来源：{todo.sourceMessage}</span>}
      </div>
      <button type="button" className="todo-detail-delete" onClick={() => onDelete(todo)}>
        <Trash2 size={14} /> 删除任务
      </button>
    </aside>
  );
}

function nextMondayIso() {
  const date = new Date();
  const day = date.getDay();
  const offset = ((8 - day) % 7) || 7;
  date.setDate(date.getDate() + offset);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function toDatetimeLocalValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function SettingsPanel({
  settings,
  onChange,
  onClearMessages,
  onSelectPetAppearance,
  onResetPetAppearance,
  onTestReminder,
  api
}: {
  settings: AppSettings;
  onChange(patch: Partial<AppSettings>): void | Promise<void>;
  onClearMessages(): void;
  onSelectPetAppearance(): void;
  onResetPetAppearance(): void;
  onTestReminder(): Promise<void>;
  api?: DesktopPetApi;
}) {
  const [apiKey, setApiKey] = React.useState(settings.aiApiKey ?? settings.openAiApiKey ?? "");
  const [aiProviderName, setAiProviderName] = React.useState(settings.aiProviderName ?? aiProviderPresets[settings.aiProvider].label);
  const [aiBaseUrl, setAiBaseUrl] = React.useState(settings.aiBaseUrl ?? aiProviderPresets[settings.aiProvider].baseUrl);
  const [aiModel, setAiModel] = React.useState(settings.aiModel ?? settings.openAiModel);
  const [themeColor, setThemeColor] = React.useState(settings.workspaceThemeColor);
  const [quickAiRecordShortcut, setQuickAiRecordShortcut] = React.useState(settings.quickAiRecordShortcut);
  const [codexExecutable, setCodexExecutable] = React.useState(settings.codexExecutable);
  const [apiTestBusy, setApiTestBusy] = React.useState(false);
  const [apiTestResult, setApiTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [updateCheckBusy, setUpdateCheckBusy] = React.useState(false);

  React.useEffect(() => {
    setThemeColor(settings.workspaceThemeColor);
  }, [settings.workspaceThemeColor]);

  React.useEffect(() => {
    setApiKey(settings.aiApiKey ?? settings.openAiApiKey ?? "");
  }, [settings.aiApiKey, settings.openAiApiKey]);

  React.useEffect(() => {
    setAiProviderName(settings.aiProviderName ?? aiProviderPresets[settings.aiProvider].label);
    setAiBaseUrl(settings.aiBaseUrl ?? aiProviderPresets[settings.aiProvider].baseUrl);
    setAiModel(settings.aiModel ?? settings.openAiModel);
  }, [settings.aiBaseUrl, settings.aiModel, settings.aiProvider, settings.aiProviderName, settings.openAiModel]);

  React.useEffect(() => {
    setQuickAiRecordShortcut(settings.quickAiRecordShortcut);
  }, [settings.quickAiRecordShortcut]);

  React.useEffect(() => {
    setCodexExecutable(settings.codexExecutable);
  }, [settings.codexExecutable]);

  function updateThemeColor(value: string) {
    setThemeColor(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      onChange({ workspaceThemeColor: value });
    }
  }

  function changeAiProvider(provider: AppSettings["aiProvider"]) {
    const preset = aiProviderPresets[provider];
    setAiProviderName(preset.label);
    setAiBaseUrl(preset.baseUrl);
    setAiModel(preset.model);
    setApiTestResult(null);
    onChange({
      aiProvider: provider,
      aiProviderName: preset.label,
      aiBaseUrl: preset.baseUrl,
      aiModel: preset.model,
      openAiModel: preset.model
    });
  }

  function persistAiConfig(patch: Partial<AppSettings>) {
    setApiTestResult(null);
    return Promise.resolve(onChange(patch));
  }

  async function testApi() {
    if (!api || apiTestBusy) return;
    await persistAiConfig({
      aiApiKey: apiKey || undefined,
      openAiApiKey: apiKey || undefined,
      aiProviderName: aiProviderName || aiProviderPresets[settings.aiProvider].label,
      aiBaseUrl: aiBaseUrl || undefined,
      aiModel: aiModel || aiProviderPresets[settings.aiProvider].model,
      openAiModel: aiModel || aiProviderPresets[settings.aiProvider].model
    });
    setApiTestBusy(true);
    setApiTestResult(null);
    try {
      const result = await api.chat.testApi(apiKey || undefined);
      setApiTestResult(result);
    } catch (error) {
      setApiTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "API 测试失败。"
      });
    } finally {
      setApiTestBusy(false);
    }
  }

  async function checkForUpdates() {
    if (!api || updateCheckBusy) return;
    setUpdateCheckBusy(true);
    try {
      await api.app.checkForUpdates();
    } finally {
      setUpdateCheckBusy(false);
    }
  }

  return (
    <section className="settings">
      <div className="settings-overview">
        <div>
          <strong>设置</strong>
          <span>调整双击主窗口、AI 服务和桌宠行为。</span>
        </div>
        <div className="settings-status">
          <span>{settings.aiProviderName ?? aiProviderPresets[settings.aiProvider].label}</span>
          <span>{settings.aiModel ?? settings.openAiModel}</span>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-section ai-setting" aria-label="模型服务设置">
          <div className="settings-section-header">
            <div className="setting-icon"><Sparkles size={15} /></div>
            <div>
              <strong>模型服务</strong>
              <span>配置 OpenAI-compatible 服务，用于对话和待办识别。</span>
            </div>
          </div>
          <label>
            提供商
            <select
              value={settings.aiProvider}
              onChange={(event) => changeAiProvider(event.target.value as AppSettings["aiProvider"])}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="custom">自定义提供商</option>
            </select>
          </label>
          {settings.aiProvider === "custom" && (
            <label>
              提供商名称
              <input
                value={aiProviderName}
                onChange={(event) => setAiProviderName(event.target.value)}
                onBlur={() => persistAiConfig({ aiProviderName: aiProviderName || "自定义提供商" })}
                placeholder="例如 OpenRouter / SiliconFlow"
              />
            </label>
          )}
          <div className="settings-two-column">
            <label>
              Base URL
              <input
                value={aiBaseUrl}
                onChange={(event) => setAiBaseUrl(event.target.value)}
                onBlur={() => persistAiConfig({ aiBaseUrl: aiBaseUrl || undefined })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              模型
              <input
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
                onBlur={() => persistAiConfig({ aiModel: aiModel || aiProviderPresets[settings.aiProvider].model, openAiModel: aiModel || aiProviderPresets[settings.aiProvider].model })}
                placeholder={aiProviderPresets[settings.aiProvider].model}
              />
            </label>
          </div>
          <label>
            API Key
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onBlur={() => persistAiConfig({ aiApiKey: apiKey || undefined, openAiApiKey: apiKey || undefined })}
              placeholder="也可使用对应环境变量"
            />
          </label>
          <div className="settings-inline-actions">
            <button className="settings-action primary" onClick={() => void testApi()} disabled={apiTestBusy}>
              <Sparkles size={15} /> {apiTestBusy ? "测试中..." : "测试 API"}
            </button>
            {apiTestResult && (
              <div className={`api-test-result ${apiTestResult.ok ? "ok" : "error"}`}>
                {apiTestResult.message}
              </div>
            )}
          </div>
        </section>

        <section className="settings-section codex-setting" aria-label="Codex 设置">
          <div className="settings-section-header">
            <div className="setting-icon"><Sparkles size={15} /></div>
            <div>
              <strong>Codex</strong>
              <span>设置双击主窗口中 Codex 面板的默认启动方式。</span>
            </div>
          </div>
          <label>
            启动命令
            <input
              value={codexExecutable}
              onChange={(event) => setCodexExecutable(event.target.value)}
              onBlur={() => onChange({ codexExecutable: codexExecutable.trim() || "codex" })}
              placeholder="codex 或 codex --yolo"
            />
          </label>
          <div className="settings-two-column">
            <label>
              默认 Sandbox
              <select
                value={settings.codexDefaultSandbox}
                onChange={(event) => onChange({ codexDefaultSandbox: event.target.value as CodexSandboxPolicy })}
              >
                <option value="read-only">只读分析</option>
                <option value="workspace-write">允许修改副本</option>
                <option value="danger-full-access">完全权限</option>
              </select>
            </label>
            <label>
              默认 Approval
              <select
                value={settings.codexDefaultApproval}
                onChange={(event) => onChange({ codexDefaultApproval: event.target.value as CodexApprovalPolicy })}
              >
                <option value="on-request">需要时询问</option>
                <option value="never">不询问</option>
              </select>
            </label>
          </div>
          <div className="setting-hint">可填 codex、完整 codex.cmd 路径，或 codex --yolo。拖拽文件会先复制到隔离工作目录。</div>
        </section>

        <section className="settings-section shortcut-setting" aria-label="快捷键设置">
          <div className="settings-section-header">
            <div className="setting-icon"><KeyRound size={15} /></div>
            <div>
              <strong>快捷键</strong>
              <span>快速唤出桌宠气泡，直接记录想法和任务。</span>
            </div>
          </div>
          <label>
            快速 AI 记录
            <input
              value={quickAiRecordShortcut}
              onChange={(event) => setQuickAiRecordShortcut(event.target.value)}
              onBlur={() => onChange({ quickAiRecordShortcut: quickAiRecordShortcut.trim() || "CommandOrControl+Shift+Space" })}
              placeholder="CommandOrControl+Shift+Space"
            />
          </label>
          <div className="setting-hint">格式示例：CommandOrControl+Shift+Space。</div>
        </section>

        <section className="settings-section theme-setting" aria-label="双击页面主题颜色">
          <div className="settings-section-header">
            <div className="setting-icon"><Settings size={15} /></div>
            <div>
              <strong>双击页面主题颜色</strong>
              <span>同步工作台、提醒气泡和分区强调色。</span>
            </div>
          </div>
          <div className="theme-swatches">
            {workspaceThemePresets.map((color) => (
              <button
                key={color}
                type="button"
                className={`theme-swatch ${settings.workspaceThemeColor.toLowerCase() === color.toLowerCase() ? "active" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => updateThemeColor(color)}
                aria-label={`使用主题色 ${color}`}
              />
            ))}
            <label className="theme-picker" aria-label="自定义主题颜色">
              <input type="color" value={themeColor} onChange={(event) => updateThemeColor(event.target.value)} />
            </label>
          </div>
        </section>

        <section className="settings-section appearance-setting" aria-label="更换桌宠形象">
          <div className="settings-section-header">
            <div className="setting-icon"><ImageIcon size={15} /></div>
            <div>
              <strong>桌宠形象</strong>
              <span>替换完整状态图组，保持所有情绪状态可用。</span>
            </div>
          </div>
          <div className="appearance-current">
            <strong>{settings.petAppearance?.name ?? "默认 Linnea"}</strong>
            <span>{settings.petAppearance?.directory ?? "使用内置状态图片"}</span>
          </div>
          <div className="appearance-actions">
            <button className="settings-action" onClick={onSelectPetAppearance}>
              <FolderOpen size={15} /> 选择形象文件夹
            </button>
            {settings.petAppearance && (
              <button className="settings-action" onClick={onResetPetAppearance}>
                <RotateCcw size={15} /> 恢复默认
              </button>
            )}
          </div>
          <div className="setting-hint">文件夹名需为 {"{角色名}_state"}，图片文件名如 _Idle_.png、_Talking_.png。</div>
        </section>

        <section className="settings-section behavior-setting" aria-label="行为设置">
          <div className="settings-section-header">
            <div className="setting-icon"><Bell size={15} /></div>
            <div>
              <strong>桌宠行为</strong>
              <span>控制全局浮窗、系统提醒和窗口层级。</span>
            </div>
          </div>
          <div className="toggle-list">
            <Toggle label="浮窗工具" checked={settings.selectionToolsEnabled} onChange={(value) => onChange({ selectionToolsEnabled: value })} />
            <Toggle label="系统通知" checked={settings.systemNotifications} onChange={(value) => onChange({ systemNotifications: value })} />
            <Toggle label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => onChange({ alwaysOnTop: value })} />
          </div>
          <div className="settings-note">AI 识别到的任务会先生成草案，确认后才保存。</div>
        </section>
      </div>

      <div className="settings-footer">
        <button className="settings-action danger" onClick={onClearMessages}>
          <Trash2 size={15} /> 清除对话记录
        </button>
        <button className="settings-action" onClick={() => void onTestReminder()}>
          <Bell size={15} /> 测试 Windows 提醒
        </button>
        <button className="settings-action" onClick={() => void checkForUpdates()} disabled={updateCheckBusy}>
          <RotateCcw size={15} /> {updateCheckBusy ? "检查中..." : "检查更新"}
        </button>
      </div>
    </section>
  );
}

function createWorkspaceThemeStyle(color = "#5aa982"): React.CSSProperties {
  const accent = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#5aa982";
  return {
    "--workspace-accent": accent,
    "--workspace-bg": mixHex(accent, "#ffffff", 0.86),
    "--workspace-soft": mixHex(accent, "#ffffff", 0.76),
    "--workspace-active": mixHex(accent, "#ffffff", 0.9),
    "--workspace-card-bg": mixHex(accent, "#ffffff", 0.94),
    "--workspace-content-bg": mixHex(accent, "#ffffff", 0.88),
    "--workspace-border": hexToRgba(accent, 0.28),
    "--workspace-shadow": hexToRgba(accent, 0.12)
  } as React.CSSProperties;
}

function mixHex(color: string, base: string, baseWeight: number) {
  const foreground = hexToRgb(color);
  const background = hexToRgb(base);
  const mix = (channel: keyof typeof foreground) =>
    Math.round(background[channel] * baseWeight + foreground[channel] * (1 - baseWeight));
  return `rgb(${mix("r")}, ${mix("g")}, ${mix("b")})`;
}

function hexToRgba(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(color: string) {
  const value = color.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <button
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span>{label}</span>
      <span className="toggle-switch" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
