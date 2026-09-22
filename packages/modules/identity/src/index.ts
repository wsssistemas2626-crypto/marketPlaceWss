/** API pública do módulo `identity` (CLAUDE.md §4.1). */
export {
  assertKind,
  assertPermission,
  InvalidPanelTokenError,
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
export { PanelAuth, PanelAuthGuard, Requires } from './http/panel-auth.guard.js';
export { PanelAuthMiddleware, type PanelRequest } from './http/panel-auth.middleware.js';
export { IdentityModule, type IdentityModuleOptions } from './identity.module.js';
export { DrizzleOrgLinkRepository } from './infrastructure/drizzle-org-link.repository.js';
