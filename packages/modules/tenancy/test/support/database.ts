import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

export interface TestDatabase {
  readonly container: StartedPostgreSqlContainer;
  /** URL de cada role, como na Railway (ADR-014 §3). */
  readonly urls: { app: string; migrator: string; platform: string; superuser: string };
  stop(): Promise<void>;
}

const url = (container: StartedPostgreSqlContainer, role: string, password: string): string =>
  `postgres://${role}:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${container.getDatabase()}`;

/**
 * Sobe um Postgres real e executa **o mesmo** `infra/db/bootstrap-roles.sql`
 * que roda no docker-compose e na Railway. Sem isso, o teste rodaria com
 * superusuário e não provaria nada sobre RLS (ADR-014, armadilha #1).
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:17')
    .withDatabase('marketplace')
    .withUsername('postgres')
    .withPassword('postgres')
    .withCopyFilesToContainer([
      {
        source: path.join(repositoryRoot, 'infra', 'db', 'bootstrap-roles.sql'),
        target: '/tmp/bootstrap-roles.sql',
      },
    ])
    .start();

  const result = await container.exec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'marketplace',
    '-v',
    'migrator_password=migrator',
    '-v',
    'app_password=app',
    '-v',
    'platform_password=platform',
    '-f',
    '/tmp/bootstrap-roles.sql',
  ]);

  if (result.exitCode !== 0) {
    await container.stop();
    throw new Error(`bootstrap-roles.sql falhou: ${result.output}`);
  }

  return {
    container,
    urls: {
      app: url(container, 'app', 'app'),
      migrator: url(container, 'migrator', 'migrator'),
      platform: url(container, 'platform', 'platform'),
      superuser: url(container, 'postgres', 'postgres'),
    },
    stop: () => container.stop(),
  };
}

/** Docker ausente (ex.: máquina sem Docker Desktop) → a suíte é pulada. */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('docker', ['info']);
    return true;
  } catch {
    return false;
  }
}
