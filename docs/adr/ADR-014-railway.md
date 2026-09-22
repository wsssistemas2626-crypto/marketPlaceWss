# ADR-014: Railway como plataforma de infraestrutura (banco, cache, storage e execução)

**Status:** Aceito · **Data:** 2026-09-21 · **Substitui:** ADR-011 (mantidos os princípios de observabilidade e células)

## Contexto
Foi decidido usar a **Railway** para o banco de dados. Para reduzir operação e evitar integrar vários fornecedores,
avaliamos hospedar também os demais componentes na Railway. Pontos verificados na documentação atual (set/2026):
- **PostgreSQL** gerenciado com backups de volume agendados, **Point-in-Time Recovery (PITR)** via WAL arquivado
  (restauração sempre cria um serviço novo), **alta disponibilidade** e **PgBouncer** para pooling.
- **Redis** gerenciado (BullMQ).
- **Storage Buckets** privados e compatíveis com S3 (URLs pré-assinadas), com bucket isolado por ambiente.
- **Config as Code** por serviço (`railway.json`) com `preDeployCommand`, `healthcheckPath`, sobrescrita por ambiente
  (inclusive ambientes de PR) e, mais recentemente, IaC em TypeScript (`.railway/railway.ts`).
- Rede privada entre serviços (`*.railway.internal`), variáveis por referência entre serviços, ambientes separados.
- **Limite de domínios customizados: 20 por serviço no plano Pro**; wildcard conta como 1. Para plataformas com domínio
  próprio por cliente, a própria Railway recomenda gerenciar esses domínios **externamente (ex.: Cloudflare)** e fazer
  proxy para o serviço, em vez de cadastrar cada domínio na Railway.
- Plugin oficial da Railway para o Claude Code (skill + MCP hospedado).

## Decisão
1. **Tudo roda em um projeto Railway** (`marketplace`), com ambientes `production`, `staging` e **ambientes de PR**:
   serviços `api`, `worker`, `storefront`, `admin`, `seller-center`, `console`, `postgres`, `redis`, `meilisearch`
   (imagem Docker oficial com volume) e bucket `media`. Topologia completa em `docs/arquitetura/07-infraestrutura-railway.md`.
2. **Config as Code por serviço** (`apps/<app>/railway.json`) no monorepo. Migração para o IaC em TypeScript
   (`.railway/railway.ts`) fica como evolução quando estável para o time — sem mudar a topologia.
3. **Banco com quatro roles** (script `infra/db/bootstrap-roles.sql`): `postgres` (superusuário, só para bootstrap),
   `migrator` (dono dos schemas, roda migrações), `app` (runtime, **sem BYPASSRLS**, sem ser dono das tabelas) e
   `platform` (outbox relay e `@PlatformJob`, com BYPASSRLS e permissões mínimas). **A aplicação nunca usa o usuário
   `postgres` padrão da Railway**, porque superusuário ignora RLS e anularia o isolamento entre tenants (ADR-012).
4. **Migrações no `preDeployCommand` do serviço `api`**, com a URL do role `migrator`. O worker nunca migra.
5. **Domínios:** subdomínios da plataforma via **wildcard** no serviço `storefront` (1 slot); `api.`, `admin.`, `vendedor.`
   e `console.` nos respectivos serviços. **Domínios próprios de tenants via Cloudflare for SaaS (Custom Hostnames)**
   na frente da Railway (resolve a decisão D10) — detalhes e validação na story spike US-085.
6. **Produção:** Railway plano Pro; PITR habilitado + backups diários e semanais do volume; réplicas para `api` e
   `storefront`; alta disponibilidade do Postgres avaliada antes do go-live (US-086).
7. **Desenvolvimento local continua com docker-compose** (paridade: mesmas roles via o mesmo script de bootstrap).

## Alternativas consideradas
- **Railway só para o banco + Vercel para os frontends** — viável (Vercel tem API de domínios boa para multi-tenant),
  mas divide observabilidade, variáveis e ambientes entre dois fornecedores; latência frontend → API entre provedores.
  Mantida como opção caso os limites de domínio/edge da Railway se mostrem insuficientes após a US-085.
- **AWS (RDS + ECS)** — mais controle e escala, operação e custo de configuração muito maiores para o time atual.
- **Supabase/Neon para o banco** — bons em RLS e branching, mas a decisão foi Railway; e manter tudo num só lugar simplifica.

## Consequências
**Positivas:** um só painel para tudo; ambientes de PR automáticos (cada Pull Request vira um ambiente testável);
rede privada; PITR; storage S3 sem fornecedor extra; Claude Code opera a infraestrutura via plugin oficial.
**Negativas / trade-offs:**
- Domínios próprios de tenants dependem de uma camada Cloudflare (mais um fornecedor e um ponto a validar cedo).
- Menos controle fino de rede/escala que um hyperscaler; revisitar em escala alta (células — ADR-012).
- Região de dados: escolher a região mais próxima do Brasil disponível; registrar a transferência internacional na
  política de privacidade (LGPD), como já feito para a Clerk.

## Quando revisitar
Custo mensal acima do equivalente em AWS/GCP com operação, necessidade de região no Brasil por contrato/regulação,
ou limites de domínio/edge que a camada Cloudflare não resolva.
