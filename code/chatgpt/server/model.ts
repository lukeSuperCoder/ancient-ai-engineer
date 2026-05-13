import Anthropic from "@anthropic-ai/sdk";
import { getModelConfig } from "./config";

type ApiChatRole = "user" | "assistant";

interface ApiChatMessage {
  role: ApiChatRole;
  content: string;
}

export interface ChatRequestBody {
  systemPrompt?: string;
  messages?: ApiChatMessage[];
}

const modelConfig = getModelConfig();

// Anthropic SDK 使用驼峰 baseURL；配置值仍沿用 learncc 的 ANTHROPIC_BASE_URL。
const client = new Anthropic({
  apiKey: modelConfig.apiKey,
  baseURL: modelConfig.baseURL,
});

function normalizeMessages(messages: ApiChatMessage[] = []) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-20);
}

function extractText(content: Anthropic.Messages.Message["content"]) {
  // Messages API 的 content 是 block 数组。当前聊天机器人只消费 text block；
  // 未来如果接工具调用或多模态，可以在这里扩展 block 类型处理。
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function createChatReply(body: ChatRequestBody) {
  const messages = normalizeMessages(body.messages);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("messages must end with a user message");
  }

  const response = await client.messages.create({
    model: modelConfig.model,
    max_tokens: modelConfig.maxTokens,
    system: body.systemPrompt?.trim() || "You are a helpful assistant.",
    messages,
  });

  const text = extractText(response.content);

  if (!text) {
    throw new Error("model returned an empty response");
  }

  return {
    text,
    model: response.model,
    stopReason: response.stop_reason,
    usage: response.usage,
  };
}

export async function* streamChatReply(body: ChatRequestBody) {
  const messages = normalizeMessages(body.messages);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("messages must end with a user message");
  }

  // 第四阶段开始使用真正的模型流式输出。
  // Anthropic SDK 会把底层 SSE 解析成结构化事件；我们只抽取 text_delta。
  const stream = client.messages.stream({
    model: modelConfig.model,
    max_tokens: modelConfig.maxTokens,
    system: body.systemPrompt?.trim() || "You are a helpful assistant.",
    messages,
  });

  for await (const event of stream) {
    if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") {
      continue;
    }

    yield event.delta.text;
  }
}

export function getPublicModelInfo() {
  return {
    model: modelConfig.model,
    baseURL: modelConfig.baseURL ? "custom" : "default",
    maxTokens: modelConfig.maxTokens,
  };
}
