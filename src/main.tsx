import React from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, BarChart3, Bell, CalendarDays, Check, FolderOpen, Image as ImageIcon, KeyRound, ListTodo, MessageCircle, Pencil, RotateCcw, Save, Settings, Send, Sparkles, Trash2, X } from "lucide-react";
import type { AppSettings, ConversationMessage, DesktopPetApi, PetMood, ReminderItem, TodoItem } from "../shared/types";
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

function App() {
  const isWorkspaceWindow = new URLSearchParams(window.location.search).get("window") === "workspace";
  const api = window.desktopPet;
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [todos, setTodos] = React.useState<TodoItem[]>([]);
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [input, setInput] = React.useState("");
  const [mood, setMood] = React.useState<LocalPetMood>("idle");
  const [chatOpen, setChatOpen] = React.useState(false);
  const [bubble, setBubble] = React.useState("今天也一起把事情整理清楚。");
  const [busy, setBusy] = React.useState(false);
  const [activeReminder, setActiveReminder] = React.useState<ReminderItem | null>(null);
  const [focusedTodoId, setFocusedTodoId] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [dragging, setDragging] = React.useState(false);
  const [lastInteractionAt, setLastInteractionAt] = React.useState(() => Date.now());
  const clickTimerRef = React.useRef<number | null>(null);
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

  function markInteraction() {
    setLastInteractionAt(Date.now());
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
      setChatOpen(true);
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
    if (isWorkspaceWindow || !chatOpen || input.trim() || busy || activeReminder) return;
    const timer = window.setTimeout(() => setChatOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [activeReminder, busy, chatOpen, input, isWorkspaceWindow]);

  React.useEffect(() => {
    if (!api || !isWorkspaceWindow) return;
    return api.events.onTodoFocus((todoId) => {
      setFocusedTodoId(todoId);
    });
  }, [api, isWorkspaceWindow]);

  React.useEffect(() => {
    if (isWorkspaceWindow || !api) return;
    void api.app.setPetWindowExpanded(chatOpen);
  }, [api, chatOpen, isWorkspaceWindow]);

  React.useEffect(() => {
    return () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
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

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    markInteraction();
    setInput("");
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, userMessage]);
    setMood("thinking");
    setBubble("我在整理你刚刚说的内容...");
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
        return;
      }
      const result = await api.chat.sendMessage(text);
      setMessages(await api.chat.listMessages());
      setMood(result.mood);
      setBubble(result.assistantMessage.text);
      if (result.extractedTodos.length) {
        setTodos(await api.todo.list());
      }
    } catch (error) {
      setMood("confused");
      setBubble(error instanceof Error ? error.message : "对话失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTodo(todo: TodoItem) {
    if (!api) return;
    markInteraction();
    const status = todo.status === "done" ? "open" : "done";
    const updated = await api.todo.update(todo.id, { status });
    setTodos((current) => current.map((item) => (item.id === todo.id ? updated : item)));
  }

  async function deleteTodo(todo: TodoItem) {
    if (!api) return;
    markInteraction();
    const removed = await api.todo.delete(todo.id);
    setTodos((current) => current.filter((item) => item.id !== removed.id));
    setMood("idle");
    setBubble(`已删除：${removed.title}`);
  }

  async function updateTodo(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "remindAt" | "dueAt">>) {
    if (!api) return;
    markInteraction();
    const updated = await api.todo.update(todo.id, patch);
    setTodos((current) => current.map((item) => (item.id === todo.id ? updated : item)));
    setMood("happy");
    setBubble(`已更新：${updated.title}`);
  }

  async function undoAutoSave() {
    if (!api) return;
    markInteraction();
    const removed = await api.todo.undoLastAutoSave();
    if (removed) {
      setTodos((current) => current.filter((todo) => todo.id !== removed.id));
      setMood("happy");
      setBubble(`已撤销：${removed.title}`);
    }
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
    void api?.app.beginWindowDrag(event.clientX, event.clientY);
  }

  function handlePetPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!api || !pointerStartRef.current) return;
    const totalDx = Math.abs(event.screenX - pointerStartRef.current.screenX);
    const totalDy = Math.abs(event.screenY - pointerStartRef.current.screenY);
    if (!didDragRef.current && totalDx < 5 && totalDy < 5) return;
    didDragRef.current = true;
    setDragging(true);
    void api.app.dragWindowToCursor(event.screenX, event.screenY);
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
      setChatOpen((open) => !open);
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
        input={input}
        busy={busy}
        onInputChange={setInput}
        onSendMessage={sendMessage}
        onToggleTodo={toggleTodo}
        onUpdateTodo={updateTodo}
        onDeleteTodo={deleteTodo}
        onUndoAutoSave={undoAutoSave}
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
        {chatOpen && (
          <section className="chat-popover">
            {bubble && <div className="speech-bubble">{bubble}</div>}
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
            <div className="mini-messages">
              {messages.slice(-4).map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  {message.text}
                </div>
              ))}
            </div>
            <form className="mini-composer" onSubmit={sendMessage}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="和 Linnea 说话..."
              />
              <button type="submit" disabled={busy} aria-label="发送">
                <Send size={16} />
              </button>
            </form>
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

