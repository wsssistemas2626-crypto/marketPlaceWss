import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import {
  TENANT_RESOLUTION_CONFIG,
  TenantContextMiddleware,
  type TenantResolutionConfig,
} from '@mkt/platform';

import { loadApiEnv } from '../env.js';
import { TenantContextController } from './tenant-context.controller.js';

/**
 * Resolução de tenant por host para as rotas do storefront (ADR-012 / US-070).
 *
 * O registro vem do módulo `tenancy` (US-075), que é global; aqui fica só o
 * middleware e a configuração de célula/edge deste processo.
 *
 * Global: a configuração da borda (segredo do edge) também decide qual IP o
 * rate limit e o consentimento enxergam (`resolveClientIp`).
 */
@Global()
@Module({
  controllers: [TenantContextController],
  providers: [
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
  exports: [TENANT_RESOLUTION_CONFIG],
})
export class StorefrontTenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // rotas com tenant vindo do host: comprador e API pública de integração
    consumer.apply(TenantContextMiddleware).forRoutes('store/*splat', 'public/*splat');
  }
}
