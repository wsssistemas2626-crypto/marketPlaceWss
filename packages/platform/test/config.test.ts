import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { ConfigService } from '../src/config/config.service.js';
import {
  ConfigKeyNotFoundError,
  ModuleNotEnabledError,
  PlanLimitReachedError,
} from '../src/config/config.types.js';
import { DEVELOPMENT_PLANS, InMemoryConfigSource } from '../src/config/in-memory-config-source.js';
import { RequiresModule, RequiresModuleGuard } from '../src/config/requires-module.guard.js';
import { runWithTenant, type TenantContext } from '../src/tenancy/tenant-context.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';
const contexto: TenantContext = { tenantId: TENANT_A, slug: 'loja-a', status: 'active', cell: 'shared-1' };

const [starter, growth] = DEVELOPMENT_PLANS as [
  (typeof DEVELOPMENT_PLANS)[number],
  (typeof DEVELOPMENT_PLANS)[number],
];

function montar() {
  const source = new InMemoryConfigSource({
    'orders.cancel_window_minutes': 15,
    'ledger.payout_delay_days': 7,
  });
  source.assignPlan(TENANT_A, growth);
  source.assignPlan(TENANT_B, starter);
  return { source, config: new ConfigService(source) };
}

describe('ConfigService — hierarquia plataforma → plano → tenant', () => {
  it('usa o padrão da plataforma quando ninguém sobrescreve', async () => {
    const { config } = montar();

    expect(await config.resolve('ledger.payout_delay_days', undefined, TENANT_A)).toEqual({
      value: 7,
      origin: 'platform',
    });
  });

  it('o plano tem precedência sobre a plataforma', async () => {
    const { config } = montar();

    expect(await config.resolve('orders.cancel_window_minutes', undefined, TENANT_A)).toEqual({
      value: 60,
      origin: 'plan',
    });
  });

  it('o tenant tem precedência sobre tudo', async () => {
    const { source, config } = montar();
    source.setTenantOverrides(TENANT_A, { 'orders.cancel_window_minutes': 5 });

    expect(await config.resolve('orders.cancel_window_minutes', undefined, TENANT_A)).toEqual({
      value: 5,
      origin: 'tenant',
    });
    // o outro tenant continua no valor do plano dele
    expect(await config.get('orders.cancel_window_minutes', undefined, TENANT_B)).toBe(30);
  });

  it('usa o tenant do contexto quando nenhum é passado', async () => {
    const { config } = montar();

    const valor = await runWithTenant(contexto, () => config.get('orders.cancel_window_minutes'));

    expect(valor).toBe(60);
  });

  it('cai no fallback informado e falha quando não há nenhum', async () => {
    const { config } = montar();

    expect(await config.get('inexistente', 'padrao', TENANT_A)).toBe('padrao');
    await expect(config.get('inexistente', undefined, TENANT_A)).rejects.toBeInstanceOf(
      ConfigKeyNotFoundError,
    );
  });
});

describe('entitlements do plano', () => {
  it('diz quais módulos o plano habilita', async () => {
    const { config } = montar();

    expect(await config.isModuleEnabled('disputes', TENANT_A)).toBe(true);
    expect(await config.isModuleEnabled('disputes', TENANT_B)).toBe(false);
    await expect(config.assertModuleEnabled('disputes', TENANT_B)).rejects.toBeInstanceOf(
      ModuleNotEnabledError,
    );
  });

  it('tenant sem plano não tem módulo nenhum', async () => {
    const { config } = montar();
    const semPlano = '0193a000-0000-7000-8000-00000000000f';

    expect(await config.entitlements(semPlano)).toEqual({ modules: [], limits: {} });
  });

  it('bloqueia ao atingir o limite do plano (RN-TEN-03)', async () => {
    const { config } = montar();

    await expect(config.assertWithinLimit('sellers', 9, TENANT_B)).resolves.toBeUndefined();

    const erro = await config.assertWithinLimit('sellers', 10, TENANT_B).catch((e) => e);
    expect(erro).toBeInstanceOf(PlanLimitReachedError);
    expect(erro.details).toEqual({ limit: 'sellers', max: 10, current: 10 });
  });

  it('limite não declarado é ilimitado', async () => {
    const { config } = montar();

    await expect(config.assertWithinLimit('webhooks', 9_999, TENANT_A)).resolves.toBeUndefined();
  });
});

describe('@RequiresModule', () => {
  class RotaDeDisputas {
    listar(): string {
      return 'ok';
    }
  }
  RequiresModule('disputes')(RotaDeDisputas);

  const contextoDe = (alvo: unknown): ExecutionContext =>
    ({
      getHandler: () => RotaDeDisputas.prototype.listar,
      getClass: () => alvo,
    }) as unknown as ExecutionContext;

  it('deixa passar quando o plano inclui o módulo', async () => {
    const { config } = montar();
    const guard = new RequiresModuleGuard(config, new Reflector());

    const permitido = await runWithTenant(contexto, () => guard.canActivate(contextoDe(RotaDeDisputas)));

    expect(permitido).toBe(true);
  });

  it('bloqueia quando o plano não inclui', async () => {
    const { config } = montar();
    const guard = new RequiresModuleGuard(config, new Reflector());
    const doTenantB: TenantContext = { ...contexto, tenantId: TENANT_B, slug: 'loja-b' };

    await expect(
      runWithTenant(doTenantB, () => guard.canActivate(contextoDe(RotaDeDisputas))),
    ).rejects.toBeInstanceOf(ModuleNotEnabledError);
  });

  it('rota sem a marca passa direto', async () => {
    const { config } = montar();
    const guard = new RequiresModuleGuard(config, new Reflector());

    class RotaComum {
      listar(): string {
        return 'ok';
      }
    }

    const contextoComum = {
      getHandler: () => RotaComum.prototype.listar,
      getClass: () => RotaComum,
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(contextoComum)).toBe(true);
  });
});
