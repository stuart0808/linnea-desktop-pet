import React from "react";
import { FileText, Sparkles, X } from "lucide-react";
import type { CodexApprovalPolicy, CodexDropItem, CodexSandboxPolicy } from "../../../shared/types";

export function CodexBasketPopover({
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
