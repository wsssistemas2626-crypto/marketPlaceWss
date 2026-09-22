import { DomainError } from '@mkt/shared-kernel';

/** Valor de configuração aceito em `[config]` (ver docs/04-regras-de-negocio.md). */
export type ConfigValue = string | number | boolean | null;

export interface Entitlements {
  /** Módulos que o plano habilita (`06-multi-tenancy.md` §8). */
  readonly modules: readonly string[];
  /** Limites numéricos do plano: sellers, skus, staffUsers, customDomains… */
  readonly limits: Readonly<Record<string, number>>;
}

export interface PlanDefinition {
  readonly planId: string;
  readonly name: string;
  readonly entitlements: Entitlements;
  /** Configurações padrão do plano, acima do padrão da plataforma. */
  readonly settings: Readonly<Record<string, ConfigValue>>;
}

/**
 * De onde vêm as configurações. A implementação com banco + cache chega com o
 * módulo `tenancy` (US-075); aqui fica a porta e uma versão em memória.
 */
export interface ConfigSourcePort {
  platformDefaults(): Promise<Readonly<Record<string, ConfigValue>>>;
  planOf(tenantId: string): Promise<PlanDefinition | undefined>;
  tenantOverrides(tenantId: string): Promise<Readonly<Record<string, ConfigValue>>>;
}

export const CONFIG_SOURCE = Symbol('CONFIG_SOURCE');

/** Origem do valor resolvido — útil na UI de configurações e no suporte. */
export type ConfigOrigin = 'tenant' | 'plan' | 'platform' | 'default';

export interface ResolvedConfig<T extends ConfigValue = ConfigValue> {
  readonly value: T;
  readonly origin: ConfigOrigin;
}

export class ModuleNotEnabledError extends DomainError {
  constructor(moduleName: string) {
    super('module_not_enabled', `O módulo "${moduleName}" não está incluído no plano deste tenant.`, {
      module: moduleName,
    });
  }
}

export class PlanLimitReachedError extends DomainError {
  constructor(limit: string, max: number, current: number) {
    super('plan_limit_reached', `Limite do plano atingido para "${limit}": ${current}/${max}.`, {
      limit,
      max,
      current,
    });
  }
}

export class ConfigKeyNotFoundError extends DomainError {
  constructor(key: string) {
    super('config_key_not_found', `Configuração "${key}" não tem valor em nenhum nível.`, { key });
  }
}
