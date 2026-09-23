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

/** Pedido de troca de senha (US-012). Resposta 202 genérica, exista ou não a conta. */
export const requestPasswordResetRequest = z.object({
  email: z.string().max(320),
});

export type RequestPasswordResetRequest = z.infer<typeof requestPasswordResetRequest>;

/** Troca de senha com o token do e-mail (uso único, 1 hora). */
export const completePasswordResetRequest = z.object({
  token: z.string().max(256),
  password: z.string().max(256),
});

export type CompletePasswordResetRequest = z.infer<typeof completePasswordResetRequest>;

/** Endereço do comprador (US-014). As regras (CEP, UF, tamanhos) moram no domínio. */
export const customerAddressRequest = z.object({
  label: z.string().max(200).optional(),
  recipientName: z.string().max(200),
  zipCode: z.string().max(20),
  street: z.string().max(300),
  number: z.string().max(50),
  complement: z.string().max(200).optional(),
  district: z.string().max(200),
  city: z.string().max(200),
  state: z.string().max(10),
  isDefault: z.boolean().optional(),
});

export type CustomerAddressRequest = z.infer<typeof customerAddressRequest>;

export interface CustomerAddressResponse {
  readonly id: string;
  readonly label?: string;
  readonly recipientName: string;
  readonly zipCode: string;
  readonly street: string;
  readonly number: string;
  readonly complement?: string;
  readonly district: string;
  readonly city: string;
  readonly state: string;
  readonly isDefault: boolean;
}

/** Autocompletar de CEP: `found: false` quando o CEP não existe. */
export interface PostalCodeLookupResponse {
  readonly found: boolean;
  readonly address?: { zipCode: string; street: string; district: string; city: string; state: string };
}
