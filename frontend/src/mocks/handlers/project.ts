import { http } from 'msw';
import { FROZEN } from '@shared/api/endpoints';
import type { CreateProjectRequest, Paginated, Project, ProjectId } from '@shared/types';
import { asId, asIso } from '@shared/types';
import { DEMO_USER, db } from '../db';
import { fail, lag, ok } from './_util';

export const projectHandlers = [
  http.post(FROZEN.createProject, async ({ request }) => {
    await lag();
    const body = (await request.json()) as CreateProjectRequest;
    if (!body.name?.trim()) return fail(422, '项目名称不能为空。');
    const now = asIso(new Date().toISOString());
    const p: Project = {
      id: asId<ProjectId>(db.nextId('p')),
      name: body.name.trim(),
      description: body.description ?? '',
      scenario_type: body.scenario_type,
      owner_id: DEMO_USER.id,
      created_at: now,
      updated_at: now,
      is_demo: false,
    };
    db.projects.unshift(p);
    return ok(p);
  }),

  // list / detail 已解冻(协商清单 #9)
  http.get(FROZEN.listProjects, async () => {
    await lag();
    const res: Paginated<Project> = {
      items: db.projects, total: db.projects.length, page: 1, page_size: 50,
    };
    return ok(res);
  }),

  http.get(FROZEN.projectDetail(':id'), async ({ params }) => {
    await lag();
    const p = db.projects.find((x) => x.id === params['id']);
    return p ? ok(p) : fail(404, '项目不存在或已被删除。');
  }),
];
