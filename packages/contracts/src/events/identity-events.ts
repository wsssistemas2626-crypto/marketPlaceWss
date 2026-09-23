import { z } from 'zod';

import { registerEvent } from './catalog.js';

/**
 * Eventos dos compradores (identidade própria, ADR-013).
 *
 * Só identificadores no `data`: e-mail, nome e documento são dados pessoais e
 * não viajam pelo barramento (CLAUDE.md §4.9). Quem precisar deles consulta a
 * fachada do `identity`.
 */
export const customerRegisteredData = z.object({
  customerId: z.string(),
});

export type CustomerRegisteredData = z.infer<typeof customerRegisteredData>;

export const CUSTOMER_REGISTERED = registerEvent({
  type: 'identity.customer.registered',
  version: 1,
  schema: customerRegisteredData,
  isPublic: false,
  description: 'Um comprador criou conta; o e-mail ainda não foi confirmado.',
});

export const customerVerifiedData = z.object({
  customerId: z.string(),
});

export type CustomerVerifiedData = z.infer<typeof customerVerifiedData>;

export const CUSTOMER_VERIFIED = registerEvent({
  type: 'identity.customer.verified',
  version: 1,
  schema: customerVerifiedData,
  isPublic: false,
  description: 'O comprador confirmou o e-mail e pode comprar.',
});
