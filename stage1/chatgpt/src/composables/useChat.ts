import { computed, ref } from "vue";
import type {
  AgentStep,
  AgentStructuredResult,
  AgentThought,
  ChatConversation,
  ChatMessage,
  ChatMode,
} from "../types/chat";

const STORAGE_KEY = "mini-chatgpt.conversations.v1";

const DEFAULT_SYSTEM_PROMPT = `你是一个面向前端初学者的 AI 编程助教。
回答要求：
1. 优先用中文解释。
2. 先给结论，再解释原因。
3. 代码示例使用 TypeScript。
4. 如果用户问题不清楚，先指出缺失信息。`;

const stageWelcomeMessage = "你好，我是 Mini ChatGPT。有什么问题都可以问我，左侧可以管理历史对话，System Prompt 通过顶部按钮设置。";

const sampleMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: stageWelcomeMessage,
    createdAt: Date.now() - 1000 * 60 * 2,
    status: "done",
  }
];

type AgentStreamPayload =
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
      structured: AgentStructuredResult;
    };

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

function cloneMessages(messages: ChatMessage[]) {
  // 复制消息对象，避免默认示例和真实会话共享同一批引用。
  return messages.map((message) => ({ ...message }));
}

function createConversation(
  title = "新对话",
  messages: ChatMessage[] = [createMessage("assistant", stageWelcomeMessage)],
): ChatConversation {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    title,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    messages: cloneMessages(messages),
    createdAt: now,
    updatedAt: now,
  };
}

function createSampleConversation() {
  return createConversation("Vue 响应式示例", sampleMessages);
}

function safeReadConversations() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return [createSampleConversation()];
    }

    const parsed = JSON.parse(rawValue) as ChatConversation[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createSampleConversation()];
    }

    // 做一层轻量校验，避免 localStorage 被手动改坏后导致页面直接崩溃。
    return parsed
      .filter((conversation) => conversation.id && Array.isArray(conversation.messages))
      .map((conversation) => ({
        ...conversation,
        systemPrompt: conversation.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        title: conversation.title || "未命名对话",
      }));
  } catch {
    return [createSampleConversation()];
  }
}

function saveConversations(conversations: ChatConversation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
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

async function streamAgentReply(
  systemPrompt: string,
  messageList: ChatMessage[],
  onEvent: (payload: AgentStreamPayload) => void,
) {
  const response = await fetch("/api/agent/stream", {
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
    throw new Error(`Agent Stream API 请求失败：${response.status}`);
  }

  if (!response.body) {
    throw new Error("浏览器不支持读取 Agent 流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      const data = JSON.parse(item.data) as AgentStreamPayload | { error?: string };

      if (item.event === "error") {
        throw new Error("error" in data ? data.error || "Agent 流式请求失败" : "Agent 流式请求失败");
      }

      if (
        item.event === "thinking" ||
        item.event === "step" ||
        item.event === "delta" ||
        item.event === "structured"
      ) {
        onEvent(data as AgentStreamPayload);
      }
    }
  }
}

function inferConversationTitle(messages: ChatMessage[], fallback: string) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return fallback;
  }

  return firstUserMessage.content.slice(0, 18) || fallback;
}

