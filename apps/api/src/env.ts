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
  /** Chave das credenciais de integração (32 bytes base64). */
  readonly integrationsEncryptionKey: string;
  /** Célula desta implantação (ADR-012). */
  readonly cell: string;
  /** Segredo do edge; sem ele o X-Forwarded-Host é ignorado (ADR-014 §6). */
  readonly edgeSharedSecret?: string;
  /**
   * RF-IAM-14: exige segundo fator dos papéis sensíveis e do staff. Sempre
   * ligado em produção; fora dela, `PANEL_MFA_ENFORCED=true` liga — só faz
   * sentido com MFA habilitado na instância da Clerk (checklist §G).
   */
  readonly panelMfaEnforced: boolean;
  /** Credenciais da aplicação Clerk Console (staff). */
  readonly consoleClerk?: ApiEnv['clerk'];
  /** Credenciais da Clerk (ADR-013). Ausentes = adapter fake em desenvolvimento. */
  readonly clerk?: {
    readonly secretKey: string;
    readonly jwtKey?: string;
    readonly authorizedParties: readonly string[];
    readonly webhookSigningSecret?: string;
  };
}

/**
 * Credenciais da Clerk. `prefix` escolhe a aplicação: vazio para "Plataforma"
 * (admin + seller center) e `CONSOLE_` para o console do staff (ADR-013).
 *
 * `sk_test_xxx`/`sk_test_yyy` são os placeholders do `.env.example` e não
 * valem como credencial — com eles, o processo cai no adapter fake.
 */
function clerkFromEnv(prefix: '' | 'CONSOLE_' = ''): ApiEnv['clerk'] {
  const read = (name: string): string | undefined => process.env[`${prefix}${name}`];

  const secretKey = read('CLERK_SECRET_KEY');
  if (secretKey === undefined || secretKey === '' || /^sk_test_(xxx|yyy)/.test(secretKey)) {
    return undefined;
  }

  const jwtKey = read('CLERK_JWT_KEY');
  const webhookSigningSecret = read('CLERK_WEBHOOK_SIGNING_SECRET');

  return {
    secretKey,
    ...(jwtKey === undefined ? {} : { jwtKey }),
    authorizedParties: (read('CLERK_AUTHORIZED_PARTIES') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    ...(webhookSigningSecret === undefined ? {} : { webhookSigningSecret }),
  };
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
  const clerk = clerkFromEnv();
  const consoleClerk = clerkFromEnv('CONSOLE_');

  return {
    // A Railway injeta PORT; localmente cai no padrão (armadilha #2).
    port: Number(process.env.PORT ?? 3100),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    cell: process.env.PLATFORM_CELL ?? 'shared-1',
    panelMfaEnforced: process.env.NODE_ENV === 'production' || process.env.PANEL_MFA_ENFORCED === 'true',
    // em desenvolvimento uma chave fixa basta; em produção vem do KMS (checklist §F)
    integrationsEncryptionKey:
      process.env.INTEGRATIONS_ENCRYPTION_KEY === undefined || process.env.INTEGRATIONS_ENCRYPTION_KEY === ''
        ? Buffer.alloc(32, 7).toString('base64')
        : process.env.INTEGRATIONS_ENCRYPTION_KEY,
    ...(process.env.DATABASE_URL_MIGRATOR === undefined
      ? {}
      : { migratorUrl: process.env.DATABASE_URL_MIGRATOR }),
    ...(process.env.EDGE_SHARED_SECRET === undefined
      ? {}
      : { edgeSharedSecret: process.env.EDGE_SHARED_SECRET }),
    ...(clerk === undefined ? {} : { clerk }),
    ...(consoleClerk === undefined ? {} : { consoleClerk }),
  };
}
