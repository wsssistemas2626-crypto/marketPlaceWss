import { fetchFromApi } from '../lib/api';

interface TenantContext {
  slug: string;
  tenantId: string;
}

/**
 * Vitrine (esqueleto da Fase 1). O que ela prova hoje: o tenant vem do host e
 * o tema publicado dele é aplicado — a base do white-label.
 */
const fetchTenant = (): Promise<TenantContext | undefined> =>
  fetchFromApi<TenantContext>('/v1/store/tenant-context');

export default async function Home() {
  const tenant = await fetchTenant();

  return (
    <main style={{ padding: 'calc(var(--mkt-space, 0.75rem) * 3)', maxWidth: '60rem', margin: '0 auto' }}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>
        {tenant === undefined ? 'Loja não encontrada' : `Loja ${tenant.slug}`}
      </h1>

      {tenant === undefined ? (
        <p>Este endereço não corresponde a nenhuma loja.</p>
      ) : (
        <>
          <p>Vitrine do comprador. O catálogo chega nos próximos marcos da Fase 1.</p>
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
        </>
      )}
    </main>
  );
}
