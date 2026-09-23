'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { postToApi } from '../../lib/api';
import { COOKIE_ACESSO, COOKIE_RENOVACAO, cookiesDaSessao, type TokensDoComprador } from '../../lib/sessao';

export interface EstadoLogin {
  readonly erro?: string;
}

/** Login do comprador (US-011): a API devolve os tokens; o servidor grava em cookie `HttpOnly`. */
export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const resultado = await postToApi<TokensDoComprador>('/v1/store/auth/login', {
    email: String(dados.get('email') ?? ''),
    password: String(dados.get('password') ?? ''),
  });

  if (resultado.data === undefined) return { erro: resultado.error ?? 'Não foi possível entrar agora.' };

  const jar = await cookies();
  for (const [nome, valor, opcoes] of cookiesDaSessao(resultado.data)) jar.set(nome, valor, opcoes);

  redirect('/conta');
}

/** Sai: revoga a família do refresh na API e apaga os cookies, mesmo se a API falhar. */
export async function sair(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(COOKIE_RENOVACAO)?.value;

  if (refreshToken !== undefined) await postToApi('/v1/store/auth/logout', { refreshToken });

  jar.delete(COOKIE_ACESSO);
  jar.delete(COOKIE_RENOVACAO);
  redirect('/');
}
