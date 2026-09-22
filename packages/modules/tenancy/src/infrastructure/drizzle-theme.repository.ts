import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, TenantAwareRepository, type DatabasePool } from '@mkt/platform';

import type { ThemeRecord, ThemeRepositoryPort } from '../application/theme-service.js';
import { themeSchema, type Theme } from '../domain/theme.js';
import { themes } from './tenancy.schema.js';

/**
 * Persistência do tema.
 *
 * Herda de `TenantAwareRepository`: a tabela tem RLS, e as consultas rodam no
 * contexto do tenant — o admin de um tenant não alcança o tema de outro nem
 * por id.
 */
@Injectable()
export class DrizzleThemeRepository extends TenantAwareRepository implements ThemeRepositoryPort {
  constructor(@Inject(DATABASE_POOL) pool: DatabasePool) {
    super(pool);
  }

  async find(tenantId: string): Promise<ThemeRecord | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client).select().from(themes).where(eq(themes.tenantId, tenantId)).limit(1);
      if (row === undefined) return undefined;

      return {
        draft: themeSchema.parse(row.draft ?? {}),
        ...(row.published === null ? {} : { published: themeSchema.parse(row.published) }),
        ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt }),
      };
    });
  }

  async saveDraft(tenantId: string, draft: Theme): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .insert(themes)
        .values({ tenantId, draft })
        .onConflictDoUpdate({ target: themes.tenantId, set: { draft, updatedAt: new Date() } });
    });
  }

  async publish(tenantId: string, theme: Theme, publishedAt: Date): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .insert(themes)
        .values({ tenantId, draft: theme, published: theme, publishedAt })
        .onConflictDoUpdate({
          target: themes.tenantId,
          set: { published: theme, publishedAt, updatedAt: publishedAt },
        });
    });
  }
}
