/**
 * Bloqueio progressivo do login do comprador (RNF-SEG-02).
 *
 * Até 4 erros seguidos, nada. A partir do 5º, a conta fica bloqueada por um
 * tempo que dobra a cada erro novo — 1, 2, 4, 8… minutos, com teto de 1 hora.
 * Acertar a senha (fora do bloqueio) zera a contagem.
 *
 * Por conta, não por IP: senha é chutada contra uma conta; o limite por IP da
 * rota (rate limit) cobre quem chuta contra muitas contas.
 */
export const LOGIN_FREE_ATTEMPTS = 4;
export const LOGIN_MAX_LOCK_MINUTES = 60;

export interface LoginThrottleState {
  readonly failedAttempts: number;
  readonly lockedUntil?: Date;
}

export function isLocked(state: LoginThrottleState, now: Date): boolean {
  return state.lockedUntil !== undefined && state.lockedUntil.getTime() > now.getTime();
}

/** Estado depois de uma senha errada. */
export function registerFailure(state: LoginThrottleState, now: Date): LoginThrottleState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts <= LOGIN_FREE_ATTEMPTS) return { failedAttempts };

  const minutes = Math.min(LOGIN_MAX_LOCK_MINUTES, 2 ** (failedAttempts - LOGIN_FREE_ATTEMPTS - 1));
  return { failedAttempts, lockedUntil: new Date(now.getTime() + minutes * 60_000) };
}

export const CLEAR_THROTTLE: LoginThrottleState = { failedAttempts: 0 };
