import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';

/**
 * Host de jobs. Consumidores de fila, outbox relay e jobs agendados entram
 * a partir da US-005; na Fase 0 o processo existe para provar o esqueleto.
 */
@Module({
  imports: [InfrastructureModule, HealthModule],
})
export class AppModule {}
