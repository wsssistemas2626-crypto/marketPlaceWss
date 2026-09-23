import { z } from 'zod';

/**
 * Contratos HTTP dos compradores (`/v1/store/customers`, US-010).
 *
 * Só a forma: as regras (CPF válido, senha forte, e-mail normalizado) moram
 * no domínio do `identity`, que devolve o erro apontando o campo.
 */
export const registerCustomerRequest = z.object({
  name: z.string().max(200),
  email: z.string().max(320),
  /** CPF ou CNPJ, com ou sem máscara. */
  document: z.string().max(32),
  password: z.string().max(256),
  /** Aceite de termos de uso e política de privacidade nas versões vigentes. */
  acceptTerms: z.boolean(),
});

export type RegisterCustomerRequest = z.infer<typeof registerCustomerRequest>;

/** Mesma resposta exista ou não a conta (anti-enumeração). */
export interface RegisterCustomerResponse {
  readonly message: string;
}

export const verifyCustomerEmailRequest = z.object({
  token: z.string().max(256),
});

export type VerifyCustomerEmailRequest = z.infer<typeof verifyCustomerEmailRequest>;

export interface VerifyCustomerEmailResponse {
  readonly status: 'verified' | 'already_verified';
}
