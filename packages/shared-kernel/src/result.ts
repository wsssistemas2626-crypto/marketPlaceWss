import { DomainError } from './errors.js';

/**
 * Resultado explícito de um caso de uso: ou deu certo, ou falhou com um erro
 * previsto. Erros de regra viram valor de retorno (e não exceção), o que
 * obriga quem chama a tratar os dois caminhos.
 *
 * Exceção continua reservada para falha inesperada (bug, indisponibilidade).
 */
export type Result<T, E = DomainError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;

export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok;

/** Transforma o valor de sucesso, preservando o erro. */
export const map = <T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> =>
  result.ok ? ok(transform(result.value)) : result;

/** Transforma o erro, preservando o sucesso. */
export const mapErr = <T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> =>
  result.ok ? result : err(transform(result.error));

/** Encadeia operações que também podem falhar. */
export const andThen = <T, U, E>(result: Result<T, E>, next: (value: T) => Result<U, E>): Result<U, E> =>
  result.ok ? next(result.value) : result;

/** Extrai o valor; lança se for erro. Use só onde a falha é realmente impossível. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error instanceof Error
    ? result.error
    : new DomainError('unwrap_failed', `Result em erro: ${JSON.stringify(result.error)}`);
}

export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T => (result.ok ? result.value : fallback);
