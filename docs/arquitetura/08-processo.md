# 08 · Processo

**Processo de desenvolvimento — Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Base: "Requisitos não-funcionais", "Stack e ADRs" e o processo do CRM AgroFuturo (mesmas convenções da casa).
Time de **um desenvolvedor** (Kadu), um **product owner** (Eduardo) e um **stakeholder** (Matheus). As convenções abaixo existem para dar rastreabilidade e rede de segurança, não burocracia.
* * *
## 1\. Pessoas e gates

| Pessoa | Papel no processo |
| ---| --- |
| Kadu | Desenvolve, abre PR, marca os itens automáticos do DoD, publica em staging |
| Eduardo | Product owner: aprova o Definition of Ready das histórias, faz o aceite em staging, decide pendências de regra de negócio |
| Matheus | Consulta: lê os artefatos, opina; não é gate |

**Regra ✅:** um gate só precisa de **uma** aprovação (Eduardo). Se os dois precisassem aprovar, o ciclo semanal travaria.
**Documentação viva ✅:** cada tarefa de produto gera um artefato na lista de documentação do ClickUp (acordo já existente). Estas páginas são atualizadas na mesma entrega que muda a regra — não depois.
* * *
## 2\. Convenções de código
### Repositório
GitHub `gestao-ambiental`, monorepo:

```java
apps/web            React + TypeScript + Vite
packages/domain     lógica de domínio pura + testes portados do protótipo
supabase/migrations schema versionado (Supabase CLI)
supabase/functions  Edge Functions (extrair-licenca, ...)
supabase/tests      testes de RLS (pgTAP)
docs/               cópia destas páginas (fonte é o ClickUp; aqui é espelho)
```

### Branches
Uma branch por história, nomeada com o **ID da tarefa do ClickUp**:

```plain
feature/86e3xxxxx-cadastro-de-instrumento
fix/86e3xxxxx-recorrencia-fim-de-mes
```

Prefixos: `feature/`, `fix/`, `chore/`, `docs/`.
### Commits — Conventional Commits
Tipo em inglês, descrição em português:

```yaml
feat: adiciona revisão de condicionantes propostas pela IA
fix: corrige limite de protocolo quando a validade cai em fim de mês
chore: atualiza supabase-js
docs: escreve ADR de PostGIS
test: porta testes de addMonths do protótipo
```

Tipos em uso: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
### Pull Requests
**Uma história = um PR.** Nada entra na `main` sem PR, mesmo com um único dev — o PR é onde o CI roda e onde acontece a auto-revisão. `main` faz deploy em produção; PR gera preview na Vercel e roda contra o Supabase de staging.
Template do PR:
*   Link da tarefa no ClickUp
*   O que muda e por quê (cita o ID do requisito, ex. `LIC-03`)
*   Como testar
*   Checklist do Definition of Done
### Migrations
Toda mudança de schema é uma migration no repositório, criada pela CLI, nunca editada no painel. Migration que cria tabela de dados **vem com** RLS, políticas e o teste negativo no mesmo PR.
* * *
## 3\. Definition of Ready
Uma história só entra em desenvolvimento quando tem:
1. **Critério de aceite escrito** — o que precisa acontecer para considerar pronta, incluindo o caso negativo (acesso negado, dado ausente, retry).
2. **Tela ou fluxo definido** — o caminho que o usuário percorre está claro; quando a tela existe no protótipo, o card aponta para ela.
3. **Regra de negócio citada** — se a história depende de uma regra, a regra está na página "Regras de negócio" (decidida) ou o card diz qual pendência precisa ser resolvida antes.
4. **Dependência externa identificada** — IA, e-mail, Google, bases cartográficas ou decisão do cliente, explícito.
5. **Cabe em uma semana** — se não cabe, é quebrada antes de começar.
Eduardo aprova o DoR movendo o card para "Pronto para dev".
* * *
## 4\. Definition of Done
Cada item marcado como **\[auto\]** pode ser verificado pela IA (Claude Code) ao concluir a tarefa; **\[humano\]** exige uma pessoa.

| # | Item | Quem verifica |
| ---| ---| --- |
| 1 | CI verde — lint, checagem de tipos, testes de domínio, testes de RLS, build | \[auto\] |
| 2 | Toda tabela nova tem `consultoria_id`, RLS habilitada e forçada, políticas e teste negativo (usuário de outra consultoria recebe zero linhas) (ADR-0003) | \[auto\] |
| 3 | Escrita multi-tabela está em função do banco, em transação, idempotente quando pode ser repetida (RNF 11) | \[auto\] |
| 4 | Migration versionada, se houve mudança de schema | \[auto\] |
| 5 | Trigger de auditoria presente, se tocou instrumento, condicionante, ocorrência, conferência, renovação, vínculo ou extração (ADR-0010) | \[auto\] |
| 6 | Datas civis em `DATE`, instantes em `TIMESTAMPTZ`; nenhum cálculo de prazo no fuso do aparelho (ADR-0009) | \[auto\] |
| 7 | Regra de cálculo vive em `packages/domain` com teste; o front só chama (ADR-0007) | \[auto\] |
| 8 | Segredo não aparece em front, repositório ou log; saída de IA validada por schema, se tocou a extração (ADR-0006) | \[auto\] |
| 9 | Tela tem estados vazio, carregando, erro e não autorizado; funciona no celular e no tema escuro, se é tela nova (RNF 12) | \[auto\] |
| 10 | Revisão do PR | \[humano — Kadu\] |
| 11 | Aceite em staging — fluxo executado de ponta a ponta na tela real, pelo critério de aceite do card | \[humano — Eduardo\] |
| 12 | Página de documentação atualizada, se a história mudou regra, modelo ou decisão | \[humano — Kadu\] |

