/**
 * Leitura centralizada do ambiente do processo (composition root).
 * O `ConfigService` hierárquico (plataforma → plano → tenant) chega na US-009;
 * até lá, nenhum outro arquivo lê `process.env` diretamente.
 */
export interface ApiEnv {
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly nodeEnv: string;
  /** URL do role migrator; só existe onde as migrações rodam. */
  readonly migratorUrl?: string;
  /** Célula desta implantação (ADR-012). */
  readonly cell: string;
  /** Segredo do edge; sem ele o X-Forwarded-Host é ignorado (ADR-014 §6). */
  readonly edgeSharedSecret?: string;
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

export function loadApiEnv(): ApiEnv {
  loadDotEnvFile();
  return {
    // A Railway injeta PORT; localmente cai no padrão (armadilha #2).
    port: Number(process.env.PORT ?? 3100),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    cell: process.env.PLATFORM_CELL ?? 'shared-1',
    ...(process.env.DATABASE_URL_MIGRATOR === undefined
      ? {}
      : { migratorUrl: process.env.DATABASE_URL_MIGRATOR }),
    ...(process.env.EDGE_SHARED_SECRET === undefined
      ? {}
      : { edgeSharedSecret: process.env.EDGE_SHARED_SECRET }),
  };
}
