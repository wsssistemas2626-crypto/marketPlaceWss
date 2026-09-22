import { describe, expect, it } from 'vitest';

import {
  ThemeService,
  type ThemeRecord,
  type ThemeRepositoryPort,
} from '../src/application/theme-service.js';
import {
  DEFAULT_THEME,
  themeSchema,
  themeToCssVariables,
  themeToStyleSheet,
  type Theme,
} from '../src/domain/theme.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';

class RepositorioEmMemoria implements ThemeRepositoryPort {
  readonly registros = new Map<string, ThemeRecord>();

  async find(tenantId: string): Promise<ThemeRecord | undefined> {
    return this.registros.get(tenantId);
  }

  async saveDraft(tenantId: string, draft: Theme): Promise<void> {
    const atual = this.registros.get(tenantId);
    this.registros.set(tenantId, { ...atual, draft });
  }

  async publish(tenantId: string, theme: Theme, publishedAt: Date): Promise<void> {
    this.registros.set(tenantId, { draft: theme, published: theme, publishedAt });
  }
}

describe('tokens de tema (RF-TEN-04)', () => {
  it('preenche o padrão quando nada é informado', () => {
    const tema = themeSchema.parse({});

    expect(tema.colors.primary).toBe('#1f6feb');
    expect(tema.typography.fontFamily).toBe('system');
    expect(tema.shape.radiusPx).toBe(8);
  });

  it('recusa cor que não é hexadecimal', () => {
    expect(() => themeSchema.parse({ colors: { primary: 'red' } })).toThrow();
    expect(() => themeSchema.parse({ colors: { primary: 'javascript:alert(1)' } })).toThrow();
    expect(themeSchema.parse({ colors: { primary: '#abc' } }).colors.primary).toBe('#abc');
  });

  it('recusa fonte fora da lista permitida', () => {
    // aceitar nome livre abriria a porta para @import de terceiro na loja
    expect(() => themeSchema.parse({ typography: { fontFamily: 'https://evil/f.css' } })).toThrow();
    expect(themeSchema.parse({ typography: { fontFamily: 'inter' } }).typography.fontFamily).toBe('inter');
  });

  it('recusa logo e favicon fora de https', () => {
    expect(() => themeSchema.parse({ brand: { logoUrl: 'http://cdn.local/logo.png' } })).toThrow();
    expect(() => themeSchema.parse({ brand: { faviconUrl: 'javascript:alert(1)' } })).toThrow();
    expect(themeSchema.parse({ brand: { logoUrl: 'https://cdn.local/logo.png' } }).brand.logoUrl).toBe(
      'https://cdn.local/logo.png',
    );
  });

  it('limita raio e peso a faixas sãs', () => {
    expect(() => themeSchema.parse({ shape: { radiusPx: 999 } })).toThrow();
    expect(() => themeSchema.parse({ typography: { headingWeight: 100 } })).toThrow();
  });

  it('gera variáveis CSS sem string livre', () => {
    const css = themeToStyleSheet(themeSchema.parse({ colors: { primary: '#ff0000' } }));

    expect(css).toContain('--mkt-color-primary: #ff0000;');
    expect(css).toContain('--mkt-font-family: system-ui');
    expect(themeToCssVariables(DEFAULT_THEME)['--mkt-radius']).toBe('8px');
  });
});

describe('ThemeService — rascunho e publicado', () => {
  it('tenant sem tema recebe o padrão nos dois', async () => {
    const service = new ThemeService(new RepositorioEmMemoria());

    expect(await service.getDraft(TENANT_A)).toEqual(DEFAULT_THEME);
    expect(await service.getPublished(TENANT_A)).toEqual(DEFAULT_THEME);
  });

  it('salvar rascunho não muda o que a loja serve', async () => {
    const service = new ThemeService(new RepositorioEmMemoria());

    await service.saveDraft(TENANT_A, { colors: { primary: '#00ff00' } });

    expect((await service.getDraft(TENANT_A)).colors.primary).toBe('#00ff00');
    // é este o ponto do rascunho: a loja continua como estava
    expect((await service.getPublished(TENANT_A)).colors.primary).toBe('#1f6feb');
  });

  it('publicar leva o rascunho para a loja', async () => {
    const service = new ThemeService(new RepositorioEmMemoria());
    await service.saveDraft(TENANT_A, { colors: { primary: '#00ff00' } });

    await service.publish(TENANT_A, new Date('2026-05-01T12:00:00.000Z'));

    expect((await service.getPublished(TENANT_A)).colors.primary).toBe('#00ff00');
  });

  it('descartar volta o rascunho para o que está no ar', async () => {
    const service = new ThemeService(new RepositorioEmMemoria());
    await service.saveDraft(TENANT_A, { colors: { primary: '#00ff00' } });
    await service.publish(TENANT_A, new Date());
    await service.saveDraft(TENANT_A, { colors: { primary: '#123456' } });

    const restaurado = await service.discardDraft(TENANT_A);

    expect(restaurado.colors.primary).toBe('#00ff00');
    expect((await service.getDraft(TENANT_A)).colors.primary).toBe('#00ff00');
  });

  it('o tema de um tenant não alcança o outro', async () => {
    const repositorio = new RepositorioEmMemoria();
    const service = new ThemeService(repositorio);

    await service.saveDraft(TENANT_A, { colors: { primary: '#00ff00' } });
    await service.publish(TENANT_A, new Date());

    expect((await service.getPublished(TENANT_B)).colors.primary).toBe('#1f6feb');
  });

  it('rascunho inválido é recusado antes de chegar ao banco', async () => {
    const repositorio = new RepositorioEmMemoria();
    const service = new ThemeService(repositorio);

    await expect(service.saveDraft(TENANT_A, { colors: { primary: 'vermelho' } })).rejects.toThrow();
    expect(repositorio.registros.size).toBe(0);
  });
});
