import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';

import { IdentityModule } from '@mkt/modules-identity';
import { TemplateModule } from '@mkt/modules-template';
import { TenancyModule } from '@mkt/modules-tenancy';

import {
  BullMqEventBus,
  DATABASE_POOL_PLATFORM,
  EVENT_BUS,
  createPool,
  type DatabasePool,
} from '@mkt/platform';

import { loadWorkerEnv } from '../env.js';
import { createWorkforceIdentity } from '../identity/identity.provider.js';
import { EventConsumerService } from './event-consumer.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';

/**
 * Filas e outbox do worker.
 *
 * O pool do role `platform` (BYPASSRLS) existe **só** aqui: o restante do
 * processo usa o pool do role `app` (ADR-014 §3).
 */
@Module({
  imports: [
    // o worker não autentica ninguém, mas o tenancy precisa do adapter de
    // identidade para provisionar organizações
    IdentityModule.register({
      workforceIdentity: createWorkforceIdentity(),
      consoleIdentity: createWorkforceIdentity(),
    }),
    TenancyModule.register({ seedModules: ['template'] }),
    TemplateModule,
  ],
  providers: [
    {
      provide: DATABASE_POOL_PLATFORM,
      useFactory: () => {
        const env = loadWorkerEnv();
        return createPool(env.platformDatabaseUrl ?? env.databaseUrl, {
          max: 2,
          applicationName: 'marketplace-outbox-relay',
        });
      },
    },
    {
      provide: EVENT_BUS,
      useFactory: () => {
        const env = loadWorkerEnv();
        // family: 0 (dual stack) é exigência da rede privada da Railway (armadilha #3)
        return new BullMqEventBus({ connection: { url: env.redisUrl, family: 0 } });
      },
    },
    OutboxRelayService,
    EventConsumerService,
  ],
  exports: [EVENT_BUS, DATABASE_POOL_PLATFORM],
})
export class MessagingModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL_PLATFORM) private readonly pool: DatabasePool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
