import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import type { WorkforceIdentityPort } from '@mkt/contracts';

import {
  ORG_LINK_REPOSITORY,
  WORKFORCE_IDENTITY,
  type OrgLinkRepositoryPort,
} from './application/panel-session.js';
import { SyncClerkWebhook } from './application/sync-clerk-webhook.js';
import { ClerkWebhookController } from './http/clerk-webhook.controller.js';
import { PanelAuthGuard } from './http/panel-auth.guard.js';
import { PanelAuthMiddleware } from './http/panel-auth.middleware.js';
import { DrizzleOrgLinkRepository } from './infrastructure/drizzle-org-link.repository.js';

export interface IdentityModuleOptions {
  /** Adapter de identidade de painel: Clerk em produção, fake em dev/teste. */
  readonly workforceIdentity: WorkforceIdentityPort;
}

/**
 * Identidade dos painéis (ADR-013 / US-082).
 *
 * O adapter é injetado pelo host e **não** passa pelo hub de integrações: a
 * resolução do hub depende do TenantContext, que só existe depois desta
 * autenticação.
 */
@Module({})
export class IdentityModule implements NestModule {
  static register(options: IdentityModuleOptions) {
    return {
      module: IdentityModule,
      controllers: [ClerkWebhookController],
      providers: [
        { provide: WORKFORCE_IDENTITY, useValue: options.workforceIdentity },
        { provide: ORG_LINK_REPOSITORY, useClass: DrizzleOrgLinkRepository },
        { provide: APP_GUARD, useClass: PanelAuthGuard },
        {
          provide: SyncClerkWebhook,
          useFactory: (links: OrgLinkRepositoryPort) => new SyncClerkWebhook(links),
          inject: [ORG_LINK_REPOSITORY],
        },
        PanelAuthMiddleware,
      ],
      exports: [WORKFORCE_IDENTITY, ORG_LINK_REPOSITORY],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    // rotas de painel e de console; o storefront usa identidade própria (US-010)
    consumer
      .apply(PanelAuthMiddleware)
      .forRoutes(
        { path: 'admin/*splat', method: RequestMethod.ALL },
        { path: 'seller/*splat', method: RequestMethod.ALL },
        { path: 'platform/*splat', method: RequestMethod.ALL },
      );
  }
}
