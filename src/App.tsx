import React from "react";
import type { DesktopPetApi } from "../shared/types";
import { createWorkspaceThemeStyle } from "./utils/themeHelpers";
import { normalizeCodexSandbox, normalizeCodexApproval } from "./utils/codexHelpers";
import { PetWindow } from "./windows/PetWindow";
import { WorkspaceWindow } from "./windows/WorkspaceWindow";
import { SelectionResultWindow } from "./windows/SelectionResultWindow";
import { GlobalSelectionPopoverWindow } from "./windows/GlobalSelectionPopoverWindow";
import { CodexTerminalWindow } from "./components/codex/CodexTerminalWindow";

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const windowMode = searchParams.get("window");
  const api: DesktopPetApi | undefined = window.desktopPet;

  const [themeColor, setThemeColor] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!api || (windowMode !== "selection-result" && windowMode !== "selection-popover" && windowMode !== "codex")) return;
    void api.settings.get().then((s) => setThemeColor(s.workspaceThemeColor)).catch(() => undefined);
  }, [api, windowMode]);

  const themeStyle = React.useMemo(() => createWorkspaceThemeStyle(themeColor), [themeColor]);

  if (windowMode === "selection-result") {
    const resultId = searchParams.get("id") ?? "";
    return <SelectionResultWindow api={api} resultId={resultId} themeStyle={themeStyle} />;
  }

  if (windowMode === "selection-popover") {
    const captureId = searchParams.get("id") ?? "";
    const placement = searchParams.get("placement") === "left" ? "left" : "right";
    return <GlobalSelectionPopoverWindow api={api} captureId={captureId} placement={placement} themeStyle={themeStyle} />;
  }

  if (windowMode === "codex") {
    const sessionId = searchParams.get("id") ?? "";
    const initialPrompt = searchParams.get("prompt") ?? "";
    const initialDraft = searchParams.get("draft") ?? "";
    const sandbox = normalizeCodexSandbox(searchParams.get("sandbox"));
    const approval = normalizeCodexApproval(searchParams.get("approval"));
    return (
      <CodexTerminalWindow
        api={api}
        sessionId={sessionId}
        initialPrompt={initialPrompt}
        initialDraft={initialDraft}
        sandbox={sandbox}
        approval={approval}
        themeStyle={themeStyle}
      />
    );
  }

  if (windowMode === "workspace") {
    return <WorkspaceWindow />;
  }

  return <PetWindow />;
}