function WorkspaceWindow({
  api,
  messages,
  todos,
  settings,
  input,
  busy,
  onInputChange,
  onSendMessage,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onUndoAutoSave,
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
  input: string;
  busy: boolean;
  onInputChange(value: string): void;
  onSendMessage(event: React.FormEvent): void;
  onToggleTodo(todo: TodoItem): void;
  onUpdateTodo(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "remindAt" | "dueAt">>): void;
  onDeleteTodo(todo: TodoItem): void;
  onUndoAutoSave(): void;
  onUpdateSettings(patch: Partial<AppSettings>): void;
  onClearMessages(): void;
  onSelectPetAppearance(): void;
  onResetPetAppearance(): void;
  focusedTodoId: string | null;
  onTestReminder(): Promise<void>;
}) {
  const [activeTab, setActiveTab] = React.useState<"workspace" | "calendar" | "summary" | "settings">("workspace");
  const [summaryText, setSummaryText] = React.useState("");
  const [summaryBusy, setSummaryBusy] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState("");
  const themeStyle = React.useMemo(
    () => createWorkspaceThemeStyle(settings?.workspaceThemeColor),
    [settings?.workspaceThemeColor]
  );

  React.useEffect(() => {
    if (focusedTodoId) setActiveTab("workspace");
  }, [focusedTodoId]);

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
    <main className="workspace-shell" style={themeStyle}>
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
            对话与待办
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
          <section className="workspace-grid">
            <section className="workspace-card chat-card">
              <div className="section-title">
                <span>对话</span>
              </div>
              <div className="workspace-messages">
                {messages.length === 0 && <div className="empty">还没有对话。</div>}
                {messages.slice(-20).map((message) => (
                  <div key={message.id} className={`message ${message.role}`}>
                    {message.text}
                  </div>
                ))}
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

            <section className="workspace-card todo-card">
              <TodoList todos={todos} focusedTodoId={focusedTodoId} onToggle={onToggleTodo} onUpdate={onUpdateTodo} onDelete={onDeleteTodo} onUndo={onUndoAutoSave} />
            </section>
          </section>
        ) : activeTab === "calendar" ? (
          <CalendarPanel todos={todos} />
        ) : activeTab === "summary" ? (
          <SummaryPanel
            todos={todos}
            summaryText={summaryText}
            summaryBusy={summaryBusy}
            summaryError={summaryError}
            onGenerateSummary={() => void generateSummary()}
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

function SummaryPanel({
  todos,
  summaryText,
  summaryBusy,
  summaryError,
  onGenerateSummary
}: {
  todos: TodoItem[];
  summaryText: string;
  summaryBusy: boolean;
  summaryError: string;
  onGenerateSummary(): void;
}) {
  const stats = React.useMemo(() => getSummaryStats(todos), [todos]);

  return (
    <section className="summary-page">
      <section className="summary-card">
        <div className="summary-card-title">
          <BarChart3 size={17} />
          今天
        </div>
        <div className="summary-metrics">
          <Metric label="新增" value={stats.todayCreated.length} />
          <Metric label="完成" value={stats.todayDone.length} />
          <Metric label="未完成" value={stats.openTodos.length} />
        </div>
        <CompactTodoList todos={stats.todayOpen} emptyText="今天没有未完成事项。" />
      </section>

      <section className="summary-card">
        <div className="summary-card-title">
          <AlertTriangle size={17} />
          需要注意
        </div>
        <CompactTodoList todos={stats.overdueTodos} emptyText="暂无过期未完成待办。" urgent />
        <CompactTodoList todos={stats.todayReminders} emptyText="今天没有剩余提醒。" />
      </section>

      <section className="summary-card">
        <div className="summary-card-title">
          <CalendarDays size={17} />
          接下来
        </div>
        <CompactTodoList todos={stats.upcomingTodos} emptyText="未来 7 天没有提醒。" />
      </section>

      <section className="summary-card summary-ai-card">
        <div className="summary-card-title">
          <Sparkles size={17} />
          今日总结
          <button className="summary-generate-button" onClick={onGenerateSummary} disabled={summaryBusy}>
            {summaryBusy ? "生成中..." : "生成今日总结"}
          </button>
        </div>
        {summaryError && <div className="summary-error">{summaryError}</div>}
        {summaryText ? (
          <p className="summary-text">{summaryText}</p>
        ) : (
          <div className="summary-empty">点击按钮生成今日待完成事项总结和行动建议。</div>
        )}
      </section>
    </section>
  );
}

function CalendarPanel({ todos }: { todos: TodoItem[] }) {
  const [currentTime, setCurrentTime] = React.useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = React.useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = React.useState(() => startOfDay(new Date()));

  React.useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const monthDays = React.useMemo(() => getCalendarMonthDays(visibleMonth), [visibleMonth]);
  const todoDates = React.useMemo(() => new Set(todos.map(getTodoCalendarDateKey).filter(Boolean) as string[]), [todos]);
  const selectedTodos = React.useMemo(
    () => todos
      .filter((todo) => getTodoCalendarDateKey(todo) === formatDateKey(selectedDate))
      .sort((a, b) => (getTodoCalendarTime(a) ?? 24 * 60) - (getTodoCalendarTime(b) ?? 24 * 60)),
    [selectedDate, todos]
  );

  function moveMonth(delta: number) {
    setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
  }

  return (
    <section className="calendar-page">
      <section className="calendar-card calendar-overview-card">
        <div className="calendar-header">
          <div>
            <strong>{currentTime.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</strong>
            <span>{currentTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="calendar-month-controls">
            <button onClick={() => moveMonth(-1)} aria-label="上个月">‹</button>
            <span>{visibleMonth.toLocaleDateString(undefined, { year: "numeric", month: "long" })}</span>
            <button onClick={() => moveMonth(1)} aria-label="下个月">›</button>
          </div>
        </div>
        <div className="calendar-weekdays">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid">
          {monthDays.map((date) => {
            const dateKey = formatDateKey(date);
            const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, currentTime);
            return (
              <button
                key={dateKey}
                className={`calendar-day ${isCurrentMonth ? "" : "muted"} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                onClick={() => setSelectedDate(startOfDay(date))}
              >
                <span>{date.getDate()}</span>
                {todoDates.has(dateKey) && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="calendar-card calendar-timeline-card">
        <div className="calendar-card-title">
          <CalendarDays size={17} />
          {selectedDate.toLocaleDateString(undefined, { month: "long", day: "numeric", weekday: "long" })}
        </div>
        {selectedTodos.length === 0 ? (
          <div className="calendar-empty">当日无待办。</div>
        ) : (
          <div className="day-timeline">
            {selectedTodos.map((todo) => (
              <div key={todo.id} className={`timeline-item ${todo.status === "done" ? "done" : ""}`}>
                <time>{formatTodoTimelineTime(todo)}</time>
                <div>
                  <strong>{todo.title}</strong>
                  {todo.notes && <span>{todo.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-metric">
      <strong>{value}</strong>
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
  const source = todo.remindAt ?? todo.dueAt ?? todo.createdAt;
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
  const source = todo.remindAt ?? todo.dueAt;
  if (!source) return "全天";
  const date = new Date(source);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "全天";
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
  onUndo
}: {
  todos: TodoItem[];
  focusedTodoId?: string | null;
  onToggle(todo: TodoItem): void;
  onUpdate(todo: TodoItem, patch: Partial<Pick<TodoItem, "title" | "remindAt" | "dueAt">>): void;
  onDelete(todo: TodoItem): void;
  onUndo(): void;
}) {
  const [tab, setTab] = React.useState<"open" | "done">("open");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftRemindAt, setDraftRemindAt] = React.useState("");
  const visibleTodos = React.useMemo(
    () => todos.filter((todo) => (tab === "done" ? todo.status === "done" : todo.status !== "done")),
    [tab, todos]
  );
  const openCount = todos.filter((todo) => todo.status !== "done").length;
  const doneCount = todos.filter((todo) => todo.status === "done").length;

  React.useEffect(() => {
    if (!focusedTodoId) return;
    const target = todos.find((todo) => todo.id === focusedTodoId);
    if (!target) return;
    setTab(target.status === "done" ? "done" : "open");
  }, [focusedTodoId, todos]);

  React.useEffect(() => {
    if (!focusedTodoId) return;
    const timer = window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-todo-id="${focusedTodoId}"]`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusedTodoId, tab, visibleTodos]);

  function startEdit(todo: TodoItem) {
    setEditingId(todo.id);
    setDraftTitle(todo.title);
    setDraftRemindAt(toDatetimeLocalValue(todo.remindAt));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftTitle("");
    setDraftRemindAt("");
  }

  function saveEdit(todo: TodoItem) {
    const title = draftTitle.trim();
    if (!title) return;
    const remindAt = fromDatetimeLocalValue(draftRemindAt);
    onUpdate(todo, {
      title,
      remindAt,
      dueAt: remindAt
    });
    cancelEdit();
  }

  return (
    <section className="todos">
      <div className="section-title">
        <span>待办</span>
        <button className="ghost-button" onClick={onUndo}>
          <RotateCcw size={14} /> 撤销自动记录
        </button>
      </div>
      <div className="todo-tabs">
        <button className={`todo-tab ${tab === "open" ? "active" : ""}`} onClick={() => setTab("open")}>
          未完成 <span>{openCount}</span>
        </button>
        <button className={`todo-tab ${tab === "done" ? "active" : ""}`} onClick={() => setTab("done")}>
          已完成 <span>{doneCount}</span>
        </button>
      </div>
      <div className="todo-scroll">
        {visibleTodos.length === 0 && <div className="empty">{tab === "done" ? "暂无已完成待办。" : "暂无未完成待办。"}</div>}
        {visibleTodos.map((todo) => (
          <div key={todo.id} data-todo-id={todo.id} className={`todo ${todo.status} ${focusedTodoId === todo.id ? "focused" : ""}`}>
            {editingId === todo.id ? (
              <form className="todo-edit-form" onSubmit={(event) => {
                event.preventDefault();
                saveEdit(todo);
              }}>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="待办内容" />
                <input type="datetime-local" value={draftRemindAt} onChange={(event) => setDraftRemindAt(event.target.value)} />
                <div className="todo-edit-actions">
                  <button type="submit" className="todo-action" aria-label="保存修改">
                    <Save size={14} />
                  </button>
                  <button type="button" className="todo-action" onClick={cancelEdit} aria-label="取消修改">
                    <X size={14} />
                  </button>
                </div>
              </form>
            ) : (
              <>
                <button className="check" onClick={() => onToggle(todo)} aria-label={todo.status === "done" ? "标记为未完成" : "标记完成"}>
                  {todo.status === "done" ? <Check size={14} /> : null}
                </button>
                <span className="todo-body">
                  <span>{todo.title}</span>
                  {todo.remindAt && <small><Bell size={12} /> {new Date(todo.remindAt).toLocaleString()}</small>}
                </span>
                <div className="todo-actions">
                  <button className="todo-action" onClick={() => startEdit(todo)} aria-label="修改待办">
                    <Pencil size={14} />
                  </button>
                  <button className="todo-action delete-todo" onClick={() => onDelete(todo)} aria-label="删除待办">
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
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
  onTestReminder
}: {
  settings: AppSettings;
  onChange(patch: Partial<AppSettings>): void;
  onClearMessages(): void;
  onSelectPetAppearance(): void;
  onResetPetAppearance(): void;
  onTestReminder(): Promise<void>;
}) {
  const [apiKey, setApiKey] = React.useState(settings.openAiApiKey ?? "");
  const [themeColor, setThemeColor] = React.useState(settings.workspaceThemeColor);

  React.useEffect(() => {
    setThemeColor(settings.workspaceThemeColor);
  }, [settings.workspaceThemeColor]);

  function updateThemeColor(value: string) {
    setThemeColor(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      onChange({ workspaceThemeColor: value });
    }
  }

  return (
    <section className="settings">
      <label>
        <KeyRound size={14} /> DeepSeek API Key
        <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} onBlur={() => onChange({ openAiApiKey: apiKey || undefined })} placeholder="也可使用系统环境变量 DEEPSEEK_API_KEY" />
      </label>
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
      <Toggle label="自动保存待办" checked={settings.autoSaveTodos} onChange={(value) => onChange({ autoSaveTodos: value })} />
      <Toggle label="系统通知" checked={settings.systemNotifications} onChange={(value) => onChange({ systemNotifications: value })} />
      <Toggle label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => onChange({ alwaysOnTop: value })} />
      <button className="clear-chat-button" onClick={onClearMessages}>
        <Trash2 size={15} /> 清除对话记录
      </button>
      <button className="test-reminder-button" onClick={() => void onTestReminder()}>
        <Bell size={15} /> 测试 Windows 提醒
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
