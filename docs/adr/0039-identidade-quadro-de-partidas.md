# ADR-0039: Identidade "quadro de partidas"

- Situação: proposta (camada `camada/identidade-nova`)
- Data: 20/11/2026
- Substitui: ADR-0015 (Fluent 2) no que toca ao visual; descarta a proposta Grama Fluent (ADR-0038, camada `camada/grama-fluent`)

## Contexto

As duas reformulações anteriores (UI limpa e Grama Fluent) foram recusadas pelo Eduardo por parecerem feitas por IA: cartões, selos e cinzas demais, hierarquia fraca. O pedido foi um design system do zero, simples e visual, para um público geração Z, mantendo todas as funções.

## Decisão

- Direção "quadro de partidas": o prazo é uma partida; listas de prazo são quadros com a coluna "Faltam" em numeral grande e a linha de hoje acesa.
- Casca em papel e areia com o verde-lima como sinal do "agora" (ver a revisão abaixo).
- Ícones Phosphor bold; fontes e cores do site (ver a revisão abaixo).
- Tokens próprios em `apps/web/src/styles/tokens.css`, documentados em `apps/web/DESIGN.md`. Os tokens do Fluent em `docs/design-system/tokens` deixam de ser importados.
- Estado = palavra + forma (sem pílula); painel sem sombra; uma ação principal por tela.
- Celular: barra inferior com Início, Calendário, Campo e Mais.

## Consequências

- Todo componente usa só os semânticos novos (`--folha`, `--tinta`, `--acao`, `--sinal`, `--atraso-texto`, `--e-*`…).
- A direção foi sorteada pela Impeccable (seed fdd45b1a4337b553) sem entrevista com o Eduardo; ele valida pela prévia `novo.grama-teste.pages.dev`.

## Revisão de 20/11/2026: cores e fontes do site

A pedido do Eduardo ("aplica no sistema as cores do site, com as mesmas fontes, exclui esse verde esgoto e deixa só o verde lima"):

- O verde-escuro de placa sai de todo o sistema. Cores do gramaapp.com.br: papel `#faf8f3`, tinta `#08090b`, lima `#cdf22b` (única cor de destaque), muted `#484e45`, line `#d2d6cd`, areia, céu e pedra nas superfícies. No escuro, a tinta é o fundo e o lima segue de destaque.
- Fontes do site: Outfit em toda a interface; Anton em caixa alta só no título de tela e nos números do placar e da coluna "Faltam". A Overpass sai.
- Botões em pílula com lima e tinta, como no site; logotipo, símbolo e favicon recoloridos com a tinta, o lima e o papel do site.
- No claro, o lima é sempre preenchimento (1,2:1 sobre o papel); marca, link e foco são tinta.
