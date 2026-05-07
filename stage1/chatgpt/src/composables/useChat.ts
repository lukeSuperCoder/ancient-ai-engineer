import { computed, ref } from "vue";
import type { ChatMessage } from "../types/chat";

const DEFAULT_SYSTEM_PROMPT = `你是一个面向前端初学者的 AI 编程助教。
回答要求：
1. 优先用中文解释。
2. 先给结论，再解释原因。
3. 代码示例使用 TypeScript。
4. 如果用户问题不清楚，先指出缺失信息。`;

// 第一阶段使用 mock 消息，让 UI 能独立开发和验收。
// 后续第二阶段会把 sendMessage 里的模拟回复替换成真实 API 调用。
const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是 Mini ChatGPT。当前是第一阶段静态 UI 版本，可以先验证消息列表、输入框和布局效果。",
    createdAt: Date.now() - 1000 * 60 * 2,
    status: "done",
  },
  {
    id: "example-user",
    role: "user",
    content: "请用一句话解释 Vue 的响应式。",
    createdAt: Date.now() - 1000 * 60,
    status: "done",
  },
  {
    id: "example-assistant",
    role: "assistant",
    content:
      "Vue 的响应式可以理解为：数据变化时，框架会自动追踪依赖并更新使用这些数据的视图。",
    createdAt: Date.now() - 1000 * 30,
    status: "done",
  },
];

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    status: "done",
  };
}

// composable 用来集中管理聊天状态。
// 组件只负责展示和触发动作，不直接关心消息数组如何变更。
export function useChat() {
  const systemPrompt = ref(DEFAULT_SYSTEM_PROMPT);
  const messages = ref<ChatMessage[]>(initialMessages);
  const draft = ref("");

  const canSend = computed(() => draft.value.trim().length > 0);

  function sendMessage() {
    const content = draft.value.trim();

    if (!content) {
      return;
    }

    messages.value.push(createMessage("user", content));
    draft.value = "";

    // 第一阶段先用同步 mock 回复验证 UI。
    // 后续接入 Streaming 时，这里会先创建一条空 assistant 消息，再逐步追加 token。
    messages.value.push(
      createMessage(
        "assistant",
        `已收到你的问题：“${content}”。下一阶段会在这里接入真实模型 API。`,
      ),
    );
  }

  function resetMessages() {
    messages.value = initialMessages;
  }

  return {
    systemPrompt,
    messages,
    draft,
    canSend,
    sendMessage,
    resetMessages,
  };
}
