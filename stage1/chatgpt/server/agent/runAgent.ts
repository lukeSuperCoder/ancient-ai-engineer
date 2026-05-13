import Anthropic from "@anthropic-ai/sdk";
import { getModelConfig } from "../config";
import { executeToolCall } from "./executor";
import { getToolSchemas } from "./registry";
import type { AgentResponse, AgentStep, AgentStreamEvent, AgentThought, ToolResult } from "./types";

type ApiChatRole = "user" | "assistant";

interface ApiChatMessage {
  role: ApiChatRole;
  content: string;
}

export interface AgentRequestBody {
  systemPrompt?: string;
  messages?: ApiChatMessage[];
}

const modelConfig = getModelConfig();
const client = new Anthropic({
  apiKey: modelConfig.apiKey,
  baseURL: modelConfig.baseURL,
});

function normalizeMessages(messages: ApiChatMessage[] = []): Anthropic.MessageParam[] {
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
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function summarizeModelContent(content: Anthropic.Messages.Message["content"]) {
  return content.map((block) => {
    if (block.type === "text") {
      return {
        type: "text",
        text: block.text,
      };
    }

    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      };
    }

    return {
      type: block.type,
    };
  });
}

function buildStructuredResult(answer: string, toolResults: ToolResult[]) {
  return {
    usedTools: toolResults.map((result) => result.tool).filter(Boolean) as string[],
    toolResultsSummary: toolResults,
    finalAnswer: answer,
    hasToolError: toolResults.some((result) => !result.ok),
  };
}

function createThought(index: number, text: string): AgentThought {
  return {
    id: crypto.randomUUID(),
    index,
    text,
    createdAt: Date.now(),
  };
}

function createTextChunks(text: string, chunkSize = 12) {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function runAgent(body: AgentRequestBody): Promise<AgentResponse> {
  const messages = normalizeMessages(body.messages);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("messages must end with a user message");
  }

  const steps: AgentStep[] = [];
  const toolResults: ToolResult[] = [];
  const tools = getToolSchemas();
  let lastUsage: unknown;
  let lastAnswer = "";

  for (let round = 0; round < modelConfig.agentMaxSteps; round += 1) {
    const startedAt = performance.now();
    const response = await client.messages.create({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system:
        body.systemPrompt?.trim() ||
        "你是一个可以按需调用工具的 AI 助手。调用工具后，最终回答必须基于工具结果。",
      messages,
      tools,
    });
    const durationMs = Math.round(performance.now() - startedAt);

    lastUsage = response.usage;
    lastAnswer = extractText(response.content);
    steps.push({
      id: response.id,
      index: steps.length + 1,
      type: "model",
      input: {
        round: round + 1,
        stopReason: response.stop_reason,
      },
      output: summarizeModelContent(response.content),
      durationMs,
    });

    messages.push({
      role: response.role,
      content: response.content,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const answer = lastAnswer || "模型没有返回内容。";

      return {
        answer,
        structured: buildStructuredResult(answer, toolResults),
        steps,
        usage: lastUsage,
      };
    }

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const toolStartedAt = performance.now();
      const result = await executeToolCall({
        id: toolUse.id,
        name: toolUse.name,
        arguments: toolUse.input,
      });
      const toolDurationMs = Math.round(performance.now() - toolStartedAt);

      toolResults.push(result);
      steps.push({
        id: toolUse.id,
        index: steps.length + 1,
        type: "tool",
        name: toolUse.name,
        input: toolUse.input,
        output: result.ok ? result.data : undefined,
        error: result.ok ? undefined : result.error,
        durationMs: toolDurationMs,
      });

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });
    }

    // Anthropic Messages API 要求 tool_result 作为下一条 user message 交回模型。
    messages.push({
      role: "user",
      content: toolResultBlocks,
    });
  }

  const answer =
    lastAnswer ||
    `Agent 已达到最大步骤数 ${modelConfig.agentMaxSteps}，但模型还没有生成最终回答。`;

  return {
    answer,
    structured: buildStructuredResult(answer, toolResults),
    steps,
    usage: lastUsage,
  };
}

