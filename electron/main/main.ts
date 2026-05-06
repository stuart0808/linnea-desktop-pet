import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray, WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { basename, dirname, extname, join } from "node:path";
import type { AppSettings, ChatResult, PetAppearance, ReminderItem, TodoItem } from "../../shared/types.js";
import { askPetAssistant, summarizeRecentContext } from "./openaiClient.js";
import { JsonStore } from "./storage.js";
import type { OpenDialogOptions } from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const store = new JsonStore();
const appUserModelId = "com.local.linnea";
app.setName("Linnea");

if (process.platform === "win32") {
  app.setAppUserModelId(appUserModelId);
}

let mainWindow: BrowserWindow | null = null;
let workspaceWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const reminderTimers = new Map<string, NodeJS.Timeout>();
const collapsedPetBounds = { width: 180, height: 300 };
const expandedPetBounds = { width: 390, height: 560 };
let windowDragState: { window: BrowserWindow; offsetX: number; offsetY: number } | null = null;
const petStateNames = ["Idle", "Talking", "Happy", "Thinking", "Reminder", "Confused", "Dragging", "Urgent", "Rest", "Sleepy"] as const;
const supportedPetImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

function getPreloadPath() {
  return join(__dirname, "../../../electron/preload.cjs");
}

function getRendererUrl(windowMode?: "workspace") {
  const query = windowMode ? `window=${windowMode}` : "";
  return process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}${query ? `?${query}` : ""}`
    : (() => {
        const url = pathToFileURL(join(__dirname, "../../../dist/index.html"));
        url.search = query;
        return url.toString();
      })();
}

function getAppIconPath() {
  return join(__dirname, "../../../src/assets/app/linnea-icon.ico");
}

function getNotificationIconPath() {
  return join(__dirname, "../../../src/assets/app/linnea-icon.png");
}

function getTrayIcon() {
  return nativeImage.createFromPath(getAppIconPath()).resize({ width: 16, height: 16 });
}

function ensureWindowsNotificationShortcut() {
  if (process.platform !== "win32") return;
  const programsPath = join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs");
  mkdirSync(programsPath, { recursive: true });
  const shortcutPath = join(programsPath, "Linnea.lnk");
  const target = process.execPath;
  const args = app.isPackaged ? "" : `"${app.getAppPath()}"`;

  shell.writeShortcutLink(shortcutPath, "create", {
    target,
    args,
    appUserModelId,
    description: "Linnea desktop pet",
    icon: getAppIconPath(),
    iconIndex: 0
  });
}

async function createWindow() {
  const settings = await store.getSettings();
  const transparentMode = app.isPackaged || process.env.DESKTOP_PET_TRANSPARENT === "1";
  mainWindow = new BrowserWindow({
    width: transparentMode ? collapsedPetBounds.width : expandedPetBounds.width,
    height: transparentMode ? collapsedPetBounds.height : expandedPetBounds.height,
    minWidth: transparentMode ? 180 : 260,
    minHeight: transparentMode ? 200 : 340,
    x: 80,
    y: 80,
    show: false,
    title: "Linnea",
    icon: getAppIconPath(),
    frame: !transparentMode,
    transparent: transparentMode,
    backgroundColor: transparentMode ? "#00000000" : "#eef7f2",
    resizable: !transparentMode,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: transparentMode,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error("Renderer failed to load", { errorCode, errorDescription, validatedUrl });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone", details);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log("Renderer console", { level, message, line, sourceId });
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.setBounds({
      x: 80,
      y: 80,
      width: transparentMode ? collapsedPetBounds.width : expandedPetBounds.width,
      height: transparentMode ? collapsedPetBounds.height : expandedPetBounds.height
    });
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  });
  await mainWindow.loadURL(getRendererUrl());
}

function setPetWindowExpanded(expanded: boolean) {
  if (!mainWindow || (!app.isPackaged && process.env.DESKTOP_PET_TRANSPARENT !== "1")) return;
  const target = expanded ? expandedPetBounds : collapsedPetBounds;
  const bounds = mainWindow.getBounds();
  if (bounds.width === target.width && bounds.height === target.height) return;
  const centerX = bounds.x + bounds.width / 2;
  const bottomY = bounds.y + bounds.height;
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const nextX = Math.min(
    Math.max(Math.round(centerX - target.width / 2), workArea.x),
    workArea.x + workArea.width - target.width
  );
  const nextY = Math.min(
    Math.max(Math.round(bottomY - target.height), workArea.y),
    workArea.y + workArea.height - target.height
  );
  mainWindow.setBounds({
    x: nextX,
    y: nextY,
    width: target.width,
    height: target.height
  });
}

function beginWindowDrag(sender: WebContents, offsetX: number, offsetY: number) {
  const targetWindow = BrowserWindow.fromWebContents(sender) ?? mainWindow;
  if (!targetWindow) return;
  windowDragState = {
    window: targetWindow,
    offsetX,
    offsetY
  };
}

function dragWindowToCursor(screenX: number, screenY: number) {
  if (!windowDragState || windowDragState.window.isDestroyed()) return;
  windowDragState.window.setPosition(
    Math.round(screenX - windowDragState.offsetX),
    Math.round(screenY - windowDragState.offsetY),
    false
  );
}

function endWindowDrag() {
  windowDragState = null;
}

async function openWorkspaceWindow(todoId?: string) {
  if (workspaceWindow && !workspaceWindow.isDestroyed()) {
    workspaceWindow.show();
    workspaceWindow.focus();
    if (todoId) workspaceWindow.webContents.send("todo:focus", todoId);
    return;
  }

  workspaceWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 420,
    minHeight: 520,
    show: false,
    title: "Linnea 待办与对话",
    icon: getAppIconPath(),
    backgroundColor: "#eef7f2",
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  workspaceWindow.setMenuBarVisibility(false);
  workspaceWindow.once("ready-to-show", () => {
    workspaceWindow?.show();
    workspaceWindow?.focus();
    if (todoId) workspaceWindow?.webContents.send("todo:focus", todoId);
  });
  workspaceWindow.on("closed", () => {
    workspaceWindow = null;
  });
  await workspaceWindow.loadURL(getRendererUrl("workspace"));
}

async function openReminderTarget(reminder: ReminderItem) {
  await openWorkspaceWindow(reminder.todoId);
}

async function completeReminder(id: string): Promise<ReminderItem> {
  const reminder = await store.updateReminder(id, { dismissedAt: new Date().toISOString() });
  if (reminder.todoId) {
    await store.updateTodo(reminder.todoId, { status: "done" });
  }
  await refreshReminderTimers();
  broadcastSnapshotUpdated();
  return reminder;
}

async function snoozeReminder(id: string, minutes: number): Promise<ReminderItem> {
  const reminder = await store.updateReminder(id, {
    firedAt: undefined,
    dismissedAt: undefined,
    snoozedUntil: new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString()
  });
  await refreshReminderTimers();
  broadcastSnapshotUpdated();
  return reminder;
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip("Linnea");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示 / 隐藏", click: () => toggleWindow() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    ])
  );
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else mainWindow.show();
}

async function refreshReminderTimers() {
  for (const timer of reminderTimers.values()) clearTimeout(timer);
  reminderTimers.clear();

  const reminders = await store.listReminders();
  const now = Date.now();
  for (const reminder of reminders) {
    if (reminder.dismissedAt || reminder.firedAt) continue;
    const fireAt = new Date(reminder.snoozedUntil ?? reminder.remindAt).getTime();
    if (!Number.isFinite(fireAt)) continue;
    const delay = Math.max(0, fireAt - now);
    const timer = setTimeout(() => void fireReminder(reminder.id), delay);
    reminderTimers.set(reminder.id, timer);
  }
}

async function fireReminder(id: string) {
  const reminder = await store.updateReminder(id, { firedAt: new Date().toISOString() });
  await showReminder(reminder);
}

async function showReminder(reminder: ReminderItem) {
  const settings = await store.getSettings();
  mainWindow?.webContents.send("reminder:fired", reminder);
  workspaceWindow?.webContents.send("reminder:fired", reminder);
  mainWindow?.show();

  if (settings.systemNotifications && Notification.isSupported()) {
    const notification = new Notification({
      title: reminder.title,
      body: reminder.message || "有一个待办提醒到了。",
      icon: getNotificationIconPath(),
      timeoutType: "never",
      actions: reminder.todoId
        ? [
            { type: "button", text: "完成" },
            { type: "button", text: "10 分钟后提醒" },
            { type: "button", text: "打开待办" }
          ]
        : undefined
    });
    notification.on("click", () => {
      void openReminderTarget(reminder);
    });
    notification.on("action", (details, actionIndex) => {
      const index = details.actionIndex ?? actionIndex;
      if (index === 0) void completeReminder(reminder.id);
      else if (index === 1) void snoozeReminder(reminder.id, 10);
      else void openReminderTarget(reminder);
    });
    notification.show();
  }
}

function broadcastSnapshotUpdated(except?: WebContents) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window.webContents.id !== except?.id) {
      window.webContents.send("app:snapshotUpdated");
    }
  }
}

function normalizeMaybeIso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function getLocalTimeContext(now = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const localTimeText = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset"
  }).format(now);

  return {
    nowIso: now.toISOString(),
    localTimeText,
    timeZone
  };
}

function createTodo(candidate: {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  remindAt?: string | null;
  confidence?: number;
}, sourceMessage: string): TodoItem {
  return {
    id: randomUUID(),
    title: candidate.title.trim().slice(0, 120),
    notes: candidate.notes ?? undefined,
    sourceMessage,
    status: "open",
    createdAt: new Date().toISOString(),
    dueAt: normalizeMaybeIso(candidate.dueAt),
    remindAt: normalizeMaybeIso(candidate.remindAt),
    confidence: candidate.confidence
  };
}

function createReminder(todo: TodoItem, message?: string): ReminderItem | null {
  if (!todo.remindAt) return null;
  return {
    id: randomUUID(),
    todoId: todo.id,
    title: todo.title,
    message: message ?? `该处理：${todo.title}`,
    remindAt: todo.remindAt
  };
}

async function selectPetAppearance(sender: WebContents): Promise<PetAppearance | null> {
  const owner = BrowserWindow.fromWebContents(sender) ?? workspaceWindow ?? mainWindow;
  const options: OpenDialogOptions = {
    title: "选择桌宠形象文件夹",
    properties: ["openDirectory"]
  };
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const appearance = await scanPetAppearanceFolder(result.filePaths[0]);
  const next = await store.updateSettings({ petAppearance: appearance });
  broadcastSnapshotUpdated(sender);
  return next.petAppearance ?? appearance;
}

async function scanPetAppearanceFolder(directory: string): Promise<PetAppearance> {
  const folderName = basename(directory);
  if (!folderName.endsWith("_state")) {
    throw new Error("形象文件夹名称需要以 _state 结尾，例如 Linnea_state。");
  }
  const roleName = folderName.slice(0, -"_state".length) || "自定义角色";
  const entries = await readdir(directory, { withFileTypes: true });
  const images: PetAppearance["images"] = {};

  for (const state of petStateNames) {
    const match = entries.find((entry) => {
      if (!entry.isFile()) return false;
      const extension = extname(entry.name).toLowerCase();
      if (!supportedPetImageExtensions.has(extension)) return false;
      const nameWithoutExtension = basename(entry.name, extension).toLowerCase();
      return nameWithoutExtension === `_${state.toLowerCase()}_`;
    });
    if (match) images[state.toLowerCase()] = pathToFileURL(join(directory, match.name)).toString();
  }

  if (!images.idle) {
    throw new Error("形象文件夹至少需要包含 _Idle_ 图片文件，例如 _Idle_.png。");
  }

  return {
    name: roleName,
    directory,
    images
  };
}

function registerIpc() {
  ipcMain.handle("app:snapshot", () => store.snapshot());
  ipcMain.handle("app:setIgnoreMouseEvents", (_event, ignore: boolean) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.handle("app:moveWindowBy", (_event, deltaX: number, deltaY: number) => {
    const targetWindow = BrowserWindow.fromWebContents(_event.sender) ?? mainWindow;
    if (!targetWindow) return;
    const [x, y] = targetWindow.getPosition();
    targetWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY));
  });
  ipcMain.handle("app:beginWindowDrag", (_event, offsetX: number, offsetY: number) => {
    beginWindowDrag(_event.sender, offsetX, offsetY);
  });
  ipcMain.on("app:dragWindowToCursor", (_event, screenX: number, screenY: number) => {
    dragWindowToCursor(screenX, screenY);
  });
  ipcMain.handle("app:endWindowDrag", () => {
    endWindowDrag();
  });
  ipcMain.handle("app:setPetWindowExpanded", (_event, expanded: boolean) => {
    setPetWindowExpanded(expanded);
  });
  ipcMain.handle("app:openWorkspaceWindow", (_event, todoId?: string) => openWorkspaceWindow(todoId));

  ipcMain.handle("chat:listMessages", () => store.listMessages());
  ipcMain.handle("chat:clearMessages", async (_event) => {
    await store.clearMessages();
    broadcastSnapshotUpdated(_event.sender);
  });
  ipcMain.handle("chat:sendMessage", async (_event, text: string): Promise<ChatResult> => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message is empty");

    const userMessage = {
      id: randomUUID(),
      role: "user" as const,
      text: trimmed,
      createdAt: new Date().toISOString()
    };
    await store.addMessage(userMessage);

    const settings = await store.getSettings();
    const apiKey = settings.openAiApiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const timeContext = getLocalTimeContext();
    const modelResult = await askPetAssistant({
      apiKey,
      model: settings.openAiModel,
      text: trimmed,
      ...timeContext
    });

    const assistantMessage = {
      id: randomUUID(),
      role: "assistant" as const,
      text: modelResult.replyText,
      createdAt: new Date().toISOString()
    };
    await store.addMessage(assistantMessage);

    const extractedTodos: TodoItem[] = [];
    const reminders: ReminderItem[] = [];
    if (settings.autoSaveTodos) {
      for (const candidate of modelResult.todoCandidates) {
        if (!candidate.title?.trim() || candidate.confidence < 0.45) continue;
        const todo = createTodo(candidate, trimmed);
        await store.addTodo(todo, true);
        extractedTodos.push(todo);
        const reminder = createReminder(todo);
        if (reminder) {
          await store.addReminder(reminder);
          reminders.push(reminder);
        }
      }
      await refreshReminderTimers();
    }

    broadcastSnapshotUpdated(_event.sender);

    return {
      assistantMessage,
      extractedTodos,
      reminders,
      mood: modelResult.mood
    };
  });

  ipcMain.handle("todo:list", () => store.listTodos());
  ipcMain.handle("todo:update", async (_event, id: string, patch: Partial<TodoItem>) => {
    const updated = await store.updateTodo(id, patch);
    if ("title" in patch || "remindAt" in patch) {
      await store.replaceReminderForTodo(updated.id, createReminder(updated));
      await refreshReminderTimers();
    }
    broadcastSnapshotUpdated(_event.sender);
    return updated;
  });
  ipcMain.handle("todo:delete", async (_event, id: string) => {
    const removed = await store.deleteTodo(id);
    await refreshReminderTimers();
    broadcastSnapshotUpdated(_event.sender);
    return removed;
  });
  ipcMain.handle("todo:undoLastAutoSave", async (_event) => {
    const removed = await store.undoLastAutoSave();
    if (removed) broadcastSnapshotUpdated(_event.sender);
    return removed;
  });

  ipcMain.handle("reminder:list", () => store.listReminders());
  ipcMain.handle("reminder:complete", async (_event, id: string) => completeReminder(id));
  ipcMain.handle("reminder:dismiss", async (_event, id: string) => {
    const reminder = await store.updateReminder(id, { dismissedAt: new Date().toISOString() });
    await refreshReminderTimers();
    broadcastSnapshotUpdated(_event.sender);
    return reminder;
  });
  ipcMain.handle("reminder:snooze", async (_event, id: string, minutes: number) => snoozeReminder(id, minutes));
  ipcMain.handle("reminder:test", async () => {
    const reminder: ReminderItem = {
      id: randomUUID(),
      title: "Linnea 测试提醒",
      message: "如果你看到这条 Windows 通知，提醒功能可以正常触达。",
      remindAt: new Date().toISOString(),
      firedAt: new Date().toISOString()
    };
    await showReminder(reminder);
    return reminder;
  });

  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:set", async (_event, patch: Partial<AppSettings>) => {
    const next = await store.updateSettings(patch);
    mainWindow?.setAlwaysOnTop(next.alwaysOnTop);
    app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    broadcastSnapshotUpdated(_event.sender);
    return next;
  });

  ipcMain.handle("appearance:selectFolder", async (_event) => selectPetAppearance(_event.sender));
  ipcMain.handle("appearance:reset", async (_event) => {
    const next = await store.updateSettings({ petAppearance: undefined });
    broadcastSnapshotUpdated(_event.sender);
    return next;
  });

  ipcMain.handle("summary:generate", async () => {
    const settings = await store.getSettings();
    const apiKey = settings.openAiApiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const timeContext = getLocalTimeContext();
    return summarizeRecentContext({
      apiKey,
      model: settings.openAiModel,
      messages: await store.listMessages(),
      todos: await store.listTodos(),
      ...timeContext
    });
  });
}

app.whenReady().then(async () => {
  ensureWindowsNotificationShortcut();
  await store.load();
  registerIpc();
  await createWindow();
  try {
    createTray();
  } catch {
    tray = null;
  }
  await refreshReminderTimers();
  if (process.env.DESKTOP_PET_TEST_REMINDER === "1") {
    setTimeout(() => {
      void showReminder({
        id: randomUUID(),
        title: "Linnea 测试提醒",
        message: "自动测试：Windows 提醒功能已触发。",
        remindAt: new Date().toISOString(),
        firedAt: new Date().toISOString()
      });
    }, 1500);
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