**Regra:** a IA pode marcar os itens automáticos, mas **não pode concluir a tarefa** — os itens 10 a 12 são de pessoas. O critério de aceite é avaliado por leitura e, por ser frágil, entra no aceite humano.
Esta tabela vira **checklist-template no ClickUp** (item da Fundação).
* * *
## 5\. Fundação do projeto
Tarefas que precisam existir antes da primeira história de produto. São a primeira coisa a fazer.

| # | Item | Resultado verificável |
| ---| ---| --- |
| F1 | Repositório `gestao-ambiental` com monorepo, lint, tipos, Vitest e CI no GitHub Actions | PR de exemplo com CI verde |
| F2 | Projetos Supabase staging e produção em São Paulo; CLI configurada; migrations rodando no CI | `supabase db push` em staging a partir do CI |
| F3 | Projeto Vercel com preview por PR e deploy da `main` | URL de preview num PR |
| F4 | Walking skeleton: login → consultoria → uma tela que grava no banco (com RLS), sobe um arquivo no bucket privado e recebe um e-mail de convite | Fluxo executado de ponta a ponta em staging por Eduardo |
| F5 | Teste de RLS automatizado (pgTAP) com duas consultorias sintéticas, rodando no CI | Teste negativo falha quando uma política é removida |
| F6 | `packages/domain` criado com `addMonths`, `occurrences` e `laoRenewalDates` portados do protótipo com os testes | Testes verdes, casos de fim de mês e bissexto incluídos |
| F7 | Gabarito humano: 5 licenças reais da Filtroville com condicionantes, prazos e periodicidades marcados pelo Eduardo | Arquivo de gabarito no repositório (sem dados pessoais) |
| F8 | Edge Function `extrair-licenca` com adapter OpenRouter, schema de saída e registro em `EXTRACAO_IA` | Extração de uma licença do gabarito com custo registrado |
| F9 | Checklist-template do DoD e template de PR no ClickUp/GitHub | Existem |
| F10 | Monitor de uptime externo com alerta | Alerta recebido num teste |
| F11 | Termo de uso com cláusula de envio de documentos à IA (pendência jurídica da Envora) | Texto aprovado pela Envora — não bloqueia o dev |
| F12 | Antes do go-live: upgrade do Supabase para Pro, SMTP customizado (Resend), restauração do backup testada em projeto isolado, decisão sobre cópia dos objetos do Storage | Checklist de go-live assinado |

* * *
## 6\. Ciclos de entrega
*   **Ciclo semanal.** Revisão com Eduardo toda semana: o que entrou em staging, o que foi aceito, o que muda de ordem.
*   **Marco da onda 1: 15/10/2026** — versão de teste no cliente com a IA rodando. Dez dias corridos a partir de 05/10.
*   Ondas seguintes **têm ordem, não data**; a data de cada uma é fixada no início da onda anterior.
*   Dentro de uma onda, as tarefas são ordenadas por **valor para a métrica** (acurácia da IA e tempo de cadastro), não por ordem de módulo.
### Ordem de ataque da onda 1

| Dias | Entrega | Por quê nessa ordem |
| ---| ---| --- |
| 1–2 | Fundação F1–F6: repo, Supabase, Vercel, CI, walking skeleton, RLS testada, domínio portado | Tudo o que vem depois depende disso; é o que não dá para refazer depois |
| 3–4 | ACC-01 a ACC-04, EMP-01, EMP-02 | Entrar, ter consultoria, equipe e empreendimento |
| 5–7 | LIC-01 a LIC-05 (caminho manual), EQ-01 a EQ-04 | O fluxo inteiro funciona sem IA; a visão da equipe já mostra ocorrências reais |
| 8–9 | IA-01 a IA-04 (extração, revisão, cota, degradação) | A IA entra por cima de um fluxo que já está em produção |
| 10 | F7–F8 + IA-05: rodar o gabarito, comparar modelos, ajustar prompt; aceite com Eduardo | É o que mede a métrica no dia 15 |

### Risco declarado ⚠️
São **16 módulos, 1 desenvolvedor e 10 dias até a primeira versão de teste**. O escopo completo do MVP **não cabe** até 15/10 — só a onda 1 cabe, e apertada. Isso está registrado aqui para que a decisão seja consciente, não uma surpresa no dia 14.
**Critério de corte:** se ao fim do dia 10 faltar escopo, a entrega correta é **o fluxo manual completo + visão da equipe em produção, com a IA em staging**, não dez telas pela metade. A métrica de tempo pode ser medida com o fluxo manual; a de acurácia espera a IA estabilizar. Um fluxo incompleto em produção custa mais caro que uma onda adiada.
### Entre ondas
Ao fechar uma onda: (1) aceite de Eduardo em staging; (2) páginas de documentação atualizadas; (3) ordem das ondas seguintes revista com Eduardo e Matheus; (4) "Evoluções futuras" revisada — o que ganhou gatilho entra como história.