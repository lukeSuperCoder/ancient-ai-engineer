<script setup lang="ts">
import ChatInput from "./ChatInput.vue";
import MessageList from "./MessageList.vue";
import SystemPromptPanel from "./SystemPromptPanel.vue";
import { useChat } from "../composables/useChat";

// ChatShell 是页面级组件：负责组装左侧设置区和右侧聊天区。
// 具体的数据状态放在 useChat，避免页面组件越来越臃肿。
const { systemPrompt, messages, draft, canSend, sendMessage, resetMessages } = useChat();
</script>

<template>
  <!-- h-dvh 把应用高度固定在当前视口内，避免聊天内容把整页撑高。 -->
  <main class="h-dvh overflow-hidden bg-[#f5f7fb]">
    <div class="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
      <header class="shrink-0 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-medium text-sky-700">Stage 1</p>
          <h1 class="text-2xl font-semibold text-slate-950">Mini ChatGPT</h1>
        </div>

        <button
          type="button"
          class="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          @click="resetMessages"
        >
          重置示例
        </button>
      </header>

      <!-- min-h-0 是 flex/grid 内部滚动的关键：允许子元素在固定高度里收缩。 -->
      <section class="grid min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SystemPromptPanel v-model="systemPrompt" />

        <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <MessageList :messages="messages" />

          <ChatInput v-model="draft" :can-send="canSend" @send="sendMessage" />
        </div>
      </section>
    </div>
  </main>
</template>
