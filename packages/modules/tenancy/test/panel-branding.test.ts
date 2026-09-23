import { describe, expect, it } from 'vitest';

import { PanelBrandingService } from '../src/application/panel-branding.js';
import type { TenantSummary } from '../src/application/tenant-registry.js';
import {
  ThemeService,
  type ThemeRecord,
  type ThemeRepositoryPort,
} from '../src/application/theme-service.js';
import { DEFAULT_THEME, themeSchema, type Theme } from '../src/domain/theme.js';

class TemasEmMemoria implements ThemeRepositoryPort {
  readonly registros = new Map<string, ThemeRecord>();

  async find(tenantId: string): Promise<ThemeRecord | undefined> {
    return this.registros.get(tenantId);
  }

  async saveDraft(tenantId: string, draft: Theme): Promise<void> {
    this.registros.set(tenantId, { ...this.registros.get(tenantId), draft });
  }

  async publish(tenantId: string, theme: Theme, publishedAt: Date): Promise<void> {
    this.registros.set(tenantId, { draft: theme, published: theme, publishedAt });
  }
}

const registro = (tenants: TenantSummary[]) => ({
  findBySlug: async (slug: string) => tenants.find((tenant) => tenant.slug === slug),
});

const lojaA: TenantSummary = {
  id: 'tenant-a',
  slug: 'loja-a',
  name: 'Loja A Cadastrada',
  status: 'active',
  cell: 'shared-1',
  hosts: [],
};

describe('PanelBrandingService — marca do tenant nos painéis (US-083)', () => {
  it('usa o tema publicado: nome, logo e cores', async () => {
    const temas = new TemasEmMemoria();
    const publicado = themeSchema.parse({
      colors: { primary: '#e11d48', onPrimary: '#ffffff' },
      brand: { storeName: 'Loja A Oficial', logoUrl: 'https://cdn.exemplo.com/logo.png' },
    });
    await temas.publish('tenant-a', publicado, new Date());

    const marca = await new PanelBrandingService(new ThemeService(temas), registro([lojaA])).forTenant({
      tenantId: 'tenant-a',
      slug: 'loja-a',
    });

    expect(marca).toEqual({
      tenantSlug: 'loja-a',
      storeName: 'Loja A Oficial',
      logoUrl: 'https://cdn.exemplo.com/logo.png',
      colors: { primary: '#e11d48', onPrimary: '#ffffff' },
    });
  });

  it('o rascunho não aparece no painel antes de publicado', async () => {
    const temas = new TemasEmMemoria();
    await temas.saveDraft('tenant-a', themeSchema.parse({ colors: { primary: '#000000' } }));

    const marca = await new PanelBrandingService(new ThemeService(temas), registro([lojaA])).forTenant({
      tenantId: 'tenant-a',
      slug: 'loja-a',
    });

    expect(marca.colors.primary).toBe(DEFAULT_THEME.colors.primary);
  });

  it('sem nome no tema, usa o nome do cadastro do tenant', async () => {
    const marca = await new PanelBrandingService(
      new ThemeService(new TemasEmMemoria()),
      registro([lojaA]),
    ).forTenant({ tenantId: 'tenant-a', slug: 'loja-a' });

    expect(marca.storeName).toBe('Loja A Cadastrada');
    expect(marca).not.toHaveProperty('logoUrl');
  });

  it('cada tenant recebe a própria marca', async () => {
    const temas = new TemasEmMemoria();
    await temas.publish('tenant-a', themeSchema.parse({ brand: { storeName: 'A' } }), new Date());
    await temas.publish('tenant-b', themeSchema.parse({ brand: { storeName: 'B' } }), new Date());
    const servico = new PanelBrandingService(new ThemeService(temas), registro([]));

    expect((await servico.forTenant({ tenantId: 'tenant-a', slug: 'loja-a' })).storeName).toBe('A');
    expect((await servico.forTenant({ tenantId: 'tenant-b', slug: 'loja-b' })).storeName).toBe('B');
  });
});
