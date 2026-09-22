# ADR-013: Clerk para autenticação dos painéis (B2B); identidade própria para compradores (B2C white-label)

**Status:** Aceito · **Data:** 2026-09-21 · **Substitui parcialmente:** ADR-009

## Contexto
Foi decidido usar **Clerk** para login. Nosso produto, porém, é uma **plataforma SaaS multi-tenant no estilo Shopify**:
cada tenant tem marca e domínio próprios, e seus compradores devem ser isolados dos compradores de outros tenants
(o tenant é o controlador desses dados na LGPD).

A documentação oficial da Clerk ("Multi-tenant architecture", atualizada em set/2026) distingue três cenários:
- **B2C** (um pool de usuários, um domínio, marca única) — suportado.
- **B2B** (pool compartilhado de usuários, **Organizations** como tenants/equipes, **um domínio**) — suportado.
- **Platforms** (pools de usuários **isolados por cliente**, domínio próprio e marca por cliente — exemplo citado:
  Shopify) — **ainda não suportado pela Clerk** (está no roadmap como "Clerk for Platforms").

Nossos usuários se dividem exatamente nesses dois grupos:

| Grupo | Natureza | Cenário Clerk |
|---|---|---|
| Staff da plataforma, operadores dos tenants, sellers e colaboradores | Usuários de negócio, trabalham em painéis, podem pertencer a mais de uma organização | **B2B — suportado** |
| Compradores de cada marketplace | Consumidores, storefront com domínio e marca do tenant, isolados por tenant | **Platforms — não suportado** |

## Decisão
1. **Clerk autentica todos os usuários de painéis** (console, admin do tenant, seller center), no modelo B2B:
   - **Aplicação Clerk "Plataforma"** (admin + seller center), servida sob o domínio raiz da plataforma
     (`admin.<plataforma>`, `vendedor.<plataforma>`), com **Organizations** habilitadas:
     - uma organização por **tenant** (equipe de operadores) — `publicMetadata: { kind: "tenant", tenantId }`;
     - uma organização por **seller** — `publicMetadata: { kind: "seller", tenantId, sellerId }`.
     - A **organização ativa** da sessão define o `TenantContext` (e o seller) dos painéis.
     - Papéis e permissões customizados da Clerk mapeiam o RBAC (ver tabela abaixo).
   - **Aplicação Clerk "Console"** separada, para o staff da plataforma: cadastro restrito (allowlist/convite), MFA obrigatório.
     Separar as aplicações isola a superfície de ataque dos usuários mais privilegiados.
2. **Compradores continuam com identidade própria** no módulo `identity` (como no ADR-009): contas por tenant,
   `UNIQUE(tenant_id, email)`, telas de login com a marca do tenant, funcionando em domínio próprio.
   Quando a Clerk lançar suporte a Platforms, reavaliar a migração (a port `CustomerAuthPort` já isola essa troca).
3. A integração com a Clerk fica atrás de uma port (`WorkforceIdentityPort`, adapter `identity-clerk`) para reduzir lock-in.
4. O backend **não confia no frontend**: a API NestJS valida o token de sessão da Clerk (verificação de assinatura
   com a chave JWT pública, sem chamada de rede por requisição), lê as claims da organização ativa e **confere o
   mapeamento organização → tenant/seller na nossa base** antes de abrir o `TenantContext`.
5. Dados de usuários de painel são **espelhados localmente** via webhooks da Clerk (assinados via Svix), numa projeção
   `identity.workforce_users` com `clerk_user_id`, para auditoria, relatórios e integridade referencial.

### Mapeamento de papéis (Clerk custom roles → nosso RBAC)
| Organização | Papel Clerk | Permissões Clerk (exemplos) |
|---|---|---|
| tenant | `org:tenant_admin` | todas `org:*` do tenant, incluindo integrações e configurações |
| tenant | `org:tenant_moderation` | `org:catalog:moderate`, `org:sellers:review` |
| tenant | `org:tenant_support` | `org:orders:read`, `org:orders:support` |
| tenant | `org:tenant_finance` | `org:finance:read`, `org:finance:manage` |
| seller | `org:seller_owner` | todas do seller, inclusive dados bancários e membros |
| seller | `org:seller_catalog` | `org:catalog:manage`, `org:offers:manage` |
| seller | `org:seller_orders` | `org:orders:manage`, `org:shipping:manage` |
| seller | `org:seller_finance` | `org:finance:read` |

O guard `@Requires('org:orders:manage')` checa a permissão na claim **e** o `kind` da organização exigido pela rota.

## Alternativas consideradas
- **Clerk para todos, inclusive compradores (pool compartilhado)** — descartada como padrão: o comprador teria
  **uma conta única em todos os marketplaces** da plataforma (quebra o isolamento por tenant e o papel do tenant como
  controlador LGPD), telas de login com marca da plataforma, e domínios próprios dependeriam de "satellite domains",
  que a própria Clerk classifica como uso avançado, sem garantia de suporte. Pode ser reavaliada se o negócio
  **quiser** uma "conta única do comprador" (decisão D11).
- **Uma aplicação Clerk por tenant** — descartada: criação manual por tenant, sem suporte oficial a esse cenário, chaves
  por tenant e operação que não escala.
- **IAM 100% próprio (ADR-009 original)** — descartada para painéis: Clerk entrega MFA, organizações, convites,
  gestão de sessão e componentes prontos, reduzindo muito código de segurança sensível.

## Consequências
**Positivas:** menos código de segurança para painéis; MFA, convites, troca de organização e gestão de membros prontos;
um seller que vende em dois marketplaces usa uma conta só e alterna entre organizações.
**Negativas / trade-offs aceitos:**
- **Dois sistemas de identidade** (Clerk para painéis, próprio para compradores) — mitigado por ports e guards unificados.
- As telas de login dos painéis ficam **com a marca da plataforma** (pool compartilhado, domínio único); a marca do
  tenant aparece depois do login, dentro do painel.
- **Dependência de fornecedor externo** (disponibilidade, preço por usuário/organização ativos, mudanças de API).
- **LGPD:** dados de operadores e sellers ficam na Clerk (fora do Brasil) → transferência internacional; incluir a Clerk
  como suboperadora nos contratos (DPA) e na política de privacidade.
- Limites do plano (ex.: número de colaboradores do seller) precisam ser aplicados também na Clerk
  (limite de membros por organização) e verificados no nosso backend.

## Quando revisitar
Lançamento do "Clerk for Platforms"; mudança de preço relevante; exigência de SSO corporativo por tenant
(Clerk suporta SAML/OIDC por organização — avaliar); decisão de negócio por conta única de comprador (D11).
