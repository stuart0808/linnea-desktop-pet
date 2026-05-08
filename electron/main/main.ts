import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray, WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { spawn as spawnChild, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { basename, delimiter, dirname, extname, isAbsolute, join } from "node:path";
import { uIOhook, UiohookKey, type UiohookKeyboardEvent, type UiohookMouseEvent } from "uiohook-napi";
import WebSocket from "ws";
import type { AppSettings, ChatResult, CodexApprovalPolicy, CodexCopiedItem, CodexCreateSessionOptions, CodexDropItem, CodexReasoningEffort, CodexSandboxPolicy, CodexSavedSession, CodexSessionHistory, CodexSessionInfo, CodexStartOptions, CodexThreadMode, CodexThreadSettings, ConversationMessage, PetAppearance, ReminderItem, SelectionAskDraft, SelectionCapture, SelectionTextAction, SelectionTextResult, TodoCandidate, TodoItem } from "../../shared/types.js";
import { askPetAssistant, processSelectedText, summarizeRecentContext, testAiConnection } from "./openaiClient.js";
import { JsonStore } from "./storage.js";
import type { OpenDialogOptions } from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const store = new JsonStore();
const appUserModelId = "com.local.linnea";
const githubRepoOwner = "stuart0808";
const githubRepoName = "linnea-desktop-pet";
app.setName("Linnea");

if (process.platform === "win32") {
  app.setAppUserModelId(appUserModelId);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let workspaceWindow: BrowserWindow | null = null;
let selectionPopoverWindow: BrowserWindow | null = null;
const selectionResultWindows = new Set<BrowserWindow>();
let tray: Tray | null = null;
let isQuitting = false;
const reminderTimers = new Map<string, NodeJS.Timeout>();
const selectionResults = new Map<string, SelectionTextResult>();
const selectionCaptures = new Map<string, SelectionCapture>();
const pendingSelectionCaptureIds = new Set<string>();
const selectionResultSources = new Map<string, string>();
let selectionAskDraftCaptures: SelectionCapture[] = [];
const codexSessions = new Map<string, CodexRuntimeSession>();
const collapsedPetBounds = { width: 180, height: 300 };
const expandedPetBounds = { width: 560, height: 720 };
const workspacePreferredBounds = { width: 1680, height: 820, minWidth: 1600, minHeight: 700 };
const selectionPopoverCollapsedBounds = { width: 38, height: 38 };
const selectionPopoverExpandedBounds = { width: 372, height: 38 };
let registeredQuickAiRecordShortcut: string | null = null;
let windowDragState: { window: BrowserWindow; offsetX: number; offsetY: number } | null = null;
let pendingPetExpanded: boolean | null = null;
let globalSelectionHookStarted = false;
let globalMouseDown: { x: number; y: number; time: number; insideAppWindow: boolean; moved: boolean } | null = null;
let globalSelectionCaptureInFlight = false;
let selectionPopoverAnchor: { x: number; y: number; placement: "right" | "left" } | null = null;
let selectionPopoverCaptureId: string | null = null;
let syntheticKeyboardEventsSuppressedUntil = 0;
let uiaHelperProcess: ChildProcessWithoutNullStreams | null = null;
let uiaHelperReady = false;
let uiaHelperPending: Array<(text: string) => void> = [];
let uiaHelperBuffer = "";
let lastGlobalKeyActivityTime = 0;
interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}
interface GitHubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  assets?: GitHubReleaseAsset[];
}
const petStateNames = ["Idle", "Talking", "Happy", "Thinking", "Reminder", "Confused", "Dragging", "Urgent", "Rest", "Sleepy"] as const;
const supportedPetImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
interface CodexRuntimeSession extends CodexSessionInfo {
  rootPath: string;
  appServer?: ChildProcessWithoutNullStreams;
  appSocket?: WebSocket;
  appReady?: Promise<void>;
  requestSeq?: number;
  pendingRequests?: Map<number | string, { resolve(value: unknown): void; reject(error: Error): void }>;
  threadId?: string;
  startOptions?: CodexStartOptions;
  activeThreadId?: string;
  threads?: Record<string, CodexSessionHistory>;
}

function getPreloadPath() {
  return join(__dirname, "../../../electron/preload.cjs");
}

function getRendererUrl(windowMode?: "workspace" | "selection-result" | "selection-popover" | "codex") {
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

function getWorkspaceInitialBounds() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const minWidth = Math.min(workspacePreferredBounds.minWidth, workAreaSize.width);
  const minHeight = Math.min(workspacePreferredBounds.minHeight, workAreaSize.height);
  const width = Math.min(workspacePreferredBounds.width, Math.floor(workAreaSize.width * 0.94));
  const height = Math.min(workspacePreferredBounds.height, Math.floor(workAreaSize.height * 0.92));
  return {
    width: Math.max(minWidth, width),
    height: Math.max(minHeight, height),
    minWidth,
    minHeight
  };
}

function normalizeAccelerator(value: string | undefined) {
  return value?.trim().replace(/\s+/g, "") || "";
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
  if (windowDragState?.window === mainWindow) {
    pendingPetExpanded = expanded;
    return;
  }
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

async function triggerQuickAiRecord() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.moveTop();
  mainWindow.focus();
  setPetWindowExpanded(true);
  mainWindow.webContents.send("app:quickAiRecord");
}

async function registerQuickAiRecordShortcut() {
  const settings = await store.getSettings();
  const accelerator = normalizeAccelerator(settings.quickAiRecordShortcut);
  if (registeredQuickAiRecordShortcut) {
    globalShortcut.unregister(registeredQuickAiRecordShortcut);
    registeredQuickAiRecordShortcut = null;
  }
  if (!accelerator) return;
  const ok = globalShortcut.register(accelerator, () => {
    void triggerQuickAiRecord();
  });
  registeredQuickAiRecordShortcut = ok ? accelerator : null;
  if (!ok) console.warn(`Failed to register quick AI record shortcut: ${accelerator}`);
}

function beginWindowDrag(sender: WebContents) {
  const targetWindow = BrowserWindow.fromWebContents(sender) ?? mainWindow;
  if (!targetWindow) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = targetWindow.getBounds();
  windowDragState = {
    window: targetWindow,
    offsetX: cursor.x - bounds.x,
    offsetY: cursor.y - bounds.y
  };
}

