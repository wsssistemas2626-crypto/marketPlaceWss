import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';

/**
 * Host HTTP. Os módulos de negócio (`packages/modules/*`) são registrados aqui
 * a partir da Fase 1; na Fase 0 o host existe só para provar o esqueleto.
 */
@Module({
  imports: [InfrastructureModule, HealthModule],
})
export class AppModule {}
