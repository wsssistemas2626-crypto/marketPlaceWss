import type { CustomHostname, DomainProvisioningPort } from '@mkt/contracts';

export interface CloudflareDomainsOptions {
  /** Token com permissão de SSL e Custom Hostnames na zona (checklist §C). */
  readonly apiToken: string;
  readonly zoneId: string;
  /** Para onde o hostname do cliente aponta (CNAME de destino). */
  readonly originHostname: string;
  /** Injetável para teste; em produção é o `fetch` global. */
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

interface CloudflareResponse<T> {
  readonly success: boolean;
  readonly errors: { code: number; message: string }[];
  readonly result: T;
}

interface CloudflareCustomHostname {
  readonly id: string;
  readonly hostname: string;
  readonly status: string;
  readonly ssl?: { status?: string };
  readonly verification_errors?: string[];
}

export class CloudflareDomainsError extends Error {
  constructor(operation: string, detail: string) {
    super(`Cloudflare falhou em ${operation}: ${detail}`);
    this.name = 'CloudflareDomainsError';
  }
}

/** Estados que a Cloudflare usa para hostname e certificado. */
const HOSTNAME_STATUS: Record<string, CustomHostname['status']> = {
  active: 'active',
  pending: 'pending',
  active_redeploying: 'active',
  moved: 'failed',
  deleted: 'failed',
  blocked: 'failed',
  provisioning: 'pending',
};

const CERTIFICATE_STATUS: Record<string, CustomHostname['certificateStatus']> = {
  active: 'issued',
  pending_validation: 'pending',
  pending_issuance: 'pending',
  pending_deployment: 'pending',
  initializing: 'pending',
  expired: 'failed',
  deleted: 'failed',
  deactivated: 'failed',
};

/**
 * Adapter do **Cloudflare for SaaS** (Custom Hostnames) para o
 * `DomainProvisioningPort` — ADR-014 §6 e spike US-085.
 *
 * O fluxo do tenant é: ele cria um CNAME do domínio dele para
 * `customers.<plataforma>`; nós registramos o hostname aqui e a Cloudflare
 * emite o certificado por validação DNS/HTTP. O tráfego entra pelo Worker de
 * `infra/cloudflare/`, que marca a requisição com `X-Edge-Secret`.
 *
 * Nenhum tipo da Cloudflare vaza para fora deste pacote: o port fala em
 * `CustomHostname`, e os estados dela são traduzidos aqui.
 */
export class CloudflareDomainProvisioning implements DomainProvisioningPort {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: CloudflareDomainsOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
  }

  private async call<T>(
    operation: string,
    path: string,
    init: { method: string; body?: unknown } = { method: 'GET' },
  ): Promise<CloudflareResponse<T>> {
    const response = await this.fetchImpl(`${this.baseUrl}/zones/${this.options.zoneId}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${this.options.apiToken}`,
        'content-type': 'application/json',
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });

    const payload = (await response.json()) as CloudflareResponse<T>;
    if (!response.ok || !payload.success) {
      const detail = payload.errors?.map((error) => error.message).join('; ') ?? `HTTP ${response.status}`;
      throw new CloudflareDomainsError(operation, detail);
    }

    return payload;
  }

  private toCustomHostname(record: CloudflareCustomHostname): CustomHostname {
    return {
      hostname: record.hostname,
      status: HOSTNAME_STATUS[record.status] ?? 'pending',
      certificateStatus: CERTIFICATE_STATUS[record.ssl?.status ?? ''] ?? 'pending',
    };
  }

  async addDomain(hostname: string): Promise<CustomHostname> {
    // já existente não é erro: provisionar domínio precisa ser idempotente
    const existing = await this.getStatus(hostname);
    if (existing !== undefined) return existing;

    const { result } = await this.call<CloudflareCustomHostname>('registrar hostname', '/custom_hostnames', {
      method: 'POST',
      body: {
        hostname,
        ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
        custom_origin_server: this.options.originHostname,
      },
    });

    return this.toCustomHostname(result);
  }

  async getStatus(hostname: string): Promise<CustomHostname | undefined> {
    const { result } = await this.call<CloudflareCustomHostname[]>(
      'consultar hostname',
      `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    );

    const record = result[0];
    return record === undefined ? undefined : this.toCustomHostname(record);
  }

  async remove(hostname: string): Promise<void> {
    const { result } = await this.call<CloudflareCustomHostname[]>(
      'consultar hostname',
      `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    );

    const record = result[0];
    // remover o que não existe é sucesso: o estado desejado já é o atual
    if (record === undefined) return;

    await this.call('remover hostname', `/custom_hostnames/${record.id}`, { method: 'DELETE' });
  }
}
