import React from "react";
import { Check, ShieldAlert, X } from "lucide-react";

export type CodexRequest = { id: number | string; method: string; params: any; threadId?: string; createdAt?: string };

export type CodexRequestAction = {
  key: string;
  label: string;
  response: unknown;
  tone?: "primary" | "danger";
};

const DECISION_LABELS: Record<string, string> = {
  accept: "允许一次",
  acceptForSession: "本会话允许",
  decline: "拒绝",
  cancel: "取消",
  allow: "允许",
  allowOnce: "允许一次",
  allowForSession: "本会话允许",
  deny: "拒绝",
  reject: "拒绝"
};

const DEFAULT_DECISIONS = ["accept", "acceptForSession", "decline", "cancel"];
const SAFE_FALLBACK_DECISIONS = ["decline", "cancel"];

function getAvailableDecisions(request: CodexRequest): string[] {
  return Array.isArray(request.params?.availableDecisions) && request.params.availableDecisions.length
    ? request.params.availableDecisions.map((decision: unknown) => String(decision)).filter(Boolean)
    : [];
}

function decisionTone(decision: string): CodexRequestAction["tone"] {
  if (decision === "accept" || decision === "allow" || decision === "allowOnce") return "primary";
  if (decision === "decline" || decision === "cancel" || decision === "deny" || decision === "reject") return "danger";
  return undefined;
}

function buildDecisionActions(decisions: string[]): CodexRequestAction[] {
  return decisions.map((decision) => ({
    key: decision,
    label: DECISION_LABELS[decision] ?? decision,
    response: { decision },
    tone: decisionTone(decision)
  }));
}

export function isCommandExecutionApprovalRequest(request: CodexRequest | undefined): boolean {
  return request?.method === "item/commandExecution/requestApproval";
}

export function getCodexRequestTitle(request: CodexRequest): string {
  if (request.method === "item/commandExecution/requestApproval") return "允许执行命令？";
  if (request.method === "item/fileChange/requestApproval") return "允许文件变更？";
  if (request.method === "item/permissions/requestApproval") return "权限请求";
  return "Codex 请求确认";
}

export function getCodexRequestActions(request: CodexRequest): CodexRequestAction[] {
  if (request.method === "item/commandExecution/requestApproval" || request.method === "item/fileChange/requestApproval") {
    const available = getAvailableDecisions(request).length ? getAvailableDecisions(request) : DEFAULT_DECISIONS;
    const decisions = available.filter((decision: string) => DEFAULT_DECISIONS.includes(decision));
    return buildDecisionActions(decisions.length ? decisions : DEFAULT_DECISIONS);
  }

  if (request.method === "item/permissions/requestApproval") {
    const permissions = request.params?.permissions ?? {};
    return [
      { key: "turn", label: "本轮允许", response: { permissions, scope: "turn" }, tone: "primary" },
      { key: "session", label: "本会话允许", response: { permissions, scope: "session" } },
      { key: "decline", label: "拒绝", response: { permissions: {}, scope: "turn" }, tone: "danger" }
    ];
  }

  const available = getAvailableDecisions(request);
  if (available.length) return buildDecisionActions(available);

  return SAFE_FALLBACK_DECISIONS.map((decision) => ({
    key: decision,
    label: DECISION_LABELS[decision] ?? decision,
    response: { decision },
    tone: decisionTone(decision)
  }));
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function RequestDetail({ label, value, code = false }: { label: string; value: unknown; code?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value : formatJson(value);
  return (
    <div className="codex-request-detail">
      <span>{label}</span>
      {code ? <pre>{text}</pre> : <p>{text}</p>}
    </div>
  );
}

export function CodexRequestCard({
  request,
  activeIndex,
  resolving,
  error,
  onActiveIndexChange,
  onResolve
}: {
  request: CodexRequest;
  activeIndex: number;
  resolving?: boolean;
  error?: string;
  onActiveIndexChange(index: number): void;
  onResolve(response: unknown): void;
}) {
  const actions = getCodexRequestActions(request);
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(actions.length - 1, 0));
  const commandActions = request.params?.commandActions;
  const networkApprovalContext = request.params?.networkApprovalContext;
  const isKnownRequest =
    request.method === "item/commandExecution/requestApproval" ||
    request.method === "item/fileChange/requestApproval" ||
    request.method === "item/permissions/requestApproval";

  function choose(index: number) {
    const action = actions[index];
    if (!action || resolving) return;
    onActiveIndexChange(index);
    onResolve(action.response);
  }

  return (
    <section className="codex-request-dialog" role="dialog" aria-modal="false" aria-label={getCodexRequestTitle(request)}>
      <div className="codex-request-dialog-header">
        <ShieldAlert size={16} />
        <div>
          <strong>{getCodexRequestTitle(request)}</strong>
          <span>使用上下箭头选择，Enter 提交。</span>
        </div>
      </div>
      <RequestDetail label="请求类型" value={request.method} code />
      <RequestDetail label="原因" value={request.params?.reason} />
      <RequestDetail label="命令" value={request.params?.command} code />
      <RequestDetail label="目录" value={request.params?.cwd} />
      <RequestDetail label="文件范围" value={request.params?.grantRoot ?? request.params?.itemId} />
      <RequestDetail label="权限" value={request.params?.permissions} code />
      <RequestDetail label="命令操作" value={commandActions} code />
      <RequestDetail label="网络上下文" value={networkApprovalContext} code />
      {!isKnownRequest && <RequestDetail label="原始参数" value={request.params ?? {}} code />}
      {error && <div className="codex-request-error">{error}</div>}
      <div className="codex-request-actions" role="listbox" aria-label="审批选项">
        {actions.map((action, index) => (
          <button
            key={action.key}
            type="button"
            className={`${index === safeActiveIndex ? "active" : ""} ${action.tone ?? ""}`}
            disabled={resolving}
            onMouseEnter={() => onActiveIndexChange(index)}
            onClick={() => choose(index)}
          >
            {index === safeActiveIndex ? <Check size={13} /> : action.tone === "danger" ? <X size={13} /> : null}
            {resolving && index === safeActiveIndex ? "正在提交..." : action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
