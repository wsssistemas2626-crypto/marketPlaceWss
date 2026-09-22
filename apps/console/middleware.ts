import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Autenticação do painel (ADR-013).
 *
 * A sessão é da Clerk, mas quem decide o tenant é a API, conferindo a
 * organização ativa contra `identity.org_links` — o front só carrega o token.
 */
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/health']);

export default clerkMiddleware(async (auth, request) => {
  if (isPublic(request)) return;

  const { userId, orgId } = await auth();

  // sem organização ativa não há tenant: a API recusaria de qualquer forma
  if (userId === null || orgId === undefined) {
    await auth.protect();
  }
});

export const config = {
  // tudo, menos arquivos estáticos e as rotas internas do Next
  matcher: ['/((?!_next|.*[.].*).*)', '/(api|trpc)(.*)'],
};
