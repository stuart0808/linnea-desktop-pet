const { contextBridge, ipcRenderer } = require("electron");

const api = {
  chat: {
    sendMessage: (text) => ipcRenderer.invoke("chat:sendMessage", text),
    listMessages: () => ipcRenderer.invoke("chat:listMessages"),
    clearMessages: () => ipcRenderer.invoke("chat:clearMessages")
  },
  todo: {
    list: () => ipcRenderer.invoke("todo:list"),
    update: (id, patch) => ipcRenderer.invoke("todo:update", id, patch),
    delete: (id) => ipcRenderer.invoke("todo:delete", id),
    undoLastAutoSave: () => ipcRenderer.invoke("todo:undoLastAutoSave")
  },
  reminder: {
    list: () => ipcRenderer.invoke("reminder:list"),
    complete: (id) => ipcRenderer.invoke("reminder:complete", id),
    dismiss: (id) => ipcRenderer.invoke("reminder:dismiss", id),
    snooze: (id, minutes) => ipcRenderer.invoke("reminder:snooze", id, minutes),
    test: () => ipcRenderer.invoke("reminder:test")
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch)
  },
  appearance: {
    selectFolder: () => ipcRenderer.invoke("appearance:selectFolder"),
    reset: () => ipcRenderer.invoke("appearance:reset")
  },
  summary: {
    generate: () => ipcRenderer.invoke("summary:generate")
  },
  app: {
    snapshot: () => ipcRenderer.invoke("app:snapshot"),
    setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke("app:setIgnoreMouseEvents", ignore),
    moveWindowBy: (deltaX, deltaY) => ipcRenderer.invoke("app:moveWindowBy", deltaX, deltaY),
    beginWindowDrag: (offsetX, offsetY) => ipcRenderer.invoke("app:beginWindowDrag", offsetX, offsetY),
    dragWindowToCursor: (screenX, screenY) => {
      ipcRenderer.send("app:dragWindowToCursor", screenX, screenY);
      return Promise.resolve();
    },
    endWindowDrag: () => ipcRenderer.invoke("app:endWindowDrag"),
    setPetWindowExpanded: (expanded) => ipcRenderer.invoke("app:setPetWindowExpanded", expanded),
    openWorkspaceWindow: (todoId) => ipcRenderer.invoke("app:openWorkspaceWindow", todoId)
  },
  events: {
    onReminderFired: (callback) => {
      const listener = (_event, reminder) => callback(reminder);
      ipcRenderer.on("reminder:fired", listener);
      return () => ipcRenderer.removeListener("reminder:fired", listener);
    },
    onSnapshotUpdated: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("app:snapshotUpdated", listener);
      return () => ipcRenderer.removeListener("app:snapshotUpdated", listener);
    },
    onTodoFocus: (callback) => {
      const listener = (_event, todoId) => callback(todoId);
      ipcRenderer.on("todo:focus", listener);
      return () => ipcRenderer.removeListener("todo:focus", listener);
    }
  }
};

contextBridge.exposeInMainWorld("desktopPet", api);
