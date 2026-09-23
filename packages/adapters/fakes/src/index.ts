import type {
  Charge,
  CreateChargeInput,
  CustomHostname,
  DomainProvisioningPort,
  EmailMessage,
  EmailPort,
  FiscalInvoice,
  FiscalIssuerPort,
  IntegrationCategory,
  MoneyLike,
  ObjectStoragePort,
  PaymentGatewayPort,
  SearchDocument,
  SearchIndexPort,
  ShippingLabel,
  ShippingLabelPort,
  ShippingPackage,
  ShippingQuote,
  ShippingQuotePort,
  VerifiedPanelToken,
  WorkforceIdentityPort,
  PostalCodeAddress,
  PostalCodePort,
} from '@mkt/contracts';
import { Id, SystemClock } from '@mkt/shared-kernel';

/**
 * Adapters **fake** de todas as ports da Fase 1 (US-009).
 *
 * Servem para desenvolver e testar sem depender de conta em provedor — é o que
 * permite o agente seguir quando um item do checklist de pré-voo ainda está
 * pendente (CLAUDE.md §4.17). O estado é por instância, e o hub cria uma
 * instância por tenant/requisição, então dois tenants nunca compartilham
 * dados aqui.
 *
 * Um único pacote `fakes` em vez de `<categoria>-fake` para cada categoria:
 * eles não compartilham nada além de serem falsos, e nove pacotes de ~30
 * linhas só espalhariam boilerplate.
 */

const clock = new SystemClock();
const newId = (): string => Id.create(clock);

/** Gateway de pagamento fake: Pix aprova por chamada explícita ao `settle`. */
export class FakePaymentGateway implements PaymentGatewayPort {
  private readonly charges = new Map<string, Charge>();
  private readonly recipients = new Map<string, string>();

  async createRecipient(input: { sellerId: string; document: string }): Promise<{ externalId: string }> {
    const externalId = `rcp_${newId()}`;
    this.recipients.set(input.sellerId, externalId);
    return { externalId };
  }

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const somaSplit = input.split.reduce((total, entry) => total + entry.amount.cents, 0);
    if (input.split.length > 0 && somaSplit !== input.amount.cents) {
      // mesma invariante que o port exige dos adapters reais
      throw new Error(`Split (${somaSplit}) diferente do valor cobrado (${input.amount.cents})`);
    }

    const charge: Charge = {
      externalId: `chg_${newId()}`,
      status: 'pending',
      amount: input.amount,
      ...(input.method.type === 'pix' ? { pixCode: `00020126fake${newId()}` } : {}),
    };

    this.charges.set(charge.externalId, charge);
    return charge;
  }

  async getCharge(externalId: string): Promise<Charge | undefined> {
    return this.charges.get(externalId);
  }

  async refund(externalId: string, amount: MoneyLike): Promise<Charge> {
    const charge = this.charges.get(externalId);
    if (charge === undefined) throw new Error(`Cobrança ${externalId} não existe no gateway fake`);

    const refunded: Charge = { ...charge, status: 'refunded', amount };
    this.charges.set(externalId, refunded);
    return refunded;
  }

  async parseWebhook(_headers: Readonly<Record<string, string>>, body: unknown): Promise<Charge | undefined> {
    const payload = body as { externalId?: string; status?: Charge['status'] };
    if (payload.externalId === undefined) return undefined;
    return this.settle(payload.externalId, payload.status ?? 'paid');
  }

  /** Só no fake: simula o retorno do provedor sem HTTP. */
  settle(externalId: string, status: Charge['status'] = 'paid'): Charge | undefined {
    const charge = this.charges.get(externalId);
    if (charge === undefined) return undefined;

    const updated = { ...charge, status };
    this.charges.set(externalId, updated);
    return updated;
  }
}

