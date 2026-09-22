import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { IntegrationCategory } from '@mkt/contracts';
import { integrationCategories } from '@mkt/contracts';
import { FAKE_PROVIDER, FakeEmail, fakeAdapterFactories } from '@mkt/adapters-fakes';
import { runWithTenant, type TenantContext } from '@mkt/platform';

import { AdapterRegistry, ProviderNotRegisteredError } from '../src/application/adapter-registry.js';
import { IntegrationHub, NoActiveProviderError } from '../src/application/integration-hub.js';
import type {
  ProviderConfigRecord,
  ProviderConfigRepositoryPort,
} from '../src/application/provider-config.port.js';
import { CredentialCipher } from '../src/infrastructure/credential-cipher.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';

const contexto = (tenantId: string, slug: string): TenantContext => ({
  tenantId,
  slug,
  status: 'active',
  cell: 'shared-1',
});

/** Repositório em memória, escopado por tenant como o real (via RLS). */
class RepositorioEmMemoria implements ProviderConfigRepositoryPort {
  constructor(
    private readonly tenantId: string,
    private readonly configs: ProviderConfigRecord[] = [],
  ) {}

  async findActive(category: IntegrationCategory): Promise<ProviderConfigRecord | undefined> {
    return this.configs.find((config) => config.category === category && config.isActive);
  }

  async list(): Promise<ProviderConfigRecord[]> {
    return this.configs;
  }

  async upsert(input: Omit<ProviderConfigRecord, 'id'> & { id?: string }): Promise<ProviderConfigRecord> {
    const record = { id: input.id ?? `cfg-${this.tenantId}-${input.category}`, ...input };
    this.configs.push(record);
    return record;
  }

  async deactivate(): Promise<void> {
    /* não usado nestes testes */
  }
}

const registryComFakes = (): AdapterRegistry => {
  const registry = new AdapterRegistry();
  for (const category of integrationCategories) {
    const factory = fakeAdapterFactories[category];
    registry.register(category, FAKE_PROVIDER, () => factory() as never);
  }
  return registry;
};

describe('CredentialCipher', () => {
  const key = randomBytes(32).toString('base64');

  it('cifra e decifra as credenciais', () => {
    const cipher = new CredentialCipher(key);
    const segredo = { apiKey: 'sk_live_123', secret: 'muito-secreto' };

    const encriptado = cipher.encrypt(segredo);

    expect(encriptado).not.toContain('sk_live_123');
    expect(cipher.decrypt(encriptado)).toEqual(segredo);
  });

  it('gera texto cifrado diferente a cada chamada (IV aleatório)', () => {
    const cipher = new CredentialCipher(key);

    expect(cipher.encrypt({ a: '1' })).not.toBe(cipher.encrypt({ a: '1' }));
  });

  it('recusa credencial adulterada (GCM autentica)', () => {
    const cipher = new CredentialCipher(key);
    const [iv, tag, payload] = cipher.encrypt({ apiKey: 'original' }).split('.');
    const adulterado = [iv, tag, Buffer.from('outra-coisa').toString('base64')].join('.');

    expect(() => cipher.decrypt(adulterado)).toThrow();
    expect(() => cipher.decrypt(`${payload}`)).toThrow();
  });

  it('recusa chave fora de 32 bytes', () => {
    expect(() => new CredentialCipher(Buffer.from('curta').toString('base64'))).toThrow();
  });

  it('chave diferente não decifra', () => {
    const encriptado = new CredentialCipher(key).encrypt({ apiKey: 'x' });

    expect(() => new CredentialCipher(randomBytes(32).toString('base64')).decrypt(encriptado)).toThrow();
  });
});

