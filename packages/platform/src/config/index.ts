export { ConfigService } from './config.service.js';
export {
  CONFIG_SOURCE,
  ConfigKeyNotFoundError,
  ModuleNotEnabledError,
  PlanLimitReachedError,
  type ConfigOrigin,
  type ConfigSourcePort,
  type ConfigValue,
  type Entitlements,
  type PlanDefinition,
  type ResolvedConfig,
} from './config.types.js';
export { DEVELOPMENT_PLANS, InMemoryConfigSource } from './in-memory-config-source.js';
export { RequiresModule, RequiresModuleGuard } from './requires-module.guard.js';
