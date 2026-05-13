import { ZodError } from "zod";
import { getTool } from "./registry";
import type { ToolCall, ToolResult } from "./types";

function formatZodError(error: ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`)
    .join("; ");
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const tool = getTool(toolCall.name);

  if (!tool) {
    return {
      ok: false,
      error: `未知工具：${toolCall.name}`,
      retryable: false,
    };
  }

  try {
    const args = tool.argsSchema.parse(toolCall.arguments);
    const data = await tool.execute(args);

    return {
      ok: true,
      tool: tool.name,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      tool: tool.name,
      error:
        error instanceof ZodError
          ? `工具参数校验失败：${formatZodError(error)}`
          : error instanceof Error
            ? error.message
            : String(error),
      retryable: !(error instanceof ZodError),
    };
  }
}