/** Cotação fake: preço previsível a partir do peso, para teste determinístico. */
export class FakeShippingQuote implements ShippingQuotePort {
  async quote(input: {
    originZipCode: string;
    destinationZipCode: string;
    packages: readonly ShippingPackage[];
  }): Promise<ShippingQuote[]> {
    const gramas = input.packages.reduce((total, pacote) => total + pacote.weightGrams, 0);
    const base = 1_500 + Math.ceil(gramas / 1_000) * 500;

    return [
      {
        serviceCode: 'fake-economy',
        serviceName: 'Fake Econômico',
        price: { cents: base, currency: 'BRL' },
        estimatedDays: 8,
      },
      {
        serviceCode: 'fake-express',
        serviceName: 'Fake Expresso',
        price: { cents: base * 2, currency: 'BRL' },
        estimatedDays: 2,
      },
    ];
  }
}

export class FakeShippingLabel implements ShippingLabelPort {
  private readonly labels = new Map<string, ShippingLabel>();

  async createLabel(input: { sellerOrderId: string; serviceCode: string }): Promise<ShippingLabel> {
    const label: ShippingLabel = {
      labelId: `lbl_${newId()}`,
      trackingCode: `FAKE${input.sellerOrderId.slice(0, 8).toUpperCase()}BR`,
      labelUrl: `https://fake.local/labels/${input.serviceCode}.pdf`,
    };
    this.labels.set(label.labelId, label);
    return label;
  }

  async cancelLabel(labelId: string): Promise<void> {
    this.labels.delete(labelId);
  }
}

/** E-mail fake: guarda as mensagens para o teste inspecionar (como o Mailpit). */
export class FakeEmail implements EmailPort {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    this.sent.push(message);
    return { messageId: `msg_${newId()}` };
  }
}

export class FakeSearchIndex implements SearchIndexPort {
  private readonly indexes = new Map<string, Map<string, SearchDocument>>();

  private index(name: string): Map<string, SearchDocument> {
    const existing = this.indexes.get(name);
    if (existing !== undefined) return existing;

    const created = new Map<string, SearchDocument>();
    this.indexes.set(name, created);
    return created;
  }

  async upsert(index: string, documents: readonly SearchDocument[]): Promise<void> {
    documents.forEach((document) => this.index(index).set(document.id, document));
  }

  async delete(index: string, ids: readonly string[]): Promise<void> {
    ids.forEach((id) => this.index(index).delete(id));
  }

  async query(index: string, term: string, options?: { limit?: number }): Promise<SearchDocument[]> {
    const termo = term.trim().toLowerCase();
    const encontrados = [...this.index(index).values()].filter((document) =>
      termo === '' ? true : JSON.stringify(document).toLowerCase().includes(termo),
    );

    return encontrados.slice(0, options?.limit ?? 20);
  }
}

export class FakeObjectStorage implements ObjectStoragePort {
  readonly stored = new Set<string>();

  async presignUpload(key: string, contentType: string): Promise<{ url: string; expiresInSeconds: number }> {
    this.stored.add(key);
    return {
      url: `https://fake.local/upload/${encodeURIComponent(key)}?type=${encodeURIComponent(contentType)}`,
      expiresInSeconds: 900,
    };
  }

  async presignDownload(key: string): Promise<{ url: string; expiresInSeconds: number }> {
    return { url: `https://fake.local/download/${encodeURIComponent(key)}`, expiresInSeconds: 900 };
  }

  async delete(key: string): Promise<void> {
    this.stored.delete(key);
  }
}

export class FakeFiscalIssuer implements FiscalIssuerPort {
  private readonly invoices = new Map<string, FiscalInvoice>();

  async issueNFe(input: { sellerOrderId: string }): Promise<FiscalInvoice> {
    const invoice: FiscalInvoice = {
      invoiceId: `nfe_${newId()}`,
      status: 'issued',
      accessKey: `3526${input.sellerOrderId.replace(/\D/g, '').padEnd(40, '0').slice(0, 40)}`,
      pdfUrl: 'https://fake.local/nfe.pdf',
    };
    this.invoices.set(invoice.invoiceId, invoice);
    return invoice;
  }

  async getStatus(invoiceId: string): Promise<FiscalInvoice | undefined> {
    return this.invoices.get(invoiceId);
  }

  async cancel(invoiceId: string, _reason: string): Promise<FiscalInvoice> {
    const invoice = this.invoices.get(invoiceId);
    if (invoice === undefined) throw new Error(`Nota ${invoiceId} não existe no emissor fake`);

    const cancelled: FiscalInvoice = { ...invoice, status: 'cancelled' };
    this.invoices.set(invoiceId, cancelled);
    return cancelled;
  }
}

