import { describe, expect, it, vi } from 'vitest';

import type { HealthReport } from '@mkt/platform';

import { HealthController } from '../src/health/health.controller.js';
import type { HealthService } from '../src/health/health.service.js';

function controllerFor(report: HealthReport) {
  const service = { check: async () => report } as HealthService;
  return new HealthController(service);
}

describe('HealthController', () => {
  it('responde 200 com o relatório quando tudo está no ar', async () => {
    const report: HealthReport = {
      status: 'up',
      checks: { database: { status: 'up', latencyMs: 3 }, redis: { status: 'up', latencyMs: 1 } },
    };
    const response = { status: vi.fn() };

    const body = await controllerFor(report).get(response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(body).toEqual(report);
  });

  it('responde 503 quando uma dependência está fora', async () => {
    const report: HealthReport = {
      status: 'down',
      checks: { database: { status: 'up', latencyMs: 3 }, redis: { status: 'down', latencyMs: 2_000 } },
    };
    const response = { status: vi.fn() };

    const body = await controllerFor(report).get(response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(body.checks.redis?.status).toBe('down');
  });
});
