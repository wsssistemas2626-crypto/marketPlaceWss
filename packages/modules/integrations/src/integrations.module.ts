import { Module } from '@nestjs/common';

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
  /**
   * Registro de adapters disponíveis, montado pelo **host**.
   *
   * O módulo não conhece nenhum adapter concreto — nem os fakes: quem decide
   * quais provedores existem naquela instalação é o composition root
   * (CLAUDE.md §4.4). Depender de `packages/adapters/*` aqui inverteria a
   * dependência e é exatamente o que a checagem de fronteiras acusa.
   */
  readonly registry: AdapterRegistry;
}

/**
 * Hub de integrações (US-009): guarda qual provedor está ativo em cada
 * categoria, por tenant, com as credenciais cifradas, e monta o adapter
 * na hora da requisição a partir do `TenantContext`.
 */
@Module({})
export class IntegrationsModule {
  static register(options: IntegrationsModuleOptions) {
    return {
      module: IntegrationsModule,
      providers: [
        { provide: CREDENTIAL_CIPHER, useFactory: () => new CredentialCipher(options.encryptionKey) },
        { provide: PROVIDER_CONFIG_REPOSITORY, useClass: DrizzleProviderConfigRepository },
        { provide: ADAPTER_REGISTRY, useValue: options.registry },
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
