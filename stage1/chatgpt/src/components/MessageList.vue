<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import ChatMessage from "./ChatMessage.vue";
import type { ChatMessage as ChatMessageType } from "../types/chat";

const props = defineProps<{
  messages: ChatMessageType[];
}>();

const listRef = ref<HTMLElement | null>(null);

async function scrollToBottom() {
  await nextTick();

  if (!listRef.value) {
    return;
  }

  // 聊天产品里，新消息出现后通常要自动滚动到底部。
  // 这里监听消息数量变化；后续 Streaming 时还可以监听最后一条内容变化。
  listRef.value.scrollTop = listRef.value.scrollHeight;
}

watch(() => props.messages.length, scrollToBottom, { immediate: true });
</script>

<template>
  <!-- 消息列表是唯一随对话增长滚动的主区域。父级固定高度后，这里用 min-h-0 + flex-1 承接剩余空间。 -->
  <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    <div v-if="messages.length === 0" class="flex h-full items-center justify-center text-sm text-slate-500">
      暂无消息，输入一个问题开始对话。
    </div>

    <div v-else class="space-y-5">
      <ChatMessage v-for="message in messages" :key="message.id" :message="message" />
    </div>
  </div>
</template>
