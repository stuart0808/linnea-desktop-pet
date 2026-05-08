import React from "react";
import { Check, X } from "lucide-react";
import type { CodexModelSummary, CodexThreadSettings, CodexThreadSummary } from "../../../shared/types";
import type { CodexInputSuggestion } from "../../utils/codexHelpers";
import { getCodexModelLabel } from "../../utils/codexHelpers";

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
