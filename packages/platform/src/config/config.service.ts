import { Inject, Injectable } from '@nestjs/common';

import { requireTenant } from '../tenancy/tenant-context.js';
import {
  CONFIG_SOURCE,
  ConfigKeyNotFoundError,
  ModuleNotEnabledError,
  PlanLimitReachedError,
  type ConfigSourcePort,
  type ConfigValue,
  type Entitlements,
  type ResolvedConfig,
} from './config.types.js';

/**
 * Resolve configuração na hierarquia **plataforma → plano → tenant**
 * (CLAUDE.md §4.13): o valor mais específico ganha.
 *
 * É o que permite diferenças entre tenants sem nenhum `if` por tenant no
 * código (CLAUDE.md §9): diferença vira configuração ou plano.
 */
@Injectable()
export class ConfigService {
  constructor(@Inject(CONFIG_SOURCE) private readonly source: ConfigSourcePort) {}

  /** Valor com a origem, para a UI mostrar "herdado do plano" vs. "definido pelo tenant". */
  async resolve<T extends ConfigValue>(
    key: string,
    fallback?: T,
    tenantId: string = requireTenant().tenantId,
  ): Promise<ResolvedConfig<T>> {
    const overrides = await this.source.tenantOverrides(tenantId);
    if (key in overrides) return { value: overrides[key] as T, origin: 'tenant' };

    const plan = await this.source.planOf(tenantId);
    if (plan !== undefined && key in plan.settings) {
      return { value: plan.settings[key] as T, origin: 'plan' };
    }

    const defaults = await this.source.platformDefaults();
    if (key in defaults) return { value: defaults[key] as T, origin: 'platform' };

    if (fallback === undefined) throw new ConfigKeyNotFoundError(key);
    return { value: fallback, origin: 'default' };
  }

  async get<T extends ConfigValue>(key: string, fallback?: T, tenantId?: string): Promise<T> {
    const resolved =
      tenantId === undefined
        ? await this.resolve<T>(key, fallback)
        : await this.resolve<T>(key, fallback, tenantId);
    return resolved.value;
  }

  async entitlements(tenantId: string = requireTenant().tenantId): Promise<Entitlements> {
    const plan = await this.source.planOf(tenantId);
    return plan?.entitlements ?? { modules: [], limits: {} };
  }

  async isModuleEnabled(moduleName: string, tenantId?: string): Promise<boolean> {
    const { modules } = await (tenantId === undefined ? this.entitlements() : this.entitlements(tenantId));
    return modules.includes(moduleName);
  }

  /** Usado pelo guard `@RequiresModule` e por casos de uso de módulos opcionais. */
  async assertModuleEnabled(moduleName: string, tenantId?: string): Promise<void> {
    if (!(await this.isModuleEnabled(moduleName, tenantId))) {
      throw new ModuleNotEnabledError(moduleName);
    }
  }

  /**
   * Checa um limite do plano **antes** de criar o recurso (RN-TEN-03).
   * Limite ausente = sem limite: um plano enterprise não precisa listar tudo.
   */
  async assertWithinLimit(limit: string, currentCount: number, tenantId?: string): Promise<void> {
    const { limits } = await (tenantId === undefined ? this.entitlements() : this.entitlements(tenantId));
    const max = limits[limit];

    if (max !== undefined && currentCount >= max) {
      throw new PlanLimitReachedError(limit, max, currentCount);
    }
  }
}
