import { DEFAULT_THEME, themeSchema, type Theme } from '../domain/theme.js';

export interface ThemeRecord {
  readonly draft: Theme;
  readonly published?: Theme;
  readonly publishedAt?: Date;
}

export interface ThemeRepositoryPort {
  find(tenantId: string): Promise<ThemeRecord | undefined>;
  saveDraft(tenantId: string, draft: Theme): Promise<void>;
  publish(tenantId: string, theme: Theme, publishedAt: Date): Promise<void>;
}

export const THEME_REPOSITORY = Symbol('THEME_REPOSITORY');

/**
 * Tema do tenant (US-077 / RF-TEN-04).
 *
 * Duas versões convivem: o **rascunho**, que o admin edita e vê no preview, e
 * o **publicado**, que a loja serve. Sem essa separação, mexer numa cor
 * apareceria para os compradores no mesmo instante.
 *
 * Tenant sem tema recebe o padrão — a loja nunca fica sem estilo.
 */
export class ThemeService {
  constructor(private readonly repository: ThemeRepositoryPort) {}

  /** O que o admin está editando. */
  async getDraft(tenantId: string): Promise<Theme> {
    return (await this.repository.find(tenantId))?.draft ?? DEFAULT_THEME;
  }

  /** O que a loja serve. Cai no padrão enquanto nada foi publicado. */
  async getPublished(tenantId: string): Promise<Theme> {
    return (await this.repository.find(tenantId))?.published ?? DEFAULT_THEME;
  }

  /**
   * Salva o rascunho. A validação é do schema: token fora da lista, cor que
   * não é hexadecimal ou URL não-https são recusados aqui, não no CSS.
   */
  async saveDraft(tenantId: string, input: unknown): Promise<Theme> {
    const theme = themeSchema.parse(input);
    await this.repository.saveDraft(tenantId, theme);
    return theme;
  }

  async publish(tenantId: string, now: Date): Promise<Theme> {
    const draft = await this.getDraft(tenantId);
    await this.repository.publish(tenantId, draft, now);
    return draft;
  }

  /** Volta o rascunho para o que está no ar (descarta edições). */
  async discardDraft(tenantId: string): Promise<Theme> {
    const published = await this.getPublished(tenantId);
    await this.repository.saveDraft(tenantId, published);
    return published;
  }
}
