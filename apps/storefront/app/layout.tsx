import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { fetchFromApi } from '../lib/api';

interface ThemeResponse {
  theme: { brand?: { storeName?: string; faviconUrl?: string } };
  cssVariables: Record<string, string>;
}

/**
 * Tema publicado do tenant (US-077).
 *
 * O storefront não fala com o banco: pede à API, que resolve o tenant pelo
 * host (CLAUDE.md §9) — via X-Forwarded-Host assinado, porque `Host` é
 * forbidden header no fetch e seria descartado (ver lib/api.ts).
 */
const fetchTheme = (): Promise<ThemeResponse | undefined> =>
  // loja no ar com o estilo padrão é melhor que loja fora do ar: o helper
  // devolve undefined em vez de lançar
  fetchFromApi<ThemeResponse>('/v1/store/theme');

export async function generateMetadata(): Promise<Metadata> {
  const theme = await fetchTheme();
  const storeName = theme?.theme.brand?.storeName ?? 'Storefront';

  return {
    title: storeName,
    description: `${storeName} — loja do marketplace.`,
    ...(theme?.theme.brand?.faviconUrl === undefined
      ? {}
      : { icons: { icon: theme.theme.brand.faviconUrl } }),
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await fetchTheme();

  return (
    <html lang="pt-BR">
      <body
        style={{
          // tokens validados pelo schema no servidor; nenhuma string livre
          // do tenant chega ao CSS (ver domain/theme.ts)
          ...(theme?.cssVariables as React.CSSProperties | undefined),
          background: 'var(--mkt-color-background, #fff)',
          color: 'var(--mkt-color-text, #1f2328)',
          fontFamily: 'var(--mkt-font-family, system-ui, sans-serif)',
          margin: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
