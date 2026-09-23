import { z } from 'zod';

import { registerEvent } from './catalog.js';

/**
 * Eventos do módulo `tenancy` (US-076/US-080).
 *
 * `tenant.created` é o gatilho do provisionamento: cada módulo semeia os
 * próprios dados ao recebê-lo e confirma pela fachada do tenancy. Quando todos
 * confirmam, o tenant sai de `provisioning` e o `tenant.provisioned` é
 * publicado (`06-multi-tenancy.md` §9).
 */
export const tenantCreatedData = z.object({
  tenantId: z.string(),
  slug: z.string(),
  name: z.string(),
  planId: z.string().optional(),
  /** Template de categorias/conteúdo escolhido pelo staff (ex.: "moda"). */
  template: z.string().optional(),
});

export type TenantCreatedData = z.infer<typeof tenantCreatedData>;

export const TENANT_CREATED = registerEvent({
  type: 'tenancy.tenant.created',
  version: 1,
  schema: tenantCreatedData,
  isPublic: false,
  description: 'Um tenant foi registrado e o provisionamento começou.',
});

export const tenantProvisionedData = z.object({
  tenantId: z.string(),
  slug: z.string(),
  /** Módulos que confirmaram o seed. */
  seededModules: z.array(z.string()),
});

export type TenantProvisionedData = z.infer<typeof tenantProvisionedData>;

export const TENANT_PROVISIONED = registerEvent({
  type: 'tenancy.tenant.provisioned',
  version: 1,
  schema: tenantProvisionedData,
  isPublic: false,
  description: 'O provisionamento terminou e o tenant passou a atender requisições.',
});

export const tenantStatusChangedData = z.object({
  tenantId: z.string(),
  slug: z.string(),
  from: z.string(),
  to: z.string(),
  reason: z.string().optional(),
});

export type TenantStatusChangedData = z.infer<typeof tenantStatusChangedData>;

export const TENANT_STATUS_CHANGED = registerEvent({
  type: 'tenancy.tenant.status_changed',
  version: 1,
  schema: tenantStatusChangedData,
  isPublic: false,
  description: 'Mudança de status do tenant (suspensão, reativação, cancelamento).',
});
