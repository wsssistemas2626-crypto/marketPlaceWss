import { Module } from '@nestjs/common';

import { IdentityModule } from '@mkt/modules-identity';
import { IntegrationsModule } from '@mkt/modules-integrations';
import { TemplateModule } from '@mkt/modules-template';

import { loadApiEnv } from './env.js';
import { HealthModule } from './health/health.module.js';
import { createWorkforceIdentity } from './identity/identity.provider.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

/**
 * Host HTTP. Os módulos de negócio (`packages/modules/*`) são registrados aqui
 * a partir da Fase 1; na Fase 0 o host existe só para provar o esqueleto.
 */
@Module({
  imports: [
    InfrastructureModule,
    PlatformModule,
    TenancyModule,
    HealthModule,
    IntegrationsModule.register({ encryptionKey: loadApiEnv().integrationsEncryptionKey }),
    IdentityModule.register({ workforceIdentity: createWorkforceIdentity(loadApiEnv()) }),
    TemplateModule,
  ],
})
export class AppModule {}
