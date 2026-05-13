<script setup lang="ts">
import type { AgentStep, AgentStructuredResult, AgentThought } from "../types/chat";

defineProps<{
  steps: AgentStep[];
  thoughts: AgentThought[];
  structured?: AgentStructuredResult;
}>();

function formatJson(value: unknown) {
  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}
</script>

<template>
  <aside class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div class="shrink-0 border-b border-slate-200 px-4 py-3">
      <h2 class="text-sm font-semibold text-slate-950">Agent 执行日志</h2>
      <p class="mt-1 text-xs text-slate-500">{{ thoughts.length }} 条过程 · {{ steps.length }} 个步骤</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div v-if="steps.length === 0 && thoughts.length === 0" class="flex h-full items-center justify-center text-sm text-slate-500">
        Agent 模式回复后会显示工具调用过程。
      </div>

      <div v-else class="space-y-3">
        <section v-if="thoughts.length > 0" class="rounded-md border border-sky-100 bg-sky-50 p-3">
          <h3 class="text-sm font-semibold text-slate-900">Thinking</h3>
          <ol class="mt-2 space-y-2 text-xs leading-5 text-slate-700">
            <li v-for="thought in thoughts" :key="thought.id" class="flex gap-2">
              <span class="shrink-0 text-sky-700">{{ thought.index }}.</span>
              <span>{{ thought.text }}</span>
            </li>
          </ol>
        </section>

        <section
          v-for="step in steps"
          :key="`${step.index}-${step.id}`"
          class="rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Step {{ step.index }} · {{ step.type === "model" ? "Model" : "Tool" }}
              </p>
              <h3 class="mt-1 text-sm font-semibold text-slate-900">
                {{ step.name || (step.type === "model" ? "模型决策" : "工具调用") }}
              </h3>
            </div>
            <span class="shrink-0 rounded bg-white px-2 py-1 text-xs text-slate-500">
              {{ step.durationMs }}ms
            </span>
          </div>

          <p v-if="step.error" class="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {{ step.error }}
          </p>

          <details class="mt-3 text-xs text-slate-700">
            <summary class="cursor-pointer font-medium text-slate-600">输入参数</summary>
            <pre class="mt-2 max-h-48 overflow-auto rounded bg-white p-2 text-[11px] leading-5">{{ formatJson(step.input) }}</pre>
          </details>

          <details class="mt-2 text-xs text-slate-700">
            <summary class="cursor-pointer font-medium text-slate-600">输出结果</summary>
            <pre class="mt-2 max-h-56 overflow-auto rounded bg-white p-2 text-[11px] leading-5">{{ formatJson(step.output) }}</pre>
          </details>
        </section>

        <section v-if="structured" class="rounded-md border border-slate-200 bg-white p-3">
          <h3 class="text-sm font-semibold text-slate-900">Structured Output</h3>
          <pre class="mt-2 max-h-72 overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-5 text-slate-700">{{ formatJson(structured) }}</pre>
        </section>
      </div>
    </div>
  </aside>
</template>
