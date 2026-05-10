import OpenAI from "openai";
import type { ModelStructuredResult, SelectionTextAction, TodoPriority } from "../../shared/types.js";

interface AiClientConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  providerName?: string;
}

const fallbackResult = (text: string): ModelStructuredResult => ({
  replyText: "我先整理成任务草案，确认后再保存。当前没有配置模型服务访问密钥，所以只使用本地规则做基础抽取。",
  mood: "thinking",
  taskIntent: "simple_todo",
  todoCandidates: localTodoExtract(text)
});

export async function askPetAssistant(params: {
  apiKey?: string;
  baseURL?: string;
  model: string;
  providerName?: string;
  text: string;
  nowIso: string;
  localTimeText: string;
  timeZone: string;
}): Promise<ModelStructuredResult> {
  if (!params.apiKey) return fallbackResult(params.text);

  const client = createAiClient(params);

  const response = await client.chat.completions.create({
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "你是 Windows 桌面宠物助手 Linnea。用简短、自然、亲近但不夸张的中文回复。你还要判断用户消息的任务意图并抽取待办草案。必须只输出 JSON，不要输出 Markdown。JSON 字段只能为 replyText, mood, taskIntent, todoCandidates, planProposal。mood 只能是 idle/talking/happy/thinking/reminder。taskIntent 只能是 none/simple_todo/complex_goal。none 表示闲聊、情绪表达或没有明确行动；simple_todo 表示一个或多个可以直接列为待办的事项，例如提醒、开会、买东西、打电话、提交材料；complex_goal 表示需要多个步骤或阶段推进的目标，例如写完论文、备考、准备汇报、完成项目、整理作品集。todoCandidates 用于 simple_todo，每项必须包含 title, notes, project, tags, priority, dueAt, remindAt, repeatRule, subtasks, attachments, confidence；没有值用 null 或空数组。priority 只能是 low/medium/high/urgent，不确定用 medium。tags 是短标签数组；project 是所属项目；repeatRule 是自然语言重复规则，例如“每周五”，没有则 null；subtasks 是 {title, done} 数组；attachments 是附件名称或路径数组，用户没有明确提到则空数组。complex_goal 时不要把内容放入 todoCandidates，必须输出 planProposal：summary 是目标概述，sourceMessage 原样填写用户消息，needsConfirmation 为 true，items 为 3-6 个可执行步骤，每项字段同 todoCandidates，并给出合理时间节点。用户说“提醒我 X”“N 分钟后提醒我 X”“明天提醒我 X”时属于 simple_todo，必须创建 todoCandidates 项：title 是要做的事，remindAt 是提醒时间，dueAt 通常同 remindAt，notes 可写提醒说明。所有相对日期和口语时间都必须基于用户消息发送时的本地时间解析。输出 dueAt/remindAt 时必须使用带时区偏移的 ISO 8601，例如 2026-05-04T20:00:00+08:00；不要输出无时区时间，也不要把本地晚上 8 点当作 UTC 20:00。所有抽取结果只是草案，不能声称已经保存。"
      },
      {
        role: "user",
        content: `用户消息发送时间（本地）：${params.localTimeText}\n用户时区：${params.timeZone}\n发送时间 UTC：${params.nowIso}\n用户消息：${params.text}`
      }
    ],
    response_format: { type: "json_object" }
  });

  const outputText = response.choices[0]?.message?.content;
  if (!outputText) throw new Error(`${params.providerName ?? "模型服务"} returned an empty response`);
  return normalizeModelResult(JSON.parse(outputText));
}

