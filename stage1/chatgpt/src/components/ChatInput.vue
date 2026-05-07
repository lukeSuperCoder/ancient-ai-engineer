<script setup lang="ts">
const model = defineModel<string>({ required: true });

defineProps<{
  canSend: boolean;
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

      <textarea
        id="chat-input"
        v-model="model"
        rows="3"
        class="min-h-24 flex-1 resize-none rounded-md border border-slate-300 px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        placeholder="输入你的问题，Enter 发送，Shift + Enter 换行"
        @keydown="handleKeydown"
      />

      <button
        type="submit"
        class="h-11 rounded-md bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        :disabled="!canSend"
      >
        发送
      </button>
    </div>
  </form>
</template>
