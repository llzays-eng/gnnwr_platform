import type { CreateProjectRequest, Paginated, Project, ProjectId } from '../types';
import { FROZEN } from './endpoints';
import { get, post } from './http';

export const projectApi = {
  create: (body: CreateProjectRequest) => post<Project>(FROZEN.createProject, body),

  list: (params: { page?: number; page_size?: number } = {}) =>
    get<Paginated<Project>>(FROZEN.listProjects, { params }),

  detail: (id: ProjectId) => get<Project>(FROZEN.projectDetail(id)),
};
