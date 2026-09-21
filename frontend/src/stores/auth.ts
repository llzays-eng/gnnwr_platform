import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi, installAuthHooks } from '@shared/api';
import { ROLE_RANK, type LoginRequest, type UserProfile, type UserRole } from '@shared/types';

const TOKEN_KEY = 'gnnwr:token';
const USER_KEY = 'gnnwr:user';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<UserProfile | null>(
    (() => { try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as UserProfile | null; } catch { return null; } })(),
  );
  const pending = ref(false);

  /** 未登录即游客。游客不是"没有角色", 而是一个真实角色 —— 能看演示项目。 */
  const role = computed<UserRole>(() => user.value?.role ?? 'guest');
  const isAuthed = computed(() => token.value !== null);

  const can = (min: UserRole): boolean => ROLE_RANK[role.value] >= ROLE_RANK[min];

  async function login(body: LoginRequest): Promise<void> {
    pending.value = true;
    try {
      const res = await authApi.login(body);
      token.value = res.access_token;
      user.value = res.user;
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } finally {
      pending.value = false;
    }
  }

  function clear(): void {
    token.value = null;
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /** 优先调用后端 logout；网络失败不影响本地凭据清除。 */
  async function logout(): Promise<void> {
    try { await authApi.logout(); } catch { /* 网络/服务异常时也要确保本地退出 */ }
    clear();
  }

  return { token, user, role, isAuthed, pending, can, login, logout, clear };
});

/**
 * 把鉴权钩子注入 http 层。
 * 在 main.ts 里 Pinia 装好之后调用一次。
 * 这样 http.ts 不需要 import store, 避免循环依赖。
 */
export function bindAuthToHttp(onUnauthorized: () => void): void {
  const store = useAuthStore();
  installAuthHooks({
    getToken: () => store.token,
    onUnauthorized: () => { store.clear(); onUnauthorized(); },
  });
}
