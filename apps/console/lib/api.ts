import { auth } from '@clerk/nextjs/server';

export const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3100';

export interface PanelResult<T> {
  readonly data?: T;
  readonly error?: string;
}

/**
 * Chamada à API com o token do staff (aplicação Clerk Console).
 *
 * Rotas `/v1/platform/*` são **sem tenant**: quem chama é o staff da
 * plataforma, autenticado na aplicação Clerk Console (ADR-013). Quando o staff
 * precisa agir dentro de um tenant, isso passa pelo modo suporte, auditado.
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

    const problem = (await response.json().catch(() => ({}))) as { title?: string; detail?: string };
    return {
      error:
        response.status === 401 || response.status === 403
          ? 'Sua conta não tem acesso ao console da plataforma.'
          : (problem.detail ?? problem.title ?? `A API respondeu ${response.status}.`),
    };
  } catch {
    return { error: 'A API não respondeu — ela está rodando em ' + API_URL + '?' };
  }
}
