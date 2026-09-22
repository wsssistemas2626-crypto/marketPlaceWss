export { assertRuntimeRoleIsSafe, UnsafeDatabaseRoleError } from './assert-runtime-role.js';
export {
  discoverMigrations,
  migrateFromCli,
  runMigrations,
  type Migration,
  type MigrationResult,
} from './migrations.js';
export { createModuleSchemaSql, enableTenantRlsSql } from './module-schema.js';
export {
  describeRlsGaps,
  findTablesMissingTenantRls,
  RLS_EXEMPT_TABLES,
  type RlsGap,
} from './rls-coverage.js';
export { nextTenantCounter } from './tenant-counters.js';
export { TenantAwareRepository } from './tenant-aware.repository.js';
export { createPool, type DatabaseClient, type DatabasePool, type PoolOptions } from './pool.js';
export { DATABASE_POOL, DATABASE_POOL_PLATFORM, REDIS_CLIENT } from './tokens.js';
export {
  currentTransaction,
  useTenantClient,
  useTransaction,
  withTenantTx,
  withTransaction,
} from './unit-of-work.js';
