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
