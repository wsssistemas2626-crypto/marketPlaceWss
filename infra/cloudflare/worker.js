/**
 * Cloudflare Worker do edge (ADR-014 §6 / US-085).
 *
 * Domínio próprio de tenant (`loja-x.com.br`) → Cloudflare for SaaS → aqui →
 * origem única na Railway (`edge-origin.<plataforma>`).
 *
 * Por que existe: a Railway limita domínios customizados por serviço (20 no
 * plano Pro) e a própria documentação dela recomenda gerenciar domínios de
 * cliente fora. Então **um** hostname fica cadastrado lá e este Worker diz ao
 * storefront qual tenant é, via `X-Forwarded-Host`.
 *
 * O `X-Edge-Secret` é o que separa "o edge está dizendo" de "o cliente está
 * dizendo": sem ele, qualquer um mandaria `X-Forwarded-Host` direto para a
 * Railway e se passaria por outro tenant. O storefront só confia no header
 * quando o segredo confere (ver `resolveRequestHost` em @mkt/platform).
 */
export default {
  /**
   * @param {Request} request
   * @param {{ EDGE_ORIGIN: string, EDGE_SHARED_SECRET: string }} env
   */
  async fetch(request, env) {
    if (!env.EDGE_ORIGIN || !env.EDGE_SHARED_SECRET) {
      return new Response('Edge não configurado', { status: 500 });
    }

    const incoming = new URL(request.url);
    const target = new URL(request.url);
    target.hostname = env.EDGE_ORIGIN;
    target.port = '';
    target.protocol = 'https:';

    const headers = new Headers(request.headers);
    // o host real do visitante é o que identifica o tenant
    headers.set('X-Forwarded-Host', incoming.hostname);
    headers.set('X-Edge-Secret', env.EDGE_SHARED_SECRET);
    headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));

    // `redirect: manual` mantém os 3xx da aplicação intactos: quem decide
    // seguir é o navegador, no domínio do tenant, não o Worker
    const response = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      }),
    );

    // Location relativo é preservado pelo navegador; absoluto apontando para a
    // origem viraria vazamento do domínio interno, então reescrevemos
    const location = response.headers.get('location');
    if (location !== null && location.includes(env.EDGE_ORIGIN)) {
      const corrected = new Headers(response.headers);
      corrected.set('location', location.replaceAll(env.EDGE_ORIGIN, incoming.hostname));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: corrected,
      });
    }

    return response;
  },
};
