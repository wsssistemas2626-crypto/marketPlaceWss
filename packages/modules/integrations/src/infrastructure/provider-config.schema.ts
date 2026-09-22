import { boolean, jsonb, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const integrationsSchema = pgSchema('integrations');

/** Espelha `drizzle/0001_init.sql` (o SQL é a fonte da verdade). */
export const providerConfigs = integrationsSchema.table(
  'provider_configs',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    category: text('category').notNull(),
    provider: text('provider').notNull(),
    credentialsEncrypted: text('credentials_encrypted').notNull(),
    settings: jsonb('settings').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('provider_configs_tenant_category_provider_unique').on(
      table.tenantId,
      table.category,
      table.provider,
    ),
  ],
);
