# Runbook — Deploy na Railway

Referências: ADR-014, `docs/arquitetura/07-infraestrutura-railway.md`, checklist §B.

> **Regra do agente (CLAUDE.md §4.18):** nunca executar em `production` sem confirmação explícita;
> nunca apagar serviço, volume, bucket ou ambiente; nunca imprimir valor de variável secreta.

## 1. O que já está pronto no repositório

| Item | Onde |
|---|---|
| Dockerfiles multi-stage (`turbo prune`, imagem final não-root) | `apps/*/Dockerfile` |
| Config as Code por serviço | `apps/*/railway.json` |
| Migrações no pre-deploy da `api` | `apps/api/railway.json` → `node dist/migrate.js` |
| Seed automático nos ambientes de PR | `environments.pr.deploy.preDeployCommand` |
| Bootstrap das roles do banco | `infra/db/bootstrap-roles.sql` |
| Healthchecks | `/health` na api, `/api/health` nos apps Next |
| SIGTERM, `family: 0`, checagem de `noeviction` | api e worker (armadilhas #3, #4 e #5) |

## 2. Primeira configuração (uma vez, feita por você)

1. Conta Railway no plano **Pro** e projeto `marketplace`, com ambientes `production`, `staging` e
   **PR environments** habilitados.
2. Conectar o repositório GitHub e ligar **"Wait for CI"** em todos os serviços — o deploy só acontece com o
   job `ci` verde (US-008).
3. Criar os serviços de dados em `staging`: `postgres` (imagem oficial, **tag major**, ex. `:17`), `redis`,
   `meilisearch` (imagem fixada + volume) e o bucket `media`.
4. Redis: política **`noeviction`** (o worker recusa subir em produção sem ela).
5. Rodar o bootstrap de roles **uma vez por ambiente**, da sua máquina:

   ```bash
   psql "$DATABASE_PUBLIC_URL_DO_POSTGRES" \
     -v migrator_password="$DB_MIGRATOR_PASSWORD" \
     -v app_password="$DB_APP_PASSWORD" \
     -v platform_password="$DB_PLATFORM_PASSWORD" \
     -f infra/db/bootstrap-roles.sql
   ```

   O script imprime `rolsuper`/`rolbypassrls` no fim: `app` precisa sair com `f`/`f`.
6. Guardar `DB_MIGRATOR_PASSWORD`, `DB_APP_PASSWORD` e `DB_PLATFORM_PASSWORD` como **Shared Variables** do
   ambiente, além de `PLATFORM_ROOT_DOMAIN`, `EDGE_SHARED_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, `NODE_ENV`
   e `LOG_LEVEL`.
7. Criar os serviços de aplicação apontando o **caminho do arquivo de config** de cada um para
   `apps/<app>/railway.json`.
8. Variáveis por serviço: use **referências**, nunca valores copiados. A lista está em
   `07-infraestrutura-railway.md` §4. A da `api` começa assim:

   ```
   DATABASE_URL=postgresql://app:${{shared.DB_APP_PASSWORD}}@${{postgres.PGHOST}}:${{postgres.PGPORT}}/${{postgres.PGDATABASE}}
   DATABASE_URL_MIGRATOR=postgresql://migrator:${{shared.DB_MIGRATOR_PASSWORD}}@${{postgres.PGHOST}}:${{postgres.PGPORT}}/${{postgres.PGDATABASE}}
   REDIS_URL=${{redis.REDIS_URL}}
   ```

   O **worker** leva também `DATABASE_URL_PLATFORM` (role `platform`) e **não** leva `DATABASE_URL_MIGRATOR`.

> ⚠️ **Nunca** coloque a URL do usuário `postgres` em um serviço de aplicação. Superusuário ignora RLS e o
> isolamento entre tenants desaparece sem nenhum erro visível. A api recusa subir se detectar isso
> (`assertRuntimeRoleIsSafe`), mas a regra é não chegar lá.

## 3. Fluxo normal

| Evento | O que acontece |
|---|---|
| Push em um PR | Ambiente efêmero: banco novo, `migrate` + `seed-dev` no pre-deploy, link no PR |
| Merge em `main` | Deploy de `staging` apenas dos serviços afetados (`watchPatterns`) |
| PR `main → production` aprovado | Deploy de produção — **exige sua confirmação explícita** |

O pre-deploy da `api` roda as migrações **antes** de a nova versão receber tráfego. Se a migração falhar, o
deploy é abortado e a versão anterior continua no ar.

## 4. Verificação pós-deploy

```bash
curl -fsS https://api.<plataforma>/health            # 200 com database e redis "up"
curl -fsS https://<slug>.<plataforma>/api/health     # storefront
```

E confirme, uma vez por ambiente, que o runtime não é superusuário:

```sql
SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
-- esperado: app | f | f
```

## 5. Rollback

1. Redeploy da versão anterior pelo dashboard (ou `railway redeploy`).
2. As migrações seguem **expand/contract**, então a versão anterior continua funcionando com o schema novo.
3. Se a migração precisar ser desfeita, crie uma migração de contração nova — nunca edite uma já aplicada.

## 6. Pendências que dependem de você (checklist §B)

- [ ] Conta Railway no plano Pro e projeto `marketplace`
- [ ] Ambientes `staging`/`production` + PR environments
- [ ] Repositório conectado com "Wait for CI"
- [ ] Railway CLI instalada e `railway login`
- [ ] Serviços de dados criados e bootstrap de roles executado
- [ ] Shared Variables preenchidas

Enquanto isso não existir, o deploy não pode ser executado — nem por mim: eu não tenho credencial de Railway
neste ambiente, e criar recursos de infraestrutura exige sua confirmação.
