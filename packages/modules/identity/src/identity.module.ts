import { randomBytes } from 'node:crypto';

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

import type { PostalCodePort, WorkforceIdentityPort } from '@mkt/contracts';
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
import {
  CUSTOMER_ADDRESS_REPOSITORY,
  CustomerAddresses,
  POSTAL_CODE,
  type CustomerAddressRepositoryPort,
} from './application/customers/customer-addresses.js';
import { CustomerSessions } from './application/customers/customer-sessions.js';
import {
  PASSWORD_RESET_MAILER,
  PASSWORD_RESET_REPOSITORY,
  PasswordReset,
  type PasswordResetLinksPort,
  type PasswordResetMailerPort,
  type PasswordResetRepositoryPort,
} from './application/customers/password-reset.js';
import { RegisterCustomer } from './application/customers/register-customer.js';
import {
  CUSTOMER_ACCESS_TOKENS,
  CUSTOMER_CREDENTIALS,
  REFRESH_TOKEN_REPOSITORY,
  type CustomerAccessTokenPort,
  type CustomerCredentialsPort,
  type RefreshTokenRepositoryPort,
} from './application/customers/session-ports.js';
import { VerifyCustomerEmail } from './application/customers/verify-customer-email.js';
import { SyncClerkWebhook } from './application/sync-clerk-webhook.js';
import { CustomerAddressesController, PostalCodesController } from './http/customer-addresses.controller.js';
import { CustomerAuthGuard } from './http/customer-auth.js';
import {
  CustomerAccountController,
  CustomerSessionsController,
} from './http/customer-sessions.controller.js';
import { CUSTOMER_HTTP_OPTIONS, CustomersController } from './http/customers.controller.js';
import { PasswordResetController } from './http/password-reset.controller.js';
import { ClerkWebhookController } from './http/clerk-webhook.controller.js';
import { PANEL_AUTH_POLICY, PanelAuthGuard, type PanelAuthPolicy } from './http/panel-auth.guard.js';
import { CONSOLE_IDENTITY, ConsoleAuthGuard, ConsoleAuthMiddleware } from './http/console-auth.js';
import { PanelAuthMiddleware } from './http/panel-auth.middleware.js';
import {
  ConfigLegalVersions,
  HubCustomerMailer,
  JwtCustomerAccessTokens,
  type CustomerTokenKeys,
  NoPasswordBreachCheck,
  STOREFRONT_LINKS_OPTIONS,
  TemplateStorefrontLinks,
} from './infrastructure/customer-adapters.js';
import { DrizzleCustomerAddressRepository } from './infrastructure/drizzle-customer-address.repository.js';
import { DrizzleCustomerRepository } from './infrastructure/drizzle-customer.repository.js';
import { DrizzleOrgLinkRepository } from './infrastructure/drizzle-org-link.repository.js';
import { DrizzlePasswordResetRepository } from './infrastructure/drizzle-password-reset.repository.js';
import { DrizzleRefreshTokenRepository } from './infrastructure/drizzle-refresh-token.repository.js';

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
    /** Chaves Ed25519 do access token do comprador (US-011). */
    readonly tokenKeys: CustomerTokenKeys;
    /** Consulta de CEP (US-014): ViaCEP ou fake, escolhido pelo host — não é por tenant. */
    readonly postalCode: PostalCodePort;
  };
}

/** Compradores: cadastro (US-010), sessões (US-011), troca de senha (US-012) e endereços (US-014). */
function customerProviders(options: NonNullable<IdentityModuleOptions['customers']>): Provider[] {
  return [
    DrizzleCustomerRepository,
    { provide: CUSTOMER_REPOSITORY, useExisting: DrizzleCustomerRepository },
    { provide: CUSTOMER_CREDENTIALS, useExisting: DrizzleCustomerRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: DrizzleRefreshTokenRepository },
    {
      provide: CUSTOMER_ACCESS_TOKENS,
      useFactory: () => new JwtCustomerAccessTokens(options.tokenKeys, new SystemClock()),
    },
    { provide: APP_GUARD, useClass: CustomerAuthGuard },
    { provide: CUSTOMER_ADDRESS_REPOSITORY, useClass: DrizzleCustomerAddressRepository },
    { provide: POSTAL_CODE, useValue: options.postalCode },
    {
      provide: CustomerAddresses,
      useFactory: (addresses: CustomerAddressRepositoryPort, postalCodes: PostalCodePort) =>
        new CustomerAddresses(addresses, postalCodes, new SystemClock()),
      inject: [CUSTOMER_ADDRESS_REPOSITORY, POSTAL_CODE],
    },
    HubCustomerMailer,
    { provide: CUSTOMER_MAILER, useExisting: HubCustomerMailer },
    { provide: PASSWORD_RESET_MAILER, useExisting: HubCustomerMailer },
    { provide: PASSWORD_RESET_REPOSITORY, useClass: DrizzlePasswordResetRepository },
    { provide: PASSWORD_BREACH, useClass: NoPasswordBreachCheck },
    TemplateStorefrontLinks,
    { provide: STOREFRONT_LINKS, useExisting: TemplateStorefrontLinks },
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
      provide: CustomerSessions,
      useFactory: async (
        customers: CustomerRepositoryPort,
        credentials: CustomerCredentialsPort,
        refreshTokens: RefreshTokenRepositoryPort,
        accessTokens: CustomerAccessTokenPort,
      ) => {
        const hasher = new Argon2idPasswordHasher();
        const logger = new Logger(CustomerSessions.name);
        return new CustomerSessions({
          customers,
          credentials,
          refreshTokens,
          accessTokens,
          hasher,
          clock: new SystemClock(),
          // senha aleatória: nunca confere, só iguala o custo do login sem conta
          decoyPasswordHash: await hasher.hash(randomBytes(32).toString('hex')),
          // ids, nunca e-mail: o log não carrega dado pessoal
          onRefreshReuse: ({ customerId, familyId }) =>
            logger.warn(`Refresh token reusado: família ${familyId} do comprador ${customerId} revogada`),
        });
      },
      inject: [CUSTOMER_REPOSITORY, CUSTOMER_CREDENTIALS, REFRESH_TOKEN_REPOSITORY, CUSTOMER_ACCESS_TOKENS],
    },
    {
      provide: PasswordReset,
      useFactory: (
        customers: CustomerRepositoryPort,
        resets: PasswordResetRepositoryPort,
        mailer: PasswordResetMailerPort,
        links: PasswordResetLinksPort,
        breaches: PasswordBreachPort,
      ) => {
        const logger = new Logger(PasswordReset.name);
        return new PasswordReset({
          customers,
          resets,
          mailer,
          links,
          breaches,
          hasher: new Argon2idPasswordHasher(),
          clock: new SystemClock(),
          onMailFailure: (error) =>
            logger.error(
              `E-mail de troca de senha não saiu: ${error instanceof Error ? error.name : 'erro'}`,
            ),
        });
      },
      inject: [
        CUSTOMER_REPOSITORY,
        PASSWORD_RESET_REPOSITORY,
        PASSWORD_RESET_MAILER,
        TemplateStorefrontLinks,
        PASSWORD_BREACH,
      ],
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
        ...(options.customers === undefined
          ? []
          : [
              CustomersController,
              CustomerSessionsController,
              CustomerAccountController,
              PasswordResetController,
              CustomerAddressesController,
              PostalCodesController,
            ]),
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