/**
 * Identidade de painel fake: tokens são JSON assinado trivialmente, só para
 * desenvolvimento. O adapter real da Clerk é outro pacote (ADR-013).
 */
export class FakeWorkforceIdentity implements WorkforceIdentityPort {
  private readonly organizations = new Map<string, Record<string, unknown>>();
  private readonly memberships = new Map<string, { organizationId: string; role: string }[]>();

  async verifyToken(token: string): Promise<VerifiedPanelToken> {
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as VerifiedPanelToken;
    } catch {
      throw new Error('Token fake inválido');
    }
  }

  /** Só no fake: gera um token com as claims desejadas. */
  static issueToken(claims: VerifiedPanelToken): string {
    return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  }

  async createOrganization(input: {
    name: string;
    kind: 'tenant' | 'seller';
    tenantId: string;
    sellerId?: string;
  }): Promise<{ organizationId: string }> {
    const organizationId = `org_${newId()}`;
    this.organizations.set(organizationId, { ...input });
    return { organizationId };
  }

  async updateOrganizationMetadata(
    organizationId: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.organizations.set(organizationId, { ...this.organizations.get(organizationId), ...metadata });
  }

  async inviteMember(input: { organizationId: string; email: string; role: string }): Promise<void> {
    const atuais = this.memberships.get(input.email) ?? [];
    this.memberships.set(input.email, [
      ...atuais,
      { organizationId: input.organizationId, role: input.role },
    ]);
  }

  async listMemberships(userId: string): Promise<{ organizationId: string; role: string }[]> {
    return this.memberships.get(userId) ?? [];
  }

  async parseWebhook(
    _headers: Readonly<Record<string, string>>,
    body: string,
  ): Promise<{ type: string; data: Record<string, unknown> }> {
    return JSON.parse(body) as { type: string; data: Record<string, unknown> };
  }
}

export class FakeDomainProvisioning implements DomainProvisioningPort {
  private readonly hostnames = new Map<string, CustomHostname>();

  async addDomain(hostname: string): Promise<CustomHostname> {
    const record: CustomHostname = { hostname, status: 'active', certificateStatus: 'issued' };
    this.hostnames.set(hostname, record);
    return record;
  }

  async getStatus(hostname: string): Promise<CustomHostname | undefined> {
    return this.hostnames.get(hostname);
  }

  async remove(hostname: string): Promise<void> {
    this.hostnames.delete(hostname);
  }
}

/** Nome do provedor fake no hub. */
export const FAKE_PROVIDER = 'fake';

/** Fábrica por categoria — o hub registra isto no `AdapterRegistry`. */
export const fakeAdapterFactories: Readonly<Record<IntegrationCategory, () => unknown>> = {
  payment: () => new FakePaymentGateway(),
  shipping_quote: () => new FakeShippingQuote(),
  shipping_label: () => new FakeShippingLabel(),
  email: () => new FakeEmail(),
  search_index: () => new FakeSearchIndex(),
  object_storage: () => new FakeObjectStorage(),
  fiscal_issuer: () => new FakeFiscalIssuer(),
  workforce_identity: () => new FakeWorkforceIdentity(),
  domain_provisioning: () => new FakeDomainProvisioning(),
};
export { MailpitEmail } from './mailpit-email.js';

/**
 * CEP fake: alguns CEPs conhecidos, o resto "não existe". Para testes e para
 * rodar sem rede — em desenvolvimento o padrão é o ViaCEP, que não pede conta.
 */
export class FakePostalCode implements PostalCodePort {
  static readonly KNOWN: Readonly<Record<string, PostalCodeAddress>> = {
    '01001000': {
      zipCode: '01001000',
      street: 'Praça da Sé',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    },
    '20040002': {
      zipCode: '20040002',
      street: 'Rua da Assembleia',
      district: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
    },
    '78890000': { zipCode: '78890000', street: '', district: '', city: 'Sorriso', state: 'MT' },
  };

  async lookup(zipCode: string): Promise<PostalCodeAddress | undefined> {
    return FakePostalCode.KNOWN[zipCode.replace(/\D/g, '')];
  }
}
