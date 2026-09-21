<script setup lang="ts">
import { ref } from 'vue';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { isAppError, projectApi } from '@shared/api';
import { SCENARIO_LABEL, type Project, type ScenarioType } from '@shared/types';

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [Project] }>();
const qc = useQueryClient();

const name = ref('');
const desc = ref('');
const scenario = ref<ScenarioType>('air_quality');
const err = ref<string | null>(null);

const HINT: Record<ScenarioType, string> = {
  air_quality: '默认按时空模式（GTNNWR）配置，适合有逐日观测的站点数据。',
  housing_price: '默认按空间模式（GNNWR）配置，适合只有位置没有时间的截面数据。',
  custom: '不预设任何默认值，全部字段由你在建模向导里指定。',
};

const { mutate, isPending } = useMutation({
  mutationFn: () => projectApi.create({
    name: name.value.trim(),
    description: desc.value.trim(),
    scenario_type: scenario.value,
  }),
  onSuccess: async (p) => {
    await qc.invalidateQueries({ queryKey: ['projects'] });
    open.value = false;
    name.value = ''; desc.value = '';
    emit('created', p);
  },
  onError: (e) => { err.value = isAppError(e) ? e.message : '创建失败，请重试。'; },
});
</script>

<template>
  <ElDialog v-model="open" title="新建分析项目" width="480">
    <div class="space-y-3">
      <div>
        <label class="text-eyebrow">项目名称</label>
        <ElInput v-model="name" class="mt-1" placeholder="例如：长三角 PM2.5 时空反演" />
      </div>
      <div>
        <label class="text-eyebrow">描述</label>
        <ElInput v-model="desc" type="textarea" :rows="2" class="mt-1" placeholder="这个项目要回答什么问题" />
      </div>
      <div>
        <label class="text-eyebrow">场景类型</label>
        <ElSelect v-model="scenario" class="mt-1 w-full">
          <ElOption v-for="(l, k) in SCENARIO_LABEL" :key="k" :label="l" :value="k" />
        </ElSelect>
        <p class="mt-1 text-12 text-fg-muted">{{ HINT[scenario] }}</p>
        <p class="mt-1 text-11 text-fg-faint">场景类型只影响默认值与文案，不会改变字段解析方式。</p>
      </div>
      <p v-if="err" role="alert" class="text-13 text-[var(--c-alarm)]">{{ err }}</p>
    </div>
    <template #footer>
      <ElButton @click="open = false">取消</ElButton>
      <ElButton type="primary" :disabled="!name.trim()" :loading="isPending" @click="mutate()">创建项目</ElButton>
    </template>
  </ElDialog>
</template>
