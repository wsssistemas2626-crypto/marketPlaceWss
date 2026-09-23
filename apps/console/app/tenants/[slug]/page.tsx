import { revalidatePath } from 'next/cache';
import Link from 'next/link';

import { panelFetch } from '../../../lib/api';
import { alerta, botao, campo, celula, moeda, pagina } from '../../../lib/ui';

interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  status: string;
  planId?: string;
  hosts: string[];
  usage: { orders: number; gmv_cents: number; skus: number; sellers: number };
  integrations: { category: string; provider: string }[];
}

interface SupportSession {
  id: string;
  staffUserId: string;
  reason: string;
  scope: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

/** Transições que a máquina de estados aceita (US-080 / RF-TEN-06). */
const PROXIMOS: Record<string, string[]> = {
  provisioning: ['trial', 'active', 'cancelled'],
  trial: ['active', 'suspended', 'cancelled'],
  active: ['suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
};

const quando = (iso: string): string => new Date(iso).toLocaleString('pt-BR');

const situacao = (sessao: SupportSession): string => {
  if (sessao.revokedAt !== undefined) return 'revogado';
  return new Date(sessao.expiresAt) > new Date() ? 'ativo' : 'expirado';
};

/**
 * Detalhe do tenant no console: uso, integrações, status e modo suporte.
 *
 * Todas as ações passam pela API (`/v1/platform/*`) com o token do staff — o
 * console não fala com o banco (CLAUDE.md §9). Suspender e abrir suporte são
 * ações auditadas: a primeira publica evento com o motivo, a segunda grava a
 * sessão com prazo e o admin do tenant enxerga.
 */
export default async function TenantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: tenant, error } = await panelFetch<TenantDetail>(`/v1/platform/tenants/${slug}`);
  const sessoes =
    tenant === undefined
      ? undefined
      : (await panelFetch<{ data: SupportSession[] }>(`/v1/platform/tenants/${tenant.id}/support-sessions`))
          .data;

  async function mudarStatus(formulario: FormData): Promise<void> {
    'use server';

    const tenantId = String(formulario.get('tenantId'));
    const status = String(formulario.get('status'));
    const reason = String(formulario.get('reason') ?? '');

    await panelFetch(`/v1/platform/tenants/${tenantId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(reason.length < 5 ? {} : { reason }) }),
    });

    revalidatePath(`/tenants/${String(formulario.get('slug'))}`);
  }

  async function abrirSuporte(formulario: FormData): Promise<void> {
    'use server';

    const tenantId = String(formulario.get('tenantId'));

    await panelFetch(`/v1/platform/tenants/${tenantId}/support-sessions`, {
      method: 'POST',
      body: JSON.stringify({
        reason: String(formulario.get('reason') ?? ''),
        durationMinutes: Number(formulario.get('durationMinutes') ?? 60),
        scope: String(formulario.get('scope') ?? 'read_only'),
      }),
    });

    revalidatePath(`/tenants/${String(formulario.get('slug'))}`);
  }

  async function revogarSuporte(formulario: FormData): Promise<void> {
    'use server';

    const tenantId = String(formulario.get('tenantId'));
    const sessionId = String(formulario.get('sessionId'));

    await panelFetch(`/v1/platform/tenants/${tenantId}/support-sessions/${sessionId}`, {
      method: 'DELETE',
    });

    revalidatePath(`/tenants/${String(formulario.get('slug'))}`);
  }

  if (tenant === undefined) {
    return (
      <main style={pagina}>
        <p>
          <Link href="/">← Console</Link>
        </p>
        <h1>{slug}</h1>
        <p style={alerta} role="alert">
          {error}
        </p>
      </main>
    );
  }

  return (
    <main style={pagina}>
      <p>
        <Link href="/">← Console</Link>
      </p>
      <h1>
        {tenant.name} <small style={{ fontWeight: 400, color: '#666' }}>({tenant.slug})</small>
      </h1>
      <p>
        Status <strong>{tenant.status}</strong> · plano {tenant.planId ?? '—'} · {tenant.hosts.join(', ')}
      </p>

      <h2 style={{ fontSize: '1rem' }}>Uso</h2>
      <p>
        {tenant.usage.orders} pedidos · {moeda(tenant.usage.gmv_cents)} de GMV · {tenant.usage.skus} SKUs ·{' '}
        {tenant.usage.sellers} sellers
      </p>

      <h2 style={{ fontSize: '1rem' }}>Integrações ativas</h2>
      {tenant.integrations.length === 0 ? (
        <p>Nenhuma integração configurada.</p>
      ) : (
        <ul>
          {tenant.integrations.map((integracao) => (
            <li key={integracao.category}>
              {integracao.category}: <strong>{integracao.provider}</strong>
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: '1rem' }}>Status do tenant</h2>
      {(PROXIMOS[tenant.status] ?? []).length === 0 ? (
        <p>De {tenant.status} não há transição possível.</p>
      ) : (
        <form action={mudarStatus} style={{ maxWidth: '28rem' }}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <input type="hidden" name="slug" value={tenant.slug} />
          <label style={campo}>
            Novo status
            <select name="status">
              {(PROXIMOS[tenant.status] ?? []).map((proximo) => (
                <option key={proximo} value={proximo}>
                  {proximo}
                </option>
              ))}
            </select>
          </label>
          <label style={campo}>
            Motivo (vai para o evento e para o histórico)
            <input type="text" name="reason" minLength={5} maxLength={300} />
          </label>
          <button type="submit" style={botao}>
            Aplicar
          </button>
        </form>
      )}

      <h2 style={{ fontSize: '1rem' }}>Modo suporte</h2>
      <form action={abrirSuporte} style={{ maxWidth: '28rem' }}>
        <input type="hidden" name="tenantId" value={tenant.id} />
        <input type="hidden" name="slug" value={tenant.slug} />
        <label style={campo}>
          Motivo (mínimo 10 caracteres — o admin do tenant vai ler)
          <input type="text" name="reason" minLength={10} maxLength={500} required />
        </label>
        <label style={campo}>
          Duração (minutos, máximo 120)
          <input type="number" name="durationMinutes" min={1} max={120} defaultValue={60} />
        </label>
        <label style={campo}>
          Alcance
          <select name="scope">
            <option value="read_only">somente leitura</option>
            <option value="write">escrita</option>
          </select>
        </label>
        <button type="submit" style={botao}>
          Abrir sessão
        </button>
      </form>

      {sessoes === undefined || sessoes.data.length === 0 ? (
        <p>Nenhuma sessão de suporte neste tenant.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
          <thead>
            <tr>
              {['Quando', 'Quem', 'Motivo', 'Alcance', 'Expira', 'Situação', 'Ação'].map((coluna) => (
                <th key={coluna} style={{ ...celula, borderBottom: '2px solid #ccc' }}>
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessoes.data.map((sessao) => (
              <tr key={sessao.id}>
                <td style={celula}>{quando(sessao.createdAt)}</td>
                <td style={celula}>{sessao.staffUserId}</td>
                <td style={celula}>{sessao.reason}</td>
                <td style={celula}>{sessao.scope === 'write' ? 'escrita' : 'somente leitura'}</td>
                <td style={celula}>{quando(sessao.expiresAt)}</td>
                <td style={celula}>{situacao(sessao)}</td>
                <td style={celula}>
                  {situacao(sessao) !== 'ativo' ? null : (
                    <form action={revogarSuporte}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input type="hidden" name="slug" value={tenant.slug} />
                      <input type="hidden" name="sessionId" value={sessao.id} />
                      <button type="submit" style={botao}>
                        Revogar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
