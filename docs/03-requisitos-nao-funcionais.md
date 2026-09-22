# 03 — Requisitos Não Funcionais

Todos os RNFs são mensuráveis. Os que têm "Verificação: automatizada" devem virar teste, check de CI
ou alerta de monitoramento.

## Multi-tenancy (ADR-012)
| ID | Requisito | Métrica / verificação | P |
|---|---|---|---|
| RNF-TEN-01 | Isolamento de dados | Zero acesso cross-tenant: suíte de isolamento cobre 100% das rotas e consumidores; consulta sem contexto de tenant retorna 0 linhas (RLS) — CI | M |
| RNF-TEN-02 | Vizinho barulhento | Com um tenant a 10× da carga média, p95 dos demais tenants degrada ≤ 20% (teste de carga); cotas de requisição e concorrência de jobs por tenant | M |
| RNF-TEN-03 | Provisionamento | Tenant utilizável (subdomínio, seeds, admin convidado) em ≤ 5 min; operação idempotente | M |
| RNF-TEN-04 | Portabilidade | Export completo de um tenant em ≤ 24 h; purge verificável em todos os módulos, índice e storage | M |
| RNF-TEN-05 | Observabilidade por tenant | Logs, métricas e traces com `tenant.id`; dashboard de erros/latência filtrável por tenant | M |
| RNF-TEN-06 | Custo marginal | Tenant novo sem tráfego não cria infraestrutura dedicada (apenas linhas, índice de busca e prefixos) | S |

## Performance
| ID | Requisito | Métrica / verificação | P |
|---|---|---|---|
| RNF-PERF-01 | Leitura de catálogo e busca rápidas | p95 ≤ 300 ms na API para `GET /v1/store/products/*` e `/search` com 200 req/s (teste de carga k6) | M |
| RNF-PERF-02 | Operações de escrita comuns | p95 ≤ 800 ms (carrinho, criação de oferta, atualização de pedido) | M |
| RNF-PERF-03 | Checkout | p95 ≤ 2 s para criação do pedido + cobrança, excluindo latência do gateway acima de 1,5 s | M |
| RNF-PERF-04 | Storefront | Core Web Vitals em 4G: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 nas páginas home, busca e produto (Lighthouse CI) | M |
| RNF-PERF-05 | Propagação de eventos | 95% dos eventos do outbox publicados em ≤ 5 s; índice de busca atualizado em ≤ 60 s | M |

## Escalabilidade
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-ESC-01 | Crescimento de volume | Suportar 50 tenants somando 2 M SKUs e 300 mil pedidos/mês na célula compartilhada com escala horizontal de api/worker e réplica de leitura; acima disso, novas células | M |
| RNF-ESC-02 | Picos (Black Friday) | Suportar 10× o tráfego médio por 6 h com autoscaling horizontal; API e worker **stateless** | M |
| RNF-ESC-03 | Extração de módulos | Qualquer módulo pode ser extraído para serviço próprio sem reescrever os demais (garantido pelas regras de fronteira do CLAUDE.md §4) | S |

## Disponibilidade e confiabilidade
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-DISP-01 | SLA | 99,5% mensal para storefront e checkout (≈ 3,6 h de indisponibilidade/mês) | M |
| RNF-DISP-02 | Backup | PITR da Railway habilitado (WAL arquivado) + backups de volume diário/semanal; RPO ≤ 5 min e RTO ≤ 1 h; teste de restauração trimestral (runbook `docs/runbooks/restore.md`) | M |
| RNF-DISP-03 | Degradação graciosa | Falha em busca → fallback para listagem por categoria no Postgres; falha na cotação de frete → tabela do seller; falha em notificação → não bloqueia pedido | M |
| RNF-DISP-04 | Resiliência de integrações | Toda chamada externa com timeout (padrão 5 s), retry com backoff exponencial + jitter (somente operações idempotentes) e circuit breaker | M |
| RNF-DISP-05 | Consistência financeira | Zero divergência não explicada entre ledger e gateway na conciliação diária; soma de débitos = soma de créditos (invariante verificada por teste e job) | M |

