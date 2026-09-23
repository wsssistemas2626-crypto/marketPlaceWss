import { ValidationError } from '@mkt/shared-kernel';

/** CPF (pessoa física) ou CNPJ (pessoa jurídica) — RF-IAM-01. Dado pessoal. */
export interface TaxDocument {
  readonly type: 'cpf' | 'cnpj';
  /** Só dígitos. */
  readonly number: string;
}

const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** Todos os dígitos iguais passam no cálculo, mas não são documentos válidos. */
const isRepeated = (digits: string): boolean => /^(\d)\1+$/.test(digits);

function checkDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || isRepeated(digits)) return false;

  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(digits[9]) && second === Number(digits[10]);
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || isRepeated(digits)) return false;

  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(digits[12]) && second === Number(digits[13]);
}

/**
 * Lê CPF ou CNPJ pela quantidade de dígitos; aceita com ou sem máscara.
 * Erro de validação aponta o campo `document` (cenário "CPF inválido").
 */
export function parseTaxDocument(value: string): TaxDocument {
  const digits = onlyDigits(value);

  if (digits.length === 11 && isValidCpf(digits)) return { type: 'cpf', number: digits };
  if (digits.length === 14 && isValidCnpj(digits)) return { type: 'cnpj', number: digits };

  // o valor não entra no erro: documento é dado pessoal e erro vai para log
  throw new ValidationError('CPF ou CNPJ inválido', { field: 'document' });
}
