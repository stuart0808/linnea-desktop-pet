import { BrowserWindow, Tray } from "electron";
import { type ChildProcessWithoutNullStreams } from "node:child_process";
import WebSocket from "ws";
import type { CodexSessionHistory, CodexSessionInfo, CodexStartOptions, SelectionCapture, SelectionTextResult } from "../../shared/types.js";

export interface CodexRuntimeSession extends CodexSessionInfo {
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

export const collapsedPetBounds = { width: 180, height: 300 };
export const expandedPetBounds = { width: 560, height: 720 };
export const workspacePreferredBounds = { width: 1680, height: 820, minWidth: 1600, minHeight: 700 };
export const selectionPopoverCollapsedBounds = { width: 38, height: 38 };
export const selectionPopoverExpandedBounds = { width: 372, height: 38 };

export const state = {
  mainWindow: null as BrowserWindow | null,
  workspaceWindow: null as BrowserWindow | null,
  selectionPopoverWindow: null as BrowserWindow | null,
  selectionResultWindows: new Set<BrowserWindow>(),
  tray: null as Tray | null,
  isQuitting: false,
  reminderTimers: new Map<string, NodeJS.Timeout>(),
  registeredQuickAiRecordShortcut: null as string | null,
  selectionResults: new Map<string, SelectionTextResult>(),
  selectionCaptures: new Map<string, SelectionCapture>(),
  pendingSelectionCaptureIds: new Set<string>(),
  selectionResultSources: new Map<string, string>(),
  selectionAskDraftCaptures: [] as SelectionCapture[],
  codexSessions: new Map<string, CodexRuntimeSession>(),
  windowDragState: null as { window: BrowserWindow; offsetX: number; offsetY: number } | null,
  pendingPetExpanded: null as boolean | null,
  globalSelectionHookStarted: false,
  globalMouseDown: null as { x: number; y: number; time: number; insideAppWindow: boolean; moved: boolean } | null,
  selectionPopoverAnchor: null as { x: number; y: number; placement: "right" | "left" } | null,
  selectionPopoverCaptureId: null as string | null,
  lastGlobalKeyActivityTime: 0,
  uiaHelperProcess: null as ChildProcessWithoutNullStreams | null,
  uiaHelperReady: false,
  uiaHelperPending: [] as Array<(text: string) => void>,
  uiaHelperBuffer: "",
};