export async function summarizeRecentContext(params: {
  apiKey?: string;
  baseURL?: string;
  model: string;
  providerName?: string;
  nowIso: string;
  localTimeText: string;
  timeZone: string;
  messages: Array<{ role: string; text: string; createdAt: string }>;
  todos: Array<{ title: string; status: string; createdAt: string; dueAt?: string; remindAt?: string }>;
}): Promise<string> {
  const now = new Date(params.nowIso);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  const openTodos = params.todos.filter((todo) => todo.status !== "done");
  const todayTodos = openTodos.filter((todo) => {
    const target = getTodoTargetTime(todo);
    const createdAt = new Date(todo.createdAt).getTime();
    return (typeof target === "number" && target < tomorrowStart) ||
      (Number.isFinite(createdAt) && createdAt >= todayStart && createdAt < tomorrowStart);
  });
  const overdueTodos = openTodos.filter((todo) => {
    const target = getTodoTargetTime(todo);
    return typeof target === "number" && target <= now.getTime();
  });
  const todayUpcomingTodos = openTodos.filter((todo) => {
    const target = getTodoTargetTime(todo);
    return typeof target === "number" && target > now.getTime() && target < tomorrowStart;
  });
  const auxiliaryTodayMessages = params.messages
    .filter((message) => {
      const createdAt = new Date(message.createdAt).getTime();
      return message.role !== "system" && Number.isFinite(createdAt) && createdAt >= todayStart && createdAt < tomorrowStart;
    })
    .slice(-12);
  if (!params.apiKey) {
    return todayTodos.length
      ? `当前没有配置模型服务访问密钥。根据本地数据，今天需要处理：${todayTodos.slice(0, 6).map((todo) => todo.title).join("；")}。建议先处理已过期或有明确提醒时间的事项，再整理剩余任务。`
      : "当前没有配置模型服务访问密钥。根据本地数据，今天没有明确待完成事项。建议检查是否有遗漏任务，并保留一段时间处理临时事项。";
  }

  const client = createAiClient(params);

  const response = await client.chat.completions.create({
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "你是 Windows 桌面宠物助手 Linnea 的今日总结模块。今日总结必须以待办数据为主：今天仍需完成的待办、已过期事项和今天接下来提醒是唯一主要依据。对话内容只能作为附加参考，用来理解语境或补充措辞，不能替代待办，也不要展示对话内容。不要生成新的待办，不要输出 Markdown 标题。生成一段简洁中文总结和行动建议，结构可以自然包含：今天重点、优先处理、行动建议。控制在 120-180 字。"
      },
      {
        role: "user",
        content: JSON.stringify({
          localTimeText: params.localTimeText,
          timeZone: params.timeZone,
          nowIso: params.nowIso,
          todayTodos,
          overdueTodos,
          todayUpcomingTodos,
          auxiliaryTodayMessages
        })
      }
    ]
  });

  return response.choices[0]?.message?.content?.trim() || "暂时没有足够内容可以总结。";
}

export async function testAiConnection(params: {
  apiKey?: string;
  baseURL?: string;
  model: string;
  providerName?: string;
}): Promise<string> {
  if (!params.apiKey?.trim()) {
    throw new Error(`请先填写 ${params.providerName ?? "模型服务"} 访问密钥，或配置对应环境变量。`);
  }

  const client = createAiClient(params);

  const response = await client.chat.completions.create({
    model: params.model,
    messages: [
      { role: "system", content: "你是 API 连通性测试模块。请回复 OK。" },
      { role: "user", content: "请回复 OK" }
    ],
    max_tokens: 16,
    temperature: 0
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!Array.isArray(response.choices)) throw new Error(`${params.providerName ?? "模型服务"} 返回结构异常。`);
  return text || "OK";
}

export async function processSelectedText(params: {
  apiKey?: string;
  baseURL?: string;
  model: string;
  providerName?: string;
  action: SelectionTextAction;
  text: string;
  targetLanguage?: string;
}): Promise<string> {
  const trimmed = params.text.trim();
  if (!trimmed) return "";
  if (!params.apiKey) {
    return params.action === "translate"
      ? `当前没有配置模型服务访问密钥。\n\n${trimmed}`
      : `当前没有配置模型服务访问密钥。\n\n- 已选中文字共 ${trimmed.length} 个字符。\n- 请配置访问密钥后使用智能总结。`;
  }

  const client = createAiClient(params);

  const targetLanguage = normalizeTargetLanguage(params.targetLanguage);
  const systemPrompt = params.action === "translate"
    ? `你是 Linnea 的选中文本翻译模块。只输出 Markdown 正文，不要输出标题以外的解释，不要复述用户原文。翻译目标语言：${targetLanguage}。如果目标语言是“自动”，则原文主要为中文时翻译为英文，原文主要为其他语言时翻译为中文。保留必要的列表、代码和术语。`
    : "你是 Linnea 的选中文本总结模块。只输出 Markdown 正文，不要复述用户原文。用简洁中文总结关键信息、结论和行动点。适合时使用短列表。";

  const response = await client.chat.completions.create({
    model: params.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: trimmed }
    ]
  });

  return response.choices[0]?.message?.content?.trim() || "没有生成可展示的内容。";
}

