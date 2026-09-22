import { z } from 'zod';

import type { OrganizationKind } from '@mkt/contracts';

import type { OrgLinkRepositoryPort } from './panel-session.js';

/**
 * Eventos da Clerk que mantêm a projeção local (ADR-013).
 *
 * Só chegam aqui depois que a assinatura do webhook foi validada pelo adapter.
 * O processamento é idempotente: tudo é upsert por id da Clerk, então o
 * reenvio (que a Clerk faz) não duplica nem corrompe nada.
 */
const userEvent = z.object({
  id: z.string(),
  email_addresses: z.array(z.object({ email_address: z.string() })).default([]),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
});

const organizationEvent = z.object({
  id: z.string(),
  name: z.string().optional(),
  public_metadata: z
    .object({
      kind: z.enum(['tenant', 'seller']).optional(),
      tenantId: z.string().optional(),
      sellerId: z.string().optional(),
    })
    .default({}),
});

export interface WebhookSyncResult {
  readonly handled: boolean;
  readonly reason?: string;
}

export class SyncClerkWebhook {
  constructor(private readonly links: OrgLinkRepositoryPort) {}

  async execute(event: { type: string; data: Record<string, unknown> }): Promise<WebhookSyncResult> {
    if (event.type.startsWith('user.')) return this.syncUser(event);
    if (event.type.startsWith('organization.')) return this.syncOrganization(event);
    if (event.type.startsWith('organizationMembership.')) {
      // associações são resolvidas pelo token a cada requisição; nada a espelhar
      return { handled: true };
    }

    return { handled: false, reason: `evento ignorado: ${event.type}` };
  }

  private async syncUser(event: { type: string; data: Record<string, unknown> }): Promise<WebhookSyncResult> {
    const parsed = userEvent.safeParse(event.data);
    if (!parsed.success) return { handled: false, reason: 'payload de usuário inválido' };

    const email = parsed.data.email_addresses[0]?.email_address;
    if (email === undefined) return { handled: false, reason: 'usuário sem e-mail' };

    const name = [parsed.data.first_name, parsed.data.last_name].filter(Boolean).join(' ').trim();
    await this.links.upsertUser({
      clerkUserId: parsed.data.id,
      email,
      ...(name === '' ? {} : { name }),
    });

    return { handled: true };
  }

  private async syncOrganization(event: {
    type: string;
    data: Record<string, unknown>;
  }): Promise<WebhookSyncResult> {
    const parsed = organizationEvent.safeParse(event.data);
    if (!parsed.success) return { handled: false, reason: 'payload de organização inválido' };

    const { kind, tenantId, sellerId } = parsed.data.public_metadata;
    if (kind === undefined || tenantId === undefined) {
      // organização criada sem metadados ainda não vale como vínculo
      return { handled: false, reason: 'organização sem kind/tenantId no publicMetadata' };
    }
    if (kind === 'seller' && sellerId === undefined) {
      return { handled: false, reason: 'organização de seller sem sellerId' };
    }

    await this.links.upsert({
      clerkOrgId: parsed.data.id,
      kind: kind as OrganizationKind,
      tenantId,
      ...(sellerId === undefined ? {} : { sellerId }),
      status: event.type === 'organization.deleted' ? 'suspended' : 'active',
    });

    return { handled: true };
  }
}
