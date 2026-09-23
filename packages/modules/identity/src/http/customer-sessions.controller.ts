import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';

import {
  customerLoginRequest,
  customerRefreshRequest,
  type CustomerProfileResponse,
  type CustomerTokensResponse,
} from '@mkt/contracts';
import { Public, RateLimit } from '@mkt/platform';

import { CustomerSessions, type CustomerTokens } from '../application/customers/customer-sessions.js';
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from '../application/customers/ports.js';
import {
  CurrentCustomer,
  CustomerAuth,
  CustomerNotAuthenticatedError,
  type CustomerSession,
} from './customer-auth.js';
import { parseBody } from './parse-body.js';

const toResponse = (tokens: CustomerTokens): CustomerTokensResponse => ({
  accessToken: tokens.accessToken,
  accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
  refreshToken: tokens.refreshToken,
  refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
});

/**
 * Login, refresh e logout do comprador (US-011 / RF-IAM-03).
 *
 * Sem `Idempotency-Key`: a resposta carrega tokens, e o cache de idempotência
 * guardaria segredo no Redis para devolver a quem repetisse a chave. Repetir
 * um login simplesmente abre outra sessão.
 */
@Controller('store/auth')
@Public('entrada do comprador: a credencial é o que vem no corpo (senha ou refresh token)')
export class CustomerSessionsController {
  constructor(private readonly sessions: CustomerSessions) {}

  @Post('login')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  async login(@Body() body: unknown): Promise<CustomerTokensResponse> {
    return toResponse(await this.sessions.login(parseBody(customerLoginRequest, body)));
  }

  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async refresh(@Body() body: unknown): Promise<CustomerTokensResponse> {
    const { refreshToken } = parseBody(customerRefreshRequest, body);
    return toResponse(await this.sessions.refresh(refreshToken));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown): Promise<void> {
    const { refreshToken } = parseBody(customerRefreshRequest, body);
    await this.sessions.logout(refreshToken);
  }
}

/** Dados da própria conta (a primeira rota `@CustomerAuth`). */
@Controller('store/customers/me')
@CustomerAuth()
export class CustomerAccountController {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort) {}

  @Get()
  async me(@CurrentCustomer() session: CustomerSession): Promise<CustomerProfileResponse> {
    // RLS: só enxerga comprador do tenant do host, que é o mesmo do token (conferido no guard)
    const customer = await this.customers.findById(session.customerId);
    if (customer === undefined) throw new CustomerNotAuthenticatedError();

    const snapshot = customer.toSnapshot();
    return {
      id: snapshot.id,
      name: snapshot.name,
      email: snapshot.email,
      status: snapshot.status,
      emailVerified: snapshot.emailVerifiedAt !== undefined,
    };
  }
}
