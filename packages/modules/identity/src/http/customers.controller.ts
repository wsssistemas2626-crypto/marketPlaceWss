import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';

import {
  registerCustomerRequest,
  verifyCustomerEmailRequest,
  type RegisterCustomerResponse,
  type VerifyCustomerEmailResponse,
} from '@mkt/contracts';
import { Idempotent, Public, RateLimit, resolveClientIp, type HostCarrier } from '@mkt/platform';

import { RegisterCustomer } from '../application/customers/register-customer.js';
import { VerifyCustomerEmail } from '../application/customers/verify-customer-email.js';
import { parseBody } from './parse-body.js';

/** Configuração da borda para ler o IP do comprador (mesma do TenantContext). */
export interface CustomerHttpOptions {
  readonly edgeSharedSecret?: string;
}

export const CUSTOMER_HTTP_OPTIONS = Symbol('CUSTOMER_HTTP_OPTIONS');

type ClientRequest = HostCarrier & { readonly ip?: string; readonly socket?: { remoteAddress?: string } };

const GENERIC_REGISTRATION_MESSAGE =
  'Se os dados estiverem corretos, você vai receber um e-mail para confirmar a conta.';

/**
 * Cadastro e confirmação de e-mail do comprador (US-010). O tenant vem do
 * host da loja — a conta é daquele marketplace e de nenhum outro.
 */
@Controller('store/customers')
@Public('cadastro de comprador: quem chama ainda não tem conta; o tenant vem do host')
export class CustomersController {
  constructor(
    private readonly register: RegisterCustomer,
    private readonly verifyEmail: VerifyCustomerEmail,
    @Inject(CUSTOMER_HTTP_OPTIONS) private readonly options: CustomerHttpOptions,
  ) {}

  /**
   * 202 sempre que os campos são válidos — exista ou não conta com o e-mail
   * (cenário "e-mail já cadastrado"). Erro só de campo (422).
   */
  @Post()
  @HttpCode(202)
  @Idempotent()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async create(@Body() body: unknown, @Req() request: ClientRequest): Promise<RegisterCustomerResponse> {
    const input = parseBody(registerCustomerRequest, body);

    await this.register.execute({ ...input, ip: resolveClientIp(request, this.options) });

    return { message: GENERIC_REGISTRATION_MESSAGE };
  }

  @Post('verify-email')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  async verify(@Body() body: unknown): Promise<VerifyCustomerEmailResponse> {
    const { token } = parseBody(verifyCustomerEmailRequest, body);
    return this.verifyEmail.execute(token);
  }
}
