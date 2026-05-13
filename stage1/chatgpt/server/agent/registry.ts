import type Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "./types";
import { newsTool } from "../tools/news";
import { timeTool } from "../tools/time";
import { weatherTool } from "../tools/weather";

const tools = new Map<string, ToolDefinition<any, any>>();

export function registerTool(tool: ToolDefinition<any, any>) {
  tools.set(tool.name, tool);
}

export function registerDefaultTools() {
  tools.clear();
  registerTool(weatherTool);
  registerTool(timeTool);
  registerTool(newsTool);
}

export function getTool(name: string) {
  return tools.get(name);
}

export function getToolSchemas(): Anthropic.Tool[] {
  return Array.from(tools.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

registerDefaultTools();
