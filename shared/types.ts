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
  openAiApiKey?: string;
  openAiModel: string;
  alwaysOnTop: boolean;
  autoSaveTodos: boolean;
  systemNotifications: boolean;
  launchAtLogin: boolean;
  keepChatHistory: boolean;
  workspaceThemeColor: string;
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

export interface ModelStructuredResult {
  replyText: string;
  mood: PetMood;
  todoCandidates: TodoCandidate[];
}

export interface ChatResult {
  assistantMessage: ConversationMessage;
  extractedTodos: TodoItem[];
  reminders: ReminderItem[];
  mood: PetMood;
}

export interface AppSnapshot {
  todos: TodoItem[];
  reminders: ReminderItem[];
  messages: ConversationMessage[];
  settings: AppSettings;
}

export interface DesktopPetApi {
  chat: {
    sendMessage(text: string): Promise<ChatResult>;
    listMessages(): Promise<ConversationMessage[]>;
    clearMessages(): Promise<void>;
  };
  todo: {
    list(): Promise<TodoItem[]>;
    update(id: string, patch: Partial<Pick<TodoItem, "title" | "notes" | "status" | "dueAt" | "remindAt">>): Promise<TodoItem>;
    delete(id: string): Promise<TodoItem>;
    undoLastAutoSave(): Promise<TodoItem | null>;
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
  app: {
    snapshot(): Promise<AppSnapshot>;
    setIgnoreMouseEvents(ignore: boolean): Promise<void>;
    moveWindowBy(deltaX: number, deltaY: number): Promise<void>;
    beginWindowDrag(offsetX: number, offsetY: number): Promise<void>;
    dragWindowToCursor(screenX: number, screenY: number): Promise<void>;
    endWindowDrag(): Promise<void>;
    setPetWindowExpanded(expanded: boolean): Promise<void>;
    openWorkspaceWindow(todoId?: string): Promise<void>;
  };
  events: {
    onReminderFired(callback: (reminder: ReminderItem) => void): () => void;
    onSnapshotUpdated(callback: () => void): () => void;
    onTodoFocus(callback: (todoId: string) => void): () => void;
  };
}

declare global {
  interface Window {
    desktopPet: DesktopPetApi;
  }
}
