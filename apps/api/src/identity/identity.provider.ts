import { Logger } from '@nestjs/common';

import { FakeWorkforceIdentity } from '@mkt/adapters-fakes';
import { ClerkWorkforceIdentity } from '@mkt/adapters-identity-clerk';
import type { WorkforceIdentityPort } from '@mkt/contracts';
import { generateEd25519KeyPair } from '@mkt/platform';

import type { ApiEnv } from '../env.js';

/**
 * Escolhe o adapter de identidade de painel.
 *
 * Com `CLERK_SECRET_KEY` configurada, usa a Clerk de verdade (ADR-013). Sem
 * ela, cai no fake: é o que permite rodar o repositório recém-clonado e os
 * testes sem depender de conta em provedor (CLAUDE.md §4.17).
 */
export function createWorkforceIdentity(env: ApiEnv): WorkforceIdentityPort {
  const logger = new Logger('WorkforceIdentity');

  if (env.clerk === undefined) {
    logger.warn('CLERK_SECRET_KEY ausente: usando identidade de painel FAKE (apenas desenvolvimento)');
    return new FakeWorkforceIdentity();
  }

  return new ClerkWorkforceIdentity({
    secretKey: env.clerk.secretKey,
    ...(env.clerk.jwtKey === undefined ? {} : { jwtKey: env.clerk.jwtKey }),
    authorizedParties: env.clerk.authorizedParties,
    ...(env.clerk.webhookSigningSecret === undefined
      ? {}
      : { webhookSigningSecret: env.clerk.webhookSigningSecret }),
  });
}

/**
 * Identidade do **console** (staff). A Clerk é outra aplicação, sem
 * Organizations: o staff entra sem organização ativa (ADR-013).
 */
export function createConsoleIdentity(env: ApiEnv): WorkforceIdentityPort {
  const logger = new Logger('ConsoleIdentity');

  if (env.consoleClerk === undefined) {
    logger.warn('CONSOLE_CLERK_SECRET_KEY ausente: console usando identidade FAKE (apenas desenvolvimento)');
    return new FakeWorkforceIdentity();
  }

  return new ClerkWorkforceIdentity({
    secretKey: env.consoleClerk.secretKey,
    ...(env.consoleClerk.jwtKey === undefined ? {} : { jwtKey: env.consoleClerk.jwtKey }),
    authorizedParties: env.consoleClerk.authorizedParties,
    ...(env.consoleClerk.webhookSigningSecret === undefined
      ? {}
      : { webhookSigningSecret: env.consoleClerk.webhookSigningSecret }),
    requireOrganization: false,
  });
}

let ephemeralKeys: { privateKeyPem: string; publicKeyPem: string } | undefined;

/**
 * Sem chaves no ambiente (desenvolvimento, testes), um par Ed25519 efêmero:
 * funciona, mas os tokens morrem a cada reinício da API. Produção exige as
 * chaves (`env.ts` recusa subir sem elas).
 */
function customerTokenKeys(env: ApiEnv): { privateKeyPem: string; publicKeyPem: string } {
  if (env.customerTokenKeys !== undefined) return env.customerTokenKeys;

  if (ephemeralKeys === undefined) {
    new Logger('CustomerTokens').warn(
      'CUSTOMER_JWT_*_KEY ausentes: chaves efêmeras (sessões de comprador caem a cada reinício)',
    );
    ephemeralKeys = generateEd25519KeyPair();
  }
  return ephemeralKeys;
}

/** Compradores (US-010/US-011): links dos e-mails, borda confiável para o IP e chaves do access token. */
export function customerOptions(env: ApiEnv): {
  storefrontUrlTemplate: string;
  edgeSharedSecret?: string;
  tokenKeys: { privateKeyPem: string; publicKeyPem: string };
} {
  return {
    storefrontUrlTemplate: env.storefrontUrlTemplate,
    ...(env.edgeSharedSecret === undefined ? {} : { edgeSharedSecret: env.edgeSharedSecret }),
    tokenKeys: customerTokenKeys(env),
  };
}
