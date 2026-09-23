import { inet, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

/** Espelha `drizzle/0002_customers.sql` — colunas `pii` nunca vão para log. */
export const customers = identitySchema.table('customers', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  documentType: text('document_type').notNull(),
  documentNumber: text('document_number').notNull(),
  passwordHash: text('password_hash').notNull(),
  status: text('status').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

export const customerConsents = identitySchema.table('customer_consents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  kind: text('kind').notNull(),
  version: text('version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
  ip: inet('ip').notNull(),
});

export const customerEmailVerifications = identitySchema.table('customer_email_verifications', {
  tokenHash: text('token_hash').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Espelha `drizzle/0003_customer_sessions.sql`. */
export const customerRefreshTokens = identitySchema.table('customer_refresh_tokens', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
