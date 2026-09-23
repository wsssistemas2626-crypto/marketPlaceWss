import { CredentialCipher } from '@mkt/modules-integrations';
import { DbConfigSource } from '@mkt/modules-tenancy';
import {
  createPool,
  DEVELOPMENT_PLANS,
  DEVELOPMENT_TENANTS,
  runWithTenant,
  withTenantTx,
  withTransaction,
} from '@mkt/platform';

import { loadApiEnv } from './env.js';

/**
 * Seed de desenvolvimento (`node dist/seed-dev.js`).
 *
 * Roda no pre-deploy dos **ambientes de PR** da Railway, onde o banco nasce
 * vazio (ADR-014, armadilha #10), e localmente para ter algo com que trabalhar.
 * É idempotente: pode rodar quantas vezes quiser.
 *
 * Cria: os planos de desenvolvimento, os tenants `loja-a` e `loja-b` com seus
 * domínios, o vínculo de organização da Clerk (tenant e seller) e um provedor
 * `fake` ativo em cada categoria de integração.
 */
const ORG_SEED = DEVELOPMENT_TENANTS.flatMap((tenant, indice) => [
  {
    clerkOrgId: `org_dev_tenant_${tenant.slug}`,
    kind: 'tenant' as const,
    tenantId: tenant.tenantId,
    sellerId: null,
  },
  {
    clerkOrgId: `org_dev_seller_${tenant.slug}`,
    kind: 'seller' as const,
    tenantId: tenant.tenantId,
    sellerId: `0193a000-0000-7000-8000-00000000050${indice}`,
  },
]);

const CATEGORIES = [
  'payment',
  'shipping_quote',
  'shipping_label',
  'email',
  'search_index',
  'object_storage',
  'fiscal_issuer',
];

/**
 * Tema publicado de cada loja de desenvolvimento.
 *
 * Existe para que o white-label seja visível sem nenhum passo manual: as duas
 * lojas rodam o mesmo código e se parecem diferentes porque a configuração é
 * diferente (CLAUDE.md §9). Só entra se ainda não houver tema — um ajuste feito
 * no admin não é sobrescrito por rodar o seed de novo.
 */
const THEMES: Record<string, Record<string, unknown>> = {
  'loja-a': {
    colors: { primary: '#e91e63', onPrimary: '#ffffff', surface: '#fff1f5' },
    typography: { fontFamily: 'poppins', headingWeight: 800 },
    shape: { radiusPx: 16, density: 'comfortable' },
    brand: { storeName: 'Loja A' },
  },
  'loja-b': {
    colors: { primary: '#0f766e', onPrimary: '#ffffff', surface: '#ecfdf5' },
    typography: { fontFamily: 'lora', headingWeight: 600 },
    shape: { radiusPx: 2, density: 'compact' },
    brand: { storeName: 'Loja B' },
  },
};

/** O plano `platform-defaults` guarda os padrões da plataforma (US-073). */
const PLANS = [
  {
    planId: DbConfigSource.PLATFORM_DEFAULTS_PLAN,
    name: 'Padrões da plataforma',
    entitlements: { modules: [], limits: {} },
    settings: { 'orders.cancel_window_minutes': 15, 'ledger.payout_delay_days': 7 },
  },
  ...DEVELOPMENT_PLANS,
];

