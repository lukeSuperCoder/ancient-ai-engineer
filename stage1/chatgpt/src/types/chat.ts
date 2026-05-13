// 聊天角色：第一阶段先支持三种基础角色。
// system 用来保存应用层规则，后续接 API 时会映射成模型的高优先级指令。
export type ChatRole = "system" | "user" | "assistant";

export type ChatMode = "chat" | "agent";

export interface AgentStep {
  id: string;
  index: number;
  type: "model" | "tool";
  name?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentThought {
  id: string;
  index: number;
  text: string;
  createdAt: number;
}

export interface AgentStructuredResult {
  usedTools: string[];
  toolResultsSummary: unknown[];
  finalAnswer: string;
  hasToolError: boolean;
}

// 单条消息的前端数据结构。
// 注意：这是 UI 模型，不等同于 OpenAI API 的请求模型。
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
  mode?: ChatMode;
  agent?: {
    steps: AgentStep[];
    thoughts?: AgentThought[];
    structured?: AgentStructuredResult;
  };
}

// 第五阶段开始支持多会话历史。
// 每个会话独立保存 systemPrompt 和 messages，刷新页面后可以从 localStorage 恢复。
export interface ChatConversation {
  id: string;
  title: string;
  systemPrompt: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
