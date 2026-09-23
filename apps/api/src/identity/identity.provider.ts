import { Logger } from '@nestjs/common';

import { FakeWorkforceIdentity } from '@mkt/adapters-fakes';
import { ClerkWorkforceIdentity } from '@mkt/adapters-identity-clerk';
import type { WorkforceIdentityPort } from '@mkt/contracts';

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

/** Compradores (US-010): links da loja nos e-mails e borda confiável para o IP. */
export function customerOptions(env: ApiEnv): { storefrontUrlTemplate: string; edgeSharedSecret?: string } {
  return {
    storefrontUrlTemplate: env.storefrontUrlTemplate,
    ...(env.edgeSharedSecret === undefined ? {} : { edgeSharedSecret: env.edgeSharedSecret }),
  };
}
