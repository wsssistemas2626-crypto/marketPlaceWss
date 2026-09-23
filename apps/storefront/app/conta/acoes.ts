'use server';

import { postToApi, type ActionResult } from '../../lib/api';

export interface EstadoCadastro {
  readonly enviado: boolean;
  readonly mensagem?: string;
  readonly erro?: string;
  readonly campo?: string;
}

/**
 * Cadastro do comprador (US-010). O tenant vem do host desta requisição — o
 * formulário não manda nada que identifique a loja (CLAUDE.md §4.11).
 */
export async function cadastrar(_anterior: EstadoCadastro, dados: FormData): Promise<EstadoCadastro> {
  const resultado: ActionResult<{ message: string }> = await postToApi(
    '/v1/store/customers',
    {
      name: String(dados.get('name') ?? ''),
      email: String(dados.get('email') ?? ''),
      document: String(dados.get('document') ?? ''),
      password: String(dados.get('password') ?? ''),
      acceptTerms: dados.get('acceptTerms') === 'on',
    },
    { idempotent: true },
  );

  if (resultado.data !== undefined) return { enviado: true, mensagem: resultado.data.message };

  return {
    enviado: false,
    ...(resultado.error === undefined ? {} : { erro: resultado.error }),
    ...(resultado.field === undefined ? {} : { campo: resultado.field }),
  };
}

export async function confirmarEmail(token: string): Promise<{ ok: boolean; mensagem: string }> {
  const resultado = await postToApi<{ status: 'verified' | 'already_verified' }>(
    '/v1/store/customers/verify-email',
    { token },
  );

  if (resultado.data !== undefined) {
    return {
      ok: true,
      mensagem:
        resultado.data.status === 'verified'
          ? 'E-mail confirmado! Sua conta está ativa.'
          : 'Este e-mail já estava confirmado.',
    };
  }

  return { ok: false, mensagem: resultado.error ?? 'Não foi possível confirmar agora.' };
}
