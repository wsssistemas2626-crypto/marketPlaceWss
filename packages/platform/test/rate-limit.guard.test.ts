import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { RateLimit, RateLimitExceededError, RateLimitGuard } from '../src/http/rate-limit.guard.js';
import { runWithTenant } from '../src/tenancy/tenant-context.js';
import type { RateLimitStore } from '../src/tenancy/tenant-rate-limit.js';

/** Redis de mentira: contadores sem expiração (a janela não importa aqui). */
class Contadores implements RateLimitStore {
  readonly valores = new Map<string, number>();

  async incr(key: string) {
    const valor = (this.valores.get(key) ?? 0) + 1;
    this.valores.set(key, valor);
    return valor;
  }

  async pexpire() {
    return 1;
  }

  async pttl() {
    return 60_000;
  }
}

class Rotas {
  cadastrar(): void {}
  listar(): void {}
}
RateLimit({ limit: 2, windowMs: 60_000 })(Rotas.prototype, 'cadastrar', {
  value: Rotas.prototype.cadastrar,
});

const contexto = (handler: 'cadastrar' | 'listar', headers: Record<string, string>, ip = '10.0.0.1') =>
  ({
    getHandler: () => Rotas.prototype[handler],
    getClass: () => Rotas,
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip }),
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  }) as unknown as ExecutionContext;

const naLoja = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: 'tenant-a', slug: 'loja-a', status: 'active', cell: 'shared-1' }, fn);

const guarda = (padrao = { limit: 100, windowMs: 60_000 }, edgeSharedSecret?: string) =>
  new RateLimitGuard(
    new Contadores(),
    new Reflector(),
    padrao,
    edgeSharedSecret === undefined ? undefined : { cell: 'shared-1', edgeSharedSecret },
  );

describe('RateLimitGuard', () => {
  it('limite da rota é por cliente: o 3º cadastro do mesmo IP para, outro IP segue', async () => {
    const guard = guarda();

    await naLoja(() => guard.canActivate(contexto('cadastrar', {}, '1.1.1.1')));
    await naLoja(() => guard.canActivate(contexto('cadastrar', {}, '1.1.1.1')));
    await expect(
      naLoja(() => guard.canActivate(contexto('cadastrar', {}, '1.1.1.1'))),
    ).rejects.toBeInstanceOf(RateLimitExceededError);

    await expect(naLoja(() => guard.canActivate(contexto('cadastrar', {}, '2.2.2.2')))).resolves.toBe(true);
  });

  it('limite da rota não vira teto da loja: outras rotas não contam para ele', async () => {
    const guard = guarda();

    for (let vez = 0; vez < 10; vez += 1)
      await naLoja(() => guard.canActivate(contexto('listar', {}, '3.3.3.3')));

    await expect(naLoja(() => guard.canActivate(contexto('cadastrar', {}, '4.4.4.4')))).resolves.toBe(true);
  });

  it('a cota geral do tenant continua valendo, somando todas as rotas', async () => {
    const guard = guarda({ limit: 3, windowMs: 60_000 });

    for (const ip of ['5.5.5.1', '5.5.5.2', '5.5.5.3']) {
      await naLoja(() => guard.canActivate(contexto('listar', {}, ip)));
    }

    await expect(naLoja(() => guard.canActivate(contexto('listar', {}, '5.5.5.4')))).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
  });

  it('X-Forwarded-For sem o segredo do edge é ignorado: trocar o header não fura o limite', async () => {
    const guard = guarda(undefined, 'segredo');

    await naLoja(() => guard.canActivate(contexto('cadastrar', { 'x-forwarded-for': '9.9.9.1' })));
    await naLoja(() => guard.canActivate(contexto('cadastrar', { 'x-forwarded-for': '9.9.9.2' })));

    await expect(
      naLoja(() => guard.canActivate(contexto('cadastrar', { 'x-forwarded-for': '9.9.9.3' }))),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('com o segredo do edge, cada comprador atrás do storefront conta separado', async () => {
    const guard = guarda(undefined, 'segredo');
    const doEdge = (ip: string) => ({ 'x-forwarded-for': ip, 'x-edge-secret': 'segredo' });

    for (const ip of ['7.7.7.1', '7.7.7.2', '7.7.7.3', '7.7.7.4']) {
      // mesmo IP de conexão (o servidor do storefront), compradores diferentes
      await expect(naLoja(() => guard.canActivate(contexto('cadastrar', doEdge(ip))))).resolves.toBe(true);
    }
  });
});
