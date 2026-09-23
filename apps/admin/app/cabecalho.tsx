import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import type { CSSProperties } from 'react';

import { panelFetch } from '../lib/api';
import { alerta } from '../lib/ui';

/** Resposta de `GET /v1/admin/branding` (US-083). */
interface PanelBranding {
  readonly tenantSlug: string;
  readonly storeName: string;
  readonly logoUrl?: string;
  readonly colors: { readonly primary: string; readonly onPrimary: string };
}

const SELLER_CENTER_URL = process.env.SELLER_CENTER_URL ?? 'http://localhost:3002';

/**
 * Por que o painel recusou a organização ativa — em linguagem de quem usa.
 * O seletor fica sempre visível: é por ele que se sai do problema.
 */
function avisoPara(code: string | undefined, error: string) {
  switch (code) {
    case 'wrong_organization_kind':
      return (
        <>
          A organização ativa é de <strong>vendedor</strong>. Escolha a organização do marketplace no seletor
          acima ou abra o <a href={SELLER_CENTER_URL}>Seller Center</a>.
        </>
      );
    case 'organization_not_linked':
      return <>A organização ativa não está ligada a nenhum marketplace. Escolha outra no seletor acima.</>;
    case 'mfa_required':
      return (
        <>
          Seu papel exige verificação em duas etapas. Ative-a em <strong>Gerenciar conta → Segurança</strong>{' '}
          (menu do seu avatar) e entre de novo.
        </>
      );
    default:
      return error;
  }
}

/**
 * Cabeçalho do admin (RF-IAM-15): marca do tenant da organização ativa e
 * seletor de organização — quem opera dois marketplaces troca sem novo login.
 *
 * A marca vem da API, que resolve o tenant pela organização; o painel nunca
 * decide o tenant (CLAUDE.md §4.11).
 */
export async function Cabecalho() {
  const { userId, orgId } = await auth({ treatPendingAsSignedOut: false });
  if (userId === null) return null;

  const marca = orgId === undefined ? undefined : await panelFetch<PanelBranding>('/v1/admin/branding');
  const cores = marca?.data?.colors ?? { primary: '#1f2328', onPrimary: '#ffffff' };

  const barra: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '.5rem 1.5rem',
    background: cores.primary,
    color: cores.onPrimary,
    fontFamily: 'system-ui, sans-serif',
  };

  return (
    <header>
      <div style={barra}>
        {marca?.data?.logoUrl === undefined ? null : (
          // logo do tenant: origem arbitrária, mas só https (validado no tema, US-077)
          <img src={marca.data.logoUrl} alt="" style={{ height: '2rem' }} />
        )}
        <strong style={{ fontSize: '1.1rem' }}>{marca?.data?.storeName ?? 'Admin do marketplace'}</strong>
        <span style={{ flex: 1 }} />
        <div style={{ background: '#fff', borderRadius: '.375rem', padding: '.125rem .25rem' }}>
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
        </div>
        <UserButton />
      </div>

      {marca?.error === undefined ? null : (
        <div
          style={{ ...alerta, margin: '1rem auto', maxWidth: '60rem', fontFamily: 'system-ui, sans-serif' }}
        >
          {avisoPara(marca.code, marca.error)}
        </div>
      )}
    </header>
  );
}
