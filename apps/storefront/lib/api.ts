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

/** GET numa rota pública da API, no contexto do tenant do host. */
export async function fetchFromApi<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: await tenantHeaders(),
      // cada tenant tem a sua resposta: nada de cache compartilhado aqui
      cache: 'no-store',
    });

    return response.ok ? ((await response.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}
