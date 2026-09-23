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

/** Login do comprador (US-011). */
export const customerLoginRequest = z.object({
  email: z.string().max(320),
  password: z.string().max(256),
});

export type CustomerLoginRequest = z.infer<typeof customerLoginRequest>;

export const customerRefreshRequest = z.object({
  refreshToken: z.string().max(256),
});

export type CustomerRefreshRequest = z.infer<typeof customerRefreshRequest>;

/**
 * Par de tokens. Quem guarda é o servidor do storefront, em cookies
 * `HttpOnly; Secure; SameSite=Lax` (RNF-SEG-01) — o navegador nunca vê o token.
 */
export interface CustomerTokensResponse {
  readonly accessToken: string;
  /** ISO 8601. */
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}

/** `GET /v1/store/customers/me` — só o próprio comprador. */
export interface CustomerProfileResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: 'pending_verification' | 'active' | 'blocked' | 'anonymized';
  readonly emailVerified: boolean;
}
