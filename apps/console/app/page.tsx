import { auth } from '@clerk/nextjs/server';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  planId?: string;
  hosts: string[];
  usage: { orders: number; gmv_cents: number; skus: number; sellers: number };
  integrations: { category: string; provider: string }[];
}

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3100';

const moeda = (cents: number): string =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Console da plataforma: tenants com status, plano, uso e saúde de integrações
 * (US-081 / RF-TEN-11).
 *
 * Os dados vêm da API em `/v1/platform/*` com o token do staff — o console não
 * fala com o banco (CLAUDE.md §9).
 */
async function fetchTenants(): Promise<{ tenants: TenantRow[]; error?: string }> {
  const { getToken } = await auth();
  const token = await getToken();

  if (token === null) return { tenants: [], error: 'Faça login para ver os tenants.' };

  const response = await fetch(`${API_URL}/v1/platform/tenants`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) return { tenants: [], error: `A API respondeu ${response.status}.` };

  const body = (await response.json()) as { data: TenantRow[] };
  return { tenants: body.data };
}

const celula = { padding: '.5rem', borderBottom: '1px solid #eee', textAlign: 'left' as const };

export default async function Home() {
  const { tenants, error } = await fetchTenants();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '72rem' }}>
      <h1>Console da plataforma</h1>
      <p>Tenants provisionados, uso e integrações ativas.</p>

      {error === undefined ? null : <p role="alert">{error}</p>}

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr>
            {['Slug', 'Status', 'Plano', 'Pedidos', 'GMV', 'SKUs', 'Sellers', 'Integrações'].map((coluna) => (
              <th key={coluna} style={{ ...celula, borderBottom: '2px solid #ccc' }}>
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id}>
              <td style={celula}>
                <strong>{tenant.slug}</strong>
                <br />
                <small>{tenant.hosts[0]}</small>
              </td>
              <td style={celula}>{tenant.status}</td>
              <td style={celula}>{tenant.planId ?? '—'}</td>
              <td style={celula}>{tenant.usage.orders}</td>
              <td style={celula}>{moeda(tenant.usage.gmv_cents)}</td>
              <td style={celula}>{tenant.usage.skus}</td>
              <td style={celula}>{tenant.usage.sellers}</td>
              <td style={celula}>
                {tenant.integrations.length === 0 ? (
                  // sem gateway configurado o tenant não aceita pedido (RN-TEN-02)
                  <span title="nenhum provedor ativo">⚠ nenhuma</span>
                ) : (
                  `${tenant.integrations.length} ativa(s)`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {tenants.length === 0 && error === undefined ? <p>Nenhum tenant ainda.</p> : null}
    </main>
  );
}
