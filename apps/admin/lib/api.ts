import { auth } from '@clerk/nextjs/server';

export const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3100';

export interface PanelResult<T> {
  readonly data?: T;
  readonly error?: string;
}

/**
 * Chamada à API com o token da Clerk da sessão atual.
 *
 * O painel não conhece o tenant: quem decide é a API, conferindo a organização
 * ativa contra `identity.org_links` (ADR-013). Por isso aqui só vai o token —
 * nunca um `tenantId` vindo do navegador (CLAUDE.md §4.11).
 */
export async function panelFetch<T>(path: string, init?: RequestInit): Promise<PanelResult<T>> {
  const { getToken } = await auth();
  const token = await getToken();

  if (token === null) return { error: 'Faça login para continuar.' };

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init?.headers,
      },
      cache: 'no-store',
    });

    if (response.ok) return { data: (await response.json()) as T };

    const problem = (await response.json().catch(() => ({}))) as {
      title?: string;
      detail?: string;
      code?: string;
    };
    // só o `organization_not_linked` é falta de vínculo: os demais 403 (tipo de
    // organização, permissão, módulo do plano, loja suspensa) têm causa própria
    return {
      error:
        problem.code === 'organization_not_linked'
          ? 'Sua organização não está vinculada a nenhum tenant (identity.org_links).'
          : (problem.detail ?? problem.title ?? `A API respondeu ${response.status}.`),
    };
  } catch {
    return { error: 'A API não respondeu — ela está rodando em ' + API_URL + '?' };
  }
}
