import { bigint, boolean, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export const provisioningSteps = tenancySchema.table(
  'provisioning_steps',
  {
    tenantId: uuid('tenant_id').notNull(),
    step: text('step').notNull(),
    status: text('status').notNull(),
    detail: text('detail'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.step] })],
);

export const themes = tenancySchema.table('themes', {
  tenantId: uuid('tenant_id').primaryKey(),
  draft: jsonb('draft').notNull(),
  published: jsonb('published'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supportSessions = tenancySchema.table('support_sessions', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  staffUserId: text('staff_user_id').notNull(),
  reason: text('reason').notNull(),
  scope: text('scope').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantUsage = tenancySchema.table(
  'tenant_usage',
  {
    tenantId: uuid('tenant_id').notNull(),
    metric: text('metric').notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.metric] })],
);
