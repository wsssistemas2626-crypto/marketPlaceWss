import { headers } from 'next/headers';

export const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3100';

/**
 * Headers para a API resolver o tenant desta requisição.
 *
 * **Não dá para repassar o `Host`**: `Host` é forbidden header name no Fetch,
 * e o runtime o descarta silenciosamente — a chamada chegaria como
 * `localhost:3100` e a API responderia 404. O caminho correto é o mesmo do
 * edge (ADR-014 §6): `X-Forwarded-Host` acompanhado de `X-Edge-Secret`, que a
 * API só aceita quando o segredo confere.
 */
export async function tenantHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? '';
  const secret = process.env.EDGE_SHARED_SECRET ?? '';
  // IP do comprador (consentimento LGPD): a API só aceita junto com o segredo
  const clientIp = incoming.get('x-forwarded-for');

  return {
    'x-forwarded-host': host,
    ...(secret === '' ? {} : { 'x-edge-secret': secret }),
    ...(secret === '' || clientIp === null ? {} : { 'x-forwarded-for': clientIp }),
  };
}

/** Por que a loja não abriu — a página muda conforme o caso (RF-TEN-06). */
export type StoreUnavailable = 'not_found' | 'suspended' | 'offline';

export interface ApiResult<T> {
  readonly data?: T;
  readonly unavailable?: StoreUnavailable;
}

/** GET numa rota pública da API, no contexto do tenant do host. */
export async function fetchFromApi<T>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: await tenantHeaders(),
      // cada tenant tem a sua resposta: nada de cache compartilhado aqui
      cache: 'no-store',
    });

    if (response.ok) return { data: (await response.json()) as T };

    // 403 do tenant suspenso é diferente de host desconhecido: o comprador
    // precisa ver "volte em breve", não "esta loja não existe"
    const problem = (await response.json().catch(() => ({}))) as { code?: string };
    if (problem.code === 'tenant_suspended') return { unavailable: 'suspended' };

    return { unavailable: 'not_found' };
  } catch {
    return { unavailable: 'offline' };
  }
}

/** Resultado de uma ação do comprador: sucesso, ou a mensagem e o campo do erro. */
export interface ActionResult<T> {
  readonly data?: T;
  readonly error?: string;
  /** Campo apontado pela API (`document`, `password`…) para destacar no formulário. */
  readonly field?: string;
}

/**
 * POST numa rota do storefront, no contexto do tenant do host. Rotas que criam
 * recurso exigem `Idempotency-Key` (CLAUDE.md §4.10): cada envio de formulário
 * gera uma chave nova.
 */
export async function postToApi<T>(
  path: string,
  body: unknown,
  options: { idempotent?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        ...(await tenantHeaders()),
        'content-type': 'application/json',
        ...(options.idempotent === true ? { 'idempotency-key': crypto.randomUUID() } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (response.ok) return { data: (await response.json()) as T };

    const problem = (await response.json().catch(() => ({}))) as { title?: string; field?: string };
    return {
      error: problem.title ?? 'Não foi possível concluir agora. Tente de novo.',
      ...(problem.field === undefined ? {} : { field: problem.field }),
    };
  } catch {
    return { error: 'Estamos com instabilidade. Tente de novo em instantes.' };
  }
}

/** GET em rota `@CustomerAuth` com o access token do cookie. `undefined` = sem sessão válida. */
export async function fetchDoComprador<T>(path: string, accessToken: string): Promise<T | undefined> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { ...(await tenantHeaders()), authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    return response.ok ? ((await response.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Chamada autenticada do comprador (qualquer método), para server actions.
 * O token vem do cookie `HttpOnly` — quem chama não o manipula.
 */
export async function chamarComoComprador<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options: { idempotent?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(await tenantHeaders()),
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.idempotent === true ? { 'idempotency-key': crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });

    if (response.status === 204) return {};
    if (response.ok) return { data: (await response.json()) as T };

    const problem = (await response.json().catch(() => ({}))) as { title?: string; field?: string };
    return {
      error: problem.title ?? 'Não foi possível concluir agora. Tente de novo.',
      ...(problem.field === undefined ? {} : { field: problem.field }),
    };
  } catch {
    return { error: 'Estamos com instabilidade. Tente de novo em instantes.' };
  }
}
