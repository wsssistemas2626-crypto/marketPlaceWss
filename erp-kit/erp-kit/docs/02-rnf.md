# 02 — Requisitos Não Funcionais

Metas de escala e disponibilidade validadas pelo dono do produto em 2026-09-21; revisar no GATE-F1.
Todo RNF abaixo é verificável; a coluna "Verificação" diz como.

## Performance

| ID | Requisito | Verificação |
|---|---|---|
| RNF001 | Endpoints de leitura paginada respondem em até **500 ms (p95)**; escrita em até **800 ms (p95)**, com 300 usuários simultâneos e 200 tenants ativos | Teste de carga (k6) antes de cada release de fase |
| RNF002 | Relatórios e painéis agregados (burndown, velocidade, EVM) respondem em até **3 s (p95)** para projetos com até 5.000 work items | Teste de integração com massa de dados |
| RNF003 | Carregamento inicial do front (LCP) até **2,5 s** em conexão 4G/desktop comum | Lighthouse no CI |

## Segurança

| ID | Requisito | Verificação |
|---|---|---|
| RNF010 | Isolamento total entre tenants garantido no banco via RLS; a role da aplicação não possui `BYPASSRLS` | Teste de isolamento obrigatório por módulo |
| RNF011 | Autenticação delegada ao Clerk (ADR-004): o sistema não armazena senhas; MFA habilitado na instância do Clerk; exigência de MFA para administradores tratada no EP-PLT-02 (Fase 2) | Revisão da configuração do Clerk no gate de fase |
| RNF012 | Todo request autenticado tem o token do Clerk verificado no backend (assinatura, `exp`, `nbf`, `azp`); token sem organização ativa só acessa `/me` | Testes de integração com `FakeIdentityProvider` (tokens expirados, assinatura inválida, `azp` não autorizado, sem organização) |
| RNF012b | Webhooks do Clerk só são aceitos com assinatura válida e processados de forma idempotente | Testes de integração com payload assinado e repetido |
| RNF013 | Autorização por permissão em todo endpoint de escrita; negação por padrão | Teste automatizado que falha se um controller de escrita não tiver `@RequirePermission` |
| RNF014 | Aderência ao OWASP ASVS nível 2 nas áreas de autenticação, sessão, controle de acesso e validação de entrada | Checklist na revisão de fase |
| RNF015 | TLS 1.2+ em trânsito; criptografia em repouso pelo provedor de banco | Configuração de infraestrutura |
| RNF016 | Dependências sem vulnerabilidades críticas/altas conhecidas | `pnpm audit` no CI |

## Privacidade (LGPD)

| ID | Requisito | Verificação |
|---|---|---|
| RNF020 | Inventário de dados pessoais por módulo, mantido em `docs/dominio/*.md` (campos marcados como `PII`) | Revisão de fase |
| RNF021 | Possibilidade de exportar e anonimizar dados pessoais de um parceiro/colaborador, preservando registros financeiros e fiscais exigidos por lei | Story específica na Fase 2 |
| RNF022 | Logs não contêm senha, token, CPF/CNPJ completo nem e-mail em texto claro | Teste de redaction do logger |
| RNF024 | Transferência internacional de dados de identificação para o Clerk amparada no DPA do fornecedor e informada na política de privacidade | Checklist jurídico antes do primeiro cliente |
| RNF023 | Operadores da plataforma só acessam dados de um tenant com autorização registrada em auditoria | Fase 2 (suporte assistido) |

## Auditoria e rastreabilidade

| ID | Requisito | Verificação |
|---|---|---|
| RNF030 | Toda criação, alteração e exclusão de entidade de negócio registra: tenant, usuário, data/hora UTC, entidade, id, ação, valores antes/depois | Teste de integração por caso de uso de escrita |
| RNF031 | Trilha de auditoria imutável para a aplicação (sem UPDATE/DELETE pela role da aplicação) | Permissões de banco + teste |
| RNF032 | Retenção de auditoria de 5 anos | Política de dados |
| RNF033 | Todo log e evento carrega `correlationId` e `tenantId` | Teste do middleware |

## Disponibilidade e confiabilidade

| ID | Requisito | Verificação |
|---|---|---|
| RNF040 | Disponibilidade mensal de 99,5% em horário comercial estendido (6h–23h BRT) | Monitoramento |
| RNF041 | RPO de 15 min, RTO de 4 h; backup com point-in-time recovery; restauração testada trimestralmente | Procedimento de restauração |
| RNF042 | Eventos entre módulos com entrega pelo menos uma vez; consumidores idempotentes; nenhum evento perdido se o processo cair | Teste de integração do outbox com falha simulada |
| RNF043 | API sem estado de sessão em memória (escala horizontal) | Revisão de arquitetura |

## Escalabilidade

| ID | Requisito | Verificação |
|---|---|---|
| RNF050 | Suportar crescimento para 2.000 tenants sem mudança de arquitetura, via escala horizontal da API/worker e vertical do banco | Teste de carga projetado |
| RNF051 | Arquitetura permite mover um tenant para banco dedicado sem mudança de código (ADR-001) | Revisão de arquitetura |

## Usabilidade e acessibilidade

| ID | Requisito | Verificação |
|---|---|---|
| RNF060 | Interface em pt-BR, com formatos brasileiros: `dd/mm/aaaa`, `R$ 1.234,56`, fuso `America/Sao_Paulo` na exibição | Testes de componentes de formatação |
| RNF061 | Telas principais em conformidade com WCAG 2.1 AA (contraste, navegação por teclado, rótulos) | axe-core nos testes E2E |
| RNF062 | Layout responsivo, desktop-first, utilizável a partir de 360 px de largura | Testes E2E em viewport mobile |
| RNF063 | Operações de quadro (mover card) com resposta visual imediata (atualização otimista) | E2E |

## Compatibilidade

| ID | Requisito | Verificação |
|---|---|---|
| RNF070 | Duas últimas versões estáveis de Chrome, Edge, Firefox e Safari | Playwright nos três motores |
| RNF071 | API documentada em OpenAPI 3, versionada em `/api/v1`; mudanças incompatíveis exigem `/v2` | Geração no build |

## Manutenibilidade e observabilidade

| ID | Requisito | Verificação |
|---|---|---|
| RNF080 | TypeScript `strict`, zero erros de lint, zero violações de fronteira de módulo | `pnpm check` |
| RNF081 | Cobertura mínima de 80% em `domain/` e `application/` | Relatório de cobertura no CI |
| RNF082 | Logs JSON estruturados (pino); tracing OpenTelemetry pronto para exportação; endpoint `/health` (liveness) e `/ready` (readiness com banco) | Testes de integração |

## Não se aplica (por ora)

- Funcionamento offline e app nativo: fora de escopo (ver visão).
- Tempo real multiusuário (colaboração simultânea no mesmo card): Fase 2+ se houver demanda; no MVP, concorrência otimista com `version`.
