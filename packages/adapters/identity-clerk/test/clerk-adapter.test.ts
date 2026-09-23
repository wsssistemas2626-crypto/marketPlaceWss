import { describe, expect, it } from 'vitest';

import { ClerkWorkforceIdentity, expandPermissions, panelTokenFromClaims } from '../src/index.js';

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

/**
 * A tradução das claims é o que quebrou quando a instância passou a emitir
 * token v2: o painel inteiro respondia 401 porque o adapter só conhecia
 * `org_id`. Por isso ela é testada com as duas formas, sem rede.
 */
describe('panelTokenFromClaims', () => {
  it('lê a organização do formato v2 (claim aninhada `o`)', () => {
    const token = panelTokenFromClaims({
      sub: 'user_1',
      v: 2,
      o: { id: 'org_1', rol: 'admin', slg: 'loja-a' },
    });

    expect(token.organizationId).toBe('org_1');
    expect(token.roles).toEqual(['org:admin']);
  });

  it('continua lendo o formato v1', () => {
    const token = panelTokenFromClaims({
      sub: 'user_1',
      org_id: 'org_1',
      org_role: 'org:admin',
      org_permissions: ['org:settings:manage'],
    });

    expect(token.organizationId).toBe('org_1');
    expect(token.roles).toEqual(['org:admin']);
    expect(token.permissions).toEqual(['org:settings:manage']);
  });

  it('remonta as permissões compactas do v2', () => {
    const permissoes = expandPermissions({
      fea: 'o:settings,o:orders,u:perfil',
      o: { id: 'org_1', per: 'read,manage', fpm: '3,1,0' },
    });

    expect(permissoes).toEqual(['org:settings:read', 'org:settings:manage', 'org:orders:read']);
  });

  it('token sem organização é recusado, a não ser no console', () => {
    expect(() => panelTokenFromClaims({ sub: 'user_1' })).toThrow(/organização/);
    expect(panelTokenFromClaims({ sub: 'user_1' }, { requireOrganization: false }).organizationId).toBe(
      'console',
    );
  });

  it('token sem usuário é recusado', () => {
    expect(() => panelTokenFromClaims({ o: { id: 'org_1' } })).toThrow(/usuário/);
  });
});
