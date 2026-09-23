/** API pública do módulo `identity` (CLAUDE.md §4.1). */
export {
  assertKind,
  assertPermission,
  assertMfa,
  InvalidPanelTokenError,
  MfaRequiredError,
  MissingPermissionError,
  ORG_LINK_REPOSITORY,
  OrganizationNotLinkedError,
  PanelAuthError,
  toPanelSession,
  WORKFORCE_IDENTITY,
  WrongOrganizationKindError,
  type OrgLink,
  type OrgLinkRepositoryPort,
  type PanelSession,
} from './application/panel-session.js';
export { SyncClerkWebhook, type WebhookSyncResult } from './application/sync-clerk-webhook.js';
export {
  CONSOLE_IDENTITY,
  ConsoleAuth,
  ConsoleAuthGuard,
  ConsoleAuthMiddleware,
  type ConsoleRequest,
  type ConsoleSession,
} from './http/console-auth.js';
export {
  PANEL_AUTH_POLICY,
  PanelAuth,
  PanelAuthGuard,
  Requires,
  type PanelAuthPolicy,
} from './http/panel-auth.guard.js';
export {
  CUSTOMER_AUTH,
  describeRouteAccess,
  findRouteAccessViolations,
  type RouteAccess,
  type RouteToAudit,
} from './http/route-access.js';
export { PanelAuthMiddleware, type PanelRequest } from './http/panel-auth.middleware.js';
export { IdentityModule, type IdentityModuleOptions } from './identity.module.js';
export { DrizzleOrgLinkRepository } from './infrastructure/drizzle-org-link.repository.js';
export {
  CUSTOMER_MAILER,
  CUSTOMER_REPOSITORY,
  type CustomerMailerPort,
  type CustomerRepositoryPort,
} from './application/customers/ports.js';
export { RegisterCustomer, type RegisterCustomerCommand } from './application/customers/register-customer.js';
export { VerifyCustomerEmail } from './application/customers/verify-customer-email.js';
