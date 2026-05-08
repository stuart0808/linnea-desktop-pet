import React from "react";
import { Check, Pencil, Sparkles, Trash2, X } from "lucide-react";
import type { PlanProposal, TodoCandidate, TodoPriority } from "../../../shared/types";
import { formatPriority } from "../../utils/formatHelpers";
import { formatPlanTime, toDatetimeLocalValue, fromDatetimeLocalValue } from "../../utils/dateHelpers";
import { splitDraftList } from "../../utils/todoHelpers";

export function PlanProposalCard({
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
