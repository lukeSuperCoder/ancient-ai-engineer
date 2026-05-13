<script setup lang="ts">
import type { ChatConversation } from "../types/chat";
import { formatMessageTime } from "../utils/format";

defineProps<{
  conversations: ChatConversation[];
  activeConversationId: string;
  isSending: boolean;
}>();

const emit = defineEmits<{
  newConversation: [];
  selectConversation: [conversationId: string];
  deleteConversation: [conversationId: string];
}>();
</script>

<template>
  <aside class="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div class="border-b border-slate-200 p-4">
      <div class="mb-3">
        <h2 class="text-base font-semibold text-slate-950">历史对话</h2>
        <p class="mt-1 text-sm leading-6 text-slate-500">
          对话会保存在浏览器本地缓存中，刷新页面后仍可继续查看。
        </p>
      </div>

      <button
        type="button"
        class="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        :disabled="isSending"
        @click="emit('newConversation')"
      >
        新建对话
      </button>
    </div>

    <div class="h-full min-h-0 overflow-y-auto p-3">
      <div v-if="conversations.length === 0" class="px-2 py-8 text-center text-sm text-slate-500">
        暂无历史对话。
      </div>

      <div v-else class="space-y-2">
        <article
          v-for="conversation in conversations"
          :key="conversation.id"
          :class="[
            'group rounded-md border p-3 transition',
            conversation.id === activeConversationId
              ? 'border-sky-300 bg-sky-50'
              : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50',
          ]"
        >
          <button
            type="button"
            class="block w-full text-left"
            :disabled="isSending"
            @click="emit('selectConversation', conversation.id)"
          >
            <div class="line-clamp-2 text-sm font-medium leading-5 text-slate-900">
              {{ conversation.title }}
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{{ conversation.messages.length }} 条消息</span>
              <span>{{ formatMessageTime(conversation.updatedAt) }}</span>
            </div>
          </button>

          <button
            type="button"
            class="mt-3 text-xs font-medium text-red-600 opacity-80 transition hover:text-red-700 disabled:cursor-not-allowed disabled:text-slate-400 sm:opacity-0 sm:group-hover:opacity-100"
            :disabled="isSending"
            @click.stop="emit('deleteConversation', conversation.id)"
          >
            删除
          </button>
        </article>
      </div>
    </div>
  </aside>
</template>