async function main(): Promise<void> {
  const env = loadApiEnv();
  const pool = createPool(env.databaseUrl, { max: 2, applicationName: 'marketplace-seed' });
  // credencial de verdade (cifrada), não um texto qualquer: o adapter fake
  // ignora o conteúdo, mas quem lê a configuração decifra de fato
  const credenciaisFake = new CredentialCipher(env.integrationsEncryptionKey).encrypt({ apiKey: 'fake' });

  try {
    for (const plano of PLANS) {
      await withTransaction(pool, (client) =>
        client.query(
          `INSERT INTO tenancy.plans (plan_id, name, entitlements, settings)
                VALUES ($1, $2, $3::jsonb, $4::jsonb)
           ON CONFLICT (plan_id) DO UPDATE
                  SET name = EXCLUDED.name,
                      entitlements = EXCLUDED.entitlements,
                      settings = EXCLUDED.settings`,
          [plano.planId, plano.name, JSON.stringify(plano.entitlements), JSON.stringify(plano.settings)],
        ),
      );
    }

    for (const [indice, tenant] of DEVELOPMENT_TENANTS.entries()) {
      const plano = DEVELOPMENT_PLANS[indice % DEVELOPMENT_PLANS.length];

      await withTransaction(pool, (client) =>
        client.query(
          `INSERT INTO tenancy.tenants (id, slug, name, status, cell, plan_id)
                VALUES ($1, $2, $3, 'active', $4, $5)
           ON CONFLICT (id) DO UPDATE
                  SET slug = EXCLUDED.slug, status = EXCLUDED.status, plan_id = EXCLUDED.plan_id`,
          [
            tenant.tenantId,
            tenant.slug,
            `Loja ${tenant.slug.slice(-1).toUpperCase()}`,
            tenant.cell,
            plano?.planId ?? null,
          ],
        ),
      );

      for (const hostname of tenant.hosts) {
        await withTransaction(pool, (client) =>
          client.query(
            `INSERT INTO tenancy.domains (id, tenant_id, hostname, is_primary, verified_at)
                  VALUES (gen_random_uuid(), $1, $2, $3, now())
             ON CONFLICT (hostname) DO NOTHING`,
            [tenant.tenantId, hostname, hostname.endsWith('.localhost')],
          ),
        );
      }
    }

    for (const link of ORG_SEED) {
      await withTransaction(pool, (client) =>
        client.query(
          `INSERT INTO identity.org_links (clerk_org_id, kind, tenant_id, seller_id)
                VALUES ($1, $2, $3, $4)
           ON CONFLICT (clerk_org_id) DO UPDATE
                  SET kind = EXCLUDED.kind, tenant_id = EXCLUDED.tenant_id, seller_id = EXCLUDED.seller_id`,
          [link.clerkOrgId, link.kind, link.tenantId, link.sellerId],
        ),
      );
    }

    for (const tenant of DEVELOPMENT_TENANTS) {
      const context = {
        tenantId: tenant.tenantId,
        slug: tenant.slug,
        status: tenant.status,
        cell: tenant.cell,
      };

      await runWithTenant(context, async () => {
        for (const category of CATEGORIES) {
          await withTenantTx(
            pool,
            (client) =>
              client.query(
                `INSERT INTO integrations.provider_configs
                        (id, tenant_id, category, provider, credentials_encrypted, settings, is_active)
                 VALUES (gen_random_uuid(), $1, $2, 'fake', $3, '{}'::jsonb, true)
                 ON CONFLICT (tenant_id, category, provider) DO NOTHING`,
                [tenant.tenantId, category, credenciaisFake],
              ),
            tenant.tenantId,
          );
        }

        const tema = THEMES[tenant.slug];
        if (tema !== undefined) {
          await withTenantTx(
            pool,
            (client) =>
              client.query(
                `INSERT INTO tenancy.themes (tenant_id, draft, published, published_at)
                      VALUES ($1, $2::jsonb, $2::jsonb, now())
                 ON CONFLICT (tenant_id) DO NOTHING`,
                [tenant.tenantId, JSON.stringify(tema)],
              ),
            tenant.tenantId,
          );
        }
      });
    }

    console.log(
      `Seed pronto: ${PLANS.length} planos, ${DEVELOPMENT_TENANTS.length} tenants, ` +
        `${ORG_SEED.length} organizações, ${DEVELOPMENT_TENANTS.length * CATEGORIES.length} integrações fake ` +
        `e ${Object.keys(THEMES).length} temas publicados.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
