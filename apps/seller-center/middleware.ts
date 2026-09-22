import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Autenticação do painel (ADR-013).
 *
 * A sessão é da Clerk, mas quem decide o tenant é a API, conferindo a
 * organização ativa contra `identity.org_links` — o front só carrega o token.
 */
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/health']);
const isOrganizationPicker = createRouteMatcher(['/organizacao(.*)']);

export default clerkMiddleware(
  async (auth, request) => {
    if (isPublic(request)) return;

    /*
     * `treatPendingAsSignedOut: false`: se a instância exigir escolha de
     * organização, a sessão de quem ainda não escolheu fica **pendente**, e por
     * padrão o `auth()` a trata como deslogada — daí o laço de login. Queremos
     * o contrário: reconhecer a sessão e mandar escolher a organização.
     */
    const { userId, orgId } = await auth({ treatPendingAsSignedOut: false });

    // sem sessão: a Clerk manda para o /sign-in do próprio painel
    if (userId === null) {
      await auth.protect();
      return;
    }

    /*
     * Logado, mas sem organização ativa: aqui **não** dá para chamar
     * `auth.protect()`. Ele redireciona para o sign-in, que vê a sessão válida e
     * devolve para cá — um laço que termina em página em branco. Quem está sem
     * organização precisa escolher uma, não entrar de novo.
     */
    if (orgId === undefined && !isOrganizationPicker(request)) {
      return NextResponse.redirect(new URL('/organizacao', request.url));
    }
  },
  {
    // sem isto o `auth.protect()` redireciona para o portal hospedado da Clerk:
    // o redirect do servidor lê estas opções (ou as variáveis NEXT_PUBLIC_*),
    // não o `signInUrl` do ClerkProvider, que só vale no cliente
    signInUrl: '/sign-in',
    signUpUrl: '/sign-up',
  },
);

export const config = {
  // tudo, menos arquivos estáticos e as rotas internas do Next
  matcher: ['/((?!_next|.*[.].*).*)', '/(api|trpc)(.*)'],
};
