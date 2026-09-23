import {
  Global,
  Logger,
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
  type Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import type { WorkforceIdentityPort } from '@mkt/contracts';
import { Argon2idPasswordHasher } from '@mkt/platform';
import { SystemClock } from '@mkt/shared-kernel';

import {
  ORG_LINK_REPOSITORY,
  WORKFORCE_IDENTITY,
  type OrgLinkRepositoryPort,
} from './application/panel-session.js';
import {
  CUSTOMER_MAILER,
  CUSTOMER_REPOSITORY,
  LEGAL_VERSIONS,
  PASSWORD_BREACH,
  STOREFRONT_LINKS,
  type CustomerMailerPort,
  type CustomerRepositoryPort,
  type LegalVersionsPort,
  type PasswordBreachPort,
  type StorefrontLinksPort,
} from './application/customers/ports.js';
import { RegisterCustomer } from './application/customers/register-customer.js';
import { VerifyCustomerEmail } from './application/customers/verify-customer-email.js';
import { SyncClerkWebhook } from './application/sync-clerk-webhook.js';
import { CUSTOMER_HTTP_OPTIONS, CustomersController } from './http/customers.controller.js';
import { ClerkWebhookController } from './http/clerk-webhook.controller.js';
import { PANEL_AUTH_POLICY, PanelAuthGuard, type PanelAuthPolicy } from './http/panel-auth.guard.js';
import { CONSOLE_IDENTITY, ConsoleAuthGuard, ConsoleAuthMiddleware } from './http/console-auth.js';
import { PanelAuthMiddleware } from './http/panel-auth.middleware.js';
import {
  ConfigLegalVersions,
  HubCustomerMailer,
  NoPasswordBreachCheck,
  STOREFRONT_LINKS_OPTIONS,
  TemplateStorefrontLinks,
} from './infrastructure/customer-adapters.js';
import { DrizzleCustomerRepository } from './infrastructure/drizzle-customer.repository.js';
import { DrizzleOrgLinkRepository } from './infrastructure/drizzle-org-link.repository.js';

export interface IdentityModuleOptions {
  /** Adapter de identidade de painel: Clerk em produção, fake em dev/teste. */
  readonly workforceIdentity: WorkforceIdentityPort;
  /** Adapter do console (aplicação Clerk separada, ADR-013). */
  readonly consoleIdentity: WorkforceIdentityPort;
  /** MFA dos papéis sensíveis e do staff (RF-IAM-14). */
  readonly policy: PanelAuthPolicy;
  /**
   * Compradores (identidade própria, US-010). Só o processo que atende o
   * storefront (api) liga; o worker não expõe rotas de comprador.
   */
  readonly customers?: {
    /** Loja do tenant, para os links dos e-mails — ex.: `https://{slug}.suaplataforma.com.br`. */
    readonly storefrontUrlTemplate: string;
    /** Segredo do edge: só com ele o `X-Forwarded-For` vale como IP do comprador. */
    readonly edgeSharedSecret?: string;
  };
}

/** Cadastro e confirmação de e-mail dos compradores (US-010). */
function customerProviders(options: NonNullable<IdentityModuleOptions['customers']>): Provider[] {
  return [
    { provide: CUSTOMER_REPOSITORY, useClass: DrizzleCustomerRepository },
    { provide: CUSTOMER_MAILER, useClass: HubCustomerMailer },
    { provide: PASSWORD_BREACH, useClass: NoPasswordBreachCheck },
    { provide: STOREFRONT_LINKS, useClass: TemplateStorefrontLinks },
    { provide: LEGAL_VERSIONS, useClass: ConfigLegalVersions },
    {
      provide: STOREFRONT_LINKS_OPTIONS,
      useValue: { urlTemplate: options.storefrontUrlTemplate },
    },
    {
      provide: CUSTOMER_HTTP_OPTIONS,
      useValue: options.edgeSharedSecret === undefined ? {} : { edgeSharedSecret: options.edgeSharedSecret },
    },
    {
      provide: RegisterCustomer,
      useFactory: (
        customers: CustomerRepositoryPort,
        mailer: CustomerMailerPort,
        breaches: PasswordBreachPort,
        links: StorefrontLinksPort,
        legal: LegalVersionsPort,
      ) => {
        const logger = new Logger(RegisterCustomer.name);
        return new RegisterCustomer({
          customers,
          mailer,
          breaches,
          links,
          legal,
          hasher: new Argon2idPasswordHasher(),
          clock: new SystemClock(),
          // só a mensagem: o erro do provedor pode carregar o destinatário
          onMailFailure: (error) =>
            logger.error(`E-mail do cadastro não saiu: ${error instanceof Error ? error.name : 'erro'}`),
        });
      },
      inject: [CUSTOMER_REPOSITORY, CUSTOMER_MAILER, PASSWORD_BREACH, STOREFRONT_LINKS, LEGAL_VERSIONS],
    },
    {
      provide: VerifyCustomerEmail,
      useFactory: (customers: CustomerRepositoryPort) =>
        new VerifyCustomerEmail(customers, new SystemClock()),
      inject: [CUSTOMER_REPOSITORY],
    },
  ];
}

/**
 * Identidade dos painéis (ADR-013 / US-082).
 *
 * O adapter é injetado pelo host e **não** passa pelo hub de integrações: a
 * resolução do hub depende do TenantContext, que só existe depois desta
 * autenticação.
 */
// global: autenticação de painel e o vínculo organização→tenant são usados
// por qualquer módulo que precise saber quem está chamando (tenancy, no
// provisionamento; guards, nas rotas)
@Global()
@Module({})
export class IdentityModule implements NestModule {
  static register(options: IdentityModuleOptions) {
    return {
      module: IdentityModule,
      controllers: [
        ClerkWebhookController,
        ...(options.customers === undefined ? [] : [CustomersController]),
      ],
      providers: [
        { provide: WORKFORCE_IDENTITY, useValue: options.workforceIdentity },
        { provide: CONSOLE_IDENTITY, useValue: options.consoleIdentity },
        { provide: PANEL_AUTH_POLICY, useValue: options.policy },
        { provide: ORG_LINK_REPOSITORY, useClass: DrizzleOrgLinkRepository },
        { provide: APP_GUARD, useClass: PanelAuthGuard },
        { provide: APP_GUARD, useClass: ConsoleAuthGuard },
        {
          provide: SyncClerkWebhook,
          useFactory: (links: OrgLinkRepositoryPort) => new SyncClerkWebhook(links),
          inject: [ORG_LINK_REPOSITORY],
        },
        PanelAuthMiddleware,
        ConsoleAuthMiddleware,
        ...(options.customers === undefined ? [] : customerProviders(options.customers)),
      ],
      exports: [WORKFORCE_IDENTITY, CONSOLE_IDENTITY, ORG_LINK_REPOSITORY],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    // rotas de painel e de console; o storefront usa identidade própria (US-010)
    consumer
      .apply(PanelAuthMiddleware)
      .forRoutes(
        { path: 'admin/*splat', method: RequestMethod.ALL },
        { path: 'seller/*splat', method: RequestMethod.ALL },
      );

    // o console usa a outra aplicação Clerk e não abre TenantContext
    consumer.apply(ConsoleAuthMiddleware).forRoutes({ path: 'platform/*splat', method: RequestMethod.ALL });
  }
}
