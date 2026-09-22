/** Estado de uma dependência checada pelo `/health`. */
export type CheckStatus = 'up' | 'down';

export interface CheckResult {
  readonly status: CheckStatus;
  readonly latencyMs: number;
  /** Mensagem curta, sem dados pessoais e sem credenciais (CLAUDE.md §4.9). */
  readonly error?: string;
}

export interface HealthReport {
  readonly status: CheckStatus;
  readonly checks: Readonly<Record<string, CheckResult>>;
}

/**
 * Dependência verificável. `check()` resolve se a dependência responde e
 * rejeita caso contrário. Nunca deve chamar serviços externos de terceiros
 * (armadilha #8 de `docs/arquitetura/07-infraestrutura-railway.md`).
 */
export interface HealthProbe {
  readonly name: string;
  check(): Promise<void>;
}
