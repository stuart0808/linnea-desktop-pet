import { BrowserWindow, screen } from "electron";
import { randomUUID } from "node:crypto";
import { spawn as spawnChild, type ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uIOhook, type UiohookKeyboardEvent, type UiohookMouseEvent } from "uiohook-napi";
import type { CodexApprovalPolicy, CodexCreateSessionOptions, CodexDropItem, CodexSandboxPolicy, SelectionAskDraft, SelectionCapture } from "../../shared/types.js";
import { state } from "./state.js";
import { JsonStore } from "./storage.js";

const store = new JsonStore();

let _openSelectionPopoverWindow: (capture: SelectionCapture, x: number, y: number) => Promise<void> = async () => {};
let _createCodexSession: (items: CodexDropItem[], options: CodexCreateSessionOptions, openWindow: boolean, allowEmpty: boolean, draftPrompt: string) => Promise<unknown> = async () => ({});

export function setOpenSelectionPopoverWindow(fn: typeof _openSelectionPopoverWindow): void {
  _openSelectionPopoverWindow = fn;
}

export function setCreateCodexSession(fn: typeof _createCodexSession): void {
  _createCodexSession = fn;
}

// PowerShell UIA helper — reads selected text from the active application without
// simulating any keyboard events. Uses UIAutomation TextPattern with ancestor
// tree-walking, then falls back to WM_COPY (a Win32 message, not a key event).
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
  "$tw = [System.Windows.Automation.TreeWalker]::RawViewWalker",
  "Write-Host 'READY'",
  "[Console]::Out.Flush()",
  "while ($true) {",
  "    $line = [Console]::In.ReadLine()",
  "    if ($null -eq $line) { break }",
  "    if ($line.Trim() -eq 'GET') {",
  "        $result = 'EMPTY:'",
  "        # Step 1: UIA TextPattern — walk up the automation tree from the focused element.",
  "        # This covers browsers, modern editors, VS Code, Office, WPF apps, etc.",
  "        try {",
  "            $el = [System.Windows.Automation.AutomationElement]::FocusedElement",
  "            $cur = $el",
  "            $depth = 0",
  "            while ($null -ne $cur -and $depth -lt 6 -and $result -eq 'EMPTY:') {",
  "                try {",
  "                    $pat = $cur.GetCurrentPattern($tp)",
  "                    $ranges = $pat.GetSelection()",
  "                    if ($ranges.Length -gt 0) {",
  "                        $text = $ranges[0].GetText(-1)",
  "                        if ($text.Length -gt 0) {",
  "                            $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text))",
  "                            $result = \"TEXT:$b64\"",
  "                        }",
  "                    }",
  "                } catch { }",
  "                if ($result -eq 'EMPTY:') {",
  "                    try { $cur = $tw.GetParent($cur) } catch { $cur = $null }",
  "                }",
  "                $depth++",
  "            }",
  "        } catch { }",
  "        # Step 2: WM_COPY fallback — sends the WM_COPY window message (0x0301) to the",
  "        # foreground window. This is a standard Win32 API message, not a key event.",
  "        # It works for legacy edit controls and terminal emulators that ignore UIA.",
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

function startUiaHelper(): void {
  if (process.platform !== "win32" || state.uiaHelperProcess) return;
  try {
    const scriptPath = join(tmpdir(), "linnea-uia-helper.ps1");
    writeFileSync(scriptPath, UIA_HELPER_SCRIPT, "utf8");
    const child = spawnChild("powershell.exe", [
      "-NonInteractive", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath
    ], { stdio: ["pipe", "pipe", "ignore"] }) as unknown as ChildProcessWithoutNullStreams;
    state.uiaHelperProcess = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      state.uiaHelperBuffer += data;
      const lines = state.uiaHelperBuffer.split(/\r?\n/);
      state.uiaHelperBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "READY") {
          state.uiaHelperReady = true;
        } else if (trimmed.startsWith("TEXT:")) {
          const text = Buffer.from(trimmed.slice(5), "base64").toString("utf8");
          state.uiaHelperPending.shift()?.(text.slice(0, 8000));
        } else if (trimmed.startsWith("EMPTY:") || trimmed.startsWith("ERROR:")) {
          state.uiaHelperPending.shift()?.("");
        }
      }
    });
    child.on("exit", () => {
      state.uiaHelperProcess = null;
      state.uiaHelperReady = false;
      state.uiaHelperBuffer = "";
      for (const resolve of state.uiaHelperPending.splice(0)) resolve("");
    });
  } catch {
    // UIA helper unavailable — selection feature will be silently disabled
  }
}

