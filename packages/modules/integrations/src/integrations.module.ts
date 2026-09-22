import { Module } from '@nestjs/common';

import { integrationCategories } from '@mkt/contracts';
import { FAKE_PROVIDER, fakeAdapterFactories } from '@mkt/adapters-fakes';

import { ADAPTER_REGISTRY, AdapterRegistry } from './application/adapter-registry.js';
import { IntegrationHub } from './application/integration-hub.js';
import {
  PROVIDER_CONFIG_REPOSITORY,
  type ProviderConfigRepositoryPort,
} from './application/provider-config.port.js';
import { CredentialCipher } from './infrastructure/credential-cipher.js';
import {
  CREDENTIAL_CIPHER,
  DrizzleProviderConfigRepository,
} from './infrastructure/drizzle-provider-config.repository.js';

export interface IntegrationsModuleOptions {
  /** 32 bytes em base64. Em produção vem do KMS (checklist §F). */
  readonly encryptionKey: string;
}

/**
 * Hub de integrações (US-009).
 *
 * Registra os adapters **fake** de todas as categorias: é o que permite
 * desenvolver e testar antes de existir conta em provedor (CLAUDE.md §4.17).
 * Adapters reais são registrados aqui conforme entram, sem mudar quem os usa.
 */
@Module({})
export class IntegrationsModule {
  static register(options: IntegrationsModuleOptions) {
    return {
      module: IntegrationsModule,
      providers: [
        { provide: CREDENTIAL_CIPHER, useFactory: () => new CredentialCipher(options.encryptionKey) },
        { provide: PROVIDER_CONFIG_REPOSITORY, useClass: DrizzleProviderConfigRepository },
        {
          provide: ADAPTER_REGISTRY,
          useFactory: () => {
            const registry = new AdapterRegistry();
            for (const category of integrationCategories) {
              const factory = fakeAdapterFactories[category];
              // o fake ignora credenciais; o adapter real as recebe no contexto
              registry.register(category, FAKE_PROVIDER, () => factory() as never);
            }
            return registry;
          },
        },
        {
          provide: IntegrationHub,
          useFactory: (configs: ProviderConfigRepositoryPort, registry: AdapterRegistry) =>
            new IntegrationHub(configs, registry),
          inject: [PROVIDER_CONFIG_REPOSITORY, ADAPTER_REGISTRY],
        },
      ],
      exports: [IntegrationHub, ADAPTER_REGISTRY, PROVIDER_CONFIG_REPOSITORY, CREDENTIAL_CIPHER],
    };
  }
}
