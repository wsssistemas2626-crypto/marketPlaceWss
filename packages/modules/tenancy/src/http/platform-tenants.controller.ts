import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';

import { ConsoleAuth } from '@mkt/modules-identity';
import { NotFoundError, ValidationError } from '@mkt/shared-kernel';

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
  ) {}

  @Get()
  async list(): Promise<{ data: TenantSummary[] }> {
    return { data: await this.registry.list() };
  }

  @Get(':slug')
  async bySlug(@Param('slug') slug: string): Promise<TenantSummary> {
    const tenant = await this.registry.findBySlug(slug);
    if (tenant === undefined) throw new NotFoundError('Tenant');

    return tenant;
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

    return this.registry.changeStatus(tenantId, parsed.data.status);
  }
}
