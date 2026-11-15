# Passagem de bastão: módulo de orçamentos do Grama

> **Antes de tudo, leia `ANDAMENTO-ORCAMENTO.md`, na mesma pasta.** Ele diz o que já foi feito, o que está pela metade (com uma lista de tarefas) e o que falta. Atualize esse arquivo a cada passo, do mesmo jeito.

Você vai assumir este projeto a partir de agora. Até aqui, o trabalho foi feito por outro assistente (Claude). A partir desta mensagem, eu (Eduardo, dono do produto) vou pedir alterações e melhorias para você. **Siga 100% o jeito de trabalhar descrito aqui**: as mesmas regras, a mesma arquitetura, o mesmo cuidado com testes e o mesmo jeito de falar comigo. Quando algo não estiver aqui nem no código, **pergunte antes de inventar**.

---

## 1. O projeto

- **O que é:** SaaS para consultorias ambientais (1 a 20 pessoas). Transforma licenças ambientais e suas condicionantes em calendário da equipe. Agora estamos no **módulo de orçamentos**.
- **Nome no código:** `gestao-ambiental`. **Nome na tela:** Grama.
- **Idioma:** tudo em português do Brasil (tela, mensagens, tabelas, colunas, comentários). Commits: tipo em inglês, descrição em português (ex.: `feat: adiciona lixeira de orçamentos`).
- **Pasta local:** `C:\Users\eduka\Documents\Codex\2026-11-06\https-github-com-gestao-ambiental-gestao\work\Gestao-ambiental-orcamentos`
- **Branch:** `local/orcamentos-fluent`, só local. **Não faça push nem PR** sem eu pedir. **Commit só quando eu pedir** (eu costumo dizer "Ficou bom, commita").
- **Leia primeiro:** `CLAUDE.md` (regras do projeto, valem para você também), `docs/adr/0017-orcamento-margem-no-fim-visitas-e-catalogo.md` (todas as decisões do orçamento até agora) e `docs/adr/0016-automacao-do-orcamento-a-execucao.md` (contrato, cobrança e tarefas, ainda não implementado).

## 2. Stack e onde vive cada coisa

| Camada          | Escolha                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Front           | React + TypeScript + Vite, React Router, TanStack Query, Tailwind v4 com tokens do Fluent 2 (ADR-0015) |
| Backend         | Supabase: Postgres com RLS forçada, RPCs `security definer`, Auth, Storage                             |
| Regras puras    | `packages/domain` (TypeScript puro, sem React nem Supabase), com testes Vitest                         |
| Testes do banco | pgTAP em `supabase/tests/`                                                                             |
| Monorepo        | pnpm (`./node_modules/.bin/pnpm`)                                                                      |

**Regra dura de onde vive a lógica:**

1. **Cálculo puro** (preço, rateio, parcelas, carga) vai em `packages/domain`, com teste.
2. **Escrita em várias tabelas** vai numa função do banco (RPC), em transação.
3. **Segredo ou rede externa** vai numa Edge Function.
4. **O banco e o domínio têm que dar o mesmo centavo.** Arredondamento é metade para cima, igual ao `round(numeric)` do Postgres. Parcelas e rateios usam o **maior resto** (`distribuirPorMaiorResto`). Todo cálculo novo tem o mesmo cenário testado nos dois lados (Vitest e pgTAP) com os mesmos números.
5. Nunca deixe regra de negócio só no front. O front esconde coisas para organizar a tela, nunca por segurança.

**Arquivos do orçamento:**

- Domínio: `packages/domain/src/orcamento.ts`, `preco-do-orcamento.ts`, `carga-da-equipe.ts`, exportados em `index.ts`.
- Banco: `supabase/migrations/20261110200500_cria_orcamentos.sql` até `20261113130000_situacao_e_proposta.sql`.
- Testes do banco: `supabase/tests/190_orcamentos` até `280_situacao_e_proposta`.
- Decisões mais recentes: `docs/adr/0018-unidades-de-cobranca-e-melhorias-do-orcamento.md` e `docs/adr/0019-usabilidade-do-orcamento.md`.
- API do front: `apps/web/src/lib/api/orcamentos.ts`. Os tipos ficam em `apps/web/src/lib/database.types.ts` (escritos à mão para as RPCs novas) e as mensagens de erro em `apps/web/src/lib/erros.ts`.
- Telas: `apps/web/src/app/paginas/orcamentos/` (`PaginaOrcamentos`, `PaginaOrcamento`, `PaginaCustosETaxas`, `PaginaProposta`, `calculo.ts`, `orcamentos.test.tsx`). Rotas em `apps/web/src/app/rotas.tsx`.

