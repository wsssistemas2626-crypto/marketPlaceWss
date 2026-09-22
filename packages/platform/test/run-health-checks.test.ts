import { describe, expect, it } from 'vitest';

import { runHealthChecks } from '../src/health/run-health-checks.js';
import type { HealthProbe } from '../src/health/health.types.js';

const up = (name: string): HealthProbe => ({ name, check: async () => undefined });
const down = (name: string, message: string): HealthProbe => ({
  name,
  check: async () => {
    throw new Error(message);
  },
});
const hangs = (name: string): HealthProbe => ({ name, check: () => new Promise<void>(() => {}) });

describe('runHealthChecks', () => {
  it('reporta "up" quando todas as dependências respondem', async () => {
    const report = await runHealthChecks([up('database'), up('redis')]);

    expect(report.status).toBe('up');
    expect(report.checks.database?.status).toBe('up');
    expect(report.checks.redis?.status).toBe('up');
  });

  it('reporta "down" quando uma dependência falha, sem derrubar as outras', async () => {
    const report = await runHealthChecks([up('database'), down('redis', 'connection refused')]);

    expect(report.status).toBe('down');
    expect(report.checks.database?.status).toBe('up');
    expect(report.checks.redis).toMatchObject({ status: 'down', error: 'connection refused' });
  });

  it('não espera indefinidamente por uma dependência travada', async () => {
    const report = await runHealthChecks([hangs('database')], { timeoutMs: 10 });

    expect(report.status).toBe('down');
    expect(report.checks.database?.error).toContain('timeout');
  });

  it('mede a latência de cada dependência com o relógio injetado', async () => {
    let clock = 1_000;
    const report = await runHealthChecks([up('database')], {
      now: () => {
        const value = clock;
        clock += 7;
        return value;
      },
    });

    expect(report.checks.database?.latencyMs).toBe(7);
  });

  it('considera saudável um serviço sem dependências declaradas', async () => {
    const report = await runHealthChecks([]);

    expect(report).toEqual({ status: 'up', checks: {} });
  });
});
