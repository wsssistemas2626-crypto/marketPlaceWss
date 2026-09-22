# ADR-011: Infraestrutura em containers cloud-agnóstica com OpenTelemetry

**Status:** Substituído pelo ADR-014 (Railway) — princípios de observabilidade e células continuam válidos · **Data:** 2026-09-21

## Contexto
Sem restrição de provedor de nuvem; time pequeno precisa de operação simples.

## Decisão
- Imagens Docker de `api` e `worker`; frontends em plataforma de Next.js (Vercel) ou container.
- Serviços gerenciados: Postgres (HA + PITR), Redis, object storage S3-compatível, Meilisearch (Cloud ou container).
- Execução em serviço de containers gerenciado (AWS ECS Fargate, Google Cloud Run, Azure Container Apps ou Fly.io/Render).
- IaC com Terraform/OpenTofu a partir da Fase 1.
- OpenTelemetry → backend de observabilidade (Grafana Cloud, Datadog, Honeycomb ou SigNoz).

## Alternativas consideradas
- **Kubernetes** — descartada agora: sobrecarga operacional para 2 serviços.
- **Serverless puro (Lambda)** — descartada: workers de longa duração e conexões de banco complicam.

## Consequências
Portável e simples; custo gerenciado maior que self-hosted, compensado pela operação mínima.

## Quando revisitar
Mais de ~8 serviços ou necessidade de controle fino de rede/escala → Kubernetes.

## Atualização — multi-tenancy (ADR-012)
- DNS curinga `*.<dominio-plataforma>` com certificado wildcard para subdomínios dos tenants; domínios próprios
  via `DomainProvisioningPort` (D10). Frontends Next.js resolvem o tenant pelo host no middleware.
- A infraestrutura é descrita como uma **célula** parametrizada (IaC), para que uma célula dedicada a um tenant
  enterprise seja só uma nova instância do mesmo módulo Terraform.
- Toda telemetria tem o atributo `tenant.id`; custo por tenant estimável por métricas de uso.
