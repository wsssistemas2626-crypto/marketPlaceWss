import { describe, expect, it } from 'vitest';

import {
  audienceOf,
  listRegisteredRoutes,
  probeCrossTenantAccess,
  type ProbeResponse,
  type RegisteredRoute,
} from '../src/testing/isolation-suite.js';

const TENANT_B = '0193a000-0000-7000-8000-00000000000b';
const WIDGET_DE_B = '0193a000-0000-7000-8000-000000000999';

const rota = (method: RegisteredRoute['method'], path: string): RegisteredRoute => ({ method, path });

const probe = (routes: readonly RegisteredRoute[], responder: () => ProbeResponse) =>
  probeCrossTenantAccess({
    routes,
    send: async () => responder(),
    headersOfTenantA: () => ({ host: 'loja-a.localhost' }),
    resourceIdsOfTenantB: { id: WIDGET_DE_B },
    secretsOfTenantB: [WIDGET_DE_B, TENANT_B, 'da-loja-b'],
  });

describe('classificação de rotas', () => {
  it('reconhece o público pelo prefixo', () => {
    expect(audienceOf('/v1/store/widgets')).toBe('store');
    expect(audienceOf('/v1/seller/widgets')).toBe('seller');
    expect(audienceOf('/v1/admin/orders')).toBe('admin');
    expect(audienceOf('/v1/public/products')).toBe('public');
    expect(audienceOf('/v1/platform/tenants')).toBe('platform');
    expect(audienceOf('/health')).toBe('other');
  });

  it('extrai rotas do router do Express', () => {
    const adapter = {
      router: {
        stack: [
          { route: { path: '/v1/store/widgets', methods: { get: true, post: true } } },
          { route: { path: '/health', methods: { get: true } } },
          { name: 'middleware' },
        ],
      },
    };

    expect(listRegisteredRoutes(adapter)).toEqual([
      rota('GET', '/v1/store/widgets'),
      rota('POST', '/v1/store/widgets'),
      rota('GET', '/health'),
    ]);
    expect(listRegisteredRoutes(undefined)).toEqual([]);
  });
});

describe('probeCrossTenantAccess — a suíte precisa acusar de verdade', () => {
  it('passa quando a rota devolve 404 para recurso de outro tenant', async () => {
    const violacoes = await probe([rota('GET', '/v1/store/widgets/:id')], () => ({
      status: 404,
      body: { code: 'not_found' },
    }));

    expect(violacoes).toEqual([]);
  });

  it('passa quando a listagem vem vazia (RLS filtrou)', async () => {
    const violacoes = await probe([rota('GET', '/v1/store/widgets')], () => ({
      status: 200,
      body: { data: [] },
    }));

    expect(violacoes).toEqual([]);
  });

  it('acusa vazamento de id de outro tenant na resposta', async () => {
    const violacoes = await probe([rota('GET', '/v1/store/widgets/:id')], () => ({
      status: 200,
      body: { id: WIDGET_DE_B, slug: 'da-loja-b' },
    }));

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]?.reason).toContain('contém dado do tenant B');
  });

  it('acusa escrita aceita sobre recurso de outro tenant', async () => {
    const violacoes = await probe([rota('DELETE', '/v1/store/widgets/:id')], () => ({
      status: 204,
      body: null,
    }));

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]?.reason).toContain('escrita sobre recurso de outro tenant');
  });

  it('não acusa POST de coleção: criar no próprio tenant é normal', async () => {
    const violacoes = await probe([rota('POST', '/v1/store/widgets')], () => ({
      status: 201,
      body: { id: 'id-do-tenant-a' },
    }));

    expect(violacoes).toEqual([]);
  });

  it('acusa rota cujo parâmetro a suíte não sabe preencher', async () => {
    const violacoes = await probe([rota('GET', '/v1/store/orders/:orderId/items/:itemId')], () => ({
      status: 404,
      body: {},
    }));

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]?.reason).toContain('orderId');
    expect(violacoes[0]?.reason).toContain('sem prova de isolamento');
  });

  it('ignora rotas sem tenant (health, console da plataforma)', async () => {
    const violacoes = await probe([rota('GET', '/health'), rota('GET', '/v1/platform/tenants')], () => ({
      status: 200,
      body: { tenantId: TENANT_B },
    }));

    expect(violacoes).toEqual([]);
  });
});
