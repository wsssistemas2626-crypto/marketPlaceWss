import { Inject, Injectable } from '@nestjs/common';

import type { CloudEvent } from '@mkt/contracts';

import { TenantUsageProjection } from '../application/tenant-usage.js';

/**
 * Alimenta a projeção de uso do console (US-081).
 *
 * Fica aqui, no `tenancy`, e não em cada módulo: quem publica um evento de
 * produto ou de pedido não precisa saber que existe um contador do outro lado.
 */
@Injectable()
export class TenantUsageHandler {
  static readonly handlerName = 'tenancy.usage.projection';

  constructor(@Inject(TenantUsageProjection) private readonly projection: TenantUsageProjection) {}

  async handle(event: CloudEvent): Promise<void> {
    await this.projection.apply({ type: event.type, tenantid: event.tenantid, data: event.data });
  }

  /** Tipos que o consumidor precisa rotear para cá. */
  static get observedEventTypes(): string[] {
    return TenantUsageProjection.observedEventTypes;
  }
}
