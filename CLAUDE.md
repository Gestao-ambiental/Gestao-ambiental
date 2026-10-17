# Gestão Ambiental — guia do projeto

SaaS para consultorias ambientais (1 a 20 pessoas) que transforma licenças ambientais (LAO e outras) e suas condicionantes em calendário operacional da equipe.

- **Nome no código e no repositório:** `gestao-ambiental`
- **Nome exibido no front:** **Grama** (provisório). Os protótipos dizem "Harpy" ou "Nexo": troque só a marca, nunca o comportamento.
- **Piloto:** consultoria Filtroville, 6 pessoas (1 Gestão + 5 Equipe), Joinville/SC.
- **Idioma:** tudo em português do Brasil (interface, mensagens, nomes de tabela e coluna). Commits: tipo em inglês, descrição em português.

## Fonte da verdade

Em divergência, o card do ClickUp prevalece sobre o doc; o doc prevalece sobre o protótipo.

- Backlog: lista **Dev** no ClickUp (`901717011785`). Épicos 1–9, cada um é uma fatia; uma fatia = um PR (ou poucos).
- Documentação (ClickUp Doc `2kza8vq8-617`): 02 Requisitos funcionais, 03 RNF, 05 Stack e ADRs, 06 C4 Containers, 07 ERD v1, 08 Processo, 09 Regras de negócio.
- Protótipos de tela: lista **Produto** (`901717085321`), cards "Protótipo 00" a "Protótipo 18", com prints anexados.

Se uma regra não está aqui nem no card, **pergunte**. Não invente regra de negócio, prazo ou comportamento de tela.

## Stack

| Camada | Escolha |
|---|---|
| Front | React + TypeScript + Vite (SPA), React Router, TanStack Query, react-hook-form + Zod, Tailwind + shadcn/ui |
| Backend | Supabase: Postgres com RLS, PostgREST, Auth (e-mail + senha), Storage (bucket privado), Edge Functions (Deno/TS) |
| Domínio | `packages/domain` — TypeScript puro, sem React, Supabase ou rede |
| Testes | Vitest (domínio e front), pgTAP via `supabase test db` (RLS), Playwright depois |
| Hospedagem | Vercel (front), Supabase região São Paulo (staging e produção separados) |
| Monorepo | pnpm workspaces |

```
apps/web            React + TS + Vite
packages/domain     regras puras + testes
supabase/migrations schema versionado (só pela CLI)
supabase/functions  Edge Functions
supabase/tests      pgTAP
docs/               ADRs e espelho da documentação
```

## Onde vive cada lógica (regra dura)

1. **Cálculo puro** (datas, recorrência, renovação, situação/atraso) → `packages/domain`, com teste.
2. **Escrita em várias tabelas** → uma função do banco (RPC), numa transação, idempotente quando puder ser repetida.
3. **Segredo ou rede externa** → Edge Function.

Nunca regra de negócio só no front. O front esconde coisas por apresentação, não por segurança.

## Segurança e multi-tenant

- Toda tabela de dados tem `consultoria_id`, **RLS habilitada e forçada**, e políticas baseadas nos helpers `private.is_membro(cid)` e `private.is_gestao(cid)`.
- A regra de acesso é "sou membro ativo desta consultoria". A consultoria selecionada no front é só filtro de tela.
- Relações pai-filho usam **FK composta** `(consultoria_id, id)`: o banco impede ligar registros de consultorias diferentes mesmo com UUID conhecido.
- Papel (`gestao | equipe`) vive no **vínculo** (`membro`), nunca no usuário nem em claim editável.
- Responsável, autor e ator são sempre `membro_id`, nunca nome.
- Service role só em Edge Functions, migrations e CI. O front usa sempre a chave anônima + JWT.
- Sem CPF em lugar nenhum. Convite guarda só o hash do token.
- Segredos nunca no front, no repositório ou em log.

## Dados

- Datas civis (validade, prazo, marcos, meta interna) são `DATE`; instantes (upload, decisão, auditoria) são `TIMESTAMPTZ`. Guarde também o **texto original** da data do documento.
- Prazo nunca muda pelo fuso do aparelho. Fuso por consultoria (`America/Sao_Paulo` no piloto). Exibição `dd/mm/aaaa`.
- Arquivos no Storage são **imutáveis**: substituir = objeto novo + nova linha de versão (nome original, MIME, tamanho, SHA-256, autor, instante). Caminho `consultoria_id/<entidade>/<uuid>`. Exclusão é lógica.
- Auditoria: tabela `auditoria` append-only, preenchida por trigger nas tabelas críticas (instrumento, condicionante, ocorrência, conferência, renovação, vínculos).
- Atraso e situação são **calculados**, nunca gravados. `prazo_oficial_original` nunca é sobrescrito.
- Entidades mutáveis de decisão têm `row_version` (controle otimista).
- Dinheiro, quando existir: centavos inteiros + código da moeda.

## Interface

- Desktop 1366×768 e 1920×1080; celular 375×812. Tabelas rolam na própria região, nunca a página.
- Tema claro e escuro com tokens como variáveis CSS.
- Toda tela tem os estados: vazio, carregando, erro, sem permissão.
- WCAG 2.2 AA: teclado em tudo, foco visível, nome acessível em botão de ícone, informação nunca só pela cor.
- Sem emoji na interface. Corpo 14px, conforme docs/design-system.
- Listas paginadas desde o início.

## Fluxo de trabalho

- Branch por épico ou história: `feature/<id-clickup>-<slug>`, `fix/…`, `chore/…`, `docs/…`.
- Conventional Commits: `feat: adiciona cadastro de empreendimento`.
- Nada entra na `main` sem PR. PR cita o card e os IDs de requisito (ex.: `ACC-02`).
- Migrations só pela CLI (`supabase migration new`), nunca pelo painel. Migration que cria tabela vem com RLS, políticas e teste pgTAP negativo **no mesmo PR**.
- Antes de dizer que terminou: `pnpm lint`, `pnpm typecheck`, `pnpm test` e build verdes localmente, e o job `banco` do CI (migrations, seed e pgTAP) verde. Não há Supabase local (sem Docker): o desenvolvimento usa staging.

## Definition of Done (itens que você verifica)

1. CI verde: lint, tipos, testes de domínio, pgTAP, build.
2. Toda tabela nova com `consultoria_id`, RLS forçada, políticas e teste negativo (usuário de outra consultoria recebe zero linhas).
3. Escrita multi-tabela em função do banco, em transação, idempotente quando repetível.
4. Migration versionada, se houve mudança de schema.
5. Trigger de auditoria, se tocou entidade crítica.
6. `DATE` vs `TIMESTAMPTZ` corretos; nenhum cálculo de prazo no fuso do aparelho.
7. Regra de cálculo em `packages/domain` com teste.
8. Nenhum segredo em front, repositório ou log.
9. Tela nova com vazio/carregando/erro/sem permissão, funcionando no celular e no tema escuro.

Revisão do PR, aceite em staging e atualização da documentação são de pessoas. Você não conclui card no ClickUp.

## Fora do escopo até 20/10

Sino de notificações (NOT-03), cota mensal de IA, gabarito/medição de acurácia da IA (IA-05), orçamentos, alvará, processos e dossiê, capacidade/jornada, chat, campo, central administrativa. A extração por IA (épico 9) só entra se sobrar tempo.