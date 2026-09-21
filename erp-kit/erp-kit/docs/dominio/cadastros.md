# Modelo de domínio — Cadastros mestres

## organization (schema `organization`)

### companies
| Coluna | Tipo | Regra |
|---|---|---|
| legal_name | text | razão social, obrigatório |
| trade_name | text | nome fantasia |
| cnpj | char(14) | só dígitos, dígitos verificadores válidos, único no tenant |
| state_registration | text null | inscrição estadual |
| municipal_registration | text null | inscrição municipal |
| tax_regime | enum | `SIMPLES_NACIONAL`, `LUCRO_PRESUMIDO`, `LUCRO_REAL` |
| address | jsonb | CEP, logradouro, número, complemento, bairro, cidade, código IBGE, UF |
| archived_at | timestamptz null | |

Um tenant tem ao menos uma empresa. Filiais (`branches`) são empresas com `parent_company_id`
(mesma raiz de CNPJ: 8 primeiros dígitos iguais).

### cost_centers
`code` (único no tenant), `name`, `parent_id` (hierarquia), `company_id`, `archived_at`.
Não pode arquivar centro com filhos ativos.

## partners (schema `partners`)

Um parceiro é uma pessoa física ou jurídica que pode ter vários papéis simultaneamente.

### partners
| Coluna | Tipo | Regra |
|---|---|---|
| kind | enum | `INDIVIDUAL` (PF), `LEGAL_ENTITY` (PJ) |
| name | text | nome ou razão social; **PII** se PF |
| trade_name | text null | |
| document | varchar(14) | CPF (11) ou CNPJ (14), só dígitos, DV válido, único no tenant; **PII** se PF |
| email | text null | **PII** |
| phone | text null | **PII** |
| address | jsonb null | **PII** se PF |
| roles | text[] | subconjunto de `CUSTOMER`, `SUPPLIER`, `EMPLOYEE`; ao menos um |
| archived_at | timestamptz null | |

### employees (extensão 1:1 do parceiro com papel `EMPLOYEE`)
| Coluna | Tipo | Regra |
|---|---|---|
| partner_id | uuid | PF obrigatoriamente |
| user_id | uuid null | vínculo com usuário do sistema (para apontar horas) |
| job_title | text | |
| cost_center_id | uuid | referência a organization, sem FK (ADR-002) |
| hire_date | date | |
| termination_date | date null | |

### employee_cost_rates
| Coluna | Tipo | Regra |
|---|---|---|
| employee_id | uuid | |
| valid_from | date | |
| hourly_cost | numeric(19,4) | > 0 |

Vigências não se sobrepõem; o custo vigente numa data é o de maior `valid_from` ≤ data.
Exposto via `PartnersQueryFacade.getEmployeeCostRate(employeeId, date)` em `partners-api`.
Acesso ao custo/hora exige permissão `partners.cost-rate.read` (dado sensível de remuneração).