// composable 用来集中管理聊天状态。
// 第五阶段新增“会话列表”后，组件仍然只触发动作，不直接写 localStorage。
export function useChat() {
  const conversations = ref<ChatConversation[]>(safeReadConversations());
  const activeConversationId = ref(conversations.value[0]?.id ?? "");
  const draft = ref("");
  const isSending = ref(false);
  const chatMode = ref<ChatMode>("chat");

  const activeConversation = computed(
    () =>
      conversations.value.find(
        (conversation) => conversation.id === activeConversationId.value,
      ) ?? conversations.value[0],
  );

  const messages = computed(() => activeConversation.value?.messages ?? []);

  const systemPrompt = computed({
    get() {
      return activeConversation.value?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    },
    set(value: string) {
      updateActiveConversation({
        systemPrompt: value,
      });
    },
  });

  const conversationSummaries = computed(() =>
    [...conversations.value].sort((left, right) => right.updatedAt - left.updatedAt),
  );

  const isStreaming = computed(() =>
    messages.value.some((message) => message.status === "streaming"),
  );
  const canSend = computed(() => draft.value.trim().length > 0 && !isSending.value);

  function persist() {
    saveConversations(conversations.value);
  }

  function updateConversation(
    conversationId: string,
    patch: Partial<ChatConversation>,
    shouldPersist = true,
  ) {
    conversations.value = conversations.value.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            ...patch,
            updatedAt: patch.updatedAt ?? Date.now(),
          }
        : conversation,
    );

    if (shouldPersist) {
      persist();
    }
  }

  function updateActiveConversation(patch: Partial<ChatConversation>, shouldPersist = true) {
    if (!activeConversation.value) {
      return;
    }

    updateConversation(activeConversation.value.id, patch, shouldPersist);
  }

  function setActiveMessages(nextMessages: ChatMessage[], shouldPersist = true) {
    const currentTitle = activeConversation.value?.title ?? "新对话";
    const nextTitle =
      currentTitle === "新对话"
        ? inferConversationTitle(nextMessages, currentTitle)
        : currentTitle;

    updateActiveConversation(
      {
        messages: nextMessages,
        title: nextTitle,
      },
      shouldPersist,
    );
  }

  function createNewConversation() {
    if (isSending.value) {
      return;
    }

    const conversation = createConversation();
    conversations.value = [conversation, ...conversations.value];
    activeConversationId.value = conversation.id;
    draft.value = "";
    persist();
  }

  function selectConversation(conversationId: string) {
    if (isSending.value) {
      return;
    }

    activeConversationId.value = conversationId;
    draft.value = "";
  }

  function deleteConversation(conversationId: string) {
    if (isSending.value) {
      return;
    }

    const nextConversations = conversations.value.filter(
      (conversation) => conversation.id !== conversationId,
    );

    conversations.value =
      nextConversations.length > 0 ? nextConversations : [createConversation()];

    if (!conversations.value.some((conversation) => conversation.id === activeConversationId.value)) {
      activeConversationId.value = conversations.value[0].id;
    }

    draft.value = "";
    persist();
  }

  async function sendMessage() {
    const content = draft.value.trim();
    const activeId = activeConversation.value?.id;

    if (!content || isSending.value || !activeId) {
      return;
    }

    isSending.value = true;

    const currentMode = chatMode.value;
    const userMessage = {
      ...createMessage("user", content),
      mode: currentMode,
    };
    const assistantMessage = {
      ...createMessage("assistant", "", "streaming"),
      mode: currentMode,
    };
    const nextMessages = [...messages.value, userMessage, assistantMessage];

    setActiveMessages(nextMessages);
    draft.value = "";

    try {
      if (currentMode === "agent") {
        await streamAgentReply(systemPrompt.value, nextMessages, (payload) => {
          const targetConversation = conversations.value.find(
            (conversation) => conversation.id === activeId,
          );
          const currentMessages = targetConversation?.messages ?? [];
          const currentAssistant = currentMessages.find(
            (message) => message.id === assistantMessage.id,
          );
          const currentAgent = currentAssistant?.agent ?? {
            steps: [],
            thoughts: [],
          };

          if (payload.type === "thinking") {
            updateConversation(
              activeId,
              {
                messages: replaceMessageById(currentMessages, assistantMessage.id, {
                  agent: {
                    ...currentAgent,
                    thoughts: [...(currentAgent.thoughts ?? []), payload.thought],
                  },
                }),
              },
              false,
            );
          }

          if (payload.type === "step") {
            updateConversation(
              activeId,
              {
                messages: replaceMessageById(currentMessages, assistantMessage.id, {
                  agent: {
                    ...currentAgent,
                    steps: [...currentAgent.steps, payload.step],
                  },
                }),
              },
              false,
            );
          }

          if (payload.type === "delta") {
            updateConversation(
              activeId,
              {
                messages: replaceMessageById(currentMessages, assistantMessage.id, {
                  content: `${currentAssistant?.content ?? ""}${payload.text}`,
                  agent: currentAgent,
                }),
              },
              false,
            );
          }

          if (payload.type === "structured") {
            updateConversation(
              activeId,
              {
                messages: replaceMessageById(currentMessages, assistantMessage.id, {
                  agent: {
                    ...currentAgent,
                    structured: payload.structured,
                  },
                }),
              },
              false,
            );
          }
        });

        const finalMessages =
          conversations.value.find((conversation) => conversation.id === activeId)?.messages ?? [];
        const finalContent =
          finalMessages.find((message) => message.id === assistantMessage.id)?.content || "";

        updateConversation(activeId, {
          messages: replaceMessageById(finalMessages, assistantMessage.id, {
            content: finalContent || "Agent 没有返回内容。",
            status: "done",
          }),
        });

        return;
      }

      await streamChatReply(systemPrompt.value, nextMessages, (delta) => {
        const targetConversation = conversations.value.find(
          (conversation) => conversation.id === activeId,
        );
        const currentMessages = targetConversation?.messages ?? [];
        const currentContent =
          currentMessages.find((message) => message.id === assistantMessage.id)?.content || "";

        updateConversation(
          activeId,
          {
            messages: replaceMessageById(currentMessages, assistantMessage.id, {
              content: currentContent + delta,
            }),
          },
          false,
        );
      });

      const finalMessages =
        conversations.value.find((conversation) => conversation.id === activeId)?.messages ?? [];
      const finalContent =
        finalMessages.find((message) => message.id === assistantMessage.id)?.content || "";

      updateConversation(activeId, {
        messages: replaceMessageById(finalMessages, assistantMessage.id, {
          content: finalContent || "模型没有返回内容。",
          status: "done",
        }),
      });
    } catch (error) {
      const currentMessages =
        conversations.value.find((conversation) => conversation.id === activeId)?.messages ?? [];

      updateConversation(activeId, {
        messages: replaceMessageById(currentMessages, assistantMessage.id, {
          status: "error",
          content:
            error instanceof Error
              ? `请求失败：${error.message}。你可以修改问题后重试。`
              : "请求失败：未知错误。你可以修改问题后重试。",
        }),
      });
    } finally {
      isSending.value = false;
    }
  }

  function resetMessages() {
    if (isSending.value) {
      return;
    }

    setActiveMessages(cloneMessages(sampleMessages));
    updateActiveConversation({
      title: "Vue 响应式示例",
    });
    draft.value = "";
  }

  return {
    systemPrompt,
    chatMode,
    conversations: conversationSummaries,
    activeConversationId,
    messages,
    draft,
    isSending,
    isStreaming,
    canSend,
    createNewConversation,
    selectConversation,
    deleteConversation,
    sendMessage,
    resetMessages,
  };
}
