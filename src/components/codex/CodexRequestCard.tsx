import React from "react";

export function CodexRequestCard({ request, onResolve }: { request: { id: number | string; method: string; params: any }; onResolve(response: unknown): void }) {
  const command = request.params?.command;
  const reason = request.params?.reason;
  const isFileChange = request.method === "item/fileChange/requestApproval";
  const isPermissions = request.method === "item/permissions/requestApproval";

  function accept() {
    if (request.method === "item/commandExecution/requestApproval") onResolve({ decision: "accept" });
    else if (isFileChange) onResolve({ decision: "accept" });
    else if (isPermissions) onResolve({ permissions: request.params?.permissions ?? { type: "none" }, scope: "turn" });
    else onResolve({ action: "accept" });
  }

  function acceptForSession() {
    if (request.method === "item/commandExecution/requestApproval") onResolve({ decision: "acceptForSession" });
    else if (isFileChange) onResolve({ decision: "acceptForSession" });
    else accept();
  }

  function decline() {
    if (request.method === "item/commandExecution/requestApproval" || isFileChange) onResolve({ decision: "decline" });
    else onResolve({ action: "decline" });
  }

  return (
    <div className="codex-request-card">
      <strong>{isFileChange ? "允许文件变更？" : isPermissions ? "权限请求" : "允许执行命令？"}</strong>
      {reason && <p>{reason}</p>}
      {command && <pre>{command}</pre>}
      {request.params?.cwd && <span>{request.params.cwd}</span>}
      <div>
        <button type="button" onClick={accept}>允许</button>
        <button type="button" onClick={acceptForSession}>本会话允许</button>
        <button type="button" onClick={decline}>拒绝</button>
      </div>
    </div>
  );
}
