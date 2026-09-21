<script setup lang="ts">
import StagePlaceholder from '@shared/components/StagePlaceholder.vue';
</script>
<template>
  <StagePlaceholder :stage="5" title="用户管理" :scope="['角色分配', '全局任务队列']" />
</template>
