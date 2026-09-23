import { ClerkRoleCatalog } from '@mkt/adapters-identity-clerk';
import { PANEL_PERMISSIONS, PANEL_ROLES } from '@mkt/contracts';

import { loadApiEnv } from './env.js';

/**
 * Cria na Clerk os papéis e permissões dos painéis (`pnpm clerk:roles`, US-013).
 *
 * O catálogo mora em `@mkt/contracts` (`panel-access.ts`) — é o mesmo que a
 * API usa para autorizar. Rode depois de mudar o catálogo e em cada instância
 * nova da Clerk (desenvolvimento, staging, produção). É idempotente.
 *
 * Só a aplicação **Plataforma**: o Console não usa Organizations.
 */
async function main(): Promise<void> {
  const env = loadApiEnv();

  if (env.clerk === undefined) {
    throw new Error(
      'CLERK_SECRET_KEY da aplicação Plataforma não está no .env — não há instância para configurar.',
    );
  }

  const report = await new ClerkRoleCatalog({ secretKey: env.clerk.secretKey }).sync({
    permissions: PANEL_PERMISSIONS,
    roles: PANEL_ROLES,
  });

  const linhas: [string, readonly string[]][] = [
    ['Permissões criadas', report.permissionsCreated],
    ['Permissões atualizadas', report.permissionsUpdated],
    ['Papéis criados', report.rolesCreated],
    ['Papéis atualizados', report.rolesUpdated],
    ['Permissões concedidas', report.grants],
    ['Permissões retiradas', report.revocations],
    ['Papéis incluídos no role set inicial', report.addedToRoleSet],
  ];

  const mudou = linhas.some(([, itens]) => itens.length > 0);
  if (!mudou) {
    console.log(
      `Nada a fazer: ${PANEL_ROLES.length} papéis e ${PANEL_PERMISSIONS.length} permissões já estão na Clerk.`,
    );
    return;
  }

  for (const [titulo, itens] of linhas) {
    if (itens.length === 0) continue;
    console.log(`${titulo} (${itens.length}):`);
    itens.forEach((item) => console.log(`  ${item}`));
  }
}

main().catch((error: unknown) => {
  // stdout: o turbo engole o stderr das tarefas (mesmo motivo do link-orgs)
  console.log(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
