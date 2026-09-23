import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE_ACESSO, COOKIE_RENOVACAO, cookiesDaSessao, type TokensDoComprador } from './lib/sessao';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3100';

/**
 * Renova a sessão do comprador (US-011): access vencido (o cookie expira junto
 * com o token) e refresh presente → troca na API e grava os cookies novos.
 *
 * Fica no middleware porque é o único lugar, além de server actions, em que o
 * Next deixa gravar cookie — uma página renderizando não pode. Refresh
 * recusado (vencido, revogado, reusado) apaga a sessão: o comprador entra de novo.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const acesso = request.cookies.get(COOKIE_ACESSO)?.value;
  const renovacao = request.cookies.get(COOKIE_RENOVACAO)?.value;

  if (acesso !== undefined || renovacao === undefined) return NextResponse.next();

  const secret = process.env.EDGE_SHARED_SECRET ?? '';
  const ip = request.headers.get('x-forwarded-for');

  let tokens: TokensDoComprador | undefined;
  try {
    const resposta = await fetch(`${API_URL}/v1/store/auth/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // mesma regra do lib/api.ts: o tenant vem do host, assinado pelo segredo do edge
        'x-forwarded-host': request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '',
        ...(secret === '' ? {} : { 'x-edge-secret': secret }),
        ...(secret === '' || ip === null ? {} : { 'x-forwarded-for': ip }),
      },
      body: JSON.stringify({ refreshToken: renovacao }),
      cache: 'no-store',
    });
    if (resposta.ok) tokens = (await resposta.json()) as TokensDoComprador;
  } catch {
    // API fora: segue sem sessão nesta requisição, sem apagar nada
    return NextResponse.next();
  }

  // cookies novos valem já nesta requisição (para a página) e na resposta (para o navegador)
  if (tokens === undefined) {
    request.cookies.delete(COOKIE_RENOVACAO);
    const resposta = NextResponse.next({ request });
    resposta.cookies.delete(COOKIE_RENOVACAO);
    return resposta;
  }

  for (const [nome, valor] of cookiesDaSessao(tokens)) request.cookies.set(nome, valor);
  const resposta = NextResponse.next({ request });
  for (const [nome, valor, opcoes] of cookiesDaSessao(tokens)) resposta.cookies.set(nome, valor, opcoes);
  return resposta;
}

export const config = {
  // páginas da conta; o resto da vitrine não precisa de sessão por enquanto
  matcher: ['/conta/:path*'],
};
