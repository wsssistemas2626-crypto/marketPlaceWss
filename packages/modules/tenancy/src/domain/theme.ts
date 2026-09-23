import { z } from 'zod';

/**
 * Tokens de design do tenant (RF-TEN-04).
 *
 * É uma lista **fechada** de tokens, não CSS livre: o storefront injeta isto
 * como CSS custom properties, e aceitar CSS arbitrário de um tenant seria
 * entregar execução de estilo (e, com `url()`, exfiltração) na página de
 * outro cliente. Personalização vem de configuração, não de código
 * (CLAUDE.md §9).
 */
const cor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'use uma cor hexadecimal, ex.: #1f6feb');

const urlSegura = z.url().refine((value) => value.startsWith('https://'), 'a URL precisa ser https');

export const themeSchema = z.object({
  colors: z
    .object({
      primary: cor.default('#1f6feb'),
      onPrimary: cor.default('#ffffff'),
      background: cor.default('#ffffff'),
      surface: cor.default('#f6f8fa'),
      text: cor.default('#1f2328'),
      muted: cor.default('#656d76'),
      danger: cor.default('#cf222e'),
      success: cor.default('#1a7f37'),
    })
    .prefault({}),
  typography: z
    .object({
      // nome de família, não URL: a fonte vem da nossa lista permitida
      fontFamily: z.enum(['system', 'inter', 'roboto', 'lora', 'poppins']).default('system'),
      headingWeight: z.number().int().min(400).max(900).default(700),
    })
    .prefault({}),
  shape: z
    .object({
      radiusPx: z.number().int().min(0).max(32).default(8),
      density: z.enum(['compact', 'comfortable']).default('comfortable'),
    })
    .prefault({}),
  brand: z
    .object({
      logoUrl: urlSegura.optional(),
      faviconUrl: urlSegura.optional(),
      storeName: z.string().min(1).max(60).optional(),
    })
    .prefault({}),
});

export type Theme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: Theme = themeSchema.parse({});

/**
 * Converte o tema em CSS custom properties.
 *
 * Os valores já passaram pelo schema, então não há string livre indo para o
 * CSS — o que fecha a porta de injeção via token.
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  const fonts: Record<Theme['typography']['fontFamily'], string> = {
    system: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    inter: 'Inter, system-ui, sans-serif',
    roboto: 'Roboto, system-ui, sans-serif',
    lora: 'Lora, Georgia, serif',
    poppins: 'Poppins, system-ui, sans-serif',
  };

  return {
    '--mkt-color-primary': theme.colors.primary,
    '--mkt-color-on-primary': theme.colors.onPrimary,
    '--mkt-color-background': theme.colors.background,
    '--mkt-color-surface': theme.colors.surface,
    '--mkt-color-text': theme.colors.text,
    '--mkt-color-muted': theme.colors.muted,
    '--mkt-color-danger': theme.colors.danger,
    '--mkt-color-success': theme.colors.success,
    '--mkt-font-family': fonts[theme.typography.fontFamily],
    '--mkt-heading-weight': String(theme.typography.headingWeight),
    '--mkt-radius': `${theme.shape.radiusPx}px`,
    '--mkt-space': theme.shape.density === 'compact' ? '0.5rem' : '0.75rem',
  };
}

/** Bloco `:root { … }` pronto para o storefront injetar. */
export function themeToStyleSheet(theme: Theme): string {
  const variaveis = Object.entries(themeToCssVariables(theme))
    .map(([nome, valor]) => `  ${nome}: ${valor};`)
    .join('\n');

  return `:root {\n${variaveis}\n}`;
}