export async function* streamAgent(body: AgentRequestBody): AsyncGenerator<AgentStreamEvent> {
  const messages = normalizeMessages(body.messages);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("messages must end with a user message");
  }

  const toolResults: ToolResult[] = [];
  const tools = getToolSchemas();
  let lastUsage: unknown;
  let lastAnswer = "";
  let stepIndex = 1;
  let thoughtIndex = 1;

  yield {
    type: "thinking",
    thought: createThought(thoughtIndex++, "收到问题，开始判断是否需要调用外部工具。"),
  };

  for (let round = 0; round < modelConfig.agentMaxSteps; round += 1) {
    yield {
      type: "thinking",
      thought: createThought(thoughtIndex++, `第 ${round + 1} 轮：请求模型选择下一步动作。`),
    };

    const startedAt = performance.now();
    const response = await client.messages.create({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system:
        body.systemPrompt?.trim() ||
        "你是一个可以按需调用工具的 AI 助手。调用工具后，最终回答必须基于工具结果。",
      messages,
      tools,
    });
    const durationMs = Math.round(performance.now() - startedAt);

    lastUsage = response.usage;
    lastAnswer = extractText(response.content);
    const modelStep: AgentStep = {
      id: response.id,
      index: stepIndex++,
      type: "model",
      input: {
        round: round + 1,
        stopReason: response.stop_reason,
      },
      output: summarizeModelContent(response.content),
      durationMs,
    };

    yield {
      type: "step",
      step: modelStep,
    };

    messages.push({
      role: response.role,
      content: response.content,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const answer = lastAnswer || "模型没有返回内容。";

      yield {
        type: "thinking",
        thought: createThought(thoughtIndex++, "没有新的工具调用，开始输出最终回答。"),
      };

      for (const chunk of createTextChunks(answer)) {
        yield {
          type: "delta",
          text: chunk,
        };
      }

      yield {
        type: "structured",
        structured: buildStructuredResult(answer, toolResults),
        usage: lastUsage,
      };

      return;
    }

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      yield {
        type: "thinking",
        thought: createThought(thoughtIndex++, `准备调用工具：${toolUse.name}。`),
      };

      const toolStartedAt = performance.now();
      const result = await executeToolCall({
        id: toolUse.id,
        name: toolUse.name,
        arguments: toolUse.input,
      });
      const toolDurationMs = Math.round(performance.now() - toolStartedAt);

      toolResults.push(result);
      const toolStep: AgentStep = {
        id: toolUse.id,
        index: stepIndex++,
        type: "tool",
        name: toolUse.name,
        input: toolUse.input,
        output: result.ok ? result.data : undefined,
        error: result.ok ? undefined : result.error,
        durationMs: toolDurationMs,
      };

      yield {
        type: "step",
        step: toolStep,
      };

      yield {
        type: "thinking",
        thought: createThought(
          thoughtIndex++,
          result.ok
            ? `工具 ${toolUse.name} 已返回结果，准备交给模型整合。`
            : `工具 ${toolUse.name} 调用失败，准备让模型基于错误信息继续处理。`,
        ),
      };

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });
    }

    messages.push({
      role: "user",
      content: toolResultBlocks,
    });
  }

  const answer =
    lastAnswer ||
    `Agent 已达到最大步骤数 ${modelConfig.agentMaxSteps}，但模型还没有生成最终回答。`;

  yield {
    type: "thinking",
    thought: createThought(thoughtIndex++, "已达到最大步骤数，输出当前可用结果。"),
  };

  for (const chunk of createTextChunks(answer)) {
    yield {
      type: "delta",
      text: chunk,
    };
  }

  yield {
    type: "structured",
    structured: buildStructuredResult(answer, toolResults),
    usage: lastUsage,
  };
}
