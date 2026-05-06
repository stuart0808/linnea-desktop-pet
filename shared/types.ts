export type PetMood = "idle" | "talking" | "happy" | "thinking" | "reminder";

export type TodoStatus = "open" | "done" | "dismissed";

export interface TodoItem {
  id: string;
  title: string;
  notes?: string;
  sourceMessage?: string;
  status: TodoStatus;
  createdAt: string;
  dueAt?: string;
  remindAt?: string;
  confidence?: number;
}

export interface ReminderItem {
  id: string;
  todoId?: string;
  title: string;
  message: string;
  remindAt: string;
  firedAt?: string;
  dismissedAt?: string;
  snoozedUntil?: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
}

export interface AppSettings {
  aiProvider: "deepseek" | "openai" | "custom";
  aiProviderName?: string;
  aiBaseUrl?: string;
  aiModel: string;
  aiApiKey?: string;
  openAiApiKey?: string;
  openAiModel: string;
  alwaysOnTop: boolean;
  autoSaveTodos: boolean;
  systemNotifications: boolean;
  launchAtLogin: boolean;
  keepChatHistory: boolean;
  selectionToolsEnabled: boolean;
  workspaceThemeColor: string;
  skippedUpdateVersion?: string;
  petAppearance?: PetAppearance;
}

export interface PetAppearance {
  name: string;
  directory: string;
  images: Partial<Record<string, string>>;
}

export interface TodoCandidate {
  title: string;
  notes?: string;
  dueAt?: string;
  remindAt?: string;
  confidence: number;
}

export type TaskIntent = "none" | "simple_todo" | "complex_goal";

export interface PlanProposal {
  summary: string;
  sourceMessage: string;
  needsConfirmation: boolean;
  items: TodoCandidate[];
}

export interface ModelStructuredResult {
  replyText: string;
  mood: PetMood;
  taskIntent: TaskIntent;
  todoCandidates: TodoCandidate[];
  planProposal?: PlanProposal | null;
}

export interface ChatResult {
  assistantMessage: ConversationMessage;
  extractedTodos: TodoItem[];
  reminders: ReminderItem[];
  mood: PetMood;
  planProposal?: PlanProposal | null;
}

export interface AppSnapshot {
  todos: TodoItem[];
  reminders: ReminderItem[];
  messages: ConversationMessage[];
  settings: AppSettings;
}

export type SelectionTextAction = "summarize" | "translate";

export interface SelectionTextResult {
  id: string;
  action: SelectionTextAction;
  title: string;
  markdown: string;
  status?: "pending" | "done" | "error";
  error?: string;
  targetLanguage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SelectionCapture {
  id: string;
  text: string;
  createdAt: string;
}

export interface DesktopPetApi {
  chat: {
    sendMessage(text: string): Promise<ChatResult>;
    listMessages(): Promise<ConversationMessage[]>;
    clearMessages(): Promise<void>;
    testApi(apiKey?: string): Promise<{ ok: boolean; message: string }>;
  };
  todo: {
    list(): Promise<TodoItem[]>;
    update(id: string, patch: Partial<Pick<TodoItem, "title" | "notes" | "status" | "dueAt" | "remindAt">>): Promise<TodoItem>;
    delete(id: string): Promise<TodoItem>;
    undoLastAutoSave(): Promise<TodoItem | null>;
    acceptPlanProposal(items: TodoCandidate[], sourceMessage: string): Promise<{ todos: TodoItem[]; reminders: ReminderItem[] }>;
  };
  reminder: {
    list(): Promise<ReminderItem[]>;
    complete(id: string): Promise<ReminderItem>;
    dismiss(id: string): Promise<ReminderItem>;
    snooze(id: string, minutes: number): Promise<ReminderItem>;
    test(): Promise<ReminderItem>;
  };
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  appearance: {
    selectFolder(): Promise<PetAppearance | null>;
    reset(): Promise<AppSettings>;
  };
  summary: {
    generate(): Promise<string>;
  };
  selection: {
    process(action: SelectionTextAction, text: string, targetLanguage?: string): Promise<SelectionTextResult>;
    retranslate(id: string, targetLanguage: string): Promise<SelectionTextResult>;
    getResult(id: string): Promise<SelectionTextResult | null>;
    getCapture(id: string): Promise<SelectionCapture | null>;
    openCapturePopover(text: string, clientX: number, clientY: number): Promise<void>;
    resizePopover(expanded: boolean): Promise<void>;
    createTodoFromCapture(id: string): Promise<void>;
  };
  app: {
    snapshot(): Promise<AppSnapshot>;
    setIgnoreMouseEvents(ignore: boolean): Promise<void>;
    moveWindowBy(deltaX: number, deltaY: number): Promise<void>;
    beginWindowDrag(): Promise<void>;
    dragWindowToCursor(): Promise<void>;
    endWindowDrag(): Promise<void>;
    setPetWindowExpanded(expanded: boolean): Promise<void>;
    openWorkspaceWindow(todoId?: string): Promise<void>;
    checkForUpdates(): Promise<void>;
  };
  events: {
    onReminderFired(callback: (reminder: ReminderItem) => void): () => void;
    onSnapshotUpdated(callback: () => void): () => void;
    onTodoFocus(callback: (todoId: string) => void): () => void;
    onSelectedTextTodo(callback: (text: string) => void): () => void;
  };
}

declare global {
  interface Window {
    desktopPet: DesktopPetApi;
  }
}
