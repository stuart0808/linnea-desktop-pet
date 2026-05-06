const { contextBridge, ipcRenderer } = require("electron");

const api = {
  chat: {
    sendMessage: (text) => ipcRenderer.invoke("chat:sendMessage", text),
    listMessages: () => ipcRenderer.invoke("chat:listMessages"),
    clearMessages: () => ipcRenderer.invoke("chat:clearMessages"),
    testApi: (apiKey) => ipcRenderer.invoke("chat:testApi", apiKey)
  },
  todo: {
    list: () => ipcRenderer.invoke("todo:list"),
    update: (id, patch) => ipcRenderer.invoke("todo:update", id, patch),
    delete: (id) => ipcRenderer.invoke("todo:delete", id),
    undoLastAutoSave: () => ipcRenderer.invoke("todo:undoLastAutoSave"),
    acceptPlanProposal: (items, sourceMessage) => ipcRenderer.invoke("todo:acceptPlanProposal", items, sourceMessage)
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
  selection: {
    process: (action, text, targetLanguage) => ipcRenderer.invoke("selection:process", action, text, targetLanguage),
    retranslate: (id, targetLanguage) => ipcRenderer.invoke("selection:retranslate", id, targetLanguage),
    getResult: (id) => ipcRenderer.invoke("selection:getResult", id),
    getCapture: (id) => ipcRenderer.invoke("selection:getCapture", id),
    resizePopover: (expanded) => ipcRenderer.invoke("selection:resizePopover", expanded),
    createTodoFromCapture: (id) => ipcRenderer.invoke("selection:createTodoFromCapture", id)
  },
  app: {
    snapshot: () => ipcRenderer.invoke("app:snapshot"),
    setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke("app:setIgnoreMouseEvents", ignore),
    moveWindowBy: (deltaX, deltaY) => ipcRenderer.invoke("app:moveWindowBy", deltaX, deltaY),
    beginWindowDrag: () => ipcRenderer.invoke("app:beginWindowDrag"),
    dragWindowToCursor: () => {
      ipcRenderer.send("app:dragWindowToCursor");
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
    },
    onSelectedTextTodo: (callback) => {
      const listener = (_event, text) => callback(text);
      ipcRenderer.on("selection:todoText", listener);
      return () => ipcRenderer.removeListener("selection:todoText", listener);
    }
  }
};

contextBridge.exposeInMainWorld("desktopPet", api);
