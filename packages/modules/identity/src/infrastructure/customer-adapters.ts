import { Inject, Injectable } from '@nestjs/common';

import { IntegrationHub } from '@mkt/modules-integrations';
import { ConfigService, requireTenant } from '@mkt/platform';

import type {
  CustomerMailerPort,
  LegalVersionsPort,
  PasswordBreachPort,
  StorefrontLinksPort,
} from '../application/customers/ports.js';

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
