<script setup lang="ts">
import type { FieldSchema } from '@shared/types';
import { num, percent } from '@shared/utils/format';

defineProps<{ schema: readonly FieldSchema[] }>();

const KIND: Record<string, string> = {
  numeric: '数值', integer: '整数', text: '文本', datetime: '时间', boolean: '布尔', unknown: '未知',
};
</script>

<template>
  <div class="overflow-hidden rounded-sm border border-edge">
    <table class="w-full text-13" style="table-layout: fixed">
      <thead>
        <tr class="border-b border-edge bg-[var(--s-inset)] text-left">
          <th class="px-3 py-2 font-normal text-fg-muted">字段</th>
          <th class="w-16 px-2 py-2 font-normal text-fg-muted">类型</th>
          <th class="w-20 px-2 py-2 text-right font-normal text-fg-muted">缺失</th>
          <th class="w-36 px-2 py-2 text-right font-normal text-fg-muted">范围</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in schema" :key="f.name" class="border-b border-edge last:border-0">
          <td class="truncate px-3 py-1.5" :title="f.name">{{ f.name }}</td>
          <td class="px-2 py-1.5 text-fg-muted">{{ KIND[f.kind] }}</td>
          <td class="num px-2 py-1.5 text-right"
              :class="f.missing_ratio > 0.2 ? 'text-[var(--c-ochre)]' : 'text-fg-muted'">
            {{ f.missing_ratio > 0 ? percent(f.missing_ratio, 0) : '—' }}
          </td>
          <td class="num px-2 py-1.5 text-right text-fg-muted">
            {{ f.stats ? `${num(f.stats.min, 1)} ~ ${num(f.stats.max, 1)}` : '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
