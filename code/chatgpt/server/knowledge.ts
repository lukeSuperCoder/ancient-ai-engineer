import Anthropic from "@anthropic-ai/sdk";
import { getModelConfig } from "./config";
import { searchKnowledgeBase } from "./db";

type ApiChatRole = "user" | "assistant";

interface ApiChatMessage {
  role: ApiChatRole;
  content: string;
}

export interface KbRequestBody {
  systemPrompt?: string;
  messages?: ApiChatMessage[];
}

const modelConfig = getModelConfig();
const client = new Anthropic({
  apiKey: modelConfig.apiKey,
  baseURL: modelConfig.baseURL,
});

const RAG_SYSTEM_PROMPT = `你是一个基于中国古典文学知识库的问答助手。请严格根据以下参考资料回答用户问题。

要求：
1. 如果参考资料中有相关内容，请基于资料回答，并在回答中标注出处（第X回 · 回目标题），引用原文关键片段。
2. 如果参考资料与问题无关或不足以回答问题，请直接说"知识库中没有找到相关内容，我无法回答这个问题。"
3. 不要编造任何不在参考资料中的信息。`;

function normalizeMessages(messages: ApiChatMessage[] = []): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0)
    .slice(-20);
}

function buildRagPrompt(query: string, results: { chapterNumber: number; chapterTitle: string; content: string }[]): string {
  const context = results
    .map((r, i) => `【资料${i + 1}】第${r.chapterNumber}回 · ${r.chapterTitle}\n${r.content}`)
    .join("\n\n---\n\n");

  return `${RAG_SYSTEM_PROMPT}\n\n参考资料：\n${context}\n\n用户问题：${query}`;
}

export async function* streamKnowledgeReply(body: KbRequestBody): AsyncGenerator<string> {
  const messages = normalizeMessages(body.messages);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("messages must end with a user message");
  }

  const query = messages.at(-1)!.content as string;
  const results = await searchKnowledgeBase(query, 5);

  if (results.length === 0) {
    yield "知识库中没有找到相关内容，我无法回答这个问题。";
    return;
  }

  const ragPrompt = buildRagPrompt(query, results);

  const stream = client.messages.stream({
    model: modelConfig.model,
    max_tokens: modelConfig.maxTokens,
    system: ragPrompt,
    messages: [{ role: "user" as const, content: query }],
  });

  for await (const event of stream) {
    if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") {
      continue;
    }

    yield event.delta.text;
  }
}
