import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Autenticação do console da plataforma (ADR-013).
 *
 * Aqui **não** há organização: o console usa uma aplicação Clerk separada, com
 * cadastro restrito a convite e MFA obrigatória, e o staff entra sem tenant.
 * Exigir organização nesta app levaria o login a um laço — quem manda no
 * acesso é a API, que só aceita token da aplicação Console.
 */
const isPublic = createRouteMatcher(['/sign-in(.*)', '/api/health']);

export default clerkMiddleware(
  async (auth, request) => {
    if (isPublic(request)) return;

    const { userId } = await auth();
    if (userId === null) await auth.protect();
  },
  {
    // o redirect do servidor não enxerga o `signInUrl` do ClerkProvider
    signInUrl: '/sign-in',
  },
);

export const config = {
  // tudo, menos arquivos estáticos e as rotas internas do Next
  matcher: ['/((?!_next|.*[.].*).*)', '/(api|trpc)(.*)'],
};
