// 聊天角色：第一阶段先支持三种基础角色。
// system 用来保存应用层规则，后续接 API 时会映射成模型的高优先级指令。
export type ChatRole = "system" | "user" | "assistant";

// 单条消息的前端数据结构。
// 注意：这是 UI 模型，不等同于 OpenAI API 的请求模型。
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
}
