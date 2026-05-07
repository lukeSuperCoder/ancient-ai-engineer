import { computed, ref } from "vue";
import type { ChatMessage } from "../types/chat";

const DEFAULT_SYSTEM_PROMPT = `你是一个面向前端初学者的 AI 编程助教。
回答要求：
1. 优先用中文解释。
2. 先给结论，再解释原因。
3. 代码示例使用 TypeScript。
4. 如果用户问题不清楚，先指出缺失信息。`;

// 第四阶段开始接入 Streaming：
// user 消息 -> assistant 占位消息 -> 请求后端流式接口 -> 持续追加文本 -> done/error。
const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是 Mini ChatGPT。当前是第四阶段 Streaming 版本，模型回复会通过流式接口逐段显示。",
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

function createMessage(
  role: ChatMessage["role"],
  content: string,
  status: ChatMessage["status"] = "done",
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    status,
  };
}

function cloneInitialMessages() {
  // reset 时重新创建数组，避免多个地方共享同一个引用。
  return initialMessages.map((message) => ({ ...message }));
}

function replaceMessageById(
  messageList: ChatMessage[],
  messageId: string,
  patch: Partial<ChatMessage>,
) {
  const messageIndex = messageList.findIndex((message) => message.id === messageId);

  if (messageIndex === -1) {
    return messageList;
  }

  // 用“替换数组元素”的方式更新消息，比直接修改对象属性更容易触发视图更新。
  // 后续 Streaming 逐段追加 token 时，也可以复用这个 helper。
  const nextMessages = [...messageList];
  nextMessages[messageIndex] = {
    ...nextMessages[messageIndex],
    ...patch,
  };

  return nextMessages;
}

function getRecentApiMessages(messageList: ChatMessage[]) {
  // 后端只需要 user/assistant 的对话历史，不需要前端 id、时间和 status。
  // 这里过滤掉占位中或失败的 assistant 消息，避免把半成品上下文发给模型。
  return messageList
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.status === "done")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
    .slice(-20);
}

function parseSseEvents(buffer: string) {
  const rawEvents = buffer.split("\n\n");
  const rest = rawEvents.pop() ?? "";

  const events = rawEvents.map((rawEvent) => {
    const eventLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("event:"));
    const dataLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("data:"));

    return {
      event: eventLine?.replace(/^event:\s*/, "") || "message",
      data: dataLine?.replace(/^data:\s*/, "") || "{}",
    };
  });

  return { events, rest };
}

async function streamChatReply(
  systemPrompt: string,
  messageList: ChatMessage[],
  onDelta: (text: string) => void,
) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemPrompt,
      messages: getRecentApiMessages(messageList),
    }),
  });

  if (!response.ok) {
    throw new Error(`API 请求失败：${response.status}`);
  }

  if (!response.body) {
    throw new Error("浏览器不支持读取流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // 通过 ReadableStream 逐块读取后端返回的 SSE 数据，解析出每个事件并调用 onDelta 更新消息内容。
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }
    // SSE 事件可能被分割成多段流式数据，需要累积到 buffer 中，直到解析出完整事件。
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      const data = JSON.parse(item.data) as { text?: string; error?: string };

      if (item.event === "delta" && data.text) {
        onDelta(data.text);
      }

      if (item.event === "error") {
        throw new Error(data.error || "流式请求失败");
      }
    }
  }
}

// composable 用来集中管理聊天状态。
// 组件只负责展示和触发动作，不直接关心消息数组如何变更。
export function useChat() {
  const systemPrompt = ref(DEFAULT_SYSTEM_PROMPT);
  const messages = ref<ChatMessage[]>(cloneInitialMessages());
  const draft = ref("");
  const isSending = ref(false);

  const isStreaming = computed(() =>
    messages.value.some((message) => message.status === "streaming"),
  );
  const canSend = computed(() => draft.value.trim().length > 0 && !isSending.value);

  async function sendMessage() {
    const content = draft.value.trim();

    if (!content || isSending.value) {
      return;
    }

    isSending.value = true;
    messages.value.push(createMessage("user", content));
    draft.value = "";

    // 先创建 assistant 占位消息；收到每个 delta 后持续追加 content。
    const assistantMessage = createMessage("assistant", "", "streaming");
    messages.value.push(assistantMessage);

    try {
      await streamChatReply(systemPrompt.value, messages.value, (delta) => {
        const currentContent =
          messages.value.find((message) => message.id === assistantMessage.id)?.content || "";

        messages.value = replaceMessageById(messages.value, assistantMessage.id, {
          content: currentContent + delta,
        });
      });

      const finalContent =
        messages.value.find((message) => message.id === assistantMessage.id)?.content || "";

      messages.value = replaceMessageById(messages.value, assistantMessage.id, {
        content: finalContent || "模型没有返回内容。",
        status: "done",
      });
    } catch (error) {
      messages.value = replaceMessageById(messages.value, assistantMessage.id, {
        status: "error",
        content:
          error instanceof Error
            ? `请求失败：${error.message}。你可以修改问题后重试。`
            : "请求失败：未知错误。你可以修改问题后重试。",
      });
    } finally {
      isSending.value = false;
    }
  }

  function resetMessages() {
    if (isSending.value) {
      return;
    }

    messages.value = cloneInitialMessages();
    draft.value = "";
  }

  return {
    systemPrompt,
    messages,
    draft,
    isSending,
    isStreaming,
    canSend,
    sendMessage,
    resetMessages,
  };
}
