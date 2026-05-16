<script setup lang="ts">
const model = defineModel<string>({ required: true });

defineProps<{
  canSend: boolean;
  isSending: boolean;
  isStreaming: boolean;
  mode: "chat" | "agent" | "kb";
}>();

const emit = defineEmits<{
  send: [];
}>();

function handleKeydown(event: KeyboardEvent) {
  // 聊天输入常见约定：Enter 发送，Shift + Enter 换行。
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    emit("send");
  }
}
</script>

<template>
  <form class="border-t border-slate-200 bg-white p-4" @submit.prevent="emit('send')">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label class="sr-only" for="chat-input">输入消息</label>

      <div class="flex-1">
        <textarea
          id="chat-input"
          v-model="model"
          rows="3"
          class="min-h-24 w-full resize-none rounded-md border border-slate-300 px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          placeholder="输入你的问题，Enter 发送，Shift + Enter 换行"
          :disabled="isSending"
          @keydown="handleKeydown"
        />

        <!-- 第二阶段开始区分“发送中”和“生成中”，后续接真实 API 时会继续沿用这两个状态。 -->
        <p class="mt-2 h-5 text-xs text-slate-500">
          <span v-if="isStreaming && mode === 'chat'">正在流式生成回复...</span>
          <span v-else-if="isSending && mode === 'agent'">Agent 正在决策并调用工具...</span>
          <span v-else-if="isSending && mode === 'kb'">正在检索知识库并生成回答...</span>
          <span v-else-if="isSending">正在发送...</span>
          <span v-else-if="mode === 'agent'">Agent 模式会自动选择工具，并在右侧展示执行日志。</span>
          <span v-else-if="mode === 'kb'">知识库模式会从《三国演义》中检索相关段落并生成回答，回答会标注出处和原文。</span>
          <span v-else>第五阶段已支持历史对话缓存，回复会继续流式显示。</span>
        </p>
      </div>

      <button
        type="submit"
        class="h-11 rounded-md bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        :disabled="!canSend"
      >
        {{ isSending ? "发送中" : "发送" }}
      </button>
    </div>
  </form>
</template>
