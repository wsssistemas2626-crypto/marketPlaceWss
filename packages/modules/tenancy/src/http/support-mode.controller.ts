import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';

import { ConsoleAuth, PanelAuth, Requires, type ConsoleRequest } from '@mkt/modules-identity';
import { requireTenant } from '@mkt/platform';
import { ValidationError } from '@mkt/shared-kernel';

import { SupportMode, type SupportSession } from '../application/support-mode.js';

const openSchema = z.object({
  reason: z.string().min(10).max(500),
  durationMinutes: z.number().int().min(1).max(120).optional(),
  scope: z.enum(['read_only', 'write']).optional(),
});

interface SupportSessionResponse {
  readonly id: string;
  readonly staffUserId: string;
  readonly reason: string;
  readonly scope: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
  readonly createdAt: string;
}

const toResponse = (session: SupportSession): SupportSessionResponse => ({
  id: session.id,
  staffUserId: session.staffUserId,
  reason: session.reason,
  scope: session.scope,
  expiresAt: session.expiresAt.toISOString(),
  ...(session.revokedAt === undefined ? {} : { revokedAt: session.revokedAt.toISOString() }),
  createdAt: session.createdAt.toISOString(),
});

/** Staff abrindo acesso a um tenant (console, sem TenantContext). */
@Controller('platform/tenants/:tenantId/support-sessions')
@ConsoleAuth()
export class PlatformSupportController {
  constructor(@Inject(SupportMode) private readonly support: SupportMode) {}

  @Post()
  async open(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    // a sessão do console diz **quem** está pedindo; sem isso não há auditoria
    @Req() request: ConsoleRequest,
  ): Promise<SupportSessionResponse> {
    const parsed = openSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Pedido inválido', { field: 'reason' });
    }

    const staffUserId = request.consoleSession?.userId;
    if (staffUserId === undefined) {
      throw new ValidationError('Sessão do console ausente', { field: 'authorization' });
    }

    const session = await this.support.open({
      tenantId,
      staffUserId,
      reason: parsed.data.reason,
      ...(parsed.data.durationMinutes === undefined ? {} : { durationMinutes: parsed.data.durationMinutes }),
      ...(parsed.data.scope === undefined ? {} : { scope: parsed.data.scope }),
    });

    return toResponse(session);
  }

  @Get()
  async list(@Param('tenantId') tenantId: string): Promise<{ data: SupportSessionResponse[] }> {
    return { data: (await this.support.listByTenant(tenantId)).map(toResponse) };
  }

  @Delete(':sessionId')
  async revoke(
    @Param('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<{ revoked: true }> {
    await this.support.revoke(tenantId, sessionId);
    return { revoked: true };
  }
}

/**
 * O admin do tenant vê os acessos da plataforma à conta dele.
 *
 * É o outro lado do §7: modo suporte não é impersonação silenciosa. Quem foi
 * acessado enxerga quem entrou, quando, por quê e até quando.
 */
@Controller('admin/support-sessions')
@PanelAuth('tenant')
export class AdminSupportController {
  constructor(@Inject(SupportMode) private readonly support: SupportMode) {}

  @Get()
  @Requires('org:settings:read')
  async list(): Promise<{ data: SupportSessionResponse[] }> {
    const sessions = await this.support.listByTenant(requireTenant().tenantId);
    return { data: sessions.map(toResponse) };
  }
}
