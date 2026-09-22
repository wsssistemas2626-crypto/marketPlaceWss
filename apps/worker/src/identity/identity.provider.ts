import { Logger } from '@nestjs/common';

import { FakeWorkforceIdentity } from '@mkt/adapters-fakes';
import { ClerkWorkforceIdentity } from '@mkt/adapters-identity-clerk';
import type { WorkforceIdentityPort } from '@mkt/contracts';

/**
 * Identidade de painel no worker.
 *
 * O worker **não autentica ninguém** — ele precisa disto porque importa o
 * módulo `tenancy` (para confirmar o seed dos módulos no provisionamento) e o
 * grafo de dependências do tenancy inclui a criação de organizações na Clerk.
 * Usar o fake aqui seria mentir num eventual provisionamento disparado por job,
 * então a escolha segue a mesma regra da api: Clerk quando há chave, fake
 * quando não há (com aviso).
 */
export function createWorkforceIdentity(): WorkforceIdentityPort {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (secretKey === undefined || secretKey === '' || /^sk_test_(xxx|yyy)/.test(secretKey)) {
    new Logger('WorkforceIdentity').warn(
      'CLERK_SECRET_KEY ausente: worker usando identidade FAKE (apenas desenvolvimento)',
    );
    return new FakeWorkforceIdentity();
  }

  return new ClerkWorkforceIdentity({
    secretKey,
    ...(process.env.CLERK_JWT_KEY === undefined ? {} : { jwtKey: process.env.CLERK_JWT_KEY }),
    authorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
  });
}
