import { describe, expect, it } from 'vitest';

import {
  FakeDomainProvisioning,
  FakeEmail,
  FakeFiscalIssuer,
  FakeObjectStorage,
  FakePaymentGateway,
  FakeSearchIndex,
  FakeShippingQuote,
  FakeWorkforceIdentity,
} from '../src/index.js';

describe('gateway de pagamento fake', () => {
  it('cria cobrança Pix e liquida por webhook', async () => {
    const gateway = new FakePaymentGateway();
    const cobranca = await gateway.createCharge({
      orderId: 'pedido-1',
      amount: { cents: 10_000, currency: 'BRL' },
      method: { type: 'pix', expiresInSeconds: 900 },
      split: [],
      metadata: {},
    });

    expect(cobranca.status).toBe('pending');
    expect(cobranca.pixCode).toBeDefined();

    const paga = await gateway.parseWebhook({}, { externalId: cobranca.externalId, status: 'paid' });
    expect(paga?.status).toBe('paid');
    expect((await gateway.getCharge(cobranca.externalId))?.status).toBe('paid');
  });

  it('recusa split que não fecha com o valor cobrado (RN-FIN-03)', async () => {
    const gateway = new FakePaymentGateway();

    await expect(
      gateway.createCharge({
        orderId: 'pedido-2',
        amount: { cents: 10_000, currency: 'BRL' },
        method: { type: 'pix', expiresInSeconds: 900 },
        split: [{ recipientExternalId: 'rcp_1', amount: { cents: 9_999, currency: 'BRL' }, liable: true }],
        metadata: {},
      }),
    ).rejects.toThrow(/Split/);
  });

  it('estorna uma cobrança existente', async () => {
    const gateway = new FakePaymentGateway();
    const cobranca = await gateway.createCharge({
      orderId: 'pedido-3',
      amount: { cents: 500, currency: 'BRL' },
      method: { type: 'credit_card', cardToken: 'tok_1' },
      split: [],
      metadata: {},
    });

    const estornada = await gateway.refund(cobranca.externalId, { cents: 500, currency: 'BRL' });
    expect(estornada.status).toBe('refunded');
  });
});

describe('demais fakes', () => {
  it('cotação de frete cresce com o peso', async () => {
    const cotacoes = await new FakeShippingQuote().quote({
      originZipCode: '01310000',
      destinationZipCode: '20040000',
      packages: [
        {
          weightGrams: 2_000,
          lengthCm: 20,
          widthCm: 15,
          heightCm: 10,
          declaredValue: { cents: 5_000, currency: 'BRL' },
        },
      ],
    });

    expect(cotacoes).toHaveLength(2);
    expect(cotacoes[0]?.price.cents).toBe(2_500);
    expect(cotacoes[1]?.estimatedDays).toBeLessThan(cotacoes[0]?.estimatedDays ?? 0);
  });

  it('e-mail fake guarda as mensagens enviadas', async () => {
    const email = new FakeEmail();
    await email.send({ to: 'pessoa@example.com', template: 'pedido-pago', data: { orderId: '1' } });

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.template).toBe('pedido-pago');
  });

  it('índice de busca guarda, consulta e remove', async () => {
    const search = new FakeSearchIndex();
    await search.upsert('products_t1', [
      { id: '1', name: 'Camiseta azul' },
      { id: '2', name: 'Tênis branco' },
    ]);

    expect(await search.query('products_t1', 'camiseta')).toHaveLength(1);
    await search.delete('products_t1', ['1']);
    expect(await search.query('products_t1', 'camiseta')).toHaveLength(0);
  });

  it('storage devolve URLs pré-assinadas', async () => {
    const storage = new FakeObjectStorage();
    const upload = await storage.presignUpload('t/1/foto.jpg', 'image/jpeg');

    expect(upload.url).toContain('foto.jpg');
    expect(upload.expiresInSeconds).toBeGreaterThan(0);
    expect(storage.stored.has('t/1/foto.jpg')).toBe(true);
  });

  it('emissor fiscal emite e cancela', async () => {
    const fiscal = new FakeFiscalIssuer();
    const nota = await fiscal.issueNFe({ sellerOrderId: '0193a000' });

    expect(nota.status).toBe('issued');
    expect((await fiscal.cancel(nota.invoiceId, 'teste')).status).toBe('cancelled');
  });

  it('identidade fake verifica o token que ela mesma emite', async () => {
    const identity = new FakeWorkforceIdentity();
    const token = FakeWorkforceIdentity.issueToken({
      userId: 'user_1',
      organizationId: 'org_1',
      organizationKind: 'seller',
      tenantId: 'tenant_1',
      sellerId: 'seller_1',
      roles: ['org:seller_owner'],
      permissions: ['org:orders:manage'],
    });

    expect((await identity.verifyToken(token)).sellerId).toBe('seller_1');
    await expect(identity.verifyToken('lixo')).rejects.toThrow();
  });

  it('provisionamento de domínio devolve certificado emitido', async () => {
    const domains = new FakeDomainProvisioning();
    const registro = await domains.addDomain('loja-x.com.br');

    expect(registro.certificateStatus).toBe('issued');
    await domains.remove('loja-x.com.br');
    expect(await domains.getStatus('loja-x.com.br')).toBeUndefined();
  });
});
