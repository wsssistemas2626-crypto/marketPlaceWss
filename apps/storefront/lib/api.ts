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

  return {
    'x-forwarded-host': host,
    ...(secret === '' ? {} : { 'x-edge-secret': secret }),
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
