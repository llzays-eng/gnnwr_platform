import type { Router } from 'vue-router';
import { ROLE_RANK } from '@shared/types';
import { useAuthStore } from '@stores/index';

export function installGuards(router: Router): void {
  router.beforeEach((to) => {
    const auth = useAuthStore();
    const need = to.meta.minRole ?? 'guest';

    if (ROLE_RANK[auth.role] >= ROLE_RANK[need]) return true;

    // 游客访问需要登录的页面 → 去登录并记住来路
    if (!auth.isAuthed) return { name: 'login', query: { redirect: to.fullPath } };

    // 已登录但角色不够 → 403。
    // 不静默重定向到首页: 用户需要知道"是权限不够", 而不是以为页面不存在。
    return { name: 'forbidden' };
  });

  router.afterEach((to) => {
    const t = to.meta.title;
    document.title = t ? `${t} · GNNWR 平台` : 'GNNWR 时空智能分析平台';
  });
}