describe('AdapterRegistry', () => {
  it('registra e cria adapters por categoria e provedor', () => {
    const registry = registryComFakes();

    expect(registry.has('payment', FAKE_PROVIDER)).toBe(true);
    expect(registry.providersOf('email')).toEqual([FAKE_PROVIDER]);
    expect(
      registry.create('email', FAKE_PROVIDER, { tenantId: TENANT_A, credentials: {}, settings: {} }),
    ).toBeInstanceOf(FakeEmail);
  });

  it('falha ao pedir um provedor que ninguém registrou', () => {
    expect(() =>
      registryComFakes().create('payment', 'pagarme', {
        tenantId: TENANT_A,
        credentials: {},
        settings: {},
      }),
    ).toThrow(ProviderNotRegisteredError);
  });

  it('cobre todas as categorias do catálogo com um fake', () => {
    const registry = registryComFakes();

    for (const category of integrationCategories) {
      expect(registry.has(category, FAKE_PROVIDER), category).toBe(true);
    }
  });
});

describe('IntegrationHub', () => {
  const configAtiva = (category: IntegrationCategory): ProviderConfigRecord => ({
    id: 'cfg-1',
    category,
    provider: FAKE_PROVIDER,
    credentials: { apiKey: 'fake' },
    settings: {},
    isActive: true,
  });

  it('resolve o adapter do tenant da requisição', async () => {
    const hub = new IntegrationHub(
      new RepositorioEmMemoria(TENANT_A, [configAtiva('email')]),
      registryComFakes(),
    );

    const adapter = await runWithTenant(contexto(TENANT_A, 'loja-a'), () => hub.resolve('email'));

    expect(adapter).toBeInstanceOf(FakeEmail);
  });

  it('cria uma instância nova por resolução — nada de singleton global', async () => {
    const hub = new IntegrationHub(
      new RepositorioEmMemoria(TENANT_A, [configAtiva('email')]),
      registryComFakes(),
    );

    const [primeiro, segundo] = await runWithTenant(contexto(TENANT_A, 'loja-a'), async () => [
      await hub.resolve('email'),
      await hub.resolve('email'),
    ]);

    expect(primeiro).not.toBe(segundo);
  });

  it('o adapter de um tenant não compartilha estado com o de outro', async () => {
    const hubA = new IntegrationHub(
      new RepositorioEmMemoria(TENANT_A, [configAtiva('email')]),
      registryComFakes(),
    );
    const hubB = new IntegrationHub(
      new RepositorioEmMemoria(TENANT_B, [configAtiva('email')]),
      registryComFakes(),
    );

    const emailA = (await runWithTenant(contexto(TENANT_A, 'loja-a'), () =>
      hubA.resolve('email'),
    )) as FakeEmail;
    const emailB = (await runWithTenant(contexto(TENANT_B, 'loja-b'), () =>
      hubB.resolve('email'),
    )) as FakeEmail;

    await emailA.send({ to: 'a@example.com', template: 'ola', data: {} });

    expect(emailA.sent).toHaveLength(1);
    expect(emailB.sent).toHaveLength(0);
  });

  it('falha quando o tenant não configurou a categoria', async () => {
    const hub = new IntegrationHub(new RepositorioEmMemoria(TENANT_A), registryComFakes());

    await expect(
      runWithTenant(contexto(TENANT_A, 'loja-a'), () => hub.resolve('payment')),
    ).rejects.toBeInstanceOf(NoActiveProviderError);
  });

  it('exige TenantContext: sem tenant não há provedor para resolver', async () => {
    const hub = new IntegrationHub(
      new RepositorioEmMemoria(TENANT_A, [configAtiva('email')]),
      registryComFakes(),
    );

    await expect(hub.resolve('email')).rejects.toThrow();
  });

  it('informa o provedor ativo e os disponíveis', async () => {
    const hub = new IntegrationHub(
      new RepositorioEmMemoria(TENANT_A, [configAtiva('payment')]),
      registryComFakes(),
    );

    await runWithTenant(contexto(TENANT_A, 'loja-a'), async () => {
      expect(await hub.activeProvider('payment')).toBe(FAKE_PROVIDER);
      expect(await hub.activeProvider('fiscal_issuer')).toBeUndefined();
    });
    expect(hub.availableProviders('payment')).toEqual([FAKE_PROVIDER]);
  });
});
