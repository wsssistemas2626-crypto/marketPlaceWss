/** API pública do módulo `integrations` (CLAUDE.md §4.1). */
export {
  ADAPTER_REGISTRY,
  AdapterRegistry,
  ProviderNotRegisteredError,
  type AdapterContext,
  type AdapterFactory,
} from './application/adapter-registry.js';
export { IntegrationHub, NoActiveProviderError } from './application/integration-hub.js';
export {
  PROVIDER_CONFIG_REPOSITORY,
  type ProviderConfigRecord,
  type ProviderConfigSummary,
  type ProviderConfigRepositoryPort,
} from './application/provider-config.port.js';
export { CredentialCipher } from './infrastructure/credential-cipher.js';
export {
  CREDENTIAL_CIPHER,
  DrizzleProviderConfigRepository,
} from './infrastructure/drizzle-provider-config.repository.js';
export { IntegrationsModule, type IntegrationsModuleOptions } from './integrations.module.js';
