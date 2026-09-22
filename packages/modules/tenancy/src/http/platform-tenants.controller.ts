import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';

import { ConsoleAuth } from '@mkt/modules-identity';
import { NotFoundError, ValidationError } from '@mkt/shared-kernel';

import {
  TENANT_REGISTRY,
  type TenantRegistryPort,
  type TenantSummary,
} from '../application/tenant-registry.js';

const provisionSchema = z.object({
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
  constructor(@Inject(TENANT_REGISTRY) private readonly registry: TenantRegistryPort) {}

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

  @Post()
  async provision(@Body() body: unknown): Promise<TenantSummary> {
    const parsed = provisionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(issue?.message ?? 'Corpo inválido', {
        field: issue?.path.join('.') ?? 'body',
      });
    }

    const { slug, name, planId, hostname } = parsed.data;

    return this.registry.provision({
      slug,
      name,
      ...(planId === undefined ? {} : { planId }),
      ...(hostname === undefined ? {} : { hostname }),
    });
  }

  @Patch(':tenantId/status')
  async changeStatus(@Param('tenantId') tenantId: string, @Body() body: unknown): Promise<TenantSummary> {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Status inválido', { field: 'status' });

    return this.registry.changeStatus(tenantId, parsed.data.status);
  }
}
