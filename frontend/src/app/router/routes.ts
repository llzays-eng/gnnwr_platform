import type { RouteRecordRaw } from 'vue-router';
import type { UserRole } from '@shared/types';

declare module 'vue-router' {
  interface RouteMeta {
    /** 进入所需的最低角色。缺省为 guest。 */
    minRole?: UserRole;
    /** 阶段轨上的节点序号, 1~5。非阶段页面为 undefined。 */
    stage?: 1 | 2 | 3 | 4 | 5;
    title?: string;
  }
}

/**
 * 路由即信息架构。
 *
 * 注意这里【没有】全局功能菜单对应的路由(数据管理/模型管理/可视化/系统设置)。
 * 导航被降级成项目内的 5 节点阶段轨, 因为产品本质是流水线:
 * 用户需要导航回答的是"我在第几步、下一步能不能走", 功能树一个都答不了。
 * 详见阶段 0 设计方案 §8.1。
 */
export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/projects' },

  {
    path: '/login',
    name: 'login',
    component: () => import('@modules/project/views/LoginView.vue'),
    meta: { title: '登录' },
  },

  {
    path: '/projects',
    name: 'projects',
    component: () => import('@modules/project/views/ProjectListView.vue'),
    meta: { title: '项目库' },
  },

  {
    path: '/p/:projectId',
    component: () => import('@modules/project/views/WorkbenchShell.vue'),
    props: true,
    children: [
      { path: '', redirect: (to) => `/p/${String(to.params['projectId'])}/data` },
      {
        path: 'data', name: 'stage.data', meta: { stage: 1, title: '数据接入' },
        component: () => import('@modules/dataset/views/DatasetView.vue'),
      },
      {
        path: 'model', name: 'stage.model', meta: { stage: 2, title: '建模向导', minRole: 'user' },
        component: () => import('@modules/modeling/views/WizardView.vue'),
      },
      {
        path: 'runs', name: 'stage.runs', meta: { stage: 3, title: '训练监控' },
        component: () => import('@modules/monitor/views/RunListView.vue'),
      },
      {
        path: 'runs/:taskId', name: 'stage.run', meta: { stage: 3, title: '训练监控' },
        component: () => import('@modules/monitor/views/RunDetailView.vue'), props: true,
      },
      {
        path: 'explore/:taskId', name: 'stage.explore', meta: { stage: 4, title: '解读看板' },
        component: () => import('@modules/dashboard/views/DashboardView.vue'), props: true,
      },
      {
        path: 'reports', name: 'stage.reports', meta: { stage: 5, title: '报告' },
        component: () => import('@modules/project/views/ReportsView.vue'),
      },
    ],
  },

  {
    path: '/admin/users', name: 'admin.users', meta: { minRole: 'admin', title: '用户管理' },
    component: () => import('@modules/project/views/AdminUsersView.vue'),
  },

  { path: '/403', name: 'forbidden', component: () => import('@modules/project/views/ForbiddenView.vue') },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('@modules/project/views/NotFoundView.vue') },
];
