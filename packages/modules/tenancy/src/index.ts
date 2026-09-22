/** API pública do módulo `tenancy` (CLAUDE.md §4.1). */
export { CompleteProvisioning, type SeedConfirmation } from './application/complete-provisioning.js';
export {
  PROVISIONING_STEPS,
  PROVISIONING_STEPS_REPOSITORY,
  ProvisionTenant,
  TENANCY_EVENT_PUBLISHER,
  TENANCY_TRANSACTION,
  WORKFORCE_PROVISIONING,
  type EventPublisherPort,
  type ProvisioningStep,
  type ProvisioningStepsPort,
  type ProvisionTenantCommand,
  type ProvisionTenantResult,
  type StepRecord,
  type TransactionPort,
  type WorkforceProvisioningPort,
} from './application/provision-tenant.js';
export {
  TENANT_REGISTRY,
  type ProvisionTenantInput,
  type TenantRegistryPort,
  type TenantSummary,
} from './application/tenant-registry.js';
export {
  THEME_REPOSITORY,
  ThemeService,
  type ThemeRecord,
  type ThemeRepositoryPort,
} from './application/theme-service.js';
export {
  DEFAULT_THEME,
  themeSchema,
  themeToCssVariables,
  themeToStyleSheet,
  type Theme,
} from './domain/theme.js';
export { assertValidTenantSlug, isReservedSlug, RESERVED_SLUGS } from './domain/tenant-slug.js';
export { DbConfigSource } from './infrastructure/db-config-source.js';
export { DbTenantDirectory } from './infrastructure/db-tenant-directory.js';
export { DrizzleProvisioningSteps } from './infrastructure/drizzle-provisioning-steps.js';
export { DrizzleTenantRegistry } from './infrastructure/drizzle-tenant-registry.js';
export { TenancyModule, type TenancyModuleOptions } from './tenancy.module.js';
