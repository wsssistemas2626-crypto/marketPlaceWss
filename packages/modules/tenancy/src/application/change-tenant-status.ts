import { type Clock, createDomainEvent, NotFoundError, ValidationError } from '@mkt/shared-kernel';
import type { TenantStatus } from '@mkt/platform';

import type { EventPublisherPort, TransactionPort } from './provision-tenant.js';
import type { TenantRegistryPort, TenantSummary } from './tenant-registry.js';

/** Transições válidas do ciclo de vida (`06-multi-tenancy.md` §9). */
const ALLOWED: Record<TenantStatus, readonly TenantStatus[]> = {
  provisioning: ['trial', 'active', 'cancelled'],
  trial: ['active', 'suspended', 'cancelled'],
  active: ['suspended', 'cancelled'],
  suspended: ['active', 'trial', 'cancelled'],
  cancelled: [],
};

export interface ChangeTenantStatusCommand {
  readonly tenantId: string;
  readonly status: TenantStatus;
  readonly reason?: string;
}

/**
 * Suspende, reativa ou cancela um tenant (US-080 / RF-TEN-06).
 *
 * A transição é validada contra a máquina de estados — é o que impede, por
 * exemplo, "reativar" um tenant cancelado por engano (CLAUDE.md §4.7).
 *
 * **O que a suspensão NÃO faz** (RN-TEN-04): parar o processamento de eventos.
 * O storefront fica indisponível e as APIs respondem 403, mas pagamento,
 * entrega e repasse de pedidos em andamento seguem — o dinheiro dos sellers
 * não pode ficar preso pela inadimplência do operador. Por isso o consumidor
 * de eventos abre o contexto pelo `tenantid` do envelope, sem consultar status.
 */
export class ChangeTenantStatus {
  constructor(
    private readonly registry: TenantRegistryPort,
    private readonly events: EventPublisherPort,
    private readonly transaction: TransactionPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: ChangeTenantStatusCommand): Promise<TenantSummary> {
    const tenants = await this.registry.list();
    const tenant = tenants.find((candidate) => candidate.id === command.tenantId);
    if (tenant === undefined) throw new NotFoundError('Tenant', { tenantId: command.tenantId });

    if (tenant.status === command.status) return tenant;

    if (!ALLOWED[tenant.status].includes(command.status)) {
      throw new ValidationError(`Transição inválida: ${tenant.status} → ${command.status}`, {
        from: tenant.status,
        to: command.status,
      });
    }

    return this.transaction.run(async () => {
      const atualizado = await this.registry.changeStatus(command.tenantId, command.status);

      await this.events.publish(
        createDomainEvent(
          {
            type: 'tenancy.tenant.status_changed',
            source: 'mkt/tenancy',
            tenantId: command.tenantId,
            subject: `tenant/${command.tenantId}`,
            data: {
              tenantId: command.tenantId,
              slug: tenant.slug,
              from: tenant.status,
              to: command.status,
              ...(command.reason === undefined ? {} : { reason: command.reason }),
            },
          },
          this.clock,
        ),
      );

      return atualizado;
    });
  }
}
