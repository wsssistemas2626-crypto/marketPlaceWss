import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, TenantAwareRepository, type DatabasePool } from '@mkt/platform';
import { Money } from '@mkt/shared-kernel';

import type { WidgetRepositoryPort } from '../application/widget-repository.port.js';
import { Widget, type WidgetSnapshot } from '../domain/widget.js';
import { widgets } from './widget.schema.js';

interface WidgetRow {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const toDomain = (row: WidgetRow): Widget =>
  Widget.restore({
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    name: row.name,
    price: Money.fromCents(row.priceCents),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies WidgetSnapshot);

/**
 * Repositório Drizzle.
 *
 * Nenhuma consulta escreve `WHERE tenant_id = ...`: o `useTenantClient` roda
 * tudo dentro de uma transação com `SET LOCAL app.tenant_id`, e as policies de
 * RLS fazem o filtro. Assim, esquecer o filtro não vaza dados — só devolve
 * zero linhas (ADR-012).
 */
@Injectable()
export class DrizzleWidgetRepository extends TenantAwareRepository implements WidgetRepositoryPort {
  constructor(@Inject(DATABASE_POOL) pool: DatabasePool) {
    super(pool);
  }

  async save(widget: Widget): Promise<void> {
    const snapshot = widget.toSnapshot();

    await this.withTenant(async (client) => {
      await drizzle(client)
        .insert(widgets)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          slug: snapshot.slug,
          name: snapshot.name,
          priceCents: snapshot.price.cents,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        })
        .onConflictDoUpdate({
          target: [widgets.tenantId, widgets.slug],
          set: {
            name: snapshot.name,
            priceCents: snapshot.price.cents,
            updatedAt: snapshot.updatedAt,
          },
        });
    });
  }

  async findBySlug(slug: string): Promise<Widget | undefined> {
    return this.withTenant(async (client) => {
      const rows = await drizzle(client).select().from(widgets).where(eq(widgets.slug, slug)).limit(1);
      const row = rows[0];
      return row === undefined ? undefined : toDomain(row);
    });
  }

  async list(limit: number): Promise<Widget[]> {
    return this.withTenant(async (client) => {
      const rows = await drizzle(client).select().from(widgets).orderBy(desc(widgets.createdAt)).limit(limit);
      return rows.map(toDomain);
    });
  }
}