## 3. Segurança e dados (não negociável)

- **Toda tabela de dados:**
  - tem `consultoria_id`, com RLS habilitada **e forçada** e políticas com `private.is_membro(cid)` e `private.is_gestao(cid)`;
  - liga pai e filho por **FK composta `(consultoria_id, id)`**.
- **Toda migration** que cria tabela ou função traz:
  - RLS e grants;
  - `revoke ... from public, anon` em funções públicas, e `from public, anon, authenticated` em funções de `private`;
  - **teste pgTAP negativo**: usuário de outra consultoria e da Equipe recebem zero linhas ou `sem_permissao`.
- **Pessoas:** responsável, autor e ator são sempre `membro_id`, nunca nome. O papel (`gestao` | `equipe`) vive no `membro`.
- **Datas:** datas civis (prazo, mês previsto) são `DATE`; instantes (exclusão, auditoria) são `TIMESTAMPTZ`. Nada calculado no fuso do aparelho: use o fuso da consultoria.
- **Dinheiro e percentuais:** dinheiro em **centavos inteiros**; percentuais em **pontos-base** (10000 = 100%).
- **Dados derivados e controle:** atraso e situação são **calculados, nunca gravados**. Entidade com decisão tem `row_version` (controle otimista).
- **Exclusão é lógica** (ex.: lixeira de orçamentos).
- **Nada sensível:** sem CPF; sem segredos no front, no repositório ou em log.
- **Migrations:** nunca edite uma migration que já foi aplicada em algum banco. Mudança nova vai numa migration nova (nome `AAAAMMDDHHMMSS_descricao.sql`).

## 4. Interface

- Tudo segue o **Fluent 2** (ADR-0015) e os tokens CSS existentes, como `--text`, `--text-subtle`, `--text-danger`, `--text-link`, `--surface` e `--space-100`. Não invente cor.
- Toda tela tem os estados: **vazio, carregando, erro e sem permissão**. Funciona no celular (375 px) e no tema escuro. Tabelas rolam dentro da própria área, nunca a página.
- **Acessibilidade (WCAG 2.2 AA):**
  - teclado em tudo e foco visível;
  - botão de ícone com nome acessível (ex.: `rotulo="Excluir orçamento ORC-2026-041"`);
  - informação **nunca só pela cor** (ex.: "acima da jornada" escrito);
  - os testes rodam `axe` nas telas novas.
- Sem emoji na interface. Corpo de texto 14 px.
- Componentes prontos: `Botao`, `BotaoIcone`, `Dialogo`, `MensagemSecao`, `Selo`, `CaixaSelecao`, `Icone` (só os nomes que existem em `apps/web/src/assets/icons`), e `EstadoVazio`, `EstadoErro`, `Carregando` e `SemPermissao`.

## 5. Como trabalhar (o que eu espero de você)

1. **Entenda o pedido.** Se uma regra de negócio, um prazo ou um comportamento não estiver no `CLAUDE.md`, nos ADRs ou no código, **pergunte com opções curtas e uma recomendada**. Não invente valor nenhum: tabela de honorários, piso, alíquota, nada. Valores entram como dado que a consultoria informa.
2. **Faça a mudança completa**, na ordem:
   1. domínio com testes;
   2. migration com RPC e pgTAP (inclusive o negativo);
   3. API do front, tipos e mensagens de erro;
   4. tela;
   5. testes da tela (Vitest + Testing Library + axe);
   6. ADR atualizado (normalmente o 0017) com a decisão e a data.
