import { Global, Module } from '@nestjs/common';

import { CONFIG_SOURCE, DATABASE_POOL, TENANT_DIRECTORY, type DatabasePool } from '@mkt/platform';
import { SystemClock } from '@mkt/shared-kernel';

import { CompleteProvisioning } from './application/complete-provisioning.js';
import {
  PROVISIONING_STEPS_REPOSITORY,
  ProvisionTenant,
  TENANCY_EVENT_PUBLISHER,
  TENANCY_TRANSACTION,
  WORKFORCE_PROVISIONING,
  type EventPublisherPort,
  type ProvisioningStepsPort,
  type TransactionPort,
  type WorkforceProvisioningPort,
} from './application/provision-tenant.js';
import { TENANT_REGISTRY, type TenantRegistryPort } from './application/tenant-registry.js';
import { AdminThemeController, StoreThemeController } from './http/theme.controller.js';
import { PlatformTenantsController } from './http/platform-tenants.controller.js';
import { ThemeService, THEME_REPOSITORY, type ThemeRepositoryPort } from './application/theme-service.js';
import { DbConfigSource } from './infrastructure/db-config-source.js';
import { DrizzleThemeRepository } from './infrastructure/drizzle-theme.repository.js';
import { DbTenantDirectory } from './infrastructure/db-tenant-directory.js';
import { DrizzleProvisioningSteps } from './infrastructure/drizzle-provisioning-steps.js';
import { DrizzleTenantRegistry } from './infrastructure/drizzle-tenant-registry.js';
import {
  ClerkTenantProvisioning,
  TenancyOutboxPublisher,
  TenancyTransaction,
} from './infrastructure/tenancy-adapters.js';

export interface TenancyModuleOptions {
  /**
   * Módulos que precisam confirmar o seed antes de o tenant ser ativado.
   *
   * Quem sabe disso é o host: é ele que monta a aplicação e portanto conhece
   * os módulos instalados. O tenancy só orquestra.
   */
  readonly seedModules?: readonly string[];
}

/**
 * Módulo `tenancy` (US-075/US-076): o registro de tenants e o provisionamento.
 *
 * Global porque fornece o `TENANT_DIRECTORY`, de que qualquer caminho de
 * entrada precisa (storefront por host, painel por organização, jobs por
 * evento).
 */
@Global()
@Module({})
export class TenancyModule {
  static register(options: TenancyModuleOptions = {}) {
    const seedModules = options.seedModules ?? [];

    return {
      module: TenancyModule,
      controllers: [PlatformTenantsController, AdminThemeController, StoreThemeController],
      providers: [
        DbTenantDirectory,
        { provide: TENANT_DIRECTORY, useExisting: DbTenantDirectory },
        { provide: CONFIG_SOURCE, useClass: DbConfigSource },
        { provide: PROVISIONING_STEPS_REPOSITORY, useClass: DrizzleProvisioningSteps },
        { provide: WORKFORCE_PROVISIONING, useClass: ClerkTenantProvisioning },
        { provide: TENANCY_EVENT_PUBLISHER, useClass: TenancyOutboxPublisher },
        { provide: TENANCY_TRANSACTION, useClass: TenancyTransaction },
        { provide: THEME_REPOSITORY, useClass: DrizzleThemeRepository },
        {
          provide: ThemeService,
          useFactory: (repository: ThemeRepositoryPort) => new ThemeService(repository),
          inject: [THEME_REPOSITORY],
        },
        {
          provide: TENANT_REGISTRY,
          useFactory: (pool: DatabasePool, directory: DbTenantDirectory) =>
            new DrizzleTenantRegistry(pool, directory),
          inject: [DATABASE_POOL, DbTenantDirectory],
        },
        {
          provide: ProvisionTenant,
          useFactory: (
            registry: TenantRegistryPort,
            steps: ProvisioningStepsPort,
            workforce: WorkforceProvisioningPort,
            events: EventPublisherPort,
            transaction: TransactionPort,
          ) =>
            new ProvisionTenant(
              registry,
              steps,
              workforce,
              events,
              transaction,
              new SystemClock(),
              seedModules,
            ),
          inject: [
            TENANT_REGISTRY,
            PROVISIONING_STEPS_REPOSITORY,
            WORKFORCE_PROVISIONING,
            TENANCY_EVENT_PUBLISHER,
            TENANCY_TRANSACTION,
          ],
        },
        {
          provide: CompleteProvisioning,
          useFactory: (
            registry: TenantRegistryPort,
            steps: ProvisioningStepsPort,
            events: EventPublisherPort,
            transaction: TransactionPort,
          ) => new CompleteProvisioning(registry, steps, events, transaction, new SystemClock(), seedModules),
          inject: [
            TENANT_REGISTRY,
            PROVISIONING_STEPS_REPOSITORY,
            TENANCY_EVENT_PUBLISHER,
            TENANCY_TRANSACTION,
          ],
        },
      ],
      exports: [
        TENANT_DIRECTORY,
        CONFIG_SOURCE,
        TENANT_REGISTRY,
        DbTenantDirectory,
        ProvisionTenant,
        CompleteProvisioning,
        ThemeService,
      ],
    };
  }
}
