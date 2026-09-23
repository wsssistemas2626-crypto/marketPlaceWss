import { Inject, Injectable } from '@nestjs/common';

import { IntegrationHub } from '@mkt/modules-integrations';
import { ConfigService, Ed25519JwtSigner, Ed25519JwtVerifier, requireTenant } from '@mkt/platform';
import type { Clock } from '@mkt/shared-kernel';

import type {
  CustomerMailerPort,
  LegalVersionsPort,
  PasswordBreachPort,
  StorefrontLinksPort,
} from '../application/customers/ports.js';
import type { CustomerAccessTokenPort } from '../application/customers/session-ports.js';

/** Onde fica a loja de cada tenant — decidido pelo host (composition root). */
export interface StorefrontLinksOptions {
  /** Ex.: `http://{slug}.localhost:3000` (dev) ou `https://{slug}.suaplataforma.com.br`. */
  readonly urlTemplate: string;
}

export const STOREFRONT_LINKS_OPTIONS = Symbol('STOREFRONT_LINKS_OPTIONS');

/**
 * Links do storefront do tenant atual. O token vai no **fragmento** (`#`),
 * não na query: fragmento não é enviado ao servidor, então não aparece em log
 * de acesso, proxy nem `Referer`.
 */
@Injectable()
export class TemplateStorefrontLinks implements StorefrontLinksPort {
  constructor(@Inject(STOREFRONT_LINKS_OPTIONS) private readonly options: StorefrontLinksOptions) {}

  private base(): string {
    return this.options.urlTemplate.replace('{slug}', requireTenant().slug).replace(/\/+$/, '');
  }

  verifyEmail(token: string): string {
    return `${this.base()}/conta/confirmar#token=${encodeURIComponent(token)}`;
  }

  login(): string {
    return `${this.base()}/conta/entrar`;
  }

  resetPassword(): string {
    return `${this.base()}/conta/recuperar-senha`;
  }

}

/**
 * E-mails do comprador pelo provedor de e-mail **do tenant** (hub de
 * integrações): cada marketplace manda com o próprio remetente.
 *
 * O texto é montado aqui até o módulo `notifications` (US-058) assumir os
 * templates por tenant.
 */
@Injectable()
export class HubCustomerMailer implements CustomerMailerPort {
  constructor(private readonly hub: IntegrationHub) {}

  async sendVerification(input: { to: string; name: string; link: string }): Promise<void> {
    const email = await this.hub.resolve('email');
    await email.send({
      to: input.to,
      template: 'identity.customer_verification',
      subject: 'Confirme seu e-mail',
      data: {
        name: input.name,
        link: input.link,
        text: [
          `Olá, ${input.name}!`,
          '',
          'Para ativar sua conta e poder comprar, confirme seu e-mail pelo link abaixo (válido por 24 horas):',
          input.link,
          '',
          'Se não foi você que se cadastrou, ignore esta mensagem.',
        ].join('\n'),
      },
    });
  }

  async sendRegistrationAttempt(input: {
    to: string;
    name: string;
    loginLink: string;
    resetLink: string;
  }): Promise<void> {
    const email = await this.hub.resolve('email');
    await email.send({
      to: input.to,
      template: 'identity.registration_attempt',
      subject: 'Tentativa de cadastro com seu e-mail',
      data: {
        name: input.name,
        loginLink: input.loginLink,
        resetLink: input.resetLink,
        text: [
          `Olá, ${input.name}!`,
          '',
          'Alguém tentou criar uma conta nesta loja com o seu e-mail, que já está cadastrado.',
          `Se foi você, entre por aqui: ${input.loginLink}`,
          `Esqueceu a senha? ${input.resetLink}`,
          '',
          'Se não foi você, pode ignorar: nada mudou na sua conta.',
        ].join('\n'),
      },
    });
  }

}

/** Padrões usados enquanto a plataforma não publicar outra versão. */
export const DEFAULT_LEGAL_VERSIONS = { terms_of_use: '2026-09', privacy_policy: '2026-09' } as const;

/**
 * Versões vigentes de termos e política (RNF-LGPD-03), pela configuração
 * hierárquica: plataforma → plano → tenant. Um tenant pode ter os próprios
 * termos — ele é o controlador dos dados dos compradores (ADR-013).
 */
@Injectable()
export class ConfigLegalVersions implements LegalVersionsPort {
  constructor(private readonly config: ConfigService) {}

  async current(): Promise<{ terms_of_use: string; privacy_policy: string }> {
    return {
      terms_of_use: await this.config.get('legal.terms_of_use_version', DEFAULT_LEGAL_VERSIONS.terms_of_use),
      privacy_policy: await this.config.get(
        'legal.privacy_policy_version',
        DEFAULT_LEGAL_VERSIONS.privacy_policy,
      ),
    };
  }
}

/**
 * Checagem de senha vazada desligada. A consulta k-anonymity (Have I Been
 * Pwned) é opcional no RNF-SEG-02 e depende de rede — entra como adapter
 * quando o item do checklist for decidido.
 */
export class NoPasswordBreachCheck implements PasswordBreachPort {
  async isBreached(): Promise<boolean> {
    return false;
  }
}

/** RF-IAM-03: access token de 15 minutos. */
export const CUSTOMER_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const CUSTOMER_TOKEN = { issuer: 'mkt-identity', audience: 'storefront' } as const;
const CUSTOMER_TOKEN_CLAIMS = { iss: CUSTOMER_TOKEN.issuer, aud: CUSTOMER_TOKEN.audience } as const;

/** Chaves Ed25519 (PEM) do access token do comprador. */
export interface CustomerTokenKeys {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

/**
 * Access token do comprador: JWT Ed25519 com `sub` (comprador) e `tid`
 * (tenant). A verificação confere assinatura, emissor, audiência e validade;
 * quem compara o `tid` com o tenant do host é o guard (`CustomerAuthGuard`).
 */
export class JwtCustomerAccessTokens implements CustomerAccessTokenPort {
  private readonly signer: Ed25519JwtSigner;
  private readonly verifier: Ed25519JwtVerifier;

  constructor(keys: CustomerTokenKeys, clock: Clock) {
    this.signer = new Ed25519JwtSigner(keys.privateKeyPem, clock);
    this.verifier = new Ed25519JwtVerifier(keys.publicKeyPem, CUSTOMER_TOKEN, clock);
  }

  issue(input: { customerId: string; tenantId: string }): { token: string; expiresAt: Date } {
    return this.signer.sign(
      { sub: input.customerId, tid: input.tenantId, typ: 'customer', ...CUSTOMER_TOKEN_CLAIMS },
      CUSTOMER_ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  verify(token: string): { customerId: string; tenantId: string } {
    const claims = this.verifier.verify(token);
    if (claims.typ !== 'customer' || typeof claims.tid !== 'string')
      throw new Error('Token não é de comprador');
    return { customerId: claims.sub, tenantId: claims.tid };
  }
}
