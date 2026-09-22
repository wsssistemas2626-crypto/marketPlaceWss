import { bigint, index, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** Um schema Postgres por módulo (ADR-003). */
export const templateSchema = pgSchema('template');

/**
 * Espelha `drizzle/0001_init.sql`. O SQL é a fonte da verdade (ele carrega
 * grants e policies de RLS, que o Drizzle não modela); este arquivo dá tipo às
 * consultas.
 */
export const widgets = templateSchema.table(
  'widgets',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('widgets_tenant_slug_unique').on(table.tenantId, table.slug),
    index('widgets_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);
