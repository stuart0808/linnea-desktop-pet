import React from "react";
import { FileText, Languages, ListTodo, MessageCircle, Sparkles } from "lucide-react";
import type { DesktopPetApi, SelectionAskDraft, SelectionCapture } from "../../shared/types";

type SelectionAction = "summarize" | "translate" | "todo" | "ask" | "ask-submit";

export function GlobalSelectionPopoverWindow({
  api,
  captureId,
  placement,
  themeStyle
}: {
  api?: DesktopPetApi;
  captureId: string;
  placement: "right" | "left";
  themeStyle: React.CSSProperties;
}) {
  const [capture, setCapture] = React.useState<SelectionCapture | null>(null);
  const [busyAction, setBusyAction] = React.useState<SelectionAction | null>(null);
  const [askDraft, setAskDraft] = React.useState<SelectionAskDraft>({ count: 0, text: "" });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!api) {
      setError("API 未连接");
      return;
    }
    if (!captureId) {
      setError("选区丢失");
      return;
    }
    void api.selection.getCapture(captureId)
      .then((value) => {
        if (value) setCapture(value);
        else setError("选区已失效");
      })
      .catch(() => setError("读取选区失败"));
    void api.selection.getAskDraft().then(setAskDraft).catch(() => undefined);
  }, [api, captureId]);

  React.useEffect(() => {
    if (busyAction) return;
    const timer = window.setTimeout(() => window.close(), 4500);
    return () => window.clearTimeout(timer);
  }, [busyAction]);

  React.useEffect(() => {
    return () => {
      void api?.selection.resizePopover(false);
    };
  }, [api]);

  async function runAction(action: SelectionAction) {
    if (!api || !capture || busyAction) return;
    setBusyAction(action);
    setError("");
    try {
      const resolvedCapture = await api.selection.resolveCapture(capture.id);
      setCapture(resolvedCapture);
      if (action === "todo") {
        await api.selection.createTodoFromCapture(resolvedCapture.id);
      } else if (action === "ask") {
        setAskDraft(await api.selection.addAskCapture(resolvedCapture.id));
        setBusyAction(null);
        return;
      } else if (action === "ask-submit") {
        if (askDraft.count === 0) await api.selection.addAskCapture(resolvedCapture.id);
        await api.selection.submitAskDraft();
      } else {
        await api.selection.process(action, resolvedCapture.text);
      }
      window.close();
    } catch (reason) {
      if (reason instanceof Error && /没有读取到选中文字|Selected text is empty/i.test(reason.message)) {
        window.close();
        return;
      }
      setError(reason instanceof Error ? reason.message : "处理失败");
      setBusyAction(null);
    }
  }

  return (
    <main
      className={`global-selection-popover-shell ${placement === "left" ? "expand-left" : "expand-right"}`}
      style={themeStyle}
      onMouseEnter={() => void api?.selection.resizePopover(true)}
      onMouseLeave={() => void api?.selection.resizePopover(false)}
      onFocus={() => void api?.selection.resizePopover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          void api?.selection.resizePopover(false);
        }
      }}
    >
      {error ? (
        <div className="global-selection-error">{error}</div>
      ) : (
        <>
          <span className="selection-popover-dot" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <div className="selection-toolbar" aria-label="选中文字操作">
            <button type="button" title="总结" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("summarize")}>
              <FileText size={14} /> {busyAction === "summarize" ? "总结中..." : "总结"}
            </button>
            <button type="button" title="翻译" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("translate")}>
              <Languages size={14} /> {busyAction === "translate" ? "翻译中..." : "翻译"}
            </button>
            <button type="button" title="生成待办" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("todo")}>
              <ListTodo size={14} /> {busyAction === "todo" ? "整理中..." : "待办"}
            </button>
            <button type="button" title="加入提问" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("ask")}>
              <MessageCircle size={14} /> {busyAction === "ask" ? "加入中..." : `加入${askDraft.count ? ` ${askDraft.count}` : ""}`}
            </button>
            <button type="button" title="提交提问" disabled={!capture || Boolean(busyAction)} onClick={() => void runAction("ask-submit")}>
              <Sparkles size={14} /> {busyAction === "ask-submit" ? "打开中..." : "提问"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
