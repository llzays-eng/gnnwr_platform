import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { handlers } from './handlers';

/** 与浏览器共用同一套 handler —— 这是选 MSW 的主要理由。 */
export const server = setupServer(...handlers);

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); });
afterAll(() => { server.close(); });
