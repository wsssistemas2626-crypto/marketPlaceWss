/** API pública do módulo `tenancy` (CLAUDE.md §4.1). */
export { ChangeTenantStatus, type ChangeTenantStatusCommand } from './application/change-tenant-status.js';
export { CompleteProvisioning, type SeedConfirmation } from './application/complete-provisioning.js';
export {
  MAX_SUPPORT_DURATION_MINUTES,
  SUPPORT_SESSION_REPOSITORY,
  SupportMode,
  type OpenSupportSessionCommand,
  type SupportScope,
  type SupportSession,
  type SupportSessionRepositoryPort,
} from './application/support-mode.js';
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
export {
  EMPTY_USAGE,
  TenantUsageProjection,
  USAGE_METRICS,
  USAGE_PROJECTION,
  type TenantUsage,
  type UsageMetric,
  type UsageProjectionPort,
} from './application/tenant-usage.js';
export { TenantUsageHandler } from './events/tenant-usage.handler.js';
export { assertValidTenantSlug, isReservedSlug, RESERVED_SLUGS } from './domain/tenant-slug.js';
export { DbConfigSource } from './infrastructure/db-config-source.js';
export { DbTenantDirectory } from './infrastructure/db-tenant-directory.js';
export { DrizzleProvisioningSteps } from './infrastructure/drizzle-provisioning-steps.js';
export { DrizzleTenantRegistry } from './infrastructure/drizzle-tenant-registry.js';
export { TenancyModule, type TenancyModuleOptions } from './tenancy.module.js';
