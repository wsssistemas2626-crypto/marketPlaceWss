/** API pública do módulo `tenancy` (CLAUDE.md §4.1). */
export {
  TENANT_REGISTRY,
  type ProvisionTenantInput,
  type TenantRegistryPort,
  type TenantSummary,
} from './application/tenant-registry.js';
export { DbConfigSource } from './infrastructure/db-config-source.js';
export { DbTenantDirectory } from './infrastructure/db-tenant-directory.js';
export { DrizzleTenantRegistry } from './infrastructure/drizzle-tenant-registry.js';
export { TenancyModule } from './tenancy.module.js';
