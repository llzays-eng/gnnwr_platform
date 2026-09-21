import { http } from 'msw';
import { FROZEN } from '@shared/api/endpoints';
import type { LoginRequest, LoginResponse } from '@shared/types';
import { ADMIN_USER, DEMO_USER } from '../db';
import { fail, lag, ok } from './_util';

export const authHandlers = [
  http.post(FROZEN.login, async ({ request }) => {
    await lag(300, 700);
    const body = (await request.json()) as LoginRequest;
    // demo/demo 与 admin/admin。密码错误要能演示错误态。
    const user = body.username === 'admin' ? ADMIN_USER : DEMO_USER;
    if (body.password !== body.username) {
      return fail(401, '用户名或密码不正确。演示环境可用 demo / demo 登录。');
    }
    const res: LoginResponse = {
      access_token: `mock.${user.id}.${Date.now()}`,
      token_type: 'Bearer',
      expires_in: 7200,
      user,
    };
    return ok(res);
  }),

  http.post(FROZEN.logout, async () => ok(null)),
];
