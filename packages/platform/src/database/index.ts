export { assertRuntimeRoleIsSafe, UnsafeDatabaseRoleError } from './assert-runtime-role.js';
export {
  discoverMigrations,
  migrateFromCli,
  runMigrations,
  type Migration,
  type MigrationResult,
} from './migrations.js';
export { createModuleSchemaSql, enableTenantRlsSql } from './module-schema.js';
export { createPool, type DatabaseClient, type DatabasePool, type PoolOptions } from './pool.js';
export { DATABASE_POOL, DATABASE_POOL_PLATFORM, REDIS_CLIENT } from './tokens.js';
export { currentTransaction, useTenantClient, withTenantTx, withTransaction } from './unit-of-work.js';
