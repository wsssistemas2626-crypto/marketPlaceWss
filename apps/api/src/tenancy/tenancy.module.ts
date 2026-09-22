import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import {
  DEVELOPMENT_TENANTS,
  InMemoryTenantDirectory,
  TENANT_DIRECTORY,
  TENANT_RESOLUTION_CONFIG,
  TenantContextMiddleware,
  type TenantResolutionConfig,
} from '@mkt/platform';

import { loadApiEnv } from '../env.js';
import { TenantContextController } from './tenant-context.controller.js';

/**
 * Resolução de tenant por host (ADR-012 / US-070).
 *
 * O registro em memória vale até a US-075 trazer o módulo `tenancy` com banco
 * e cache; trocar a implementação é trocar este provider.
 */
// global: o registro de tenants é consultado por qualquer módulo que precise
// resolver um tenant (identity, jobs), não só pelas rotas do storefront
@Global()
@Module({
  controllers: [TenantContextController],
  providers: [
    { provide: TENANT_DIRECTORY, useFactory: () => new InMemoryTenantDirectory(DEVELOPMENT_TENANTS) },
    {
      provide: TENANT_RESOLUTION_CONFIG,
      useFactory: (): TenantResolutionConfig => {
        const env = loadApiEnv();
        return env.edgeSharedSecret === undefined
          ? { cell: env.cell }
          : { cell: env.cell, edgeSharedSecret: env.edgeSharedSecret };
      },
    },
  ],
  exports: [TENANT_DIRECTORY, TENANT_RESOLUTION_CONFIG],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // rotas com tenant vindo do host: comprador e API pública de integração
    consumer.apply(TenantContextMiddleware).forRoutes('store/*splat', 'public/*splat');
  }
}
