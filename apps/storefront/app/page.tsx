import Link from 'next/link';

import { fetchFromApi, type StoreUnavailable } from '../lib/api';

interface TenantContext {
  slug: string;
  tenantId: string;
}

/** Mensagem por motivo — suspenso não é o mesmo que inexistente (RF-TEN-06). */
const MENSAGEM: Record<StoreUnavailable, { titulo: string; texto: string }> = {
  suspended: {
    titulo: 'Loja temporariamente indisponível',
    texto: 'Esta loja está fora do ar no momento. Tente novamente mais tarde.',
  },
  not_found: {
    titulo: 'Loja não encontrada',
    texto: 'Este endereço não corresponde a nenhuma loja.',
  },
  offline: {
    titulo: 'Estamos com instabilidade',
    texto: 'Não conseguimos carregar a loja agora. Tente novamente em instantes.',
  },
};

/**
 * Vitrine (esqueleto da Fase 1). O que ela prova hoje: o tenant vem do host, o
 * tema publicado dele é aplicado, e tenant suspenso vê a página certa.
 */
export default async function Home() {
  const { data: tenant, unavailable } = await fetchFromApi<TenantContext>('/v1/store/tenant-context');

  if (tenant === undefined) {
    const { titulo, texto } = MENSAGEM[unavailable ?? 'not_found'];

    return (
      <main style={{ padding: 'calc(var(--mkt-space, 0.75rem) * 3)', maxWidth: '40rem', margin: '0 auto' }}>
        <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>{titulo}</h1>
        <p>{texto}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 'calc(var(--mkt-space, 0.75rem) * 3)', maxWidth: '60rem', margin: '0 auto' }}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Loja {tenant.slug}</h1>
      <p>Vitrine do comprador. O catálogo chega nos próximos marcos da Fase 1.</p>
      <p>
        <Link href="/conta/cadastro">Criar conta</Link> · <Link href="/conta/entrar">Entrar</Link> ·{' '}
        <Link href="/conta">Minha conta</Link>
      </p>
      <button
        type="button"
        style={{
          background: 'var(--mkt-color-primary, #1f6feb)',
          color: 'var(--mkt-color-on-primary, #fff)',
          border: 'none',
          borderRadius: 'var(--mkt-radius, 8px)',
          padding: 'var(--mkt-space, .75rem) calc(var(--mkt-space, .75rem) * 2)',
          font: 'inherit',
        }}
      >
        Tema aplicado deste tenant
      </button>
    </main>
  );
}
