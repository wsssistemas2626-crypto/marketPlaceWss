import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';

import { IntegrationHub } from '@mkt/modules-integrations';
import { ConsoleAuth } from '@mkt/modules-identity';
import { NotFoundError, ValidationError } from '@mkt/shared-kernel';

import { ChangeTenantStatus } from '../application/change-tenant-status.js';
import { TenantUsageProjection, type TenantUsage } from '../application/tenant-usage.js';
import { ProvisionTenant, type ProvisionTenantResult } from '../application/provision-tenant.js';
import {
  TENANT_REGISTRY,
  type TenantRegistryPort,
  type TenantSummary,
} from '../application/tenant-registry.js';

const provisionSchema = z.object({
  // o e-mail do admin é obrigatório: tenant sem quem administre não serve
  adminEmail: z.email(),
  template: z.string().min(1).max(40).optional(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug deve ser minúsculo, com hífens'),
  name: z.string().min(1).max(120),
  planId: z.string().min(1).optional(),
  hostname: z.string().min(3).optional(),
});

const statusSchema = z.object({
  status: z.enum(['provisioning', 'trial', 'active', 'suspended', 'cancelled']),
  // motivo fica no evento e no histórico: suspensão sem motivo não se explica
  reason: z.string().min(5).max(300).optional(),
});

/**
 * Rotas do console da plataforma (`/v1/platform/*`, CLAUDE.md §5).
 *
 * São **sem tenant**: quem chama é o staff, autenticado na aplicação Clerk
 * Console. Nenhuma rota daqui pode ser alcançada por um admin de tenant.
 */
@Controller('platform/tenants')
@ConsoleAuth()
export class PlatformTenantsController {
  constructor(
    @Inject(TENANT_REGISTRY) private readonly registry: TenantRegistryPort,
    private readonly provisionTenant: ProvisionTenant,
    private readonly changeTenantStatus: ChangeTenantStatus,
    private readonly usage: TenantUsageProjection,
    private readonly integrations: IntegrationHub,
  ) {}

  /** Linha da lista do console: tenant + uso + integrações ativas (RF-TEN-11). */
  private async comUso(
    tenant: TenantSummary,
  ): Promise<TenantSummary & { usage: TenantUsage; integrations: { category: string; provider: string }[] }> {
    const [usage, integrations] = await Promise.all([
      this.usage.get(tenant.id),
      this.integrations.healthOf(tenant.id),
    ]);

    return { ...tenant, usage, integrations };
  }

  @Get()
  async list(): Promise<{ data: Awaited<ReturnType<PlatformTenantsController['comUso']>>[] }> {
    const tenants = await this.registry.list();
    return { data: await Promise.all(tenants.map((tenant) => this.comUso(tenant))) };
  }

  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    const tenant = await this.registry.findBySlug(slug);
    if (tenant === undefined) throw new NotFoundError('Tenant');

    return this.comUso(tenant);
  }

  /**
   * Provisiona um tenant (RF-TEN-01). Reexecutar com o mesmo slug retoma o
   * que ficou pendente, em vez de duplicar — ver ProvisionTenant.
   */
  @Post()
  async provision(@Body() body: unknown): Promise<ProvisionTenantResult> {
    const parsed = provisionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(issue?.message ?? 'Corpo inválido', {
        field: issue?.path.join('.') ?? 'body',
      });
    }

    const { slug, name, planId, hostname, adminEmail, template } = parsed.data;

    return this.provisionTenant.execute({
      slug,
      name,
      adminEmail,
      ...(planId === undefined ? {} : { planId }),
      ...(hostname === undefined ? {} : { hostname }),
      ...(template === undefined ? {} : { template }),
    });
  }

  @Patch(':tenantId/status')
  async changeStatus(@Param('tenantId') tenantId: string, @Body() body: unknown): Promise<TenantSummary> {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Status inválido', { field: 'status' });

    return this.changeTenantStatus.execute({
      tenantId,
      status: parsed.data.status,
      ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
    });
  }
}
