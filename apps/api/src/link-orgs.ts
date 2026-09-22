import { ClerkWorkforceIdentity } from '@mkt/adapters-identity-clerk';
import { createPool, DEVELOPMENT_TENANTS, withTransaction } from '@mkt/platform';

import { loadApiEnv } from './env.js';

/**
 * Liga as organizações **reais** da Clerk aos tenants de desenvolvimento
 * (`node dist/link-orgs.js`, ou `pnpm link:orgs`).
 *
 * O seed cria vínculos com ids fictícios (`org_dev_*`), que servem aos testes
 * mas não existem na sua conta da Clerk — por isso o admin e o seller center
 * recusam a sessão de um login de verdade. Este utilitário cria (ou encontra)
 * uma organização por tenant e uma por seller, coloca você como admin delas e
 * grava o id verdadeiro em `identity.org_links`, que é a fonte da verdade do
 * tenant (ADR-013). É idempotente: rode quantas vezes quiser.
 *
 * Uso:
 *   pnpm link:orgs                          # usa o primeiro usuário da instância
 *   pnpm link:orgs -- --email voce@ex.com   # escolhe o usuário pelo e-mail
 *   pnpm link:orgs -- --console voce@ex.com # convida o staff para a app Console
 *
 * Só faz sentido em desenvolvimento: em produção quem cria o vínculo é o
 * provisionamento do tenant (US-076) e o webhook da Clerk (US-082).
 */
interface Argumentos {
  readonly email?: string;
  readonly console?: string;
}

function lerArgumentos(argv: readonly string[]): Argumentos {
  const valor = (nome: string): string | undefined => {
    const indice = argv.indexOf(`--${nome}`);
    return indice === -1 ? undefined : argv[indice + 1];
  };

  const email = valor('email');
  const staff = valor('console');

  return { ...(email === undefined ? {} : { email }), ...(staff === undefined ? {} : { console: staff }) };
}

const tituloDaLoja = (slug: string): string => `Loja ${slug.slice(-1).toUpperCase()}`;

/** Mesmo id de seller que o seed usa, para os dois vínculos falarem do mesmo vendedor. */
const sellerIdDe = (indice: number): string => `0193a000-0000-7000-8000-00000000050${indice}`;

async function main(): Promise<void> {
  const env = loadApiEnv();
  const argumentos = lerArgumentos(process.argv.slice(2));

  if (env.clerk === undefined) {
    throw new Error(
      'CLERK_SECRET_KEY da aplicação Plataforma não está no .env — sem ela não há organização para ligar.',
    );
  }

  const clerk = new ClerkWorkforceIdentity(env.clerk);
  const usuario = await clerk.findUser(argumentos.email);

  if (usuario === undefined) {
    throw new Error(
      argumentos.email === undefined
        ? 'Nenhum usuário na aplicação Plataforma: entre uma vez em http://localhost:3001 e rode de novo.'
        : `Nenhum usuário com o e-mail ${argumentos.email} na aplicação Plataforma.`,
    );
  }

  console.log(`Usuário: ${usuario.email ?? usuario.userId}`);

  const pool = createPool(env.databaseUrl, { max: 2, applicationName: 'marketplace-link-orgs' });

  try {
    for (const [indice, tenant] of DEVELOPMENT_TENANTS.entries()) {
      const organizacoes = [
        { name: tituloDaLoja(tenant.slug), kind: 'tenant' as const, sellerId: undefined },
        {
          name: `${tituloDaLoja(tenant.slug)} — Vendedor`,
          kind: 'seller' as const,
          sellerId: sellerIdDe(indice),
        },
      ];

      for (const organizacao of organizacoes) {
        const existente = await clerk.findOrganizationByTenant({
          kind: organizacao.kind,
          tenantId: tenant.tenantId,
          ...(organizacao.sellerId === undefined ? {} : { sellerId: organizacao.sellerId }),
        });
        const { organizationId } =
          existente === undefined
            ? await clerk.createOrganization({
                name: organizacao.name,
                kind: organizacao.kind,
                tenantId: tenant.tenantId,
                createdBy: usuario.userId,
                ...(organizacao.sellerId === undefined ? {} : { sellerId: organizacao.sellerId }),
              })
            : { organizationId: existente.organizationId };

        if (existente !== undefined) {
          // metadados podem ter envelhecido (ou a organização ter sido criada à mão)
          await clerk.updateOrganizationMetadata(organizationId, {
            kind: organizacao.kind,
            tenantId: tenant.tenantId,
            ...(organizacao.sellerId === undefined ? {} : { sellerId: organizacao.sellerId }),
          });
        }

        const associacao = await clerk.ensureMembership({ organizationId, userId: usuario.userId });

        await withTransaction(pool, (client) =>
          client.query(
            `INSERT INTO identity.org_links (clerk_org_id, kind, tenant_id, seller_id)
                  VALUES ($1, $2, $3, $4)
             ON CONFLICT (clerk_org_id) DO UPDATE
                    SET kind = EXCLUDED.kind,
                        tenant_id = EXCLUDED.tenant_id,
                        seller_id = EXCLUDED.seller_id`,
            [organizationId, organizacao.kind, tenant.tenantId, organizacao.sellerId ?? null],
          ),
        );

        console.log(
          `  ${organizacao.name.padEnd(24)} ${organizationId}  ${organizacao.kind}` +
            `${existente === undefined ? '  (criada)' : ''}` +
            `${associacao === 'created' ? '  (+ membro)' : ''}`,
        );
      }
    }
  } finally {
    await pool.end();
  }

  if (argumentos.console !== undefined) {
    if (env.consoleClerk === undefined) {
      throw new Error('CONSOLE_CLERK_SECRET_KEY não está no .env — não dá para convidar o staff.');
    }

    await new ClerkWorkforceIdentity({ ...env.consoleClerk, requireOrganization: false }).inviteToApplication(
      argumentos.console,
      'http://localhost:3003',
    );

    console.log(
      `Convite do Console enviado para ${argumentos.console} (veja o e-mail e conclua o cadastro).`,
    );
  }
}

main().catch((error: unknown) => {
  // stdout: o turbo engole o stderr das tarefas e a mensagem é o que orienta
  // quem rodou o comando a resolver o que falta
  console.log(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