function createAiClient(config: AiClientConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseURL)
  });
}

function normalizeBaseUrl(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeTargetLanguage(value?: string) {
  const language = value?.trim();
  if (!language || language === "auto") return "自动";
  return language.slice(0, 40);
}

function getTodoTargetTime(todo: { dueAt?: string; remindAt?: string }) {
  const target = todo.remindAt ?? todo.dueAt;
  if (!target) return undefined;
  const time = new Date(target).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function localTodoExtract(text: string) {
  const normalized = text.trim();
  if (!/(提醒我|记一下|待办|todo|要做|需要|别忘)/i.test(normalized)) return [];
  return [
    {
      title: normalized.replace(/^(提醒我|记一下|待办[:：]?)/, "").trim() || normalized,
      notes: "由本地规则自动记录。配置 DeepSeek 访问密钥后会启用更准确的抽取。",
      project: undefined,
      tags: [],
      priority: "medium" as const,
      dueAt: undefined,
      remindAt: undefined,
      repeatRule: undefined,
      subtasks: [],
      attachments: [],
      confidence: 0.55
    }
  ];
}

function normalizeModelResult(value: Partial<ModelStructuredResult>): ModelStructuredResult {
  const taskIntent = ["none", "simple_todo", "complex_goal"].includes(String(value.taskIntent))
    ? (value.taskIntent as ModelStructuredResult["taskIntent"])
    : (Array.isArray(value.todoCandidates) && value.todoCandidates.length ? "simple_todo" : "none");
  const planProposal = normalizePlanProposal(value.planProposal);
  return {
    replyText: typeof value.replyText === "string" ? value.replyText : "我在。",
    mood: ["idle", "talking", "happy", "thinking", "reminder"].includes(String(value.mood))
      ? (value.mood as ModelStructuredResult["mood"])
      : "talking",
    taskIntent,
    todoCandidates: taskIntent === "complex_goal" ? [] : normalizeTodoCandidates(value.todoCandidates),
    planProposal: taskIntent === "complex_goal" ? planProposal : null
  };
}

function normalizePlanProposal(value: ModelStructuredResult["planProposal"] | undefined) {
  if (!value || typeof value !== "object") return null;
  const items = normalizeTodoCandidates(value.items).slice(0, 6);
  if (!items.length) return null;
  return {
    summary: typeof value.summary === "string" ? value.summary : "计划建议",
    sourceMessage: typeof value.sourceMessage === "string" ? value.sourceMessage : "",
    needsConfirmation: true,
    items
  };
}

function normalizeTodoCandidates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!title) return null;
      const confidence = typeof candidate.confidence === "number" ? candidate.confidence : 0.7;
      return {
        title,
        notes: typeof candidate.notes === "string" ? candidate.notes : undefined,
        project: typeof candidate.project === "string" ? candidate.project.trim() || undefined : undefined,
        tags: normalizeStringArray(candidate.tags, 8),
        priority: normalizePriority(candidate.priority),
        dueAt: typeof candidate.dueAt === "string" ? candidate.dueAt : undefined,
        remindAt: typeof candidate.remindAt === "string" ? candidate.remindAt : undefined,
        repeatRule: typeof candidate.repeatRule === "string" ? candidate.repeatRule.trim() || undefined : undefined,
        subtasks: normalizeSubtasks(candidate.subtasks),
        attachments: normalizeStringArray(candidate.attachments, 6),
        confidence
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizePriority(value: unknown): TodoPriority {
  return value === "low" || value === "high" || value === "urgent" ? value : "medium";
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeSubtasks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { title: item.trim(), done: false };
      if (!item || typeof item !== "object") return null;
      const subtask = item as Record<string, unknown>;
      const title = typeof subtask.title === "string" ? subtask.title.trim() : "";
      if (!title) return null;
      return { title, done: subtask.done === true };
    })
    .filter((item): item is { title: string; done: boolean } => Boolean(item))
    .slice(0, 12);
}
