'use server';

import { postToApi } from '../../lib/api';

export interface EstadoSenha {
  readonly enviado: boolean;
  readonly mensagem?: string;
  readonly erro?: string;
  readonly campo?: string;
}

/** Pede o link de troca de senha (US-012). A resposta é a mesma exista ou não a conta. */
export async function pedirTroca(_anterior: EstadoSenha, dados: FormData): Promise<EstadoSenha> {
  const resultado = await postToApi<{ message: string }>(
    '/v1/store/customers/password-reset',
    { email: String(dados.get('email') ?? '') },
    { idempotent: true },
  );

  return resultado.data === undefined
    ? { enviado: false, erro: resultado.error ?? 'Não foi possível pedir agora.' }
    : { enviado: true, mensagem: resultado.data.message };
}

/** Troca a senha com o token do link. Todas as sessões da conta caem na API. */
export async function trocarSenha(
  token: string,
  _anterior: EstadoSenha,
  dados: FormData,
): Promise<EstadoSenha> {
  const resultado = await postToApi('/v1/store/customers/password-reset/confirm', {
    token,
    password: String(dados.get('password') ?? ''),
  });

  if (resultado.error === undefined) {
    return { enviado: true, mensagem: 'Senha trocada. Entre de novo com a senha nova.' };
  }

  return {
    enviado: false,
    erro: resultado.error,
    ...(resultado.field === undefined ? {} : { campo: resultado.field }),
  };
}
