/**
 * Leitura centralizada do ambiente do processo `worker` (composition root).
 *
 * `DATABASE_URL_PLATFORM` (role `platform`, com BYPASSRLS) só é usada pelo
 * outbox relay e por `@PlatformJob` — nunca pelo processamento comum (US-005).
 */
export interface WorkerEnv {
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  /** Chave das credenciais de integração (32 bytes base64). */
  readonly integrationsEncryptionKey: string;
  /** Role platform (BYPASSRLS): só outbox relay e @PlatformJob. */
  readonly platformDatabaseUrl?: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

/**
 * Em desenvolvimento o processo carrega o .env da raiz do monorepo.
 * Na Railway as variáveis já vêm do ambiente e o arquivo não existe.
 */
function loadDotEnvFile(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // sem .env: seguimos com as variáveis já presentes no ambiente
  }
}

export function loadWorkerEnv(): WorkerEnv {
  loadDotEnvFile();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    // porta interna: o worker não tem domínio público (07-infraestrutura-railway.md §2)
    port: Number(process.env.PORT ?? 3101),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    nodeEnv,
    isProduction: nodeEnv === 'production',
    integrationsEncryptionKey:
      process.env.INTEGRATIONS_ENCRYPTION_KEY === undefined || process.env.INTEGRATIONS_ENCRYPTION_KEY === ''
        ? Buffer.alloc(32, 7).toString('base64')
        : process.env.INTEGRATIONS_ENCRYPTION_KEY,
    ...(process.env.DATABASE_URL_PLATFORM === undefined
      ? {}
      : { platformDatabaseUrl: process.env.DATABASE_URL_PLATFORM }),
  };
}
