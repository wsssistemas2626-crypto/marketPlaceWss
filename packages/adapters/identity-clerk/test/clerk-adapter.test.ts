import { describe, expect, it } from 'vitest';

import { ClerkWorkforceIdentity } from '../src/index.js';

/**
 * O que dá para testar sem rede e sem instância da Clerk: a política de
 * segurança do adapter. O caminho feliz (token real, organizações) é exercido
 * pela suíte do módulo `identity` com o adapter fake, e contra a instância de
 * desenvolvimento quando as chaves estão no `.env`.
 */
const adapter = (options: Partial<ConstructorParameters<typeof ClerkWorkforceIdentity>[0]> = {}) =>
  new ClerkWorkforceIdentity({
    secretKey: 'sk_test_nao_usado_offline',
    authorizedParties: ['http://localhost:3001'],
    ...options,
  });

describe('ClerkWorkforceIdentity', () => {
  it('recusa webhook quando o segredo de assinatura não está configurado', async () => {
    await expect(adapter().parseWebhook({}, '{"type":"user.created"}')).rejects.toThrow(
      /CLERK_WEBHOOK_SIGNING_SECRET/,
    );
  });

  it('recusa webhook com assinatura inválida', async () => {
    const comSegredo = adapter({ webhookSigningSecret: 'whsec_dGVzdGUtZGUtc2VncmVkby1mYWxzbw==' });

    await expect(
      comSegredo.parseWebhook(
        { 'svix-id': 'msg_1', 'svix-timestamp': '1', 'svix-signature': 'v1,assinatura-falsa' },
        '{"type":"user.created","data":{}}',
      ),
    ).rejects.toThrow();
  });

  it('recusa token que não é da Clerk', async () => {
    await expect(adapter().verifyToken('token-inventado')).rejects.toThrow();
  });

  it('expõe todas as operações do WorkforceIdentityPort', () => {
    const instancia = adapter();

    for (const metodo of [
      'verifyToken',
      'createOrganization',
      'updateOrganizationMetadata',
      'inviteMember',
      'listMemberships',
      'parseWebhook',
    ] as const) {
      expect(typeof instancia[metodo], metodo).toBe('function');
    }
  });
});
