<script setup lang="ts">
const open = defineModel<boolean>("open", { required: true });
const prompt = defineModel<string>("prompt", { required: true });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-prompt-title"
      @click.self="open = false"
    >
      <section class="flex max-h-[min(720px,92vh)] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header class="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="system-prompt-title" class="text-lg font-semibold text-slate-950">
              System Prompt 设置
            </h2>
            <p class="mt-1 text-sm text-slate-500">
              当前会话会独立保存这段系统提示词。
            </p>
          </div>

          <button
            type="button"
            class="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            @click="open = false"
          >
            关闭
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label class="sr-only" for="system-prompt">System Prompt</label>
          <textarea
            id="system-prompt"
            name="system-prompt"
            v-model="prompt"
            class="min-h-[360px] w-full resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
            spellcheck="false"
          />

          <div class="mt-4 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            <p class="font-medium text-slate-800">学习提示</p>
            <p class="mt-1">
              Prompt 应尽量明确角色、任务、输出格式和限制条件，避免互相矛盾的指令。
            </p>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