## Segurança
| ID | Requisito | Métrica / verificação | P |
|---|---|---|---|
| RNF-SEG-01 | Transporte | TLS 1.2+ em tudo; HSTS; cookies `Secure`, `HttpOnly`, `SameSite=Lax` | M |
| RNF-SEG-02 | Senhas (compradores) | Argon2id; bloqueio progressivo após 5 tentativas; verificação contra senhas vazadas (k-anonymity) | M |
| RNF-SEG-02b | Tokens da Clerk | API valida assinatura, expiração, `azp` (authorized parties) e organização ativa em toda requisição de painel, sem chamada de rede por requisição; teste com token forjado, expirado e de outra organização | M |
| RNF-DISP-06 | Indisponibilidade da Clerk | Storefront e checkout **não** dependem da Clerk (continuam funcionando); painéis exibem aviso; webhooks perdidos são recuperados por job de reconciliação diária via API da Clerk | M |
| RNF-SEG-03 | Autorização | Todo endpoint declara papel/escopo exigido; teste automatizado garante que nenhuma rota fica sem guard. Seller só acessa recursos da própria loja (teste de IDOR por módulo) | M |
| RNF-SEG-04 | Cartão | Nenhum PAN/CVV toca nossos servidores (tokenização no front pelo gateway) — escopo PCI DSS SAQ-A | M |
| RNF-SEG-05 | Segredos | Credenciais de integrações criptografadas em repouso (envelope encryption / KMS); nada de segredos no repositório (gitleaks no CI) | M |
| RNF-SEG-06 | OWASP | Mitigar OWASP Top 10 e API Top 10; rate limit por IP e por usuário/API key; SAST e scan de dependências no CI sem vulnerabilidade alta/crítica | M |
| RNF-SEG-07 | Webhooks | Entrada: validar assinatura do provedor e rejeitar replays (> 5 min). Saída: HMAC-SHA256 com segredo por endpoint | M |

## Privacidade (LGPD)
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-LGPD-00 | Papéis LGPD | Tenant = controlador dos dados de compradores/sellers; plataforma = operadora. Contrato (DPA) aceito no provisionamento; staff só acessa dados via modo suporte auditado | M |
| RNF-LGPD-05 | Suboperadores | Clerk listada como suboperadora (transferência internacional) na política de privacidade e no DPA com tenants; somente dados necessários ao login vão para a Clerk (CPF/CNPJ, endereço e dados bancários ficam na nossa base) | M |
| RNF-LGPD-01 | Minimização | Seller só vê dados do comprador necessários à entrega/fiscal do próprio pedido; dados mascarados após 90 dias da entrega | M |
| RNF-LGPD-02 | Direitos do titular | Exportação e exclusão/anonimização atendidas em ≤ 15 dias; dados fiscais/financeiros retidos pelo prazo legal | M |
| RNF-LGPD-03 | Consentimento | Versão de termos/política e consentimentos de marketing registrados com data e IP | M |
| RNF-LGPD-04 | Logs | Nenhum CPF, e-mail, telefone ou endereço em logs (redação automática + teste) | M |

## Usabilidade e acessibilidade
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-UX-01 | Acessibilidade | WCAG 2.1 AA no storefront e checkout (axe sem violações sérias no CI) | M |
| RNF-UX-02 | Responsividade | Mobile-first; funcional de 360 px a 1920 px | M |
| RNF-UX-03 | Checkout curto | Comprador logado com endereço salvo conclui compra Pix em ≤ 4 telas | S |

## Compatibilidade
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-COMP-01 | Navegadores | Últimas 2 versões de Chrome, Safari, Firefox, Edge; Safari iOS 16+ e Chrome Android | M |
| RNF-COMP-02 | API | Mudanças incompatíveis só em nova versão (`/v2`); versão anterior mantida ≥ 12 meses com header `Deprecation`/`Sunset` | M |
| RNF-COMP-03 | Eventos | Schemas de eventos versionados; consumidores toleram campos novos | M |

## Auditoria e observabilidade
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-AUD-01 | Audit log | Imutável (append-only), retido por 5 anos, consultável por entidade/ator | M |
| RNF-OBS-01 | Telemetria | Traces distribuídos (OpenTelemetry) cobrindo HTTP → caso de uso → DB → fila → adapter externo, com `correlation_id` propagado em eventos e webhooks | M |
| RNF-OBS-02 | Alertas | Alertas para: taxa de erro 5xx > 1% em 5 min, outbox com atraso > 60 s, DLQ não vazia, falha de conciliação, circuit breaker aberto | M |
| RNF-OBS-03 | Métricas de negócio | GMV, pedidos/min, taxa de aprovação de pagamento expostos como métricas | S |

## Manutenibilidade
| ID | Requisito | Métrica | P |
|---|---|---|---|
| RNF-MAN-01 | Fronteiras | 0 violações de dependência entre módulos (lint no CI) | M |
| RNF-MAN-02 | Testes | Cobertura ≥ 80% em `domain/` e `application/`; testes de contrato para cada adapter | M |
| RNF-MAN-03 | Novo provedor | Adicionar um provedor de uma categoria existente exige somente um pacote novo em `packages/adapters/` + configuração, sem alterar módulos | M |
| RNF-MAN-04 | Documentação | OpenAPI e catálogo de eventos gerados a partir do código, validados no CI | M |
| RNF-MAN-05 | Deploy | CI/CD com deploy em produção ≤ 20 min após merge; rollback em ≤ 5 min; migrações compatíveis com a versão anterior (expand/contract) | M |
