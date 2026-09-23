import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, useTransaction, type DatabasePool } from '@mkt/platform';
import { SystemClock } from '@mkt/shared-kernel';

import type { ProvisioningStepsPort, StepRecord } from '../application/provision-tenant.js';
import { provisioningSteps } from './tenancy.schema.js';

/**
 * Etapas do provisionamento.
 *
 * Roda sem TenantContext (o tenant está nascendo), mas **sempre** sabe de que
 * tenant se trata, então define `app.tenant_id` explicitamente e a tabela
 * mantém RLS como qualquer outra. Entra na transação em andamento quando há
 * uma, para a etapa ser registrada junto da escrita que ela representa.
 */
@Injectable()
export class DrizzleProvisioningSteps implements ProvisioningStepsPort {
  private readonly clock = new SystemClock();

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  /** Toda consulta roda com o tenant da etapa no contexto do Postgres. */
  private async comTenant<T>(
    tenantId: string,
    work: (client: import('@mkt/platform').DatabaseClient) => Promise<T>,
  ): Promise<T> {
    return useTransaction(this.pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      return work(client);
    });
  }

  async list(tenantId: string): Promise<StepRecord[]> {
    const rows = await this.comTenant(tenantId, (client) =>
      drizzle(client).select().from(provisioningSteps).where(eq(provisioningSteps.tenantId, tenantId)),
    );

    return rows.map((row) => ({
      step: row.step,
      status: row.status as StepRecord['status'],
      ...(row.detail === null ? {} : { detail: row.detail }),
    }));
  }

  private async upsert(
    tenantId: string,
    step: string,
    status: StepRecord['status'],
    detail?: string,
  ): Promise<void> {
    await this.comTenant(tenantId, async (client) => {
      await drizzle(client)
        .insert(provisioningSteps)
        .values({ tenantId, step, status, detail: detail ?? null })
        .onConflictDoUpdate({
          target: [provisioningSteps.tenantId, provisioningSteps.step],
          set: { status, detail: detail ?? null, updatedAt: this.clock.now() },
        });
    });
  }

  async markDone(tenantId: string, step: string, detail?: string): Promise<void> {
    await this.upsert(tenantId, step, 'done', detail);
  }

  async markFailed(tenantId: string, step: string, detail: string): Promise<void> {
    // só registra a falha se a etapa ainda não estiver concluída: uma
    // reexecução não pode "desfazer" o que já deu certo
    const atual = (await this.list(tenantId)).find((candidate) => candidate.step === step);
    if (atual?.status === 'done') return;

    await this.upsert(tenantId, step, 'failed', detail);
  }
}

export { provisioningSteps };
