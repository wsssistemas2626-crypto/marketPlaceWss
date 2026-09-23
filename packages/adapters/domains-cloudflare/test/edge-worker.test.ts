import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error — Worker em JavaScript puro, versionado em infra/cloudflare
import worker from '../../../../infra/cloudflare/worker.js';

const env = { EDGE_ORIGIN: 'edge-origin.plataforma.com.br', EDGE_SHARED_SECRET: 'segredo-do-edge' };

function capturarFetch(resposta: Response) {
  const recebidas: Request[] = [];
  const fetchImpl = vi.fn(async (request: Request) => {
    recebidas.push(request);
    return resposta;
  });

  vi.stubGlobal('fetch', fetchImpl);
  return recebidas;
}

/**
 * O Worker é a peça que transforma "domínio do cliente" em "tenant" para a
 * Railway. Se ele errar o header, o storefront serve o tenant errado — por
 * isso os testes olham exatamente o que ele manda para a origem.
 */
describe('Worker do edge (US-085)', () => {
  it('marca a requisição com o host do visitante e o segredo do edge', async () => {
    const recebidas = capturarFetch(new Response('ok', { status: 200 }));

    await worker.fetch(new Request('https://loja-x.com.br/produtos?pagina=2'), env);

    const encaminhada = recebidas[0];
    expect(encaminhada?.headers.get('X-Forwarded-Host')).toBe('loja-x.com.br');
    expect(encaminhada?.headers.get('X-Edge-Secret')).toBe('segredo-do-edge');
    // a Railway só roteia o host cadastrado; a query é preservada
    expect(encaminhada?.url).toBe('https://edge-origin.plataforma.com.br/produtos?pagina=2');
  });

  it('reescreve Location absoluto para o domínio do tenant', async () => {
    capturarFetch(
      new Response(null, {
        status: 302,
        headers: { location: 'https://edge-origin.plataforma.com.br/entrar' },
      }),
    );

    const resposta = await worker.fetch(new Request('https://loja-x.com.br/conta'), env);

    // sem isto, o navegador sairia do domínio do tenant no meio do fluxo
    expect(resposta.headers.get('location')).toBe('https://loja-x.com.br/entrar');
    expect(resposta.status).toBe(302);
  });

  it('não mexe em Location relativo', async () => {
    capturarFetch(new Response(null, { status: 302, headers: { location: '/entrar' } }));

    const resposta = await worker.fetch(new Request('https://loja-x.com.br/conta'), env);

    expect(resposta.headers.get('location')).toBe('/entrar');
  });

  it('recusa subir sem configuração, em vez de encaminhar sem o segredo', async () => {
    const resposta = await worker.fetch(new Request('https://loja-x.com.br/'), { EDGE_ORIGIN: '' });

    expect(resposta.status).toBe(500);
  });
});
