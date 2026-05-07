<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage } from "../types/chat";
import { formatMessageTime } from "../utils/format";
import { renderMarkdown } from "../utils/markdown";

const props = defineProps<{
  message: ChatMessage;
}>();

const isUser = props.message.role === "user";
const roleLabel = props.message.role === "user" ? "你" : "Mini ChatGPT";

const renderedContent = computed(() => renderMarkdown(props.message.content));
</script>

<template>
  <article :class="['flex gap-3', isUser ? 'justify-end' : 'justify-start']">
    <div v-if="!isUser" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-600 text-sm font-semibold text-white">
      AI
    </div>

    <div :class="['max-w-[min(720px,85%)]', isUser ? 'items-end' : 'items-start']">
      <div :class="['mb-1 flex items-center gap-2 text-xs', isUser ? 'justify-end text-slate-500' : 'text-slate-500']">
        <span>{{ roleLabel }}</span>
        <span>{{ formatMessageTime(message.createdAt) }}</span>
      </div>

      <div
        :class="[
          'rounded-lg px-4 py-3 text-sm shadow-sm',
          isUser
            ? 'bg-sky-600 text-white'
            : 'border border-slate-200 bg-slate-50 text-slate-800',
        ]"
      >
        <!-- assistant 消息支持 Markdown 和代码高亮。
             用户消息继续按纯文本展示，避免把用户输入当 HTML 解释。 -->
        <div
          v-if="message.content && !isUser"
          class="prose-message prose-message-ai"
          v-html="renderedContent"
        ></div>
        <div v-else-if="message.content" class="prose-message">{{ message.content }}</div>
        <div v-else class="flex items-center gap-1 py-1 text-slate-500">
          <span class="h-2 w-2 animate-pulse rounded-full bg-slate-400"></span>
          <span class="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:120ms]"></span>
          <span class="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:240ms]"></span>
        </div>

        <div v-if="message.status === 'streaming'" class="mt-2 text-xs opacity-70">正在生成...</div>
        <div v-if="message.status === 'error'" class="mt-2 text-xs text-red-600">生成失败，请重试。</div>
      </div>
    </div>

    <div v-if="isUser" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
      你
    </div>
  </article>
</template>
