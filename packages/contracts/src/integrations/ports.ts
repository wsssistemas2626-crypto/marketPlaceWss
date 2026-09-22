import { z } from 'zod';

/**
 * Ports de integração (catálogo em `docs/arquitetura/03-integracoes.md` §1).
 *
 * **Onde isto vai morar:** o documento manda o port viver em
 * `packages/modules/<dono>/src/application/ports/`. Na Fase 0 esses módulos
 * ainda não existem e os adapters fake precisam de um contrato para
 * implementar, então as interfaces nascem aqui, em `contracts`. Quando
 * `payments`, `shipping`, `notifications`, `search` e `fiscal` forem criados
 * (Fase 1), cada port se muda para o módulo dono, que passa a reexportá-lo —
 * os adapters continuam compilando porque importam pelo nome do pacote.
 */

/** Categoria de integração: é por ela que o hub resolve o adapter do tenant. */
export const integrationCategories = [
  'payment',
  'shipping_quote',
  'shipping_label',
  'email',
  'search_index',
  'object_storage',
  'fiscal_issuer',
  'workforce_identity',
  'domain_provisioning',
] as const;

export type IntegrationCategory = (typeof integrationCategories)[number];

export const integrationCategorySchema = z.enum(integrationCategories);

export interface MoneyLike {
  readonly cents: number;
  readonly currency: 'BRL';
}

// ---------------------------------------------------------------------------
// payment
// ---------------------------------------------------------------------------

export interface SplitEntry {
  readonly recipientExternalId: string;
  readonly amount: MoneyLike;
  readonly liable: boolean;
}

export interface CreateChargeInput {
  readonly orderId: string;
  readonly amount: MoneyLike;
  readonly method: { type: 'pix'; expiresInSeconds: number } | { type: 'credit_card'; cardToken: string };
  readonly split: readonly SplitEntry[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface Charge {
  readonly externalId: string;
  readonly status: 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';
  readonly amount: MoneyLike;
  /** Copia e cola do Pix, quando o método é Pix. */
  readonly pixCode?: string;
}

export interface PaymentGatewayPort {
  createRecipient(input: { sellerId: string; document: string }): Promise<{ externalId: string }>;
  createCharge(input: CreateChargeInput): Promise<Charge>;
  getCharge(externalId: string): Promise<Charge | undefined>;
  refund(externalId: string, amount: MoneyLike): Promise<Charge>;
  /** Nunca confie no corpo sem validar a assinatura do provedor. */
  parseWebhook(headers: Readonly<Record<string, string>>, body: unknown): Promise<Charge | undefined>;
}

// ---------------------------------------------------------------------------
// shipping
// ---------------------------------------------------------------------------

export interface ShippingPackage {
  readonly weightGrams: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly declaredValue: MoneyLike;
}

export interface ShippingQuote {
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly price: MoneyLike;
  readonly estimatedDays: number;
}

export interface ShippingQuotePort {
  quote(input: {
    originZipCode: string;
    destinationZipCode: string;
    packages: readonly ShippingPackage[];
  }): Promise<ShippingQuote[]>;
}

export interface ShippingLabel {
  readonly labelId: string;
  readonly trackingCode: string;
  readonly labelUrl: string;
}

export interface ShippingLabelPort {
  createLabel(input: { sellerOrderId: string; serviceCode: string }): Promise<ShippingLabel>;
  cancelLabel(labelId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// notifications, search, storage, fiscal
// ---------------------------------------------------------------------------

export interface EmailMessage {
  readonly to: string;
  readonly template: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly subject?: string;
}

export interface EmailPort {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export interface SearchDocument {
  readonly id: string;
  readonly [field: string]: unknown;
}

export interface SearchIndexPort {
  upsert(index: string, documents: readonly SearchDocument[]): Promise<void>;
  delete(index: string, ids: readonly string[]): Promise<void>;
  query(index: string, term: string, options?: { limit?: number }): Promise<SearchDocument[]>;
}

export interface ObjectStoragePort {
  presignUpload(key: string, contentType: string): Promise<{ url: string; expiresInSeconds: number }>;
  presignDownload(key: string): Promise<{ url: string; expiresInSeconds: number }>;
  delete(key: string): Promise<void>;
}

export interface FiscalInvoice {
  readonly invoiceId: string;
  readonly status: 'processing' | 'issued' | 'rejected' | 'cancelled';
  readonly accessKey?: string;
  readonly pdfUrl?: string;
}

export interface FiscalIssuerPort {
  issueNFe(input: { sellerOrderId: string }): Promise<FiscalInvoice>;
  getStatus(invoiceId: string): Promise<FiscalInvoice | undefined>;
  cancel(invoiceId: string, reason: string): Promise<FiscalInvoice>;
}

// ---------------------------------------------------------------------------
// identidade de painel (ADR-013) e domínios de tenant (ADR-014)
// ---------------------------------------------------------------------------

export type OrganizationKind = 'tenant' | 'seller';

export interface VerifiedPanelToken {
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationKind: OrganizationKind;
  readonly tenantId?: string;
  readonly sellerId?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface WorkforceIdentityPort {
  verifyToken(token: string): Promise<VerifiedPanelToken>;
  createOrganization(input: {
    name: string;
    kind: OrganizationKind;
    tenantId: string;
    sellerId?: string;
  }): Promise<{ organizationId: string }>;
  updateOrganizationMetadata(
    organizationId: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  inviteMember(input: { organizationId: string; email: string; role: string }): Promise<void>;
  listMemberships(userId: string): Promise<{ organizationId: string; role: string }[]>;
  /** Valida a assinatura do webhook e devolve o evento já tipado. */
  parseWebhook(
    headers: Readonly<Record<string, string>>,
    body: string,
  ): Promise<{ type: string; data: Record<string, unknown> }>;
}

export interface CustomHostname {
  readonly hostname: string;
  readonly status: 'pending' | 'active' | 'failed';
  readonly certificateStatus: 'pending' | 'issued' | 'failed';
}

export interface DomainProvisioningPort {
  addDomain(hostname: string): Promise<CustomHostname>;
  getStatus(hostname: string): Promise<CustomHostname | undefined>;
  remove(hostname: string): Promise<void>;
}

/** Mapa categoria → tipo do port, usado pela resolução tipada do hub. */
export interface IntegrationPortByCategory {
  payment: PaymentGatewayPort;
  shipping_quote: ShippingQuotePort;
  shipping_label: ShippingLabelPort;
  email: EmailPort;
  search_index: SearchIndexPort;
  object_storage: ObjectStoragePort;
  fiscal_issuer: FiscalIssuerPort;
  workforce_identity: WorkforceIdentityPort;
  domain_provisioning: DomainProvisioningPort;
}
