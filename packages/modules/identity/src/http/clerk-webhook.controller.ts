import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';

import type { WorkforceIdentityPort } from '@mkt/contracts';
import { Public } from '@mkt/platform';
import { ValidationError } from '@mkt/shared-kernel';

import { WORKFORCE_IDENTITY } from '../application/panel-session.js';
import { SyncClerkWebhook } from '../application/sync-clerk-webhook.js';

/**
 * Webhook da Clerk (`POST /v1/hooks/identity/clerk`).
 *
 * A assinatura é validada pelo adapter antes de qualquer coisa: corpo sem
 * assinatura válida vira 400 e nunca chega a escrever no banco. A assinatura é
 * calculada sobre o corpo **cru**, por isso ele é serializado de volta aqui.
 */
@Controller('hooks/identity/clerk')
@Public('webhook: a assinatura svix da Clerk é a credencial')
export class ClerkWebhookController {
  constructor(
    @Inject(WORKFORCE_IDENTITY) private readonly identity: WorkforceIdentityPort,
    private readonly sync: SyncClerkWebhook,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
  ): Promise<{ handled: boolean; reason?: string }> {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);

    let event: { type: string; data: Record<string, unknown> };
    try {
      event = await this.identity.parseWebhook(headers, raw);
    } catch {
      throw new ValidationError('Assinatura do webhook inválida', { field: 'svix-signature' });
    }

    return this.sync.execute(event);
  }
}
