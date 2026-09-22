import { Controller, Get, Res } from '@nestjs/common';

import type { HealthReport } from '@mkt/platform';

import { HealthService } from './health.service.js';

/** Resposta HTTP mínima de que precisamos — evita acoplar o controller ao Express. */
interface StatusCarrier {
  status(code: number): unknown;
}

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(@Res({ passthrough: true }) response: StatusCarrier): Promise<HealthReport> {
    const report = await this.health.check();
    response.status(report.status === 'up' ? 200 : 503);
    return report;
  }
}