function stopUiaHelper(): void {
  if (!state.uiaHelperProcess) return;
  try { state.uiaHelperProcess.kill(); } catch { }
  state.uiaHelperProcess = null;
  state.uiaHelperReady = false;
  state.uiaHelperBuffer = "";
  for (const resolve of state.uiaHelperPending.splice(0)) resolve("");
}

function queryUiaSelectedText(): Promise<string> {
  if (!state.uiaHelperProcess || !state.uiaHelperReady) return Promise.resolve("");
  return new Promise<string>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = state.uiaHelperPending.indexOf(resolve);
      if (idx >= 0) state.uiaHelperPending.splice(idx, 1);
      resolve("");
    }, 600);
    state.uiaHelperPending.push((text) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(text);
    });
    try {
      state.uiaHelperProcess!.stdin.write("GET\n");
    } catch {
      settled = true;
      clearTimeout(timer);
      state.uiaHelperPending.pop();
      resolve("");
    }
  });
}

export function registerGlobalSelectionHook(): void {
  if (process.platform !== "win32" || state.globalSelectionHookStarted) return;
  startUiaHelper();
  try {
    const recordKeyboardActivity = (_event: UiohookKeyboardEvent) => {
      state.lastGlobalKeyActivityTime = Date.now();
      closePendingSelectionPopover();
    };
    uIOhook.on("keydown", recordKeyboardActivity);
    uIOhook.on("keyup", recordKeyboardActivity);
    uIOhook.on("mousedown", (event: UiohookMouseEvent) => {
      const point = normalizeGlobalMousePoint(event.x, event.y);
      closePendingSelectionPopoverIfOutside(point.x, point.y);
      state.globalMouseDown = { x: point.x, y: point.y, time: Date.now(), insideAppWindow: isPointInsideAppWindow(point.x, point.y), moved: false };
    });
    uIOhook.on("mousemove", (event: UiohookMouseEvent) => {
      if (!state.globalMouseDown) return;
      const point = normalizeGlobalMousePoint(event.x, event.y);
      if (Math.hypot(point.x - state.globalMouseDown.x, point.y - state.globalMouseDown.y) >= 4) {
        state.globalMouseDown.moved = true;
      }
    });
    uIOhook.on("mouseup", (event: UiohookMouseEvent) => {
      const point = normalizeGlobalMousePoint(event.x, event.y);
      const start = state.globalMouseDown;
      state.globalMouseDown = null;
      if (!start) return;
      if (start.insideAppWindow) return;
      const distance = Math.hypot(point.x - start.x, point.y - start.y);
      const duration = Date.now() - start.time;
      if (!start.moved || distance < 10 || duration < 120) return;
      void (async () => {
        const keySnapshot = state.lastGlobalKeyActivityTime;
        const text = await queryUiaSelectedText();
        if (!text || text.length < 2) return;
        if (state.lastGlobalKeyActivityTime !== keySnapshot) return;
        void openPendingGlobalSelectionCapture(point.x, point.y, text);
      })();
    });
    uIOhook.on("click", (event: UiohookMouseEvent) => {
      if (event.clicks < 2) return;
      const point = normalizeGlobalMousePoint(event.x, event.y);
      if (isPointInsideAppWindow(point.x, point.y)) return;
      void (async () => {
        const keySnapshot = state.lastGlobalKeyActivityTime;
        const text = await queryUiaSelectedText();
        if (!text || text.length < 2) return;
        if (state.lastGlobalKeyActivityTime !== keySnapshot) return;
        void openPendingGlobalSelectionCapture(point.x, point.y, text);
      })();
    });
    uIOhook.start();
    state.globalSelectionHookStarted = true;
  } catch (error) {
    console.error("Failed to start global selection hook", error);
  }
}

