import { describe, expect, it, vi } from 'vitest';

import { CloudflareDomainProvisioning, CloudflareDomainsError } from '../src/index.js';

interface Chamada {
  url: string;
  method: string;
  body: unknown;
  authorization: string;
}

/** `fetch` de mentira que grava as chamadas e devolve respostas programadas. */
function stubFetch(respostas: { status?: number; payload: unknown }[]) {
  const chamadas: Chamada[] = [];
  let indice = 0;

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    chamadas.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      authorization: headers.get('authorization') ?? '',
    });

    const resposta = respostas[Math.min(indice, respostas.length - 1)];
    indice += 1;

    return {
      ok: (resposta?.status ?? 200) < 400,
      status: resposta?.status ?? 200,
      json: async () => resposta?.payload,
    } as Response;
  });

  return { fetchImpl: fetchImpl as unknown as typeof fetch, chamadas };
}

const sucesso = (result: unknown) => ({ payload: { success: true, errors: [], result } });

const adapter = (fetchImpl: typeof fetch) =>
  new CloudflareDomainProvisioning({
    apiToken: 'cf-token',
    zoneId: 'zona-1',
    originHostname: 'edge-origin.plataforma.com.br',
    fetchImpl,
  });

describe('CloudflareDomainProvisioning', () => {
  it('registra o hostname apontando para a origem do edge', async () => {
    const { fetchImpl, chamadas } = stubFetch([
      sucesso([]), // consulta inicial: ainda não existe
      sucesso({
        id: 'ch_1',
        hostname: 'loja-x.com.br',
        status: 'pending',
        ssl: { status: 'pending_validation' },
      }),
    ]);

    const registro = await adapter(fetchImpl).addDomain('loja-x.com.br');

    expect(registro).toEqual({
      hostname: 'loja-x.com.br',
      status: 'pending',
      certificateStatus: 'pending',
    });
    expect(chamadas[1]).toMatchObject({
      method: 'POST',
      authorization: 'Bearer cf-token',
      body: { hostname: 'loja-x.com.br', custom_origin_server: 'edge-origin.plataforma.com.br' },
    });
  });

  it('é idempotente: hostname já registrado não cria outro', async () => {
    const { fetchImpl, chamadas } = stubFetch([
      sucesso([{ id: 'ch_1', hostname: 'loja-x.com.br', status: 'active', ssl: { status: 'active' } }]),
    ]);

    const registro = await adapter(fetchImpl).addDomain('loja-x.com.br');

    expect(registro).toEqual({
      hostname: 'loja-x.com.br',
      status: 'active',
      certificateStatus: 'issued',
    });
    // só a consulta; nenhum POST
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.method).toBe('GET');
  });

  it('traduz os estados da Cloudflare para o vocabulário do port', async () => {
    const casos: [string, string, string, string][] = [
      ['active', 'active', 'active', 'issued'],
      ['pending', 'pending_validation', 'pending', 'pending'],
      ['blocked', 'deleted', 'failed', 'failed'],
      ['estado_novo_da_cloudflare', 'algo_novo', 'pending', 'pending'],
    ];

    for (const [status, sslStatus, esperadoStatus, esperadoCert] of casos) {
      const { fetchImpl } = stubFetch([
        sucesso([{ id: 'ch_1', hostname: 'loja-x.com.br', status, ssl: { status: sslStatus } }]),
      ]);

      await expect(adapter(fetchImpl).getStatus('loja-x.com.br')).resolves.toEqual({
        hostname: 'loja-x.com.br',
        status: esperadoStatus,
        certificateStatus: esperadoCert,
      });
    }
  });

  it('hostname desconhecido devolve undefined', async () => {
    const { fetchImpl } = stubFetch([sucesso([])]);

    await expect(adapter(fetchImpl).getStatus('nao-existe.com.br')).resolves.toBeUndefined();
  });

  it('remove pelo id encontrado na consulta', async () => {
    const { fetchImpl, chamadas } = stubFetch([
      sucesso([{ id: 'ch_9', hostname: 'loja-x.com.br', status: 'active', ssl: { status: 'active' } }]),
      sucesso({ id: 'ch_9' }),
    ]);

    await adapter(fetchImpl).remove('loja-x.com.br');

    expect(chamadas[1]).toMatchObject({ method: 'DELETE' });
    expect(chamadas[1]?.url).toContain('/custom_hostnames/ch_9');
  });

  it('remover o que não existe é sucesso (estado desejado já é o atual)', async () => {
    const { fetchImpl, chamadas } = stubFetch([sucesso([])]);

    await expect(adapter(fetchImpl).remove('nao-existe.com.br')).resolves.toBeUndefined();
    expect(chamadas).toHaveLength(1);
  });

  it('traduz erro da Cloudflare sem vazar o formato dela', async () => {
    const { fetchImpl } = stubFetch([
      {
        status: 403,
        payload: { success: false, errors: [{ code: 1000, message: 'token sem permissão' }], result: null },
      },
    ]);

    const erro = await adapter(fetchImpl)
      .getStatus('loja-x.com.br')
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(CloudflareDomainsError);
    expect((erro as Error).message).toContain('token sem permissão');
  });
});