function dragWindowToCursor() {
  if (!windowDragState || windowDragState.window.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const nextX = Math.round(cursor.x - windowDragState.offsetX);
  const nextY = Math.round(cursor.y - windowDragState.offsetY);
  const [currentX, currentY] = windowDragState.window.getPosition();
  if (currentX === nextX && currentY === nextY) return;
  windowDragState.window.setPosition(nextX, nextY, false);
}

function endWindowDrag() {
  const wasDraggingMainWindow = windowDragState?.window === mainWindow;
  windowDragState = null;
  if (wasDraggingMainWindow && pendingPetExpanded !== null) {
    const expanded = pendingPetExpanded;
    pendingPetExpanded = null;
    setPetWindowExpanded(expanded);
  }
}

async function openWorkspaceWindow(todoId?: string) {
  void syncGlobalSelectionHook();
  if (workspaceWindow && !workspaceWindow.isDestroyed()) {
    workspaceWindow.show();
    workspaceWindow.focus();
    if (todoId) workspaceWindow.webContents.send("todo:focus", todoId);
    return;
  }

  const initialBounds = getWorkspaceInitialBounds();
  workspaceWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: initialBounds.minWidth,
    minHeight: initialBounds.minHeight,
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

async function openSelectionResultWindow(result: SelectionTextResult) {
  const resultWindow = new BrowserWindow({
    width: 520,
    height: 420,
    minWidth: 360,
    minHeight: 260,
    show: false,
    title: result.title,
    icon: getAppIconPath(),
    backgroundColor: "#f7fbf8",
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  resultWindow.setMenuBarVisibility(false);
  selectionResultWindows.add(resultWindow);
  resultWindow.on("closed", () => {
    selectionResultWindows.delete(resultWindow);
  });
  resultWindow.once("ready-to-show", () => {
    resultWindow.show();
    resultWindow.focus();
  });
  await resultWindow.loadURL(getRendererUrl("selection-result") + `&id=${encodeURIComponent(result.id)}`);
}

async function processSelectionResultInBackground(result: SelectionTextResult, text: string, targetLanguage?: string) {
  try {
    const settings = await store.getSettings();
    const ai = resolveAiConfig(settings);
    const markdown = await processSelectedText({
      ...ai,
      action: result.action,
      text,
      targetLanguage
    });
    selectionResults.set(result.id, {
      ...result,
      markdown,
      status: "done",
      targetLanguage,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    selectionResults.set(result.id, {
      ...result,
      status: "error",
      error: error instanceof Error ? error.message : "处理失败",
      targetLanguage,
      updatedAt: new Date().toISOString()
    });
  }
}

async function openSelectionPopoverWindow(capture: SelectionCapture, x: number, y: number) {
  if (selectionPopoverWindow && !selectionPopoverWindow.isDestroyed()) {
    selectionPopoverWindow.close();
  }
  const placement = getSelectionPopoverPlacement(x, y);
  selectionPopoverAnchor = { x, y, placement };
  selectionPopoverCaptureId = capture.id;
  const windowBounds = getSelectionPopoverBounds(x, y, true, placement);

  selectionPopoverWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    title: "Linnea 选中文本",
    icon: getAppIconPath(),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  selectionPopoverWindow.setMenuBarVisibility(false);
  selectionPopoverWindow.once("ready-to-show", () => {
    selectionPopoverWindow?.showInactive();
  });
  selectionPopoverWindow.on("closed", () => {
    if (selectionPopoverCaptureId && pendingSelectionCaptureIds.has(selectionPopoverCaptureId)) {
      pendingSelectionCaptureIds.delete(selectionPopoverCaptureId);
      selectionCaptures.delete(selectionPopoverCaptureId);
    }
    selectionPopoverWindow = null;
    selectionPopoverAnchor = null;
    selectionPopoverCaptureId = null;
  });
  try {
    await selectionPopoverWindow.loadURL(getRendererUrl("selection-popover") + `&id=${encodeURIComponent(capture.id)}&placement=${encodeURIComponent(placement)}`);
  } catch (error) {
    if (selectionPopoverWindow && !selectionPopoverWindow.isDestroyed()) selectionPopoverWindow.close();
    console.warn("Failed to load selection popover window", error);
  }
}

function getSelectionPopoverPlacement(x: number, y: number): "right" | "left" {
  const display = screen.getDisplayNearestPoint({ x, y });
  const bounds = display.workArea;
  const margin = 6;
  const offset = 8;
  return x + offset + selectionPopoverExpandedBounds.width <= bounds.x + bounds.width - margin ? "right" : "left";
}

function getSelectionPopoverBounds(x: number, y: number, expanded: boolean, placement = getSelectionPopoverPlacement(x, y)) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const size = expanded ? selectionPopoverExpandedBounds : selectionPopoverCollapsedBounds;
  const bounds = display.workArea;
  const margin = 6;
  const offset = 8;
  const preferredX = x + offset;
  const preferredY = y + offset;
  const targetX = placement === "right"
    ? preferredX
    : x + offset + selectionPopoverCollapsedBounds.width - size.width;
  const targetY = preferredY + size.height <= bounds.y + bounds.height - margin
    ? preferredY
    : y - size.height - offset;
  return {
    width: size.width,
    height: size.height,
    x: Math.round(Math.min(bounds.x + bounds.width - size.width - margin, Math.max(bounds.x + margin, targetX))),
    y: Math.round(Math.min(bounds.y + bounds.height - size.height - margin, Math.max(bounds.y + margin, targetY)))
  };
}

function resizeSelectionPopoverWindow(expanded: boolean) {
  void expanded;
  if (!selectionPopoverWindow || selectionPopoverWindow.isDestroyed() || !selectionPopoverAnchor) return;
  const bounds = getSelectionPopoverBounds(selectionPopoverAnchor.x, selectionPopoverAnchor.y, true, selectionPopoverAnchor.placement);
  const current = selectionPopoverWindow.getBounds();
  if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
    selectionPopoverWindow.setBounds(bounds, false);
  }
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

async function checkForUpdates(manual = false) {
  try {
    const settings = await store.getSettings();
    const release = await fetchLatestGitHubRelease();
    const latestVersion = normalizeVersion(release.tag_name ?? release.name);
    const currentVersion = normalizeVersion(app.getVersion());
    if (!latestVersion || !currentVersion) {
      if (manual) await showUpdateInfo("无法识别版本信息", "没有从 GitHub release 中读取到可比较的版本号。");
      return;
    }
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      if (manual) await showUpdateInfo("已是最新版本", `当前版本 ${currentVersion} 已是最新版本。`);
      return;
    }
    if (!manual && settings.skippedUpdateVersion === latestVersion) return;

    const installerAsset = findWindowsInstallerAsset(release.assets);
    const downloadUrl = installerAsset?.browser_download_url ?? release.html_url;
    const releaseNotes = formatReleaseNotesForUpdateDialog(release.body);
    if (!downloadUrl) {
      if (manual) await showUpdateInfo("发现新版本", `Linnea ${latestVersion} 已发布，但没有找到可用下载链接。\n\n${releaseNotes}`);
      return;
    }

    const messageOptions: Electron.MessageBoxOptions = {
      type: "info",
      title: "发现新版本",
      message: `Linnea ${latestVersion} 已发布`,
      detail: `当前版本：${currentVersion}\n最新版本：${latestVersion}\n\n${releaseNotes}\n\n是否下载最新安装包？`,
      buttons: ["更新", "跳过当前版本", "稍后"],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    };
    const response = mainWindow
      ? await dialog.showMessageBox(mainWindow, messageOptions)
      : await dialog.showMessageBox(messageOptions);

    if (response.response === 0) {
      await shell.openExternal(downloadUrl);
    } else if (response.response === 1) {
      await store.updateSettings({ skippedUpdateVersion: latestVersion });
    }
  } catch (error) {
    console.error("Failed to check for updates", error);
    if (manual) {
      await showUpdateInfo("检查更新失败", error instanceof Error ? error.message : "请稍后再试。");
    }
  }
}

function formatReleaseNotesForUpdateDialog(body: string | undefined) {
  const text = body?.trim() || "暂无更新说明。";
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .trim();
  return normalized.length > 1600 ? `${normalized.slice(0, 1600).trim()}\n...` : normalized;
}

function showUpdateInfo(message: string, detail: string) {
  const messageOptions: Electron.MessageBoxOptions = {
    type: "info",
    title: "检查更新",
    message,
    detail,
    buttons: ["确定"],
    defaultId: 0,
    noLink: true
  };
  return mainWindow
    ? dialog.showMessageBox(mainWindow, messageOptions)
    : dialog.showMessageBox(messageOptions);
}

function fetchLatestGitHubRelease(): Promise<GitHubRelease> {
  const url = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/releases/latest`;
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `${githubRepoName}/${app.getVersion()}`
      }
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        httpsGet(response.headers.location, (redirectResponse) => collectJsonResponse(redirectResponse, resolve, reject)).on("error", reject);
        return;
      }
      collectJsonResponse(response, resolve, reject);
    });
    request.setTimeout(9000, () => {
      request.destroy(new Error("检查更新超时"));
    });
    request.on("error", reject);
  });
}

function collectJsonResponse(
  response: import("node:http").IncomingMessage,
  resolve: (value: GitHubRelease) => void,
  reject: (reason?: unknown) => void
) {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => {
    body += chunk;
  });
  response.on("end", () => {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
      reject(new Error(`GitHub releases 请求失败：${response.statusCode ?? "unknown"}`));
      return;
    }
    try {
      resolve(JSON.parse(body) as GitHubRelease);
    } catch (error) {
      reject(error);
    }
  });
  response.on("error", reject);
}

function findWindowsInstallerAsset(assets: GitHubReleaseAsset[] | undefined) {
  if (!assets?.length) return undefined;
  return assets.find((asset) => asset.name?.toLowerCase().endsWith(".exe") && /setup/i.test(asset.name)) ??
    assets.find((asset) => asset.name?.toLowerCase().endsWith(".exe"));
}

function normalizeVersion(value: string | undefined) {
  const match = value?.trim().match(/^v?(\d+(?:\.\d+){0,2})/i);
  if (!match) return undefined;
  const parts = match[1].split(".").map((part) => Number.parseInt(part, 10));
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).join(".");
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const UIA_HELPER_SCRIPT = [
  "Add-Type -AssemblyName UIAutomationClient",
  "Add-Type -TypeDefinition @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "public class LinneaWinApi {",
  "    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
  "    [DllImport(\"user32.dll\")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);",
  "}",
  "'@",
  "$tp = [System.Windows.Automation.TextPattern]::Pattern",
  "Write-Host 'READY'",
  "[Console]::Out.Flush()",
  "while ($true) {",
  "    $line = [Console]::In.ReadLine()",
  "    if ($null -eq $line) { break }",
  "    if ($line.Trim() -eq 'GET') {",
  "        $result = 'EMPTY:'",
  "        # Step 1: UIA TextPattern (works for most modern apps)",
  "        try {",
  "            $el = [System.Windows.Automation.AutomationElement]::FocusedElement",
  "            if ($null -ne $el) {",
  "                try {",
  "                    $pat = $el.GetCurrentPattern($tp)",
  "                    $ranges = $pat.GetSelection()",
  "                    if ($ranges.Length -gt 0) {",
  "                        $text = $ranges[0].GetText(-1)",
  "                        if ($text.Length -gt 0) {",
  "                            $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text))",
  "                            $result = \"TEXT:$b64\"",
  "                        }",
  "                    }",
  "                } catch { }",
  "            }",
  "        } catch { }",
  "        # Step 2: WM_COPY fallback (handles terminals and non-UIA apps, no keyboard events)",
  "        if ($result -eq 'EMPTY:') {",
  "            try {",
  "                $hwnd = [LinneaWinApi]::GetForegroundWindow()",
  "                if ($hwnd -ne [IntPtr]::Zero) {",
  "                    $prev = ''",
  "                    try { $prev = Get-Clipboard -ErrorAction Stop } catch { }",
  "                    $marker = [System.Guid]::NewGuid().ToString()",
  "                    try { Set-Clipboard -Value $marker -ErrorAction Stop } catch { }",
  "                    [LinneaWinApi]::SendMessage($hwnd, 0x0301, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null",
  "                    Start-Sleep -Milliseconds 80",
  "                    $copied = ''",
  "                    try { $copied = Get-Clipboard -ErrorAction Stop } catch { }",
  "                    if ($copied -ne $marker -and $copied.Length -gt 0) {",
  "                        $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($copied))",
  "                        $result = \"TEXT:$b64\"",
  "                    }",
  "                    try {",
  "                        if ($prev.Length -gt 0) { Set-Clipboard -Value $prev -ErrorAction Stop }",
  "                        elseif ($result -eq 'EMPTY:') { Set-Clipboard -Value $marker -ErrorAction Stop }",
  "                    } catch { }",
  "                }",
  "            } catch { }",
  "        }",
  "        Write-Host $result",
  "        [Console]::Out.Flush()",
  "    }",
  "}"
].join("\r\n");

function startUiaHelper() {
  if (process.platform !== "win32" || uiaHelperProcess) return;
  try {
    const scriptPath = join(tmpdir(), "linnea-uia-helper.ps1");
    writeFileSync(scriptPath, UIA_HELPER_SCRIPT, "utf8");
    const child = spawnChild("powershell.exe", [
      "-NonInteractive", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath
    ], { stdio: ["pipe", "pipe", "ignore"] }) as unknown as ChildProcessWithoutNullStreams;
    uiaHelperProcess = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      uiaHelperBuffer += data;
      const lines = uiaHelperBuffer.split(/\r?\n/);
      uiaHelperBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "READY") {
          uiaHelperReady = true;
        } else if (trimmed.startsWith("TEXT:")) {
          const text = Buffer.from(trimmed.slice(5), "base64").toString("utf8");
          uiaHelperPending.shift()?.(text.slice(0, 8000));
        } else if (trimmed.startsWith("EMPTY:") || trimmed.startsWith("ERROR:")) {
          uiaHelperPending.shift()?.("");
        }
      }
    });
    child.on("exit", () => {
      uiaHelperProcess = null;
      uiaHelperReady = false;
      uiaHelperBuffer = "";
      for (const resolve of uiaHelperPending.splice(0)) resolve("");
    });
  } catch {
    // UIA helper unavailable, clipboard fallback will be used
  }
}

function stopUiaHelper() {
  if (!uiaHelperProcess) return;
  try { uiaHelperProcess.kill(); } catch { }
  uiaHelperProcess = null;
  uiaHelperReady = false;
  uiaHelperBuffer = "";
  for (const resolve of uiaHelperPending.splice(0)) resolve("");
}

function queryUiaSelectedText(): Promise<string> {
  if (!uiaHelperProcess || !uiaHelperReady) return Promise.resolve("");
  return new Promise<string>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = uiaHelperPending.indexOf(resolve);
      if (idx >= 0) uiaHelperPending.splice(idx, 1);
      resolve("");
    }, 500);
    uiaHelperPending.push((text) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(text);
    });
    try {
      uiaHelperProcess!.stdin.write("GET\n");
    } catch {
      settled = true;
      clearTimeout(timer);
      uiaHelperPending.pop();
      resolve("");
    }
  });
}

function registerGlobalSelectionHook() {
  if (process.platform !== "win32" || globalSelectionHookStarted) return;
  startUiaHelper();
  try {
    const recordKeyboardActivity = (_event: UiohookKeyboardEvent) => {
      lastGlobalKeyActivityTime = Date.now();
      if (Date.now() < syntheticKeyboardEventsSuppressedUntil) return;
      closePendingSelectionPopover();
    };
    uIOhook.on("keydown", recordKeyboardActivity);
    uIOhook.on("keyup", recordKeyboardActivity);
    uIOhook.on("mousedown", (event: UiohookMouseEvent) => {
      const point = normalizeGlobalMousePoint(event.x, event.y);
      closePendingSelectionPopoverIfOutside(point.x, point.y);
      globalMouseDown = { x: point.x, y: point.y, time: Date.now(), insideAppWindow: isPointInsideAppWindow(point.x, point.y), moved: false };
    });
    uIOhook.on("mousemove", (event: UiohookMouseEvent) => {
      if (!globalMouseDown) return;
      const point = normalizeGlobalMousePoint(event.x, event.y);
      if (Math.hypot(point.x - globalMouseDown.x, point.y - globalMouseDown.y) >= 4) {
        globalMouseDown.moved = true;
      }
    });
    uIOhook.on("mouseup", (event: UiohookMouseEvent) => {
      const point = normalizeGlobalMousePoint(event.x, event.y);
      const start = globalMouseDown;
      globalMouseDown = null;
      if (!start) return;
      if (start.insideAppWindow) return;
      const distance = Math.hypot(point.x - start.x, point.y - start.y);
      const duration = Date.now() - start.time;
      if (!start.moved || distance < 10 || duration < 120) return;
      void (async () => {
        const keySnapshot = lastGlobalKeyActivityTime;
        const text = await queryUiaSelectedText();
        if (!text || text.length < 2) return;
        if (lastGlobalKeyActivityTime !== keySnapshot) return;
        void openPendingGlobalSelectionCapture(point.x, point.y, text);
      })();
    });
    uIOhook.on("click", (event: UiohookMouseEvent) => {
      if (event.clicks < 2) return;
      const point = normalizeGlobalMousePoint(event.x, event.y);
      if (isPointInsideAppWindow(point.x, point.y)) return;
      void (async () => {
        const keySnapshot = lastGlobalKeyActivityTime;
        const text = await queryUiaSelectedText();
        if (!text || text.length < 2) return;
        if (lastGlobalKeyActivityTime !== keySnapshot) return;
        void openPendingGlobalSelectionCapture(point.x, point.y, text);
      })();
    });
    uIOhook.start();
    globalSelectionHookStarted = true;
  } catch (error) {
    console.error("Failed to start global selection hook", error);
  }
}

function unregisterGlobalSelectionHook() {
  if (process.platform !== "win32") return;
  stopUiaHelper();
  try {
    if (globalSelectionHookStarted) uIOhook.stop();
    uIOhook.removeAllListeners("keydown");
    uIOhook.removeAllListeners("keyup");
    uIOhook.removeAllListeners("mousedown");
    uIOhook.removeAllListeners("mousemove");
    uIOhook.removeAllListeners("mouseup");
    uIOhook.removeAllListeners("click");
  } catch {
    // ignore hook shutdown errors
  } finally {
    globalSelectionHookStarted = false;
    globalMouseDown = null;
  }
}

async function syncGlobalSelectionHook() {
  const settings = await store.getSettings();
  if (settings.selectionToolsEnabled) {
    registerGlobalSelectionHook();
  } else {
    unregisterGlobalSelectionHook();
  }
}

function isPointInsideAppWindow(x: number, y: number) {
  const ignoredWindows = [mainWindow, workspaceWindow, selectionPopoverWindow, ...selectionResultWindows].filter(
    (window): window is BrowserWindow => Boolean(window)
  );
  return ignoredWindows.some((window) => isPointInsideBrowserWindow(window, x, y));
}

function isPointInsideBrowserWindow(window: BrowserWindow, x: number, y: number) {
  if (window.isDestroyed() || !window.isVisible()) return false;
  const bounds = window.getBounds();
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
}

function closePendingSelectionPopoverIfOutside(x: number, y: number) {
  if (!selectionPopoverWindow || selectionPopoverWindow.isDestroyed()) return;
  if (isPointInsideBrowserWindow(selectionPopoverWindow, x, y)) return;
  closePendingSelectionPopover();
}

function closePendingSelectionPopover() {
  if (!selectionPopoverWindow || selectionPopoverWindow.isDestroyed()) return;
  if (!selectionPopoverCaptureId || !pendingSelectionCaptureIds.has(selectionPopoverCaptureId)) return;
  selectionPopoverWindow.close();
}

function normalizeGlobalMousePoint(x: number, y: number) {
  for (const display of screen.getAllDisplays()) {
    const scaleFactor = display.scaleFactor || 1;
    const physicalBounds = {
      x: display.bounds.x * scaleFactor,
      y: display.bounds.y * scaleFactor,
      width: display.bounds.width * scaleFactor,
      height: display.bounds.height * scaleFactor
    };
    if (
      x >= physicalBounds.x &&
      x <= physicalBounds.x + physicalBounds.width &&
      y >= physicalBounds.y &&
      y <= physicalBounds.y + physicalBounds.height
    ) {
      return {
        x: Math.round(display.bounds.x + (x - physicalBounds.x) / scaleFactor),
        y: Math.round(display.bounds.y + (y - physicalBounds.y) / scaleFactor)
      };
    }
  }
  return { x, y };
}

async function openPendingGlobalSelectionCapture(x: number, y: number, prefilledText?: string) {
  const capture: SelectionCapture = {
    id: randomUUID(),
    text: prefilledText ?? "",
    createdAt: new Date().toISOString()
  };
  selectionCaptures.set(capture.id, capture);
  pendingSelectionCaptureIds.add(capture.id);
  await openSelectionPopoverWindow(capture, x, y);
}

async function resolveSelectionCapture(id: string): Promise<SelectionCapture> {
  const capture = selectionCaptures.get(id);
  if (!capture) throw new Error("Selected text capture not found");
  // UIA already provided the text — return immediately without clipboard simulation
  if (capture.text.trim()) {
    pendingSelectionCaptureIds.delete(id);
    return capture;
  }
  // Fallback: clipboard simulation for apps without UIA text pattern support
  if (!pendingSelectionCaptureIds.has(id)) throw new Error("没有读取到选中文字。");
  const text = await captureGlobalSelectedTextFromActiveSelection();
  if (!text || text.length < 2) throw new Error("没有读取到选中文字。");
  const resolved: SelectionCapture = {
    ...capture,
    text: text.slice(0, 8000)
  };
  selectionCaptures.set(id, resolved);
  pendingSelectionCaptureIds.delete(id);
  return resolved;
}

async function captureGlobalSelectedTextFromActiveSelection() {
  if (globalSelectionCaptureInFlight) return;

  globalSelectionCaptureInFlight = true;
  const previousText = clipboard.readText().trim();
  const marker = `__LINNEA_SELECTION_${randomUUID()}__`;
  try {
    clipboard.writeText(marker);
    await delay(40);
    copySelectedTextToClipboard();
    let selectedText = await waitForClipboardTextAfterCopy(marker, 700);
    if (!selectedText) {
      await delay(180);
      copySelectedTextToClipboard();
      selectedText = await waitForClipboardTextAfterCopy(marker, 700);
    }
    return selectedText;
  } finally {
    if (clipboard.readText().trim() === marker) clipboard.writeText(previousText);
    globalSelectionCaptureInFlight = false;
  }
}

function copySelectedTextToClipboard() {
  syntheticKeyboardEventsSuppressedUntil = Date.now() + 250;
  uIOhook.keyToggle(UiohookKey.Ctrl, "down");
  uIOhook.keyTap(UiohookKey.C);
  uIOhook.keyToggle(UiohookKey.Ctrl, "up");
}

async function waitForClipboardTextAfterCopy(previousText: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(50);
    const text = clipboard.readText().trim();
    if (!text) continue;
    if (text !== previousText) return text;
  }
  return "";
}

function getSelectionAskDraft(): SelectionAskDraft {
  return {
    count: selectionAskDraftCaptures.length,
    text: selectionAskDraftCaptures.map((capture) => capture.text).join("\n\n")
  };
}

function buildSelectionAskPrompt(captures: SelectionCapture[]) {
  const references = captures
    .map((capture, index) => `[引用 ${index + 1}]\n${capture.text.trim()}`)
    .join("\n\n");
  return `我想基于以下引用内容提问：\n\n${references}\n\n我的问题是：`;
}

async function submitSelectionAskDraft() {
  const captures = selectionAskDraftCaptures.filter((capture) => capture.text.trim().length >= 2);
  if (!captures.length) throw new Error("还没有加入要提问的划词内容。");
  selectionAskDraftCaptures = [];
  selectionPopoverWindow?.close();
  const settings = await store.getSettings();
  await createCodexSession([], {
    initialPrompt: "",
    sandbox: normalizeCodexSandbox(settings.codexDefaultSandbox),
    approval: normalizeCodexApproval(settings.codexDefaultApproval)
  }, true, true, buildSelectionAskPrompt(captures));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else mainWindow.show();
}

function showPrimaryInstanceWindow() {
  const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : workspaceWindow;
  if (!target || target.isDestroyed()) return;
  if (!target.isVisible()) target.show();
  if (target.isMinimized()) target.restore();
  target.moveTop();
  target.focus();
  if (target === mainWindow) setPetWindowExpanded(true);
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

function resolveAiConfig(settings: AppSettings, apiKeyOverride?: string) {
  const providerName = settings.aiProviderName || getAiProviderLabel(settings.aiProvider);
  return {
    apiKey: apiKeyOverride?.trim() || settings.aiApiKey || getAiProviderEnvKey(settings.aiProvider),
    baseURL: settings.aiBaseUrl,
    model: settings.aiModel || settings.openAiModel,
    providerName
  };
}

function getAiProviderEnvKey(provider: AppSettings["aiProvider"]) {
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  return process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
}

function getAiProviderLabel(provider: AppSettings["aiProvider"]) {
  if (provider === "openai") return "OpenAI";
  if (provider === "custom") return "自定义提供商";
  return "DeepSeek";
}

function createTodo(candidate: {
  title: string;
  notes?: string | null;
  project?: string | null;
  tags?: string[];
  priority?: TodoItem["priority"];
  dueAt?: string | null;
  remindAt?: string | null;
  repeatRule?: string | null;
  subtasks?: TodoItem["subtasks"];
  attachments?: string[];
  confidence?: number;
}, sourceMessage: string): TodoItem {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: candidate.title.trim().slice(0, 120),
    notes: candidate.notes ?? undefined,
    project: normalizeOptionalText(candidate.project),
    tags: normalizeTextArray(candidate.tags, 8),
    priority: candidate.priority ?? "medium",
    sourceMessage,
    status: "open",
    createdAt: now,
    dueAt: normalizeMaybeIso(candidate.dueAt),
    remindAt: normalizeMaybeIso(candidate.remindAt),
    repeatRule: normalizeOptionalText(candidate.repeatRule),
    subtasks: normalizeSubtasksForTodo(candidate.subtasks),
    attachments: normalizeTextArray(candidate.attachments, 6),
    confidence: candidate.confidence,
    confirmedAt: now
  };
}

function createReminder(todo: TodoItem, message?: string): ReminderItem | null {
  if (todo.status !== "open") return null;
  if (!todo.remindAt) return null;
  return {
    id: randomUUID(),
    todoId: todo.id,
    title: todo.title,
    message: message ?? `该处理：${todo.title}`,
    remindAt: todo.remindAt
  };
}

async function saveTodoCandidates(candidates: TodoCandidate[], sourceMessage: string, autoSaved: boolean) {
  const todos: TodoItem[] = [];
  const reminders: ReminderItem[] = [];
  for (const candidate of candidates) {
    if (!candidate.title?.trim() || candidate.confidence < 0.45) continue;
    const todo = createTodo(candidate, sourceMessage);
    await store.addTodo(todo, autoSaved);
    todos.push(todo);
    const reminder = createReminder(todo);
    if (reminder) {
      await store.addReminder(reminder);
      reminders.push(reminder);
    }
  }
  if (todos.length || reminders.length) await refreshReminderTimers();
  return { todos, reminders };
}

function buildTaskDraftProposal(modelResult: Awaited<ReturnType<typeof askPetAssistant>>, sourceMessage: string) {
  if (modelResult.planProposal?.items.length) {
    return {
      ...modelResult.planProposal,
      sourceMessage: modelResult.planProposal.sourceMessage || sourceMessage,
      needsConfirmation: true
    };
  }
  if (!modelResult.todoCandidates.length) return null;
  return {
    summary: modelResult.todoCandidates.length === 1 ? "待办草案" : `待办草案（${modelResult.todoCandidates.length} 项）`,
    sourceMessage,
    needsConfirmation: true,
    items: modelResult.todoCandidates
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTextArray(value: string[] | undefined, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function normalizeSubtasksForTodo(value: TodoItem["subtasks"]) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const title = item.title?.trim();
      if (!title) return null;
      return {
        id: item.id || randomUUID(),
        title: title.slice(0, 120),
        done: item.done === true
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12);
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

function normalizeCodexSandbox(value: unknown): CodexSandboxPolicy {
  if (value === "read-only" || value === "danger-full-access") return value;
  return "workspace-write";
}

function normalizeCodexApproval(value: unknown): CodexApprovalPolicy {
  return value === "never" ? "never" : "on-request";
}

function normalizeCodexExecutable(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || "codex";
}

function prepareCodexSpawnCommand(executableSetting: string, args: string[]) {
  const commandParts = splitCommandLine(normalizeCodexExecutable(executableSetting));
  const executable = resolveExecutablePath(commandParts[0] || "codex");
  const allArgs = [...commandParts.slice(1), ...args];
  return { executable, args: allArgs };
}

function splitCommandLine(value: string) {
  const matches = value.match(/"([^"]+)"|'([^']+)'|[^\s]+/g) ?? [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}

function resolveExecutablePath(command: string) {
  if (command.includes("\\") || command.includes("/") || isAbsolute(command)) {
    return resolveExecutableCandidate(command) ?? command;
  }
  const searchPaths = getExecutableSearchPaths();
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  for (const directory of searchPaths) {
    const found = resolveExecutableCandidate(join(directory, command), extensions);
    if (found) return found;
  }
  return command;
}

function resolveExecutableCandidate(candidate: string, extensions?: string[]) {
  const candidates = extname(candidate)
    ? [candidate]
    : (extensions ?? ["", ".cmd", ".exe", ".bat", ".ps1"]).map((extension) => `${candidate}${extension}`);
  return candidates.find((item) => existsSync(item));
}

function getExecutableSearchPaths() {
  const paths = (process.env.PATH || "").split(delimiter).filter(Boolean);
  if (process.platform === "win32" && process.env.APPDATA) {
    paths.unshift(join(process.env.APPDATA, "npm"));
  }
  return Array.from(new Set(paths));
}

function sanitizeCodexDropItem(item: CodexDropItem): CodexDropItem | null {
  if (!item || typeof item.path !== "string") return null;
  const itemPath = item.path.trim();
  if (!itemPath) return null;
  return {
    path: itemPath,
    name: basename(itemPath),
    kind: item.kind === "directory" || item.kind === "file" ? item.kind : "unknown"
  };
}

async function createCodexSession(items: CodexDropItem[], options: CodexCreateSessionOptions, openWindow = true, allowEmpty = false, draftPrompt = ""): Promise<CodexSessionInfo> {
  const normalizedItems = items.map(sanitizeCodexDropItem).filter((item): item is CodexDropItem => Boolean(item));
  if (!normalizedItems.length && !allowEmpty) throw new Error("请先拖入至少一个文件或文件夹。");
  const sessionId = randomUUID();
  const rootPath = join(tmpdir(), "linnea-codex", sessionId);
  const workspacePath = join(rootPath, "workspace");
  await mkdir(workspacePath, { recursive: true });
  const usedNames = new Set<string>();
  const copiedItems: CodexCopiedItem[] = [];

  for (const item of normalizedItems) {
    const sourceStat = await stat(item.path).catch(() => null);
    if (!sourceStat) throw new Error(`找不到拖入项：${item.path}`);
    const kind = sourceStat.isDirectory() ? "directory" : sourceStat.isFile() ? "file" : "unknown";
    if (kind === "unknown") throw new Error(`暂不支持该类型：${item.path}`);
    const copiedName = getUniqueWorkspaceName(item.name || basename(item.path), usedNames);
    const copiedPath = join(workspacePath, copiedName);
    await cp(item.path, copiedPath, { recursive: kind === "directory", force: false, errorOnExist: true });
    copiedItems.push({
      ...item,
      kind,
      copiedName,
      copiedPath
    });
  }

  const session: CodexRuntimeSession = {
    id: sessionId,
    rootPath,
    workspacePath,
    copiedItems,
    saved: false,
    createdAt: new Date().toISOString()
  };
  codexSessions.set(sessionId, session);
  if (openWindow) await openCodexWindow(session.id, options, draftPrompt);
  return publicCodexSessionInfo(session);
}

async function createCodexSessionFromFolder(sender: WebContents, options: CodexCreateSessionOptions): Promise<CodexSessionInfo | null> {
  const owner = BrowserWindow.fromWebContents(sender) ?? workspaceWindow ?? mainWindow;
  const dialogOptions: OpenDialogOptions = {
    title: "选择要交给 Codex 的文件夹",
    properties: ["openDirectory"]
  };
  const result = owner ? await dialog.showOpenDialog(owner, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  const folder = result.filePaths[0];
  if (result.canceled || !folder) return null;
  const session = await createCodexSession([{ path: folder, name: basename(folder), kind: "directory" }], options, false);
  return saveCodexSession(session.id);
}

function getSavedCodexSessionsRoot() {
  return join(app.getPath("userData"), "codex-sessions");
}

async function listSavedCodexSessions(): Promise<CodexSavedSession[]> {
  const root = getSavedCodexSessionsRoot();
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions: CodexSavedSession[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rootPath = join(root, entry.name);
    const metadata = await readCodexSavedMetadata(rootPath);
    sessions.push(metadata ?? {
      id: entry.name,
      name: entry.name,
      rootPath,
      workspacePath: join(rootPath, "workspace"),
      copiedItems: [],
      createdAt: entry.name.slice(0, 24)
    });
  }
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function readCodexSavedMetadata(rootPath: string): Promise<CodexSavedSession | null> {
  try {
    const raw = await readFile(join(rootPath, "linnea-codex-session.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<CodexSavedSession>;
    if (!parsed.id || !parsed.workspacePath) return null;
    return {
      id: parsed.id,
      name: parsed.name || parsed.id,
      rootPath,
      workspacePath: parsed.workspacePath,
      copiedItems: parsed.copiedItems ?? [],
      createdAt: parsed.createdAt || new Date().toISOString(),
      activeThreadId: parsed.activeThreadId,
      history: sanitizeCodexSessionHistory(parsed.history),
      threads: sanitizeCodexThreadHistories(parsed.threads)
    };
  } catch {
    return null;
  }
}

function sanitizeCodexSessionHistory(value: unknown): CodexSessionHistory | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<CodexSessionHistory>;
  return {
    messages: Array.isArray(input.messages)
      ? input.messages
          .filter((item) => item && typeof item.id === "string" && typeof item.text === "string")
          .map((item) => ({
            id: item.id,
            role: item.role === "user" || item.role === "assistant" || item.role === "system" ? item.role : "system",
            text: item.role === "user" ? stripCodexPlanModeInstruction(item.text) : item.text
          }))
      : [],
    activity: Array.isArray(input.activity)
      ? input.activity
          .filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.text === "string")
          .map((item) => ({
            id: item.id,
            type: typeof item.type === "string" ? item.type : "raw",
            title: item.title,
            text: item.text,
            status: typeof item.status === "string" ? item.status : undefined
          }))
      : []
    ,
    settings: sanitizeCodexThreadSettings(input.settings)
  };
}

function sanitizeCodexThreadSettings(value: unknown): CodexThreadSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<CodexThreadSettings>;
  const settings: CodexThreadSettings = {};
  if (typeof input.model === "string" && input.model.trim()) settings.model = input.model.trim();
  const effort = normalizeCodexReasoningEffort(input.reasoningEffort);
  if (effort !== undefined) settings.reasoningEffort = effort;
  const mode = normalizeCodexThreadMode(input.mode);
  if (mode) settings.mode = mode;
  return Object.keys(settings).length ? settings : undefined;
}

function normalizeCodexReasoningEffort(value: unknown): CodexReasoningEffort | null | undefined {
  if (value === null) return null;
  if (value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
  return undefined;
}

function normalizeCodexThreadMode(value: unknown): CodexThreadMode | undefined {
  if (value === "plan") return "plan";
  if (value === "default") return "default";
  return undefined;
}

function sanitizeCodexThreadHistories(value: unknown): Record<string, CodexSessionHistory> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, CodexSessionHistory> = {};
  for (const [threadId, history] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = sanitizeCodexSessionHistory(history);
    if (threadId && sanitized) result[threadId] = sanitized;
  }
  return result;
}

async function openSavedCodexSession(savedSessionId: string, options: CodexCreateSessionOptions): Promise<CodexSessionInfo> {
  const saved = (await listSavedCodexSessions()).find((item) => item.id === savedSessionId);
  if (!saved) throw new Error("Saved Codex session not found");
  const existing = Array.from(codexSessions.values()).find((session) => session.savedPath === saved.rootPath || session.rootPath === saved.rootPath);
  if (existing) {
    existing.startOptions = {
      initialPrompt: "",
      sandbox: normalizeCodexSandbox(options.sandbox),
      approval: normalizeCodexApproval(options.approval)
    };
    return publicCodexSessionInfo(existing);
  }
  const sessionId = randomUUID();
  const session: CodexRuntimeSession = {
    id: sessionId,
    rootPath: saved.rootPath,
    workspacePath: saved.workspacePath,
    saved: true,
    savedPath: saved.rootPath,
    copiedItems: saved.copiedItems,
    createdAt: saved.createdAt,
    activeThreadId: saved.activeThreadId,
    threadId: saved.activeThreadId,
    history: getActiveCodexHistory(saved.activeThreadId, saved.threads, saved.history),
    threads: saved.threads
  };
  codexSessions.set(sessionId, session);
  return publicCodexSessionInfo(session);
}

function getUniqueWorkspaceName(name: string, usedNames: Set<string>) {
  const fallback = "item";
  const parsed = basename(name || fallback);
  const extension = extname(parsed);
  const stem = extension ? parsed.slice(0, -extension.length) : parsed;
  let candidate = parsed || fallback;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = extension ? `${stem}-${index}${extension}` : `${stem}-${index}`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function publicCodexSessionInfo(session: CodexRuntimeSession): CodexSessionInfo {
  return {
    id: session.id,
    workspacePath: session.workspacePath,
    saved: session.saved,
    savedPath: session.savedPath,
    copiedItems: session.copiedItems,
    createdAt: session.createdAt,
    activeThreadId: session.threadId ?? session.activeThreadId,
    history: getActiveCodexHistory(session.threadId ?? session.activeThreadId, session.threads, session.history),
    threads: session.threads
  };
}

function getActiveCodexHistory(threadId?: string, threads?: Record<string, CodexSessionHistory>, fallback?: CodexSessionHistory) {
  return threadId && threads?.[threadId] ? threads[threadId] : fallback;
}

async function openCodexWindow(sessionId: string, options: CodexCreateSessionOptions, draftPrompt = "") {
  const session = codexSessions.get(sessionId);
  if (!session) throw new Error("Codex session not found");
  let closeConfirmed = false;
  let discardOnClose = false;
  const codexWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 720,
    minHeight: 460,
    show: false,
    title: "Linnea Codex",
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
  codexWindow.setMenuBarVisibility(false);
  codexWindow.once("ready-to-show", () => {
    codexWindow.show();
    codexWindow.focus();
  });
  codexWindow.on("close", (event) => {
    if (closeConfirmed || session.saved) return;
    event.preventDefault();
    void dialog.showMessageBox(codexWindow, {
      type: "question",
      title: "关闭 Codex 会话",
      message: "这个 Codex 会话还没有保存",
      detail: "关闭后可以保存到 Linnea 会话目录，或丢弃临时副本。",
      buttons: ["保存并关闭", "丢弃", "取消"],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    }).then(async (result) => {
      if (result.response === 2 || codexWindow.isDestroyed()) return;
      if (result.response === 0) await saveCodexSession(session.id);
      else discardOnClose = true;
      closeConfirmed = true;
      codexWindow.close();
    });
  });
  codexWindow.on("closed", () => {
    void cleanupClosedCodexWindowSession(session, discardOnClose);
    codexSessions.delete(session.id);
  });
  await codexWindow.loadURL(
    getRendererUrl("codex") +
      `&id=${encodeURIComponent(sessionId)}` +
      `&prompt=${encodeURIComponent(options.initialPrompt ?? "")}` +
      `&draft=${encodeURIComponent(draftPrompt)}` +
      `&sandbox=${encodeURIComponent(options.sandbox)}` +
      `&approval=${encodeURIComponent(options.approval)}`
  );
}

async function startCodexSession(sessionId: string, options: CodexStartOptions) {
  const session = codexSessions.get(sessionId);
  if (!session) throw new Error("Codex session not found");
  if (session.appSocket && session.threadId) return;
  session.startOptions = options;
  await ensureCodexAppSession(session);
  const prompt = (options.initialPrompt ?? "").trim();
  if (prompt) await sendCodexInput(session, prompt);
}

async function cleanupClosedCodexWindowSession(session: CodexRuntimeSession, discardOnClose: boolean) {
  if (discardOnClose) {
    await stopCodexRuntimeSession(session).catch(() => undefined);
  } else {
    if (session.appSocket) {
      session.appSocket.close();
      session.appSocket = undefined;
    }
    if (session.appServer) {
      session.appServer.kill();
      session.appServer = undefined;
    }
    session.appReady = undefined;
    session.threadId = undefined;
  }
  if (discardOnClose || !session.saved || session.savedPath !== session.rootPath) {
    await rm(session.rootPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function ensureCodexAppSession(session: CodexRuntimeSession) {
  if (session.appReady) return session.appReady;
  session.requestSeq = 1;
  session.pendingRequests = new Map();
  session.appReady = new Promise<void>((resolve, reject) => {
    const command = prepareCodexAppServerSpawnCommand();
    let settled = false;
    const child = spawnChild(command.executable, command.args, {
      cwd: session.workspacePath,
      env: process.env as NodeJS.ProcessEnv
    });
    session.appServer = child;
    let stderr = "";
    let connectionStarted = false;
    broadcastCodexEvent(session.id, "status", { status: "startingAppServer", command });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      broadcastCodexEvent(session.id, "raw", { stream: "stderr", text });
      const match = stripAnsi(stderr).match(/listening on:\s*(ws:\/\/[^\s]+)/);
      if (match && !connectionStarted) {
        connectionStarted = true;
        connectCodexAppSocket(session, match[1]).then(() => {
          settled = true;
          resolve();
        }, (error) => {
          settled = true;
          reject(error);
        });
      }
    });
    child.stdout.on("data", (chunk) => {
      broadcastCodexEvent(session.id, "raw", { stream: "stdout", text: chunk.toString() });
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      session.appServer = undefined;
      session.appSocket = undefined;
      broadcastCodexEvent(session.id, "status", { status: "exited", code, signal });
      if (!settled && !session.threadId) {
        settled = true;
        reject(new Error(`Codex app-server exited before initialization (${code ?? signal ?? "unknown"}). ${stderr}`.trim()));
      }
    });
  });
  return session.appReady;
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function prepareCodexAppServerSpawnCommand() {
  const cliJs = join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  if (process.platform === "win32" && existsSync(cliJs)) {
    return {
      executable: resolveExecutablePath("node"),
      args: [cliJs, "app-server", "--listen", "ws://127.0.0.1:0"]
    };
  }
  const command = prepareCodexSpawnCommand("codex", ["app-server", "--listen", "ws://127.0.0.1:0"]);
  return command;
}

function connectCodexAppSocket(session: CodexRuntimeSession, url: string) {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url);
    session.appSocket = ws;
    ws.on("open", async () => {
      try {
        broadcastCodexEvent(session.id, "status", { status: "connected", url });
        await codexRequest(session, "initialize", {
          clientInfo: { name: "Linnea", version: app.getVersion() },
          capabilities: null
        });
        codexNotify(session, "initialized");
        const existingThreadId = session.activeThreadId ?? session.threadId;
        const hasExistingHistory = existingThreadId && !isEmptyCodexHistory(session.threads?.[existingThreadId] ?? session.history);
        let startResult: { thread?: { id?: string } };
        if (hasExistingHistory) {
          try {
            startResult = await codexRequest(session, "thread/resume", {
              threadId: existingThreadId,
              cwd: session.workspacePath,
              approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
              sandbox: normalizeCodexSandbox(session.startOptions?.sandbox),
              excludeTurns: true
            }) as { thread?: { id?: string } };
          } catch {
            startResult = await codexRequest(session, "thread/start", {
              cwd: session.workspacePath,
              approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
              sandbox: normalizeCodexSandbox(session.startOptions?.sandbox),
              sessionStartSource: "startup"
            }) as { thread?: { id?: string } };
          }
        } else {
          startResult = await codexRequest(session, "thread/start", {
            cwd: session.workspacePath,
            approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
            sandbox: normalizeCodexSandbox(session.startOptions?.sandbox),
            sessionStartSource: "startup"
          }) as { thread?: { id?: string } };
        }
        const newThreadId = startResult.thread?.id;
        if (!newThreadId) throw new Error("Codex did not return a thread id");
        session.threads = session.threads ?? {};
        if (existingThreadId && existingThreadId !== newThreadId && session.threads[existingThreadId]) {
          session.threads[newThreadId] = session.threads[newThreadId] ?? session.threads[existingThreadId];
          delete session.threads[existingThreadId];
        }
        session.threadId = newThreadId;
        session.activeThreadId = session.threadId;
        session.threads[session.threadId] = session.threads[session.threadId] ?? { messages: [], activity: [] };
        session.history = session.threads[session.threadId];
        applyCodexThreadResponseSettings(session.history, startResult);
        broadcastCodexEvent(session.id, "thread", { ...startResult, threadId: session.threadId });
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Codex app-server initialization failed"));
      }
    });
    ws.on("message", (data) => handleCodexAppMessage(session, data.toString()));
    ws.on("error", (error) => {
      broadcastCodexEvent(session.id, "error", { message: error.message });
      reject(error);
    });
    ws.on("close", () => {
      session.appSocket = undefined;
      broadcastCodexEvent(session.id, "status", { status: "socketClosed" });
    });
  });
}

function handleCodexAppMessage(session: CodexRuntimeSession, text: string) {
  let message: any;
  try {
    message = JSON.parse(text);
  } catch {
    broadcastCodexEvent(session.id, "raw", { text });
    return;
  }
  if ("id" in message && ("result" in message || "error" in message)) {
    const pending = session.pendingRequests?.get(message.id);
    if (pending) {
      session.pendingRequests?.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "Codex request failed"));
      else pending.resolve(message.result);
    }
    return;
  }
  if (message.id && message.method) {
    broadcastCodexEvent(session.id, "request", message);
    return;
  }
  if (message.method) {
    const kind = getCodexEventKind(message.method);
    captureCodexEventInSessionHistory(session, message);
    broadcastCodexEvent(session.id, kind, message);
  }
}

function captureCodexEventInSessionHistory(session: CodexRuntimeSession, message: any) {
  const threadId = message.params?.threadId;
  if (!threadId || typeof threadId !== "string") return;
  session.threads = session.threads ?? {};
  const history = session.threads[threadId] ?? { messages: [], activity: [] };
  session.threads[threadId] = history;
  const method = message.method;
  if (method === "item/started" || method === "item/completed") {
    const item = message.params?.item;
    if (!item?.id) return;
    if (item.type === "userMessage") {
      const text = stripCodexPlanModeInstruction((item.content ?? []).map((part: any) => part.text).filter(Boolean).join("\n"));
      upsertCodexHistoryMessage(history, item.id, "user", text);
    } else if (item.type === "agentMessage") {
      upsertCodexHistoryMessage(history, item.id, "assistant", item.text ?? "");
    } else if (item.type === "commandExecution") {
      upsertCodexHistoryActivity(history, item.id, "command", `命令：${item.command ?? ""}`, item.aggregatedOutput ?? "", item.status);
    } else if (item.type === "fileChange") {
      upsertCodexHistoryActivity(history, item.id, "file", "文件变更", JSON.stringify(item.changes ?? [], null, 2), item.status);
    } else if (item.type === "plan") {
      upsertCodexHistoryActivity(history, item.id, "plan", "计划", item.text ?? "", method === "item/completed" ? "完成" : "更新中");
    } else if (item.type === "reasoning") {
      upsertCodexHistoryActivity(history, item.id, "reasoning", "推理过程", [...(item.summary ?? []), ...(item.content ?? [])].join("\n"), method === "item/completed" ? "完成" : "思考中");
    }
  } else if (method === "item/agentMessage/delta") {
    appendCodexHistoryMessage(history, message.params.itemId, "assistant", message.params.delta ?? "");
  } else if (method === "item/commandExecution/outputDelta" || method === "command/exec/outputDelta") {
    appendCodexHistoryActivity(history, message.params.itemId ?? message.params.commandId ?? randomUUID(), "command", "命令输出", message.params.delta ?? "");
  } else if (method === "item/fileChange/patchUpdated") {
    upsertCodexHistoryActivity(history, message.params.itemId, "file", "文件变更", JSON.stringify(message.params.changes ?? [], null, 2), "待确认");
  }
  if (threadId === session.threadId) session.history = history;
  if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
}

function upsertCodexHistoryMessage(history: CodexSessionHistory, id: string, role: "user" | "assistant" | "system", text: string) {
  const index = history.messages.findIndex((item) => item.id === id);
  if (index >= 0) history.messages[index] = { ...history.messages[index], role, text };
  else history.messages.push({ id, role, text });
}

function appendCodexHistoryMessage(history: CodexSessionHistory, id: string, role: "user" | "assistant" | "system", delta: string) {
  const existing = history.messages.find((item) => item.id === id);
  if (existing) existing.text += delta;
  else history.messages.push({ id, role, text: delta });
}

function upsertCodexHistoryActivity(history: CodexSessionHistory, id: string, type: string, title: string, text: string, status?: string) {
  const index = history.activity.findIndex((item) => item.id === id);
  if (index >= 0) history.activity[index] = { ...history.activity[index], type, title, text, status };
  else history.activity.push({ id, type, title, text, status });
}

function appendCodexHistoryActivity(history: CodexSessionHistory, id: string, type: string, title: string, delta: string) {
  const existing = history.activity.find((item) => item.id === id);
  if (existing) existing.text += delta;
  else history.activity.push({ id, type, title, text: delta, status: "运行中" });
}

function getCodexEventKind(method: string): "status" | "thread" | "item" | "delta" | "requestResolved" | "error" | "raw" {
  if (method === "error") return "error";
  if (method.startsWith("thread/") || method.startsWith("turn/")) return "thread";
  if (method.includes("/delta") || method.includes("outputDelta") || method.includes("patchUpdated")) return "delta";
  if (method === "serverRequest/resolved") return "requestResolved";
  if (method.startsWith("item/") || method.startsWith("rawResponseItem/")) return "item";
  return "raw";
}

function codexRequest(session: CodexRuntimeSession, method: string, params: unknown) {
  if (!session.appSocket || session.appSocket.readyState !== WebSocket.OPEN) throw new Error("Codex app-server is not connected");
  const id = session.requestSeq ?? 1;
  session.requestSeq = id + 1;
  const payload = { id, method, params };
  session.appSocket.send(JSON.stringify(payload));
  return new Promise<unknown>((resolve, reject) => {
    session.pendingRequests?.set(id, { resolve, reject });
    setTimeout(() => {
      if (!session.pendingRequests?.has(id)) return;
      session.pendingRequests.delete(id);
      reject(new Error(`Codex request timed out: ${method}`));
    }, 30_000);
  });
}

function codexNotify(session: CodexRuntimeSession, method: string, params?: unknown) {
  if (!session.appSocket || session.appSocket.readyState !== WebSocket.OPEN) throw new Error("Codex app-server is not connected");
  session.appSocket.send(JSON.stringify(params === undefined ? { method } : { method, params }));
}

async function sendCodexInput(session: CodexRuntimeSession, text: string) {
  await ensureCodexAppSession(session);
  if (!session.threadId) throw new Error("Codex thread is not ready");
  const sandbox = normalizeCodexSandbox(session.startOptions?.sandbox);
  const threadSettings = getActiveCodexThreadSettings(session);
  const turnText = threadSettings.mode === "plan" ? withCodexPlanModeInstruction(text) : text;
  const params = {
    threadId: session.threadId,
    input: [{ type: "text", text: turnText, text_elements: [] }],
    cwd: session.workspacePath,
    approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
    sandboxPolicy: toCodexSandboxPolicy(sandbox, session.workspacePath),
    model: threadSettings.model || undefined,
    effort: threadSettings.reasoningEffort ?? undefined
  };
  try {
    await codexRequest(session, "turn/start", params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("thread not found")) throw error;
    const missingThreadId = session.threadId;
    await codexRequest(session, "thread/resume", {
      threadId: missingThreadId,
      cwd: session.workspacePath,
      approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
      sandbox: normalizeCodexSandbox(session.startOptions?.sandbox),
      excludeTurns: true
    });
    await codexRequest(session, "turn/start", params);
  }
}

function getActiveCodexThreadSettings(session: CodexRuntimeSession): CodexThreadSettings {
  const history = getActiveCodexHistory(session.threadId ?? session.activeThreadId, session.threads, session.history);
  return history?.settings ?? {};
}

function withCodexPlanModeInstruction(text: string) {
  return [
    "Plan mode is enabled for this thread. First produce a concise implementation plan and do not modify files or run mutating commands unless the user explicitly asks you to proceed.",
    "",
    text
  ].join("\n");
}

function stripCodexPlanModeInstruction(text: string) {
  const prefix = "Plan mode is enabled for this thread. First produce a concise implementation plan and do not modify files or run mutating commands unless the user explicitly asks you to proceed.\n\n";
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

function toCodexSandboxPolicy(sandbox: CodexSandboxPolicy, workspacePath: string) {
  if (sandbox === "danger-full-access") return { type: "dangerFullAccess" };
  if (sandbox === "read-only") return { type: "readOnly", networkAccess: true };
  return {
    type: "workspaceWrite",
    writableRoots: [workspacePath],
    networkAccess: true,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  };
}

function respondCodexRequest(sessionId: string, requestId: number | string, response: unknown) {
  const session = getCodexSession(sessionId);
  if (!session.appSocket || session.appSocket.readyState !== WebSocket.OPEN) throw new Error("Codex app-server is not connected");
  session.appSocket.send(JSON.stringify({ id: requestId, result: response }));
}

async function listCodexModels(sessionId: string) {
  const session = getCodexSession(sessionId);
  await ensureCodexAppSession(session);
  const result = await codexRequest(session, "model/list", { includeHidden: true });
  const models = Array.isArray((result as any)?.models) ? (result as any).models : Array.isArray(result) ? result : [];
  return models.map((model: any) => ({
    id: String(model.id ?? model.slug ?? model.name ?? ""),
    displayName: typeof model.displayName === "string" ? model.displayName : typeof model.name === "string" ? model.name : undefined,
    hidden: Boolean(model.hidden),
    isDefault: Boolean(model.isDefault),
    defaultReasoningEffort: typeof model.defaultReasoningEffort === "string" ? model.defaultReasoningEffort : null,
    supportedReasoningEfforts: Array.isArray(model.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts
          .map((item: any) => ({
            reasoningEffort: normalizeCodexReasoningEffort(item?.reasoningEffort),
            description: typeof item?.description === "string" ? item.description : undefined
          }))
          .filter((item: { reasoningEffort: CodexReasoningEffort | null | undefined }) => item.reasoningEffort && item.reasoningEffort !== null)
      : undefined,
    inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities.map(String) : undefined,
    supportsPersonality: typeof model.supportsPersonality === "boolean" ? model.supportsPersonality : undefined
  })).filter((model: { id: string }) => model.id);
}

function setCodexThreadSettings(sessionId: string, patch: Partial<CodexThreadSettings>): CodexSessionInfo {
  const session = getCodexSession(sessionId);
  const threadId = session.threadId ?? session.activeThreadId;
  if (!threadId) throw new Error("Codex thread is not ready");
  session.threads = session.threads ?? {};
  const history = session.threads[threadId] ?? session.history ?? { messages: [], activity: [] };
  session.threads[threadId] = history;
  session.history = history;
  const current = history.settings ?? {};
  const next: CodexThreadSettings = { ...current };
  if ("model" in patch) {
    const model = typeof patch.model === "string" ? patch.model.trim() : "";
    if (model) next.model = model;
    else delete next.model;
  }
  if ("reasoningEffort" in patch) {
    const effort = normalizeCodexReasoningEffort(patch.reasoningEffort);
    if (effort === undefined || effort === null) delete next.reasoningEffort;
    else next.reasoningEffort = effort;
  }
  if ("mode" in patch) {
    const mode = normalizeCodexThreadMode(patch.mode);
    if (mode && mode !== "default") next.mode = mode;
    else delete next.mode;
  }
  history.settings = Object.keys(next).length ? next : undefined;
  if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
  broadcastCodexEvent(session.id, "thread", { type: "threadSettings", threadId, settings: history.settings ?? {} });
  return publicCodexSessionInfo(session);
}

async function listCodexThreads(sessionId: string) {
  const session = getCodexSession(sessionId);
  await ensureCodexAppSession(session);
  pruneEmptyInactiveCodexThreads(session);
  const now = Math.floor(Date.now() / 1000);
  const merged = new Map<string, any>();
  for (const [threadId, history] of Object.entries(session.threads ?? {})) {
    if (isEmptyCodexHistory(history)) continue;
    const firstMessage = history.messages.find((message) => message.text.trim());
    merged.set(threadId, {
      id: threadId,
      preview: firstMessage?.text.slice(0, 120) || "空 Thread",
      name: threadId === session.threadId ? "当前 Thread" : null,
      path: null,
      cwd: session.workspacePath,
      source: "linnea",
      status: threadId === session.threadId ? "active" : "saved",
      createdAt: now,
      updatedAt: now
    });
  }
  const result = await codexRequest(session, "thread/list", {
    limit: 50,
    cwd: session.workspacePath,
    archived: false
  }).catch(() => null);
  const threads = Array.isArray((result as any)?.data) ? (result as any).data : [];
  for (const thread of threads) {
    const id = String(thread.id ?? "");
    if (!id) continue;
    const preview = String(thread.preview ?? "");
    const name = typeof thread.name === "string" ? thread.name : null;
    if (!preview.trim() && isEmptyCodexHistory(session.threads?.[id])) continue;
    if (id === session.threadId && isEmptyCodexHistory(session.threads?.[id])) continue;
    merged.set(id, {
      id,
      preview,
      name,
      path: typeof thread.path === "string" ? thread.path : null,
      cwd: String(thread.cwd ?? ""),
      source: typeof thread.source === "string" ? thread.source : JSON.stringify(thread.source ?? "unknown"),
      status: typeof thread.status === "string" ? thread.status : JSON.stringify(thread.status ?? "unknown"),
      createdAt: Number(thread.createdAt ?? now),
      updatedAt: Number(thread.updatedAt ?? now)
    });
  }
  return Array.from(merged.values()).sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
}

async function resumeCodexThread(sessionId: string, threadId: string): Promise<CodexSessionInfo> {
  const session = getCodexSession(sessionId);
  await ensureCodexAppSession(session);
  pruneEmptyInactiveCodexThreads(session, threadId);
  if (session.threadId === threadId) {
    session.threadId = threadId;
    session.activeThreadId = threadId;
    session.history = getActiveCodexHistory(threadId, session.threads, session.history);
    if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
    return publicCodexSessionInfo(session);
  }
  let result: unknown;
  const targetSettings = session.threads?.[threadId]?.settings ?? {};
  try {
    result = await codexRequest(session, "thread/resume", {
      threadId,
      model: targetSettings.model || undefined,
      cwd: session.workspacePath,
      approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
      sandbox: normalizeCodexSandbox(session.startOptions?.sandbox),
      excludeTurns: false
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法恢复 Thread ${threadId}。它可能还没有被 Codex 持久化，或已不在当前 app-server 中。\n${detail}`);
  }
  const thread = (result as any)?.thread ?? result;
  if (!thread?.id) throw new Error("Codex did not return a resumed thread");
  session.threadId = String(thread.id);
  session.activeThreadId = session.threadId;
  session.threads = session.threads ?? {};
  const resumedHistory = codexHistoryFromThread(thread);
  session.threads[session.threadId] = resumedHistory.messages.length || resumedHistory.activity.length
    ? resumedHistory
    : session.threads[session.threadId] ?? { messages: [], activity: [] };
  session.history = session.threads[session.threadId];
  applyCodexThreadResponseSettings(session.history, result);
  if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
  broadcastCodexEvent(session.id, "thread", { thread, threadId: session.threadId });
  return publicCodexSessionInfo(session);
}

async function newCodexThread(sessionId: string): Promise<CodexSessionInfo> {
  const session = getCodexSession(sessionId);
  await ensureCodexAppSession(session);
  const currentThreadId = session.threadId ?? session.activeThreadId;
  if (currentThreadId && isEmptyCodexHistory(session.threads?.[currentThreadId] ?? session.history)) {
    return publicCodexSessionInfo(session);
  }
  const startResult = await codexRequest(session, "thread/start", {
    cwd: session.workspacePath,
    approvalPolicy: normalizeCodexApproval(session.startOptions?.approval),
    sandbox: normalizeCodexSandbox(session.startOptions?.sandbox),
    sessionStartSource: "startup"
  }) as { thread?: { id?: string } };
  const threadId = startResult.thread?.id;
  if (!threadId) throw new Error("Codex did not return a thread id");
  session.threadId = threadId;
  session.activeThreadId = threadId;
  session.threads = session.threads ?? {};
  session.threads[threadId] = { messages: [], activity: [] };
  session.history = session.threads[threadId];
  applyCodexThreadResponseSettings(session.history, startResult);
  if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
  broadcastCodexEvent(session.id, "thread", { ...startResult, threadId });
  return publicCodexSessionInfo(session);
}

function pruneEmptyInactiveCodexThreads(session: CodexRuntimeSession, keepThreadId?: string) {
  const activeThreadId = keepThreadId ?? session.threadId ?? session.activeThreadId;
  if (!session.threads) return;
  for (const [threadId, history] of Object.entries(session.threads)) {
    if (threadId === activeThreadId) continue;
    if (isEmptyCodexHistory(history)) delete session.threads[threadId];
  }
  if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
}

function isEmptyCodexHistory(history?: CodexSessionHistory) {
  return !history || (history.messages.length === 0 && history.activity.length === 0);
}

function codexHistoryFromThread(thread: any): CodexSessionHistory {
  const messages: CodexSessionHistory["messages"] = [];
  const activity: CodexSessionHistory["activity"] = [];
  for (const turn of Array.isArray(thread.turns) ? thread.turns : []) {
    for (const item of Array.isArray(turn.items) ? turn.items : []) {
      if (!item?.id) continue;
      if (item.type === "userMessage") {
        const text = stripCodexPlanModeInstruction((item.content ?? []).map((part: any) => part.text).filter(Boolean).join("\n"));
        messages.push({ id: item.id, role: "user", text });
      } else if (item.type === "agentMessage") {
        messages.push({ id: item.id, role: "assistant", text: item.text ?? "" });
      } else if (item.type === "commandExecution") {
        activity.push({ id: item.id, type: "command", title: `命令：${item.command ?? ""}`, text: item.aggregatedOutput ?? "", status: item.status });
      } else if (item.type === "fileChange") {
        activity.push({ id: item.id, type: "file", title: "文件变更", text: JSON.stringify(item.changes ?? [], null, 2), status: item.status });
      } else if (item.type === "plan") {
        activity.push({ id: item.id, type: "plan", title: "计划", text: item.text ?? "", status: "完成" });
      } else if (item.type === "reasoning") {
        activity.push({ id: item.id, type: "reasoning", title: "推理过程", text: [...(item.summary ?? []), ...(item.content ?? [])].join("\n"), status: "完成" });
      }
    }
  }
  return { messages, activity };
}

function applyCodexThreadResponseSettings(history: CodexSessionHistory, response: unknown) {
  const value = response as any;
  const model = typeof value?.model === "string" ? value.model : undefined;
  const effort = normalizeCodexReasoningEffort(value?.reasoningEffort);
  if (!model && effort === undefined) return;
  history.settings = {
    ...(history.settings ?? {}),
    ...(model ? { model } : {}),
    ...(effort !== undefined && effort !== null ? { reasoningEffort: effort } : {})
  };
}

function broadcastCodexEvent(sessionId: string, kind: "status" | "thread" | "item" | "delta" | "request" | "requestResolved" | "error" | "raw", payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("codex:event", { sessionId, kind, payload });
  }
}

async function saveCodexSession(sessionId: string): Promise<CodexSessionInfo> {
  const session = codexSessions.get(sessionId);
  if (!session) throw new Error("Codex session not found");
  if (session.saved) {
    await writeCodexSavedMetadata(session);
    return publicCodexSessionInfo(session);
  }
  const sessionsRoot = join(app.getPath("userData"), "codex-sessions");
  await mkdir(sessionsRoot, { recursive: true });
  const targetPath = join(sessionsRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}-${session.id}`);
  await cp(session.rootPath, targetPath, { recursive: true, force: false, errorOnExist: true });
  const metadata: CodexSavedSession = {
    id: basename(targetPath),
    name: session.copiedItems.length === 1 ? session.copiedItems[0].copiedName : `Codex 会话 ${new Date(session.createdAt).toLocaleString()}`,
    rootPath: targetPath,
    workspacePath: join(targetPath, "workspace"),
    copiedItems: session.copiedItems.map((item) => ({
      ...item,
      copiedPath: join(targetPath, "workspace", item.copiedName)
    })),
    createdAt: session.createdAt,
    activeThreadId: session.threadId ?? session.activeThreadId,
    history: getActiveCodexHistory(session.threadId ?? session.activeThreadId, session.threads, session.history),
    threads: session.threads
  };
  await writeFile(join(targetPath, "linnea-codex-session.json"), JSON.stringify(metadata, null, 2), "utf8");
  session.saved = true;
  session.savedPath = targetPath;
  if (!session.appServer && !session.appSocket && !session.threadId) {
    const previousRoot = session.rootPath;
    session.rootPath = targetPath;
    session.workspacePath = metadata.workspacePath;
    session.copiedItems = metadata.copiedItems;
    await rm(previousRoot, { recursive: true, force: true });
  }
  return publicCodexSessionInfo(session);
}

function updateCodexSessionHistory(sessionId: string, history: CodexSessionHistory) {
  const session = getCodexSession(sessionId);
  const sanitized = sanitizeCodexSessionHistory(history);
  const threadId = session.threadId ?? session.activeThreadId;
  const existingSettings = threadId ? session.threads?.[threadId]?.settings ?? session.history?.settings : session.history?.settings;
  if (sanitized && !sanitized.settings && existingSettings) sanitized.settings = existingSettings;
  session.history = sanitized;
  if (threadId && sanitized) {
    session.activeThreadId = threadId;
    session.threads = session.threads ?? {};
    session.threads[threadId] = sanitized;
  }
  if (session.saved) void writeCodexSavedMetadata(session).catch(() => undefined);
}

async function writeCodexSavedMetadata(session: CodexRuntimeSession) {
  const rootPath = session.savedPath ?? session.rootPath;
  const workspacePath = join(rootPath, "workspace");
  const metadata: CodexSavedSession = {
    id: basename(rootPath),
    name: await getCodexSavedSessionName(rootPath, session),
    rootPath,
    workspacePath,
    copiedItems: session.copiedItems.map((item) => ({
      ...item,
      copiedPath: join(workspacePath, item.copiedName)
    })),
    createdAt: session.createdAt,
    activeThreadId: session.threadId ?? session.activeThreadId,
    history: getActiveCodexHistory(session.threadId ?? session.activeThreadId, session.threads, session.history),
    threads: session.threads
  };
  await writeFile(join(rootPath, "linnea-codex-session.json"), JSON.stringify(metadata, null, 2), "utf8");
}

async function getCodexSavedSessionName(rootPath: string, session: CodexRuntimeSession) {
  const existing = await readCodexSavedMetadata(rootPath);
  if (existing?.name) return existing.name;
  return session.copiedItems.length === 1 ? session.copiedItems[0].copiedName : `Codex 会话 ${new Date(session.createdAt).toLocaleString()}`;
}

async function renameSavedCodexSession(savedSessionId: string, name: string): Promise<CodexSavedSession> {
  const saved = (await listSavedCodexSessions()).find((item) => item.id === savedSessionId);
  if (!saved) throw new Error("Saved Codex session not found");
  const nextName = name.trim();
  if (!nextName) throw new Error("会话名称不能为空。");
  const metadata: CodexSavedSession = { ...saved, name: nextName };
  await writeFile(join(saved.rootPath, "linnea-codex-session.json"), JSON.stringify(metadata, null, 2), "utf8");
  for (const session of codexSessions.values()) {
    if (session.savedPath === saved.rootPath || session.rootPath === saved.rootPath) {
      session.history = metadata.history;
      session.threads = metadata.threads;
      session.activeThreadId = metadata.activeThreadId;
    }
  }
  return metadata;
}

async function deleteSavedCodexSession(savedSessionId: string) {
  const saved = (await listSavedCodexSessions()).find((item) => item.id === savedSessionId);
  if (!saved) return;
  for (const [sessionId, session] of codexSessions.entries()) {
    if (session.savedPath !== saved.rootPath && session.rootPath !== saved.rootPath) continue;
    await stopCodexRuntimeSession(session);
    codexSessions.delete(sessionId);
  }
  await removeCodexDirectory(saved.rootPath);
}

async function discardCodexSession(sessionId: string) {
  const session = codexSessions.get(sessionId);
  if (!session) return;
  await stopCodexRuntimeSession(session);
  await removeCodexDirectory(session.rootPath);
  codexSessions.delete(sessionId);
}

async function stopCodexRuntimeSession(session: CodexRuntimeSession) {
  if (session.appSocket) {
    const socket = session.appSocket;
    const closed = new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.once("error", () => resolve());
    });
    session.appSocket.close();
    await Promise.race([closed, delay(600)]);
    session.appSocket = undefined;
  }
  if (session.appServer) {
    const appServer = session.appServer;
    const exited = new Promise<void>((resolve) => {
      appServer.once("exit", () => resolve());
      appServer.once("close", () => resolve());
    });
    session.appServer.kill();
    await Promise.race([exited, delay(1800)]);
    session.appServer = undefined;
  }
  session.appReady = undefined;
  session.threadId = undefined;
  session.pendingRequests?.clear();
}

async function removeCodexDirectory(targetPath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
      return;
    } catch (error) {
      lastError = error;
      await delay(180 + attempt * 180);
    }
  }
  const message = lastError instanceof Error ? lastError.message : "unknown error";
  throw new Error(`删除目录失败，可能仍被 Codex 或资源管理器占用：${targetPath}\n${message}`);
}

function getCodexSession(sessionId: string) {
  const session = codexSessions.get(sessionId);
  if (!session) throw new Error("Codex session not found");
  return session;
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
  ipcMain.handle("app:beginWindowDrag", (_event) => {
    beginWindowDrag(_event.sender);
  });
  ipcMain.on("app:dragWindowToCursor", () => {
    dragWindowToCursor();
  });
  ipcMain.handle("app:endWindowDrag", () => {
    endWindowDrag();
  });
  ipcMain.handle("app:setPetWindowExpanded", (_event, expanded: boolean) => {
    setPetWindowExpanded(expanded);
  });
  ipcMain.handle("app:openWorkspaceWindow", (_event, todoId?: string) => openWorkspaceWindow(todoId));
  ipcMain.handle("app:checkForUpdates", () => checkForUpdates(true));

  ipcMain.handle("chat:listMessages", () => store.listMessages());
  ipcMain.handle("chat:clearMessages", async (_event) => {
    await store.clearMessages();
    broadcastSnapshotUpdated(_event.sender);
  });
  ipcMain.handle("chat:testApi", async (_event, apiKeyOverride?: string): Promise<{ ok: boolean; message: string }> => {
    const settings = await store.getSettings();
    const ai = resolveAiConfig(settings, apiKeyOverride);
    try {
      await testAiConnection(ai);
      return { ok: true, message: `${ai.providerName} API 连接正常，模型 ${ai.model} 可用。` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "API 测试失败。"
      };
    }
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
    const ai = resolveAiConfig(settings);
    const timeContext = getLocalTimeContext();
    const modelResult = await askPetAssistant({
      ...ai,
      text: trimmed,
      ...timeContext
    });

    const taskDraftProposal = buildTaskDraftProposal(modelResult, trimmed);
    const assistantMessage = {
      id: randomUUID(),
      role: "assistant" as const,
      text: modelResult.replyText,
      createdAt: new Date().toISOString(),
      taskDraftProposal,
      taskDraftStatus: taskDraftProposal ? "pending" as const : undefined
    };
    await store.addMessage(assistantMessage);

    broadcastSnapshotUpdated(_event.sender);

    return {
      assistantMessage,
      extractedTodos: [],
      reminders: [],
      mood: modelResult.mood,
      taskDraftProposal,
      planProposal: taskDraftProposal
    };
  });

  ipcMain.handle("todo:list", () => store.listTodos());
  ipcMain.handle("chat:updateTaskDraft", async (_event, messageId: string, patch: Partial<ConversationMessage>) => {
    const updated = await store.updateMessage(messageId, {
      taskDraftProposal: patch.taskDraftProposal,
      taskDraftStatus: patch.taskDraftStatus
    });
    broadcastSnapshotUpdated(_event.sender);
    return updated;
  });
  ipcMain.handle("todo:acceptPlanProposal", async (_event, items: TodoCandidate[], sourceMessage: string, messageId?: string) => {
    const saved = await saveTodoCandidates(items, sourceMessage, true);
    if (messageId) {
      await store.updateMessage(messageId, {
        taskDraftProposal: {
          summary: `已保存 ${saved.todos.length} 个待办`,
          sourceMessage,
          needsConfirmation: false,
          items
        },
        taskDraftStatus: "accepted"
      });
    }
    broadcastSnapshotUpdated(_event.sender);
    return saved;
  });
  ipcMain.handle("todo:update", async (_event, id: string, patch: Partial<TodoItem>) => {
    const updated = await store.updateTodo(id, patch);
    if ("title" in patch || "remindAt" in patch || "status" in patch) {
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
    if ("selectionToolsEnabled" in patch) await syncGlobalSelectionHook();
    if ("quickAiRecordShortcut" in patch) await registerQuickAiRecordShortcut();
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
    const ai = resolveAiConfig(settings);
    const timeContext = getLocalTimeContext();
    return summarizeRecentContext({
      ...ai,
      messages: await store.listMessages(),
      todos: await store.listTodos(),
      ...timeContext
    });
  });
  ipcMain.handle("selection:process", async (_event, action: SelectionTextAction, text: string, targetLanguage = "auto"): Promise<SelectionTextResult> => {
    if (action !== "summarize" && action !== "translate") throw new Error("Unsupported selection action");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Selected text is empty");
    const result: SelectionTextResult = {
      id: randomUUID(),
      action,
      title: action === "summarize" ? "Linnea 总结" : "Linnea 翻译",
      markdown: "",
      status: "pending",
      targetLanguage: action === "translate" ? targetLanguage : undefined,
      createdAt: new Date().toISOString()
    };
    selectionResults.set(result.id, result);
    selectionResultSources.set(result.id, trimmed);
    await openSelectionResultWindow(result);
    void processSelectionResultInBackground(result, trimmed, action === "translate" ? targetLanguage : undefined);
    return result;
  });
  ipcMain.handle("selection:retranslate", async (_event, id: string, targetLanguage: string): Promise<SelectionTextResult> => {
    const current = selectionResults.get(id);
    const source = selectionResultSources.get(id);
    if (!current || current.action !== "translate") throw new Error("Translation result not found");
    if (!source) throw new Error("Translation source text not found");
    const pending: SelectionTextResult = {
      ...current,
      markdown: "",
      status: "pending",
      error: undefined,
      targetLanguage,
      updatedAt: new Date().toISOString()
    };
    selectionResults.set(id, pending);
    void processSelectionResultInBackground(pending, source, targetLanguage);
    return pending;
  });
  ipcMain.handle("selection:getResult", (_event, id: string) => selectionResults.get(id) ?? null);
  ipcMain.handle("selection:getCapture", (_event, id: string) => selectionCaptures.get(id) ?? null);
  ipcMain.handle("selection:resolveCapture", (_event, id: string) => resolveSelectionCapture(id));
  ipcMain.handle("selection:openCapturePopover", async (_event, text: string, clientX: number, clientY: number) => {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (trimmed.length < 2) return;
    const senderWindow = BrowserWindow.fromWebContents(_event.sender);
    if (!senderWindow || senderWindow.isDestroyed()) return;
    const contentBounds = senderWindow.getContentBounds();
    const anchorX = Number.isFinite(clientX) ? contentBounds.x + clientX : contentBounds.x + contentBounds.width / 2;
    const anchorY = Number.isFinite(clientY) ? contentBounds.y + clientY : contentBounds.y + contentBounds.height / 2;
    const capture: SelectionCapture = {
      id: randomUUID(),
      text: trimmed.slice(0, 8000),
      createdAt: new Date().toISOString()
    };
    selectionCaptures.set(capture.id, capture);
    await openSelectionPopoverWindow(capture, anchorX, anchorY);
  });
  ipcMain.handle("selection:resizePopover", (_event, expanded: boolean) => resizeSelectionPopoverWindow(expanded));
  ipcMain.handle("selection:createTodoFromCapture", async (_event, id: string) => {
    const capture = await resolveSelectionCapture(id);
    await openWorkspaceWindow();
    workspaceWindow?.webContents.send("selection:todoText", capture.text);
    selectionPopoverWindow?.close();
  });
  ipcMain.handle("selection:addAskCapture", async (_event, id: string): Promise<SelectionAskDraft> => {
    const capture = await resolveSelectionCapture(id);
    selectionAskDraftCaptures.push(capture);
    return getSelectionAskDraft();
  });
  ipcMain.handle("selection:getAskDraft", (): SelectionAskDraft => getSelectionAskDraft());
  ipcMain.handle("selection:clearAskDraft", () => {
    selectionAskDraftCaptures = [];
  });
  ipcMain.handle("selection:submitAskDraft", () => submitSelectionAskDraft());

  ipcMain.handle("codex:createSession", (_event, items: CodexDropItem[], options: CodexCreateSessionOptions) => {
    return createCodexSession(items, {
      initialPrompt: typeof options?.initialPrompt === "string" ? options.initialPrompt : "",
      sandbox: normalizeCodexSandbox(options?.sandbox),
      approval: normalizeCodexApproval(options?.approval)
    });
  });
  ipcMain.handle("codex:createSessionFromFolder", (_event, options: CodexCreateSessionOptions) => {
    return createCodexSessionFromFolder(_event.sender, {
      initialPrompt: typeof options?.initialPrompt === "string" ? options.initialPrompt : "",
      sandbox: normalizeCodexSandbox(options?.sandbox),
      approval: normalizeCodexApproval(options?.approval)
    });
  });
  ipcMain.handle("codex:listSavedSessions", () => listSavedCodexSessions());
  ipcMain.handle("codex:openSavedSession", (_event, savedSessionId: string, options: CodexCreateSessionOptions) => {
    return openSavedCodexSession(savedSessionId, {
      initialPrompt: typeof options?.initialPrompt === "string" ? options.initialPrompt : "",
      sandbox: normalizeCodexSandbox(options?.sandbox),
      approval: normalizeCodexApproval(options?.approval)
    });
  });
  ipcMain.handle("codex:renameSavedSession", (_event, savedSessionId: string, name: string) => {
    return renameSavedCodexSession(savedSessionId, typeof name === "string" ? name : "");
  });
  ipcMain.handle("codex:deleteSavedSession", (_event, savedSessionId: string) => {
    return deleteSavedCodexSession(savedSessionId);
  });
  ipcMain.handle("codex:listModels", (_event, sessionId: string) => {
    return listCodexModels(sessionId);
  });
  ipcMain.handle("codex:listThreads", (_event, sessionId: string) => {
    return listCodexThreads(sessionId);
  });
  ipcMain.handle("codex:resumeThread", (_event, sessionId: string, threadId: string) => {
    return resumeCodexThread(sessionId, threadId);
  });
  ipcMain.handle("codex:newThread", (_event, sessionId: string) => {
    return newCodexThread(sessionId);
  });
  ipcMain.handle("codex:getSession", (_event, sessionId: string) => publicCodexSessionInfo(getCodexSession(sessionId)));
  ipcMain.handle("codex:startSession", (_event, sessionId: string, options: CodexStartOptions) => {
    return startCodexSession(sessionId, {
      initialPrompt: typeof options?.initialPrompt === "string" ? options.initialPrompt : "",
      sandbox: normalizeCodexSandbox(options?.sandbox),
      approval: normalizeCodexApproval(options?.approval)
    });
  });
  ipcMain.handle("codex:sendInput", async (_event, sessionId: string, text: string) => {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return;
    await sendCodexInput(getCodexSession(sessionId), trimmed);
  });
  ipcMain.handle("codex:setThreadSettings", (_event, sessionId: string, settings: Partial<CodexThreadSettings>) => {
    return setCodexThreadSettings(sessionId, settings ?? {});
  });
  ipcMain.handle("codex:respondRequest", (_event, sessionId: string, requestId: number | string, response: unknown) => {
    respondCodexRequest(sessionId, requestId, response);
  });
  ipcMain.handle("codex:updateSessionHistory", (_event, sessionId: string, history: CodexSessionHistory) => {
    updateCodexSessionHistory(sessionId, history);
  });
  ipcMain.handle("codex:write", (_event, sessionId: string, data: string) => {
    void sessionId;
    void data;
  });
  ipcMain.handle("codex:resize", (_event, sessionId: string, cols: number, rows: number) => {
    void sessionId;
    void cols;
    void rows;
  });
  ipcMain.handle("codex:stopSession", (_event, sessionId: string) => {
    const session = getCodexSession(sessionId);
    return stopCodexRuntimeSession(session).then(() => {
      broadcastCodexEvent(session.id, "status", { status: "stopped" });
    });
  });
  ipcMain.handle("codex:saveSession", (_event, sessionId: string) => saveCodexSession(sessionId));
  ipcMain.handle("codex:discardSession", (_event, sessionId: string) => discardCodexSession(sessionId));
  ipcMain.handle("codex:openWorkspace", async (_event, sessionId: string) => {
    const session = getCodexSession(sessionId);
    if (!existsSync(session.workspacePath)) throw new Error("工作目录不存在。");
    await shell.openPath(session.workspacePath);
  });
}

app.whenReady().then(async () => {
  ensureWindowsNotificationShortcut();
  await store.load();
  registerIpc();
  await createWindow();
  await syncGlobalSelectionHook();
  await registerQuickAiRecordShortcut();
  try {
    createTray();
  } catch {
    tray = null;
  }
  await refreshReminderTimers();
  setTimeout(() => {
    void checkForUpdates();
  }, 3000);
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

app.on("second-instance", () => {
  showPrimaryInstanceWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  unregisterGlobalSelectionHook();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
