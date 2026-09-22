import { Global, Module } from '@nestjs/common';

import { CONFIG_SOURCE, DATABASE_POOL, TENANT_DIRECTORY, type DatabasePool } from '@mkt/platform';

import { TENANT_REGISTRY } from './application/tenant-registry.js';
import { PlatformTenantsController } from './http/platform-tenants.controller.js';
import { DbConfigSource } from './infrastructure/db-config-source.js';
import { DbTenantDirectory } from './infrastructure/db-tenant-directory.js';
import { DrizzleTenantRegistry } from './infrastructure/drizzle-tenant-registry.js';

/**
 * Módulo `tenancy` (US-075): o registro de tenants da plataforma.
 *
 * Global porque **fornece o `TENANT_DIRECTORY`**, que qualquer módulo precisa
 * para resolver um tenant (storefront por host, painel por organização, jobs
 * por evento). Substitui o registro em memória da US-070.
 */
@Global()
@Module({
  controllers: [PlatformTenantsController],
  providers: [
    DbTenantDirectory,
    { provide: TENANT_DIRECTORY, useExisting: DbTenantDirectory },
    { provide: CONFIG_SOURCE, useClass: DbConfigSource },
    {
      provide: TENANT_REGISTRY,
      useFactory: (pool: DatabasePool, directory: DbTenantDirectory) =>
        new DrizzleTenantRegistry(pool, directory),
      inject: [DATABASE_POOL, DbTenantDirectory],
    },
  ],
  exports: [TENANT_DIRECTORY, CONFIG_SOURCE, TENANT_REGISTRY, DbTenantDirectory],
})
export class TenancyModule {}