export function unregisterGlobalSelectionHook(): void {
  if (process.platform !== "win32") return;
  stopUiaHelper();
  try {
    if (state.globalSelectionHookStarted) uIOhook.stop();
    uIOhook.removeAllListeners("keydown");
    uIOhook.removeAllListeners("keyup");
    uIOhook.removeAllListeners("mousedown");
    uIOhook.removeAllListeners("mousemove");
    uIOhook.removeAllListeners("mouseup");
    uIOhook.removeAllListeners("click");
  } catch {
    // ignore hook shutdown errors
  } finally {
    state.globalSelectionHookStarted = false;
    state.globalMouseDown = null;
  }
}

export async function syncGlobalSelectionHook(): Promise<void> {
  const settings = await store.getSettings();
  if (settings.selectionToolsEnabled) {
    registerGlobalSelectionHook();
  } else {
    unregisterGlobalSelectionHook();
  }
}

function isPointInsideAppWindow(x: number, y: number): boolean {
  const windows = [state.mainWindow, state.workspaceWindow, state.selectionPopoverWindow, ...state.selectionResultWindows].filter(
    (w): w is BrowserWindow => Boolean(w)
  );
  return windows.some((w) => isPointInsideBrowserWindow(w, x, y));
}

function isPointInsideBrowserWindow(window: BrowserWindow, x: number, y: number): boolean {
  if (window.isDestroyed() || !window.isVisible()) return false;
  const bounds = window.getBounds();
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
}

function closePendingSelectionPopoverIfOutside(x: number, y: number): void {
  if (!state.selectionPopoverWindow || state.selectionPopoverWindow.isDestroyed()) return;
  if (isPointInsideBrowserWindow(state.selectionPopoverWindow, x, y)) return;
  closePendingSelectionPopover();
}

function closePendingSelectionPopover(): void {
  if (!state.selectionPopoverWindow || state.selectionPopoverWindow.isDestroyed()) return;
  if (!state.selectionPopoverCaptureId || !state.pendingSelectionCaptureIds.has(state.selectionPopoverCaptureId)) return;
  state.selectionPopoverWindow.close();
}

function normalizeGlobalMousePoint(x: number, y: number): { x: number; y: number } {
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

async function openPendingGlobalSelectionCapture(x: number, y: number, prefilledText?: string): Promise<void> {
  const capture: SelectionCapture = {
    id: randomUUID(),
    text: prefilledText ?? "",
    createdAt: new Date().toISOString()
  };
  state.selectionCaptures.set(capture.id, capture);
  state.pendingSelectionCaptureIds.add(capture.id);
  await _openSelectionPopoverWindow(capture, x, y);
}

// The capture always contains the text obtained via UIA at the time the popover was opened.
// This function is kept for API compatibility — callers (e.g. openCapturePopover IPC) may
// also pass captures that were pre-filled from the renderer side.
export async function resolveSelectionCapture(id: string): Promise<SelectionCapture> {
  const capture = state.selectionCaptures.get(id);
  if (!capture) throw new Error("Selected text capture not found");
  state.pendingSelectionCaptureIds.delete(id);
  if (!capture.text.trim()) throw new Error("没有读取到选中文字。");
  return capture;
}

export function getSelectionAskDraft(): SelectionAskDraft {
  return {
    count: state.selectionAskDraftCaptures.length,
    text: state.selectionAskDraftCaptures.map((c) => c.text).join("\n\n")
  };
}

function buildSelectionAskPrompt(captures: SelectionCapture[]): string {
  const references = captures
    .map((c, i) => `[引用 ${i + 1}]\n${c.text.trim()}`)
    .join("\n\n");
  return `我想基于以下引用内容提问：\n\n${references}\n\n我的问题是：`;
}

export async function submitSelectionAskDraft(): Promise<void> {
  const captures = state.selectionAskDraftCaptures.filter((c) => c.text.trim().length >= 2);
  if (!captures.length) throw new Error("还没有加入要提问的划词内容。");
  state.selectionAskDraftCaptures = [];
  state.selectionPopoverWindow?.close();
  const settings = await store.getSettings();
  const sandbox: CodexSandboxPolicy = (settings.codexDefaultSandbox === "read-only" || settings.codexDefaultSandbox === "danger-full-access")
    ? settings.codexDefaultSandbox
    : "workspace-write";
  const approval: CodexApprovalPolicy = settings.codexDefaultApproval === "never" ? "never" : "on-request";
  await _createCodexSession([], { initialPrompt: "", sandbox, approval }, true, true, buildSelectionAskPrompt(captures));
}
