import { auth } from '@clerk/nextjs/server';

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  cell: string;
  planId?: string;
  hosts: string[];
}

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3100';

/**
 * Esqueleto do console da plataforma (US-075).
 *
 * Os dados vêm da API em `/v1/platform/*`, com o token do staff — o console
 * não fala com o banco (CLAUDE.md §9: frontend consome só a API).
 */
async function fetchTenants(): Promise<{ tenants: TenantSummary[]; error?: string }> {
  const { getToken } = await auth();
  const token = await getToken();

  if (token === null) return { tenants: [], error: 'Faça login para ver os tenants.' };

  const response = await fetch(`${API_URL}/v1/platform/tenants`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return { tenants: [], error: `A API respondeu ${response.status}.` };
  }

  const body = (await response.json()) as { data: TenantSummary[] };
  return { tenants: body.data };
}

export default async function Home() {
  const { tenants, error } = await fetchTenants();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '60rem' }}>
      <h1>Console da plataforma</h1>
      <p>Tenants provisionados nesta instalação.</p>

      {error === undefined ? null : <p role="alert">{error}</p>}

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr>
            {['Slug', 'Nome', 'Status', 'Plano', 'Domínios'].map((coluna) => (
              <th
                key={coluna}
                style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '.5rem' }}
              >
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id}>
              <td style={{ padding: '.5rem' }}>{tenant.slug}</td>
              <td style={{ padding: '.5rem' }}>{tenant.name}</td>
              <td style={{ padding: '.5rem' }}>{tenant.status}</td>
              <td style={{ padding: '.5rem' }}>{tenant.planId ?? '—'}</td>
              <td style={{ padding: '.5rem' }}>{tenant.hosts.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {tenants.length === 0 && error === undefined ? <p>Nenhum tenant ainda.</p> : null}
    </main>
  );
}
