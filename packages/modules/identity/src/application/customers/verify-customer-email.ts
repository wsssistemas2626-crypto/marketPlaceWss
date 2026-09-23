import { CUSTOMER_VERIFIED } from '@mkt/contracts';
import { hashSecretToken, requireTenant } from '@mkt/platform';
import { type Clock, createDomainEvent, ValidationError } from '@mkt/shared-kernel';

import type { CustomerRepositoryPort } from './ports.js';

/** Mesmo erro para token inexistente, expirado ou de outra loja: não é oráculo. */
const invalidLink = () =>
  new ValidationError('Link de confirmação inválido ou expirado. Peça um novo cadastrando-se de novo.', {
    field: 'token',
  });

/**
 * Confirmação de e-mail (RF-IAM-02 / US-010): ativa a conta.
 *
 * O token vem do link; o banco guarda só o SHA-256. O token é de uso único,
 * mas clicar duas vezes no mesmo link numa conta já ativa responde sucesso —
 * cliente de e-mail que "pré-visualiza" links costuma abrir antes da pessoa.
 */
export class VerifyCustomerEmail {
  constructor(
    private readonly customers: CustomerRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<{ status: 'verified' | 'already_verified' }> {
    if (token.length < 20 || token.length > 200) throw invalidLink();

    const tokenHash = hashSecretToken(token);
    // RLS: token de outra loja simplesmente não aparece
    const verification = await this.customers.findVerification(tokenHash);
    if (verification === undefined) throw invalidLink();

    const customer = await this.customers.findById(verification.customerId);
    if (customer === undefined) throw invalidLink();

    if (verification.usedAt !== undefined) {
      if (customer.status === 'active') return { status: 'already_verified' };
      throw invalidLink();
    }

    const now = this.clock.now();
    if (verification.expiresAt.getTime() <= now.getTime()) throw invalidLink();

    const result = customer.verifyEmail(this.clock);
    // link antigo de uma conta que já foi ativada por outro: nada a gravar
    if (result === 'already_verified') return { status: result };

    const event = createDomainEvent(
      {
        type: CUSTOMER_VERIFIED.type,
        source: 'mkt/identity',
        tenantId: requireTenant().tenantId,
        subject: `customer/${customer.id}`,
        data: { customerId: customer.id },
      },
      this.clock,
    );

    await this.customers.confirmEmail(customer, tokenHash, now, event);
    return { status: result };
  }
}
