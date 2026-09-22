# ADR-003: Um schema PostgreSQL por módulo, sem JOIN entre schemas

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Para manter módulos extraíveis e evitar acoplamento pelo banco (o acoplamento mais difícil de desfazer),
cada módulo precisa ser dono dos próprios dados.

## Decisão
Cada módulo tem um schema Postgres próprio e migrações próprias. É proibido ler/escrever tabelas de outro schema
e criar FKs entre schemas. Dados de outros módulos são obtidos por facade ou por projeção local via eventos.
Um role de banco por módulo é desejável na Fase 2 (enforcement no próprio banco).

## Alternativas consideradas
- **Schema único compartilhado** — descartada: joins cruzados tornam a extração inviável e escondem dependências.
- **Banco físico por módulo** — descartada agora: custo e complexidade operacional sem benefício na escala atual.

## Consequências
**Positivas:** fronteiras reais; extração futura = mover schema. **Negativas:** consultas agregadas (relatórios, telas
de admin) exigem composição na aplicação ou projeções; sem transação atômica entre módulos (compensação/outbox).

## Quando revisitar
Se relatórios cross-módulo ficarem pesados → módulo `reporting` com projeções dedicadas ou data warehouse.

## Atualização — multi-tenancy (ADR-012)
Schema por módulo continua; o isolamento entre tenants é por **linha** (`tenant_id` + RLS), não por schema.
Schema por tenant foi descartado justamente porque multiplicaria os schemas por módulo (ver ADR-012).
