/**
 * Sessão do comprador no storefront (US-011).
 *
 * Os tokens ficam em cookies `HttpOnly` do **domínio da loja** (RNF-SEG-01):
 * o JavaScript da página não lê, e cada marketplace tem os seus — o cookie da
 * loja A nunca é enviado à loja B. Quem fala com a API é o servidor do Next.
 */
export const COOKIE_ACESSO = 'mkt_at';
export const COOKIE_RENOVACAO = 'mkt_rt';

export interface TokensDoComprador {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}

interface OpcoesDeCookie {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly expires: Date;
}

const base = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' } as const;

/** Os dois cookies da sessão, com a validade que a API definiu. */
export function cookiesDaSessao(tokens: TokensDoComprador): [string, string, OpcoesDeCookie][] {
  return [
    [
      COOKIE_ACESSO,
      tokens.accessToken,
      { ...base, path: '/', expires: new Date(tokens.accessTokenExpiresAt) },
    ],
    [
      COOKIE_RENOVACAO,
      tokens.refreshToken,
      { ...base, path: '/', expires: new Date(tokens.refreshTokenExpiresAt) },
    ],
  ];
}
