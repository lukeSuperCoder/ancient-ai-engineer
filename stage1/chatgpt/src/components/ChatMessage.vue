<script setup lang="ts">
import type { ChatMessage } from "../types/chat";
import { formatMessageTime } from "../utils/format";

const props = defineProps<{
  message: ChatMessage;
}>();

const isUser = props.message.role === "user";
const roleLabel = props.message.role === "user" ? "你" : "Mini ChatGPT";
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
        <!-- 第一阶段用纯文本展示。
             后续 Markdown 阶段会把这里替换成安全清洗后的 v-html。 -->
        <div class="prose-message">{{ message.content }}</div>

        <div v-if="message.status === 'streaming'" class="mt-2 text-xs opacity-70">正在生成...</div>
        <div v-if="message.status === 'error'" class="mt-2 text-xs text-red-600">生成失败，请重试。</div>
      </div>
    </div>

    <div v-if="isUser" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
      你
    </div>
  </article>
</template>
