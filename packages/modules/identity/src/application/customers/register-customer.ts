import { CUSTOMER_REGISTERED } from '@mkt/contracts';
import { createSecretToken, requireTenant, type PasswordHasher } from '@mkt/platform';
import { type Clock, createDomainEvent, ValidationError } from '@mkt/shared-kernel';

import { assertStrongPassword, normalizeEmail } from '../../domain/customer/credentials.js';
import { Customer } from '../../domain/customer/customer.js';
import type {
  CustomerMailerPort,
  CustomerRepositoryPort,
  EmailVerification,
  LegalVersionsPort,
  PasswordBreachPort,
  StorefrontLinksPort,
} from './ports.js';

/** RF-IAM-02: o link de confirmação vale 24 h. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface RegisterCustomerCommand {
  readonly name: string;
  readonly email: string;
  readonly document: string;
  readonly password: string;
  /** O cliente precisa marcar o aceite; *qual* versão foi aceita vem da configuração. */
  readonly acceptTerms: boolean;
  /** IP de quem aceitou (RNF-LGPD-03), resolvido pela borda confiável. */
  readonly ip: string;
}

export interface RegisterCustomerDependencies {
  readonly customers: CustomerRepositoryPort;
  readonly mailer: CustomerMailerPort;
  readonly hasher: PasswordHasher;
  readonly breaches: PasswordBreachPort;
  readonly links: StorefrontLinksPort;
  readonly legal: LegalVersionsPort;
  readonly clock: Clock;
  /** Falha de e-mail não derruba o cadastro — mas precisa ficar registrada. */
  readonly onMailFailure?: (error: unknown) => void;
}

/**
 * Cadastro de comprador (US-010).
 *
 * **Não revela se o e-mail existe** (cenário "e-mail já cadastrado"): a
 * resposta é a mesma nos dois caminhos, e o custo também — o hash da senha é
 * calculado sempre, para o tempo de resposta não virar oráculo. Quem recebe a
 * diferença é o dono do e-mail, por e-mail.
 *
 * Validação (nome, documento, senha) acontece **antes** de olhar o banco: erro
 * de campo não depende de a conta existir, então não vaza nada.
 */
export class RegisterCustomer {
  constructor(private readonly deps: RegisterCustomerDependencies) {}

  async execute(command: RegisterCustomerCommand): Promise<void> {
    const { customers, hasher, breaches, legal, clock } = this.deps;
    const tenantId = requireTenant().tenantId;

    if (!command.acceptTerms) {
      throw new ValidationError('É preciso aceitar os termos de uso e a política de privacidade', {
        field: 'acceptTerms',
      });
    }

    const email = normalizeEmail(command.email);
    assertStrongPassword(command.password, { email });

    if (await breaches.isBreached(command.password)) {
      throw new ValidationError('Esta senha já apareceu em vazamentos de dados; escolha outra', {
        field: 'password',
      });
    }

    const passwordHash = await hasher.hash(command.password);
    const customer = Customer.register(
      {
        tenantId,
        name: command.name,
        email,
        document: command.document,
        passwordHash,
        acceptedVersions: await legal.current(),
        ip: command.ip,
      },
      clock,
    );

    const existing = await customers.findByEmail(email);
    if (existing !== undefined) {
      await this.handleExisting(existing);
      return;
    }

    const { token, hash } = createSecretToken();
    const verification = this.verificationFor(customer.id, hash);
    const event = createDomainEvent(
      {
        type: CUSTOMER_REGISTERED.type,
        source: 'mkt/identity',
        tenantId,
        subject: `customer/${customer.id}`,
        data: { customerId: customer.id },
      },
      clock,
    );

    const result = await customers.create(customer, verification, event);
    if (result === 'email_taken') {
      // outro cadastro com o mesmo e-mail venceu a corrida: mesma resposta genérica
      const winner = await customers.findByEmail(email);
      if (winner !== undefined) await this.handleExisting(winner);
      return;
    }

    // fora da transação: e-mail é chamada externa (CLAUDE.md §9)
    await this.mail(() =>
      this.deps.mailer.sendVerification({
        to: email,
        name: customer.name,
        link: this.deps.links.verifyEmail(token),
      }),
    );
  }

  /**
   * Conta ainda não confirmada recebe um link novo (a pessoa provavelmente
   * perdeu o primeiro); conta ativa recebe o aviso de tentativa.
   */
  private async handleExisting(existing: Customer): Promise<void> {
    const { customers, mailer, links } = this.deps;

    if (existing.status === 'pending_verification') {
      const { token, hash } = createSecretToken();
      await customers.addVerification(this.verificationFor(existing.id, hash));
      await this.mail(() =>
        mailer.sendVerification({ to: existing.email, name: existing.name, link: links.verifyEmail(token) }),
      );
      return;
    }

    if (existing.status === 'active') {
      await this.mail(() =>
        mailer.sendRegistrationAttempt({
          to: existing.email,
          name: existing.name,
          loginLink: links.login(),
          resetLink: links.resetPassword(),
        }),
      );
    }
    // bloqueada ou anonimizada: nada a enviar, e a resposta continua a mesma
  }

  private verificationFor(customerId: string, tokenHash: string): EmailVerification {
    return {
      customerId,
      tokenHash,
      expiresAt: new Date(this.deps.clock.now().getTime() + EMAIL_VERIFICATION_TTL_MS),
    };
  }

  private async mail(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      // a conta existe; o comprador pode pedir o link de novo cadastrando-se outra vez
      this.deps.onMailFailure?.(error);
    }
  }
}
