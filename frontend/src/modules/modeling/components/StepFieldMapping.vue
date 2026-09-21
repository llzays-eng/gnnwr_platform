<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FieldSchema, WizardDraft } from '@shared/types';
import { percent } from '@shared/utils/format';

/**
 * 字段映射器 —— 平台中枢。
 *
 * 唯一的硬约束: 这里不允许出现任何场景判断。
 * 大气数据、房价数据、以及任何第三份数据走的都是同一条代码路径,
 * 差别只在于用户选了哪些列。
 */
const draft = defineModel<WizardDraft>({ required: true });
const props = defineProps<{ schema: readonly FieldSchema[]; badFields: Set<string> }>();

const q = ref('');
const numericFields = computed(() =>
  props.schema.filter((f) => f.kind === 'numeric' || f.kind === 'integer'));

const visible = computed(() => {
  const k = q.value.trim().toLowerCase();
  return props.schema.filter((f) => !k || f.name.toLowerCase().includes(k));
});

const used = computed(() => new Set([
  draft.value.y_column, draft.value.longitude_column,
  draft.value.latitude_column, draft.value.temporal_column,
].filter(Boolean) as string[]));

function toggleX(name: string): void {
  const arr = draft.value.x_columns;
  const i = arr.indexOf(name);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(name);
}

function moveX(i: number, d: number): void {
  const arr = draft.value.x_columns;
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}

/** 推荐: 数值列中排除 Y、坐标、时间与高缺失列，取前 6 个 */
function recommendX(): void {
  draft.value.x_columns = numericFields.value
    .filter((f) => !used.value.has(f.name) && f.missing_ratio < 0.3)
    .slice(0, 6)
    .map((f) => f.name);
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_1fr]">
    <div class="min-w-0">
      <div class="flex items-baseline justify-between">
        <span class="text-eyebrow">可用字段 {{ schema.length }}</span>
      </div>
      <ElInput v-model="q" size="small" class="mt-2" placeholder="搜索字段" clearable />
      <ul class="mt-2 max-h-80 overflow-auto rounded-sm border border-edge">
        <li v-for="f in visible" :key="f.name"
            class="flex items-center gap-2 border-b border-edge px-2 py-1.5 text-13 last:border-0"
            :class="badFields.has(f.name) ? 'bg-[color-mix(in_srgb,var(--c-alarm)_10%,transparent)]' : ''">
          <span class="min-w-0 flex-1 truncate" :title="f.name">{{ f.name }}</span>
          <span class="shrink-0 text-11 text-fg-faint">{{ f.kind === 'datetime' ? '时间' : f.kind === 'text' ? '文本' : '数值' }}</span>
          <span v-if="f.missing_ratio > 0" class="num shrink-0 text-11 text-[var(--c-ochre)]">{{ percent(f.missing_ratio, 0) }}</span>
        </li>
      </ul>
    </div>

    <div class="min-w-0 space-y-4">
      <div>
        <label class="text-eyebrow">目标变量 Y · 单选</label>
        <ElSelect v-model="draft.y_column" class="mt-1 w-full" filterable clearable placeholder="你要预测或解释的那个数值">
          <ElOption v-for="f in numericFields" :key="f.name" :label="f.name" :value="f.name" />
        </ElSelect>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label class="text-eyebrow">自变量 X · 已选 {{ draft.x_columns.length }}</label>
          <button class="text-12 underline text-fg-muted" @click="recommendX">推荐配置</button>
        </div>
        <div class="mt-1 flex flex-wrap gap-1.5 rounded-sm border border-edge p-2" style="min-height: 44px">
          <span v-if="!draft.x_columns.length" class="text-13 text-fg-faint">从下方勾选，或点「推荐配置」</span>
          <span v-for="(x, i) in draft.x_columns" :key="x"
                class="inline-flex items-center gap-1 rounded-xs border border-edge px-2 py-0.5 text-12">
            <button aria-label="上移" @click="moveX(i, -1)">↑</button>
            <button aria-label="下移" @click="moveX(i, 1)">↓</button>
            {{ x }}
            <button aria-label="移除" @click="toggleX(x)">×</button>
          </span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button v-for="f in numericFields" :key="f.name"
                  class="rounded-xs border px-2 py-0.5 text-12"
                  :class="draft.x_columns.includes(f.name) ? 'border-[var(--c-signal)] text-[var(--c-signal)]'
                    : used.has(f.name) ? 'border-edge text-fg-faint' : 'border-edge'"
                  :disabled="used.has(f.name)" @click="toggleX(f.name)">
            {{ f.name }}
          </button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <label class="text-eyebrow">经度列</label>
          <ElSelect v-model="draft.longitude_column" class="mt-1 w-full" filterable clearable size="small">
            <ElOption v-for="f in numericFields" :key="f.name" :label="f.name" :value="f.name" />
          </ElSelect>
        </div>
        <div>
          <label class="text-eyebrow">纬度列</label>
          <ElSelect v-model="draft.latitude_column" class="mt-1 w-full" filterable clearable size="small">
            <ElOption v-for="f in numericFields" :key="f.name" :label="f.name" :value="f.name" />
          </ElSelect>
        </div>
        <div>
          <label class="text-eyebrow">时间列</label>
          <ElSelect v-model="draft.temporal_column" class="mt-1 w-full" filterable clearable size="small"
                    :disabled="draft.model_type === 'GNNWR'"
                    :placeholder="draft.model_type === 'GNNWR' ? '空间模式不需要' : '必填'">
            <ElOption v-for="f in schema" :key="f.name" :label="f.name" :value="f.name" />
          </ElSelect>
        </div>
      </div>
    </div>
  </div>
</template>
