import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const identitySchema = pgSchema('identity');

/** Espelha `drizzle/0001_workforce.sql`. */
export const orgLinks = identitySchema.table('org_links', {
  clerkOrgId: text('clerk_org_id').primaryKey(),
  kind: text('kind').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  sellerId: uuid('seller_id'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workforceUsers = identitySchema.table('workforce_users', {
  clerkUserId: text('clerk_user_id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
