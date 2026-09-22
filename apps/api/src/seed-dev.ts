import { createPool, DEVELOPMENT_TENANTS, runWithTenant, withTenantTx, withTransaction } from '@mkt/platform';

import { loadApiEnv } from './env.js';

/**
 * Seed de desenvolvimento (`node dist/seed-dev.js`).
 *
 * Roda no pre-deploy dos **ambientes de PR** da Railway, onde o banco nasce
 * vazio (ADR-014, armadilha #10), e localmente para ter algo com que trabalhar.
 * É idempotente: pode rodar quantas vezes quiser.
 *
 * Cria, para loja-a e loja-b: o vínculo de organização da Clerk (tenant e
 * seller) e um provedor `fake` ativo em cada categoria de integração.
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

async function main(): Promise<void> {
  const env = loadApiEnv();
  const pool = createPool(env.databaseUrl, { max: 2, applicationName: 'marketplace-seed' });

  try {
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
                 VALUES (gen_random_uuid(), $1, $2, 'fake', 'seed.seed.seed', '{}'::jsonb, true)
                 ON CONFLICT (tenant_id, category, provider) DO NOTHING`,
                [tenant.tenantId, category],
              ),
            tenant.tenantId,
          );
        }
      });
    }

    console.log(
      `Seed pronto: ${ORG_SEED.length} organizações e ${DEVELOPMENT_TENANTS.length * CATEGORIES.length} integrações fake.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
