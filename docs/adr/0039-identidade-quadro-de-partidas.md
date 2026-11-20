# ADR-0039: Identidade "quadro de partidas"

- Situação: proposta (camada `camada/identidade-nova`)
- Data: 20/11/2026
- Substitui: ADR-0015 (Fluent 2) no que toca ao visual; descarta a proposta Grama Fluent (ADR-0038, camada `camada/grama-fluent`)

## Contexto

As duas reformulações anteriores (UI limpa e Grama Fluent) foram recusadas pelo Eduardo por parecerem feitas por IA: cartões, selos e cinzas demais, hierarquia fraca. O pedido foi um design system do zero, simples e visual, para um público geração Z, mantendo todas as funções.

## Decisão

- Direção "quadro de partidas": o prazo é uma partida; listas de prazo são quadros com a coluna "Faltam" em numeral grande e a linha de hoje acesa.
- Casca em verde de placa de rodovia (trilho lateral; faixa verde no celular) com o verde-lima do logotipo como sinal do "agora".
- Overpass (auto-hospedada) como família única; ícones Phosphor bold.
- Tokens próprios em `apps/web/src/styles/tokens.css`, documentados em `apps/web/DESIGN.md`. Os tokens do Fluent em `docs/design-system/tokens` deixam de ser importados.
- Estado = palavra + forma (sem pílula); painel sem sombra; uma ação principal por tela.
- Celular: barra inferior com Início, Calendário, Campo e Mais.

## Consequências

- Todo componente usa só os semânticos novos (`--folha`, `--tinta`, `--acao`, `--sinal`, `--atraso-texto`, `--e-*`…).
- A direção foi sorteada pela Impeccable (seed fdd45b1a4337b553) sem entrevista com o Eduardo; ele valida pela prévia `novo.grama-teste.pages.dev`.
