import OpenAI from "openai";
import type { ModelStructuredResult } from "../../shared/types.js";

const fallbackResult = (text: string): ModelStructuredResult => ({
  replyText: "我已经记下你说的内容了。现在还没有配置 DeepSeek API Key，所以先用本地规则帮你做基础记录。",
  mood: "thinking",
  todoCandidates: localTodoExtract(text)
});

export async function askPetAssistant(params: {
  apiKey?: string;
  model: string;
  text: string;
  nowIso: string;
  localTimeText: string;
  timeZone: string;
}): Promise<ModelStructuredResult> {
  if (!params.apiKey) return fallbackResult(params.text);

  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: "https://api.deepseek.com"
  });

  const response = await client.chat.completions.create({
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "你是 Windows 桌面宠物助手 Linnea。用简短、自然、亲近但不夸张的中文回复。你还要从用户消息中抽取待办。只抽取用户真实表达要做的事情，不要把闲聊误判成待办。必须只输出 JSON，不要输出 Markdown。JSON 字段只能为 replyText, mood, todoCandidates。mood 只能是 idle/talking/happy/thinking/reminder。todoCandidates 是唯一的数据来源；每项必须包含 title, notes, dueAt, remindAt, confidence。没有值用 null。用户说“提醒我 X”“N 分钟后提醒我 X”“明天提醒我 X”时，也必须创建 todoCandidates 项：title 是要做的事，remindAt 是提醒时间，dueAt 通常同 remindAt，notes 可写提醒说明。所有相对日期和口语时间都必须基于用户消息发送时的本地时间解析。输出 dueAt/remindAt 时必须使用带时区偏移的 ISO 8601，例如 2026-05-04T20:00:00+08:00；不要输出无时区时间，也不要把本地晚上 8 点当作 UTC 20:00。"
      },
      {
        role: "user",
        content: `用户消息发送时间（本地）：${params.localTimeText}\n用户时区：${params.timeZone}\n发送时间 UTC：${params.nowIso}\n用户消息：${params.text}`
      }
    ],
    response_format: { type: "json_object" }
  });

  const outputText = response.choices[0]?.message?.content;
  if (!outputText) throw new Error("DeepSeek returned an empty response");
  return normalizeModelResult(JSON.parse(outputText));
}

export async function summarizeRecentContext(params: {
  apiKey?: string;
  model: string;
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
      ? `当前没有配置 DeepSeek API Key。根据本地数据，今天需要处理：${todayTodos.slice(0, 6).map((todo) => todo.title).join("；")}。建议先处理已过期或有明确提醒时间的事项，再整理剩余任务。`
      : "当前没有配置 DeepSeek API Key。根据本地数据，今天没有明确待完成事项。建议检查是否有遗漏任务，并保留一段时间处理临时事项。";
  }

  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: "https://api.deepseek.com"
  });

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
      notes: "由本地规则自动记录。配置 DeepSeek API Key 后会启用更准确的抽取。",
      dueAt: undefined,
      remindAt: undefined,
      confidence: 0.55
    }
  ];
}

function normalizeModelResult(value: Partial<ModelStructuredResult>): ModelStructuredResult {
  return {
    replyText: typeof value.replyText === "string" ? value.replyText : "我在。",
    mood: ["idle", "talking", "happy", "thinking", "reminder"].includes(String(value.mood))
      ? (value.mood as ModelStructuredResult["mood"])
      : "talking",
    todoCandidates: Array.isArray(value.todoCandidates) ? value.todoCandidates : []
  };
}
