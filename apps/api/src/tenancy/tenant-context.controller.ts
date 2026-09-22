import { Controller, Get } from '@nestjs/common';

import { requireTenant } from '@mkt/platform';

/**
 * Diagnóstico da resolução de tenant: prova que `loja-a.localhost` e
 * `loja-b.localhost` chegam como tenants diferentes (critério de saída da
 * Fase 0 em `docs/06-plano-execucao.md`). Não expõe dado de negócio.
 */
@Controller('store/tenant-context')
export class TenantContextController {
  @Get()
  get(): { tenantId: string; slug: string; cell: string } {
    const tenant = requireTenant();
    return { tenantId: tenant.tenantId, slug: tenant.slug, cell: tenant.cell };
  }
}
