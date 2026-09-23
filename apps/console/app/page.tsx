import Link from 'next/link';

import { panelFetch } from '../lib/api';
import { celula, moeda, pagina } from '../lib/ui';

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

/**
 * Console da plataforma: tenants com status, plano, uso e saúde de integrações
 * (US-081 / RF-TEN-11).
 *
 * Os dados vêm da API em `/v1/platform/*` com o token do staff — o console não
 * fala com o banco (CLAUDE.md §9).
 */
async function fetchTenants(): Promise<{ tenants: TenantRow[]; error?: string }> {
  const { data, error } = await panelFetch<{ data: TenantRow[] }>('/v1/platform/tenants');

  return data === undefined
    ? { tenants: [], ...(error === undefined ? {} : { error }) }
    : { tenants: data.data };
}

export default async function Home() {
  const { tenants, error } = await fetchTenants();

  return (
    <main style={pagina}>
      <h1>Console da plataforma</h1>
      <p>
        Tenants provisionados, uso e integrações ativas. Clique no slug para suspender, reativar ou abrir modo
        suporte.
      </p>

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
                <Link href={`/tenants/${tenant.slug}`}>
                  <strong>{tenant.slug}</strong>
                </Link>
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
