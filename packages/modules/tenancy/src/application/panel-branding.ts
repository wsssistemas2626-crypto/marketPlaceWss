import type { Theme } from '../domain/theme.js';
import type { TenantRegistryPort } from './tenant-registry.js';
import type { ThemeService } from './theme-service.js';

/** Marca que os painéis mostram para a organização ativa (RF-IAM-15). */
export interface PanelBranding {
  readonly tenantSlug: string;
  readonly storeName: string;
  readonly logoUrl?: string;
  readonly colors: Pick<Theme['colors'], 'primary' | 'onPrimary'>;
}

/**
 * Marca do tenant nos painéis (US-083).
 *
 * Usa o tema **publicado** — o mesmo que os compradores veem —, não o
 * rascunho: o painel não pode mudar de cara enquanto o admin experimenta
 * cores. O nome vem do tema; sem nome no tema, do cadastro do tenant.
 */
export class PanelBrandingService {
  constructor(
    private readonly themes: ThemeService,
    private readonly registry: Pick<TenantRegistryPort, 'findBySlug'>,
  ) {}

  async forTenant(tenant: { tenantId: string; slug: string }): Promise<PanelBranding> {
    const theme = await this.themes.getPublished(tenant.tenantId);
    const storeName =
      theme.brand.storeName ?? (await this.registry.findBySlug(tenant.slug))?.name ?? tenant.slug;

    return {
      tenantSlug: tenant.slug,
      storeName,
      ...(theme.brand.logoUrl === undefined ? {} : { logoUrl: theme.brand.logoUrl }),
      colors: { primary: theme.colors.primary, onPrimary: theme.colors.onPrimary },
    };
  }
}
