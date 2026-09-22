import Link from 'next/link';

import { panelFetch } from '../../lib/api';
import { alerta, celula, pagina } from '../../lib/ui';

interface SupportSession {
  id: string;
  staffUserId: string;
  reason: string;
  scope: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

const quando = (iso: string): string => new Date(iso).toLocaleString('pt-BR');

const situacao = (sessao: SupportSession): string => {
  if (sessao.revokedAt !== undefined) return `revogado em ${quando(sessao.revokedAt)}`;
  return new Date(sessao.expiresAt) > new Date() ? 'ativo' : 'expirado';
};

/**
 * Acessos da plataforma a esta conta (US-080 / RF-TEN-07).
 *
 * Modo suporte não é impersonação silenciosa: quem foi acessado enxerga quem
 * entrou, quando, por quê, com qual alcance e até quando
 * (`docs/arquitetura/06-multi-tenancy.md` §7).
 */
export default async function SuportePage() {
  const { data, error } = await panelFetch<{ data: SupportSession[] }>('/v1/admin/support-sessions');

  return (
    <main style={pagina}>
      <p>
        <Link href="/">← Admin</Link>
      </p>
      <h1>Acessos de suporte</h1>
      <p>Toda vez que a plataforma abre a sua conta para investigar algo, o acesso aparece aqui.</p>

      {error === undefined ? null : (
        <p style={alerta} role="alert">
          {error}
        </p>
      )}

      {data === undefined || data.data.length === 0 ? (
        <p>Nenhum acesso registrado.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Quando', 'Quem', 'Motivo', 'Alcance', 'Expira', 'Situação'].map((coluna) => (
                <th key={coluna} style={{ ...celula, borderBottom: '2px solid #ccc' }}>
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((sessao) => (
              <tr key={sessao.id}>
                <td style={celula}>{quando(sessao.createdAt)}</td>
                <td style={celula}>{sessao.staffUserId}</td>
                <td style={celula}>{sessao.reason}</td>
                <td style={celula}>{sessao.scope === 'write' ? 'escrita' : 'somente leitura'}</td>
                <td style={celula}>{quando(sessao.expiresAt)}</td>
                <td style={celula}>{situacao(sessao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
