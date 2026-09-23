import { Inject, Injectable, Logger } from '@nestjs/common';

import { tenantCreatedData, type CloudEvent } from '@mkt/contracts';
import { CompleteProvisioning } from '@mkt/modules-tenancy';
import { Money } from '@mkt/shared-kernel';

import { CreateWidget } from '../application/create-widget.js';

/**
 * Seed do módulo no provisionamento de um tenant novo (US-076).
 *
 * Cada módulo reage a `tenancy.tenant.created` semeando o que é dele — aqui,
 * um widget de exemplo para o tenant não nascer vazio. Quando termina, avisa o
 * `tenancy` **pela fachada**, que é como um módulo fala com outro de forma
 * síncrona (CLAUDE.md §4.2). Só quando todos confirmam é que o tenant sai de
 * `provisioning`.
 */
@Injectable()
export class TenantCreatedHandler {
  static readonly handlerName = 'template.tenant-created.seed';
  static readonly moduleName = 'template';

  private readonly logger = new Logger(TenantCreatedHandler.name);

  constructor(
    private readonly createWidget: CreateWidget,
    @Inject(CompleteProvisioning) private readonly provisioning: CompleteProvisioning,
  ) {}

  async handle(event: CloudEvent): Promise<void> {
    const data = tenantCreatedData.parse(event.data);

    // o próprio caso de uso é idempotente por slug: reprocessar o evento não
    // cria dois widgets
    const resultado = await this.createWidget.execute({
      tenantId: data.tenantId,
      slug: 'bem-vindo',
      name: `Widget de boas-vindas — ${data.name}`,
      priceCents: Money.fromCents(0).cents,
      ...(event.correlationid === undefined ? {} : { correlationId: event.correlationid }),
    });

    if (!resultado.ok && resultado.error.code !== 'conflict') throw resultado.error;

    const confirmacao = await this.provisioning.confirmModuleSeed(
      data.tenantId,
      TenantCreatedHandler.moduleName,
    );

    this.logger.log(
      confirmacao.activated
        ? `tenant ${data.slug} provisionado: todos os módulos semearam`
        : `seed do template pronto para ${data.slug}; faltam: ${confirmacao.pendingModules.join(', ')}`,
    );
  }
}
