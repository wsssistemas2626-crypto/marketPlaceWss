# ADR-006 — Documentos fiscais via provedor externo atrás de adapter

**Status:** Aceito (provedor concreto a definir antes da Fase 3) · **Data:** 2026-09-21

## Contexto
Emissão de NF-e/NFS-e envolve centenas de layouts municipais, certificados digitais, contingência
e a transição da reforma tributária (IBS/CBS). Construir isso internamente consumiria mais esforço
que o restante do MVP.

## Decisão
- O módulo `fiscal` monta os dados do documento no nosso modelo e delega emissão, consulta e
  cancelamento a um provedor externo via API.
- Interface `FiscalDocumentProvider` em `fiscal`: `issue`, `getStatus`, `cancel`, `downloadXml`, `downloadPdf`.
- Estados internos independentes do provedor: `DRAFT → SUBMITTED → AUTHORIZED | REJECTED → CANCELLED`.
- Retornos assíncronos por webhook do provedor, validados e convertidos em eventos internos.
- Um `FakeFiscalProvider` determinístico é usado em desenvolvimento e testes.
- Certificados e credenciais do provedor ficam em cofre de segredos, nunca no banco em claro.

## Consequências
- (+) Troca de provedor sem afetar outros módulos.
- (−) Dependência operacional e custo por documento de um terceiro.
