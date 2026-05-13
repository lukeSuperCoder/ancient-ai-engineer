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
const agentStepSummary = computed(() => {
  const steps = props.message.agent?.steps ?? [];
  const toolSteps = steps.filter((step) => step.type === "tool");

  return {
    total: steps.length,
    tools: toolSteps.map((step) => step.name).filter(Boolean),
    hasError: toolSteps.some((step) => step.error),
  };
});
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

        <details
          v-if="message.agent?.steps?.length || message.agent?.thoughts?.length"
          class="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 xl:hidden"
        >
          <summary class="cursor-pointer font-medium text-slate-700">
            Agent 执行日志 · {{ agentStepSummary.total }} 步
            <span v-if="agentStepSummary.hasError" class="text-red-600"> · 有工具错误</span>
          </summary>

          <div class="mt-2 space-y-2">
            <div v-if="message.agent.thoughts?.length" class="rounded bg-sky-50 px-2 py-2">
              <p class="font-medium text-slate-700">Thinking</p>
              <ol class="mt-1 space-y-1">
                <li v-for="thought in message.agent.thoughts" :key="thought.id">
                  {{ thought.index }}. {{ thought.text }}
                </li>
              </ol>
            </div>

            <div
              v-for="step in message.agent.steps"
              :key="`${step.index}-${step.id}`"
              class="rounded bg-slate-50 px-2 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-slate-700">
                  Step {{ step.index }} · {{ step.name || (step.type === "model" ? "模型决策" : "工具调用") }}
                </span>
                <span>{{ step.durationMs }}ms</span>
              </div>
              <p v-if="step.error" class="mt-1 text-red-600">{{ step.error }}</p>
            </div>
          </div>
        </details>
      </div>
    </div>

    <div v-if="isUser" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
      你
    </div>
  </article>
</template>
