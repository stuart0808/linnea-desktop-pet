import React from "react";
import { Check, X } from "lucide-react";
import type { CodexModelSummary, CodexThreadSettings, CodexThreadSummary, CodexUiActivity } from "../../../shared/types";
import type { CodexInputSuggestion } from "../../utils/codexHelpers";
import { getCodexModelLabel, pathBasename, resolveCodexDisplayPath, stripAnsi } from "../../utils/codexHelpers";

const CHANGE_TYPE_LABELS: Record<string, string> = { add: "新增", delete: "删除", create: "新增", remove: "删除", update: "修改" };

function DiffView({ patch }: { patch: string }) {
  return (
    <pre className="codex-diff">
      {patch.split("\n").map((line, i) => {
        const cls = line.startsWith("+") && !line.startsWith("+++") ? "diff-add"
          : line.startsWith("-") && !line.startsWith("---") ? "diff-rm"
          : line.startsWith("@@") ? "diff-hunk"
          : line.startsWith("---") || line.startsWith("+++") ? "diff-file-header"
          : "";
        return <span key={i} className={cls}>{line + "\n"}</span>;
      })}
    </pre>
  );
}

export function FileChangesView({ text, workspacePath, onOpenPath }: {
  text: string;
  workspacePath: string;
  onOpenPath: (path: string) => void;
}) {
  const changes = React.useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : null;
    } catch { return null; }
  }, [text]);

  if (!changes) return <pre className="codex-activity-pre">{text}</pre>;
  if (changes.length === 0) return <span className="codex-activity-empty">无文件变更</span>;

  return (
    <div className="codex-file-changes">
      {changes.map((change, i) => {
        const relPath = typeof change.path === "string" ? change.path : null;
        const patch = typeof change.patch === "string" ? change.patch : null;
        const changeType = typeof change.type === "string" ? change.type : "update";
        const absPath = relPath ? resolveCodexDisplayPath(relPath, workspacePath) : null;
        const label = CHANGE_TYPE_LABELS[changeType] ?? "修改";
        return (
          <div key={i} className="codex-file-change">
            {relPath ? (
              <div className="codex-file-change-path">
                <span className={`codex-change-badge ${changeType === "add" || changeType === "create" ? "add" : changeType === "delete" || changeType === "remove" ? "delete" : "update"}`}>
                  {label}
                </span>
                <button type="button" className="codex-path-chip" title={absPath ?? relPath} onClick={() => absPath && onOpenPath(absPath)}>
                  {pathBasename(relPath)}
                </button>
              </div>
            ) : null}
            {patch ? <DiffView patch={patch} /> : null}
            {!relPath && !patch ? <pre className="codex-activity-pre">{JSON.stringify(change, null, 2)}</pre> : null}
          </div>
        );
      })}
    </div>
  );
}

export function CommandOutputView({ text }: { text: string }) {
  const clean = React.useMemo(() => stripAnsi(text), [text]);
  return <pre className="codex-command-output">{clean}</pre>;
}

export function ActivityItemContent({ item, workspacePath, onOpenPath }: {
  item: CodexUiActivity;
  workspacePath: string;
  onOpenPath: (path: string) => void;
}) {
  if (!item.text) return null;
  if (item.type === "file") {
    return <FileChangesView text={item.text} workspacePath={workspacePath} onOpenPath={onOpenPath} />;
  }
  if (item.type === "command") {
    return <CommandOutputView text={item.text} />;
  }
  return <pre className="codex-activity-pre">{item.text}</pre>;
}

export function CodexThinkingMessage() {
  return (
    <div className="codex-chat-message assistant codex-thinking-message">
      <span className="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>Codex 正在输出...</span>
    </div>
  );
}

export function CodexThreadBadges({ settings, models }: { settings: CodexThreadSettings; models: CodexModelSummary[] }) {
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

export function CodexSuggestionPicker({
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

export function CodexResumePicker({
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
