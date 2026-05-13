import type { z } from "zod";

export type ToolDefinition<TArgs, TResult> = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  argsSchema: z.ZodType<TArgs>;
  execute: (args: TArgs) => Promise<TResult>;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ToolResult =
  | {
      ok: true;
      tool: string;
      data: unknown;
    }
  | {
      ok: false;
      tool?: string;
      error: string;
      retryable: boolean;
    };

export type AgentStep = {
  id: string;
  index: number;
  type: "model" | "tool";
  name?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs: number;
};

export type AgentThought = {
  id: string;
  index: number;
  text: string;
  createdAt: number;
};

export type AgentResponse = {
  answer: string;
  structured: {
    usedTools: string[];
    toolResultsSummary: ToolResult[];
    finalAnswer: string;
    hasToolError: boolean;
  };
  steps: AgentStep[];
  usage?: unknown;
};

export type AgentStreamEvent =
  | {
      type: "thinking";
      thought: AgentThought;
    }
  | {
      type: "step";
      step: AgentStep;
    }
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "structured";
      structured: AgentResponse["structured"];
      usage?: unknown;
    };
