import type { IsoDateTime, UserId } from './brand';

/** 三级角色。权限判定一律用 hasRole(), 不要在组件里比较字符串。 */
export type UserRole = 'guest' | 'user' | 'admin';

/** 数字越大权限越高, 用于 >= 比较 */
export const ROLE_RANK: Readonly<Record<UserRole, number>> = Object.freeze({
  guest: 0,
  user: 1,
  admin: 2,
});

export interface UserProfile {
  readonly id: UserId;
  readonly username: string;
  readonly display_name: string;
  readonly role: UserRole;
  readonly created_at: IsoDateTime;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * POST /api/v1/auth/login 的响应。
 * expires_in 单位为秒 —— 按 OAuth2 惯例。
 * 刷新流程当前前端未接入，策略仍是过期即跳登录。
 */
export interface LoginResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly user: UserProfile;
}
