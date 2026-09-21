<script setup lang="ts">
/**
 * 阶段占位。
 *
 * 不是"空组件", 而是明确交代: 这块归哪个阶段、届时会有什么、
 * 现在能用什么替代。空白页会让交接的人以为是 bug。
 */
defineProps<{
  stage: number;
  title: string;
  scope: string[];
  dependsOn?: string[];
}>();
</script>

<template>
  <section class="mx-auto max-w-3xl p-6">
    <p class="text-eyebrow">阶段 {{ stage }}</p>
    <h2 class="mt-1 text-25">{{ title }}</h2>
    <p class="mt-2 text-fg-muted">此模块的实现排在阶段 {{ stage }}。当前骨架已就位: 类型、API、Mock 数据均可用。</p>

    <div class="mt-6 rounded-sm border border-edge bg-[var(--s-raised)] p-4">
      <p class="text-eyebrow">届时包含</p>
      <ul class="mt-2 space-y-1 text-fg">
        <li v-for="s in scope" :key="s">— {{ s }}</li>
      </ul>
    </div>

    <div v-if="dependsOn?.length" class="mt-4 rounded-sm border border-edge p-4">
      <p class="text-eyebrow">依赖未确认的后端能力</p>
      <ul class="mt-2 space-y-1 text-fg-muted">
        <li v-for="d in dependsOn" :key="d">— {{ d }}</li>
      </ul>
    </div>
  </section>
</template>
