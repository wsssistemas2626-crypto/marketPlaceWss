import { Module } from '@nestjs/common';

import { TemplateModule } from '@mkt/modules-template';

import { HealthModule } from './health/health.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

/**
 * Host HTTP. Os módulos de negócio (`packages/modules/*`) são registrados aqui
 * a partir da Fase 1; na Fase 0 o host existe só para provar o esqueleto.
 */
@Module({
  imports: [InfrastructureModule, TenancyModule, HealthModule, TemplateModule],
})
export class AppModule {}