3. **Verifique antes de dizer que terminou** (todos verdes):
   - `./node_modules/.bin/pnpm typecheck`
   - `./node_modules/.bin/eslint . --max-warnings=0 --ignore-pattern "apps/web/demo-local/**"`
   - `./node_modules/.bin/prettier --check <arquivos alterados>`
   - `./node_modules/.bin/pnpm test`
   - `./node_modules/.bin/pnpm build`
   - testes do banco (pgTAP): não há Docker nem Supabase local. Use o executor PGlite em `ferramentas-locais/pg/` (fora do git): `node ferramentas-locais/pg/rodar.mjs .` (todos) ou `node ferramentas-locais/pg/rodar.mjs . 280` (um). Ele não substitui o job `banco` do CI; **me diga claramente o que rodou e o que não rodou**.
4. **Seja honesto no relatório:** diga o que passou, o que falhou (com a saída) e o que **não** foi verificado (ex.: "não conferi a tela com os olhos").
5. **Navegador:** quando for abrir algo para eu ver, use o **Brave**, nunca outro navegador:
   `Start-Process "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" <url>`
6. **Demo local:** `apps/web/demo-local/` (fora do git, de propósito) é um banco de mentira na memória que imita as RPCs. Ele roda com:
   `./node_modules/.bin/pnpm --dir apps/web exec vite --config demo-local/vite.demo.config.ts` (porta 5199)
   Toda RPC nova ou alterada precisa ser imitada lá também, com a mesma regra do banco. Esse arquivo tem dados reais da minha empresa: **nunca coloque esses dados no git**.
7. **Como falar comigo:** em português simples e direto. Primeiro o resultado, depois os detalhes em listas curtas, com exemplos em reais quando ajudar ("8h × 57,47 = 459,76"). No fim, diga o que ficou pendente. Quando terminar uma mudança, pergunte se pode commitar.

## 6. O que já está pronto no orçamento (resumo; detalhes no ADR-0017)

- **Fluent 2** como design system.
- **Três etapas:**
  - Serviços: horas, hora de venda, responsável, mês e outros custos;
  - Preço e margem: margem única no fim, com atalhos de 10, 15, 20, 25 e 30%;
  - Parcelas.
- **Orçamento para prospecto** (cliente ainda não cadastrado), com "Cadastrar como empreendimento".
- **Visita técnica** com preço fixo, sem margem.
- **Duas formas de preço:**
  - **pela tabela**: horas × hora de venda por profissão e atividade (ex.: tabela ACEAMB corrigida);
  - **pela margem**: custo ÷ (1 − margem − tributos − taxas).
- **Custos e taxas:**
  - contas do mês, visita, km, tributos e taxas;
  - tabela de hora de venda por profissão e atividade, com fonte;
  - equipe feita de **membros com login**, cada um com custo do mês e horas no mês. A hora de custo é custo ÷ horas;
  - **piso por hora**, que só aparece quando alguém está "pelo piso".
- **Custo do serviço:** usa a hora do **responsável**. Sem responsável, a da profissão da hora de venda; sem ninguém dessa profissão, a média da equipe.
- **Carga da equipe:** ao escolher o responsável e o mês, aparecem as horas dele em orçamentos aprovados mais este, contra a jornada, com aviso escrito quando passa.
- **Lixeira:** excluir manda para a lixeira (menos aprovado), e dá para restaurar. Na lixeira, nada muda.
- **Proposta pronta (ORC-05):** `/orcamentos/:id/proposta`, sem custo nem margem, com "Imprimir ou salvar PDF".

## 7. O que ainda falta (não comece sem eu pedir)

- **Aprovar, enviar e revisar a proposta (ORC-04):** hoje não há botão para mudar a situação.
- **Contrato, cobrança (Pix/boleto) e tarefas automáticas** quando o contrato for assinado e pago: é o ADR-0016, e depende das minhas decisões D1 a D12 (lista no fim do ADR). O responsável de cada serviço já fica guardado para a tarefa nascer com a pessoa certa.
- **Serviços de preço fechado:** RAP, EAS, PRAD, PGRS e a tabela do CAU, que é por área, não por hora.
- **Outros:** deslocamento por faixa de distância, CTF por porte e sugestão automática de horas pelo catálogo.

---

Confirme que leu tudo isto, o `CLAUDE.md` e o ADR-0017. Depois me diga em poucas linhas como entendeu o estado atual e fique esperando meu primeiro pedido.
