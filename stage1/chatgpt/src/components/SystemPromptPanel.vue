<script setup lang="ts">
// v-model 在子组件里会被编译为 modelValue + update:modelValue。
// defineModel 是 Vue3.4+ 的简洁写法，适合这种表单类组件。
const model = defineModel<string>({ required: true });
</script>

<template>
  <aside class="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div class="mb-3">
      <h2 class="text-base font-semibold text-slate-950">System Prompt</h2>
      <p class="mt-1 text-sm leading-6 text-slate-500">
        这里保存机器人长期规则。后续接入 API 时，会把它提交给后端并映射为高优先级指令。
      </p>
    </div>

    <textarea
      v-model="model"
      class="min-h-[360px] w-full resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
      spellcheck="false"
    />

    <div class="mt-4 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
      <p class="font-medium text-slate-800">学习提示</p>
      <p class="mt-1">
        Prompt 应尽量明确角色、任务、输出格式和限制条件，避免互相矛盾的指令。
      </p>
    </div>
  </aside>
</template>
