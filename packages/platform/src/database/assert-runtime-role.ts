import { DomainError } from '@mkt/shared-kernel';

import type { DatabasePool } from './pool.js';

export class UnsafeDatabaseRoleError extends DomainError {
  constructor(role: string, reason: string) {
    super(
      'unsafe_database_role',
      `O role "${role}" ${reason}, o que ignora o Row-Level Security e anula o isolamento entre tenants (ADR-012/ADR-014). ` +
        'Use DATABASE_URL com o role "app".',
      { role },
    );
  }
}

interface RoleRow {
  readonly role: string;
  readonly is_superuser: boolean;
  readonly bypasses_rls: boolean;
}

/**
 * Confere com que role o processo está conectado.
 *
 * Superusuário e `BYPASSRLS` **ignoram as policies**: bastaria um deploy com a
 * URL errada para todo o isolamento entre tenants sumir sem nenhum erro
 * visível. Por isso a api e o worker falham no boot (armadilha #1 do ADR-014).
 */
export async function assertRuntimeRoleIsSafe(pool: DatabasePool): Promise<void> {
  const { rows } = await pool.query<RoleRow>(
    `SELECT current_user AS role,
            rolsuper     AS is_superuser,
            rolbypassrls AS bypasses_rls
       FROM pg_roles
      WHERE rolname = current_user`,
  );

  const row = rows[0];
  if (row === undefined) {
    throw new UnsafeDatabaseRoleError('desconhecido', 'não pôde ser verificado em pg_roles');
  }
  if (row.is_superuser) {
    throw new UnsafeDatabaseRoleError(row.role, 'é superusuário');
  }
  if (row.bypasses_rls) {
    throw new UnsafeDatabaseRoleError(row.role, 'tem BYPASSRLS');
  }
}
