# @gestao-ambiental/domain

Regras puras do domínio (ADR-0007): TypeScript sem React, Supabase, rede, DOM ou relógio. O lint barra `react`, `@supabase/*`, `node:*`, `fetch`, `window`, `Date.now()` e `new Date()` sem argumento dentro de `src/`.

Datas civis são strings `AAAA-MM-DD` (tipo `DataCivil`), calculadas com aritmética inteira, sem `Date`. "Hoje" nunca é lido aqui: quem chama passa o instante e o fuso da consultoria (`hojeNoFuso(instante, fuso)`).

```sh
corepack pnpm --filter domain test   # a suíte roda 3 vezes: TZ=UTC, America/Sao_Paulo e Pacific/Kiritimati
```

## Origem: protótipo Nexo

Portado de `dist/domain.js` do repositório `nexo-gestao-ambiental`, commit `c06f5b3`, com os testes convertidos de `node:test` para Vitest (cada teste portado cita arquivo e linha de origem). O porte foi comparado com o original em 164 mil casos aleatórios por fuso (UTC−11 a UTC+14), sem nenhuma divergência.

| Protótipo                                          | Aqui                                                        | Arquivo          |
| -------------------------------------------------- | ----------------------------------------------------------- | ---------------- |
| `addDays`                                          | `adicionarDias`                                             | `data-civil.ts`  |
| `days(a, b)`                                       | `diferencaEmDias(a, b)` (a − b)                             | `data-civil.ts`  |
| `addMonths`                                        | `adicionarMeses`                                            | `data-civil.ts`  |
| `weekRange` / `weekdayLabel`                       | `semanaDe` / `nomeDoDiaDaSemana`                            | `data-civil.ts`  |
| `brDate`                                           | `formatarDataCivil`                                         | `data-civil.ts`  |
| `brasiliaNow`                                      | `dataEHoraNoFuso` / `hojeNoFuso` (fuso explícito)           | `data-civil.ts`  |
| `occurrences`                                      | `ocorrencias`                                               | `recorrencia.ts` |
| `suggestedFirstOccurrence`                         | `primeiraOcorrenciaSugerida` (`null` em vez de `""`)        | `recorrencia.ts` |
| `dependencyDateSuggestions`                        | `sugerirDatasDeDependencia`                                 | `recorrencia.ts` |
| `LAO_PROTOCOL_LEAD_DAYS`                           | `DIAS_LIMITE_PROTOCOLO_LAO` (120)                           | `renovacao.ts`   |
| `DEFAULT_RENEWAL_PLANNING_LEAD_DAYS`               | `ANTECEDENCIA_PREPARACAO_PADRAO_DIAS` (30)                  | `renovacao.ts`   |
| `renewalPlanningLeadDays`                          | `antecedenciaPreparacao`                                    | `renovacao.ts`   |
| `laoRenewalDates` (`protocolDue`, `planningStart`) | `datasRenovacaoLao` (`limiteProtocolo`, `inicioPreparacao`) | `renovacao.ts`   |
| `laoRenewalSteps`                                  | `etapasRenovacaoLao`                                        | `renovacao.ts`   |
| `businessDay` / `previousBusinessDay`              | `ehDiaUtil` / `diaUtilAnterior`                             | `dias-uteis.ts`  |
| `letterDeadline` (`official`, `internal`)          | `prazoDeOficio` (`oficial`, `interno`)                      | `dias-uteis.ts`  |

Única diferença de comportamento: data inexistente (ex.: `2026-02-30`) agora lança erro. No protótipo, o `Date` do V8 a convertia silenciosamente em outra data.

## Testes portados (tests/domain.test.mjs e tests/clock.test.mjs)

`domain.test.mjs`: linhas 140, 146, 169, 195, 231, 237, 335, 598. `clock.test.mjs`: linhas 14 e 38.

## TODO: o que ainda não foi portado, e por quê

Fica no protótipo até a onda que usa, porque depende de um modelo que ainda não existe aqui (ocorrência, etapa, evidência do ERD) ou de uma decisão pendente. Cada porte traz os testes correspondentes, um para um.

| Função(ões) do protótipo                                                                                                    | Testes no protótipo (domain.test.mjs)                                       | Quando / por quê                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `risk`, `nextAction`, `actionRisk`, `sortByUrgency`                                                                         | 173, 216, 225, 277, 293, 313, 323, 403, 409                                 | Situação calculada (5.1). Dependem do modelo de ocorrência/etapa e dos rótulos de situação.                           |
| `generateTask`, `stepPlan`, `linkGroupOccurrences`, `syncGroupCompletion`                                                   | 155, 249, 256, 267, 577                                                     | Geração de ocorrências (4.6) e agrupadores. Dependem do schema de condicionante/ocorrência/etapa.                     |
| `previewOccurrenceCount`                                                                                                    | 381                                                                         | Prévia da recorrência (4.4). Depende da natureza/unidade de ciclo da condicionante no ERD.                            |
| `planLicenseDateChange`, `validateOfficialDateChange`                                                                       | 356, 505, 524, 535, 544, 563                                                | Alteração de vigência e prazo oficial (DEM-06). Dependem de ocorrência + alteração proposta.                          |
| `validateEvidenceDate`, `lastEvidenceDate`, `evidenceCycleWarning`                                                          | 636, 643, 649, 657, 661, 669, 678, 690                                      | Evidência e dependência com prazo mínimo (DEM-07). Dependem de evidência/versão.                                      |
| `officialHolidays`, `seedHolidays`                                                                                          | clock.test.mjs 50, 61                                                       | Decisão pendente: o protótipo fixa o feriado de Joinville (09/03); aqui feriado é por consultoria.                    |
| `canEditPlan`, `mayApprove`, `matchesOwner`, `unassignedConditions`                                                         | 244, 350, 474, 604                                                          | Permissão vira RLS/RPC; o protótipo usa nome de pessoa como chave (aqui é `membro_id`).                               |
| `normalizeCnpj`, `isValidCnpj`, `formatCnpj`, `matchesLicenseSearch`                                                        | 426, 494                                                                    | Cadastro de empreendimento (EMP).                                                                                     |
| `wasteManifestStatus`                                                                                                       | 460                                                                         | Resíduos (onda 6).                                                                                                    |
| `normalizeCpf`, `isValidCpf`, `formatCpf`                                                                                   | 433                                                                         | **Não será portado**: sem CPF no sistema (ADR-0004).                                                                  |
| `migrateClientData`, `initialState`, `nowInDemo`, `dateChip`, `plural`, `TODAY`, `syncClock`, `refreshToday`, `clockStatus` | 47, 56, 82, 104, 399, 418, 423, 441, 451, 488; clock.test.mjs 8, 24, 34, 74 | Específicos do protótipo (estado no navegador, relógio de demonstração) ou de apresentação; não são regra de domínio. |
