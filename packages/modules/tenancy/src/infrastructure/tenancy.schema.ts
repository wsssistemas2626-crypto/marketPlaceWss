import { boolean, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tenancySchema = pgSchema('tenancy');

/** Espelha `drizzle/0001_init.sql` (o SQL é a fonte da verdade). */
export const plans = tenancySchema.table('plans', {
  planId: text('plan_id').primaryKey(),
  name: text('name').notNull(),
  entitlements: jsonb('entitlements').notNull(),
  settings: jsonb('settings').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = tenancySchema.table('tenants', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  cell: text('cell').notNull(),
  planId: text('plan_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const domains = tenancySchema.table('domains', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  hostname: text('hostname').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSettings = tenancySchema.table('tenant_settings', {
  tenantId: uuid('tenant_id').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
