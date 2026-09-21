import type { LoginRequest, LoginResponse } from '../types';
import { FROZEN } from './endpoints';
import { post } from './http';

export const authApi = {
  /** skipAuthRedirect: 登录失败不该触发「跳登录页」 */
  login: (body: LoginRequest) =>
    post<LoginResponse>(FROZEN.login, body, { skipAuthRedirect: true }),

  /** 后端 204。失败由 store 吞掉, 本地凭据仍清除。 */
  logout: () => post<void>(FROZEN.logout, undefined, { retry: 0 }),
};
