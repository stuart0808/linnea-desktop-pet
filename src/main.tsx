import React from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, BarChart3, Bell, CalendarDays, Check, Clock, FileText, FolderOpen, Image as ImageIcon, Inbox, KeyRound, Languages, ListTodo, MessageCircle, Paperclip, Pencil, RotateCcw, Save, Search, Send, Settings, Sparkles, Tag, Trash2, X } from "lucide-react";
import type { AppSettings, ConversationMessage, DesktopPetApi, PetMood, PlanProposal, ReminderItem, SelectionCapture, SelectionTextResult, TodoCandidate, TodoItem, TodoPriority } from "../shared/types";
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
type SelectionAction = "summarize" | "translate" | "todo";

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
  const selectionResultId = searchParams.get("id") ?? "";
  const selectionCaptureId = searchParams.get("id") ?? "";
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
    if (!api || (!isSelectionResultWindow && !isSelectionPopoverWindow)) return;
    void api.settings.get().then(setSettings).catch(() => {
      // Keep the default theme if settings cannot be read in a transient utility window.
    });
  }, [api, isSelectionPopoverWindow, isSelectionResultWindow]);

  if (isSelectionResultWindow) {
    return <SelectionResultWindow api={api} resultId={selectionResultId} themeStyle={themeStyle} />;
  }

  if (isSelectionPopoverWindow) {
    return <GlobalSelectionPopoverWindow api={api} captureId={selectionCaptureId} themeStyle={themeStyle} />;
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
    void api.app.setPetWindowExpanded(chatOpen);
  }, [api, chatOpen, dragging, isWorkspaceWindow]);

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
    if (!api || !isWorkspaceWindow) return;
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
    <main className={`shell pet-only ${chatOpen ? "chat-open" : ""}`} style={themeStyle}>
      <section className="pet-stage">
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
  const [activeTab, setActiveTab] = React.useState<"workspace" | "todos" | "calendar" | "summary" | "settings">("workspace");
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
            className={`workspace-nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={17} />
            设置
          </button>
        </nav>
      </aside>

      <section className="workspace-content">
        {activeTab === "workspace" ? (
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

function LinneaPet({ state, images, showAlert }: { state: PetVisualState; images: Record<PetVisualState, string>; showAlert: boolean }) {
  return (
    <span className={`pet-image-wrap pet-${state}`}>
      <img className="pet-image" src={images[state]} alt={`Q版桌宠 ${state} 状态`} draggable={false} />
      {showAlert && <span className="reminder-star" aria-hidden="true">!</span>}
    </span>
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
    <main className="selection-result-shell" style={themeStyle}>
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
  themeStyle
}: {
  api?: DesktopPetApi;
  captureId: string;
  themeStyle: React.CSSProperties;
}) {
  const [capture, setCapture] = React.useState<SelectionCapture | null>(null);
  const [busyAction, setBusyAction] = React.useState<SelectionAction | null>(null);
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
      if (action === "todo") {
        await api.selection.createTodoFromCapture(capture.id);
      } else {
        await api.selection.process(action, capture.text);
      }
      window.close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "处理失败");
      setBusyAction(null);
    }
  }

  return (
    <main
      className="global-selection-popover-shell"
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
            <button type="button" title="关闭" aria-label="关闭" onClick={() => window.close()}>
              <X size={14} />
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
      <section className="ai-setting" aria-label="模型服务设置">
        <div className="setting-label">
          <Sparkles size={14} /> 模型服务
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
        <label>
          API Key
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={() => persistAiConfig({ aiApiKey: apiKey || undefined, openAiApiKey: apiKey || undefined })}
            placeholder="也可使用对应环境变量"
          />
        </label>
      </section>
      <button className="test-api-button" onClick={() => void testApi()} disabled={apiTestBusy}>
        <Sparkles size={15} /> {apiTestBusy ? "测试中..." : "测试 API"}
      </button>
      {apiTestResult && (
        <div className={`api-test-result ${apiTestResult.ok ? "ok" : "error"}`}>
          {apiTestResult.message}
        </div>
      )}
      <section className="shortcut-setting" aria-label="快捷键设置">
        <div className="setting-label">
          <KeyRound size={14} /> 快捷键
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
        <div className="setting-hint">按下后会唤出桌宠气泡，可直接和 AI 对话记录任务。格式示例：CommandOrControl+Shift+Space。</div>
      </section>
      <section className="theme-setting" aria-label="双击页面主题颜色">
        <div className="setting-label">双击页面主题颜色</div>
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
      <section className="appearance-setting" aria-label="更换桌宠形象">
        <div className="setting-label">
          <ImageIcon size={14} /> 桌宠形象
        </div>
        <div className="appearance-current">
          <strong>{settings.petAppearance?.name ?? "默认 Linnea"}</strong>
          <span>{settings.petAppearance?.directory ?? "使用内置状态图片"}</span>
        </div>
        <div className="appearance-actions">
          <button className="appearance-button" onClick={onSelectPetAppearance}>
            <FolderOpen size={15} /> 选择形象文件夹
          </button>
          {settings.petAppearance && (
            <button className="appearance-button" onClick={onResetPetAppearance}>
              <RotateCcw size={15} /> 恢复默认
            </button>
          )}
        </div>
        <div className="setting-hint">文件夹名需为 {"{角色名}_state"}，图片文件名如 _Idle_.png、_Talking_.png。</div>
      </section>
      <div className="settings-note">AI 识别到的任务会先生成草案，确认后才保存。</div>
      <Toggle label="浮窗工具" checked={settings.selectionToolsEnabled} onChange={(value) => onChange({ selectionToolsEnabled: value })} />
      <Toggle label="系统通知" checked={settings.systemNotifications} onChange={(value) => onChange({ systemNotifications: value })} />
      <Toggle label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => onChange({ alwaysOnTop: value })} />
      <button className="clear-chat-button" onClick={onClearMessages}>
        <Trash2 size={15} /> 清除对话记录
      </button>
      <button className="test-reminder-button" onClick={() => void onTestReminder()}>
        <Bell size={15} /> 测试 Windows 提醒
      </button>
      <button className="check-update-button" onClick={() => void checkForUpdates()} disabled={updateCheckBusy}>
        <RotateCcw size={15} /> {updateCheckBusy ? "检查中..." : "检查更新"}
      </button>
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
