import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { completePasswordResetRequest, requestPasswordResetRequest } from '@mkt/contracts';
import { Idempotent, Public, RateLimit } from '@mkt/platform';

import { PasswordReset } from '../application/customers/password-reset.js';
import { parseBody } from './parse-body.js';

const GENERIC_RESET_MESSAGE = 'Se houver uma conta com esse e-mail, enviamos um link para trocar a senha.';

/**
 * Recuperação de senha do comprador (US-012 / RF-IAM-04). O tenant vem do
 * host: o link só troca a senha da conta **desta** loja.
 */
@Controller('store/customers/password-reset')
@Public('recuperação de senha: quem chama não consegue entrar; a credencial é o e-mail ou o token do link')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordReset) {}

  /** 202 sempre — e sem esperar o e-mail sair, para o tempo não denunciar se a conta existe. */
  @Post()
  @HttpCode(202)
  @Idempotent()
  @RateLimit({ limit: 5, windowMs: 60_000 })
  async request(@Body() body: unknown): Promise<{ message: string }> {
    await this.passwordReset.request(parseBody(requestPasswordResetRequest, body));
    return { message: GENERIC_RESET_MESSAGE };
  }

  @Post('confirm')
  @HttpCode(204)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async confirm(@Body() body: unknown): Promise<void> {
    await this.passwordReset.complete(parseBody(completePasswordResetRequest, body));
  }
}
