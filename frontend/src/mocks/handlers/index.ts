import { authHandlers } from './auth';
import { projectHandlers } from './project';
import { datasetHandlers } from './dataset';
import { modelHandlers } from './model';
import { spatialHandlers } from './spatial';
import { reportHandlers } from './report';

export const handlers = [
  ...authHandlers,
  ...projectHandlers,
  ...datasetHandlers,
  ...modelHandlers,
  ...spatialHandlers,
  ...reportHandlers,
];
