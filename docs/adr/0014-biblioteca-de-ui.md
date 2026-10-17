# ADR-0014: Biblioteca de UI e design tokens

- **Situação:** aceito (épico 1, tarefa 1.5), 17/10/2026
- **Resolve:** "Biblioteca de UI e estratégia de componentes", pendente em 05 · Stack e ADRs

## Contexto

Todas as telas dos épicos 2 a 9 entram no mesmo shell. Um dev só, prazo curto, e requisitos de interface já fixados: tema claro e escuro, WCAG 2.2 AA, celular 375 px, estados vazio/carregando/erro/sem permissão, tokens visuais do protótipo como referência (RNF 2 e 12).

## Decisão

**Tailwind CSS v4 + shadcn/ui**, sobre primitivos do Radix (`radix-ui`) e ícones `lucide-react`.

- **Tailwind:** estilo junto do componente, sem CSS global crescendo por tela. Os tokens são variáveis CSS em `apps/web/src/styles/global.css` (`:root` e `.dark`), mapeados no `@theme`; trocar o tema troca as variáveis, não as classes.
- **shadcn/ui:** o código dos componentes é copiado para `apps/web/src/components/ui` e fica nosso. Não há dependência de versão de um "kit" fechado. O Radix entrega teclado, foco e ARIA de menus, diálogos e gavetas, que são a parte difícil de acertar à mão.
- **Tokens (provisórios):** marca `#176b55` e neutros do protótipo (doc 09 §9.2), cores semânticas de prazo do `style.css` do protótipo. Todos os pares usados passam AA nos dois temas (texto 4,5:1; foco e borda de campo 3:1). Viram definitivos quando o design system do Grama for fechado.
- **Componentes de estado** (`src/components/estados`): `EstadoVazio`, `Carregando`, `EstadoErro`, `SemPermissao`. Toda tela usa estes, não variações próprias.

## O que não usar

- Outra biblioteca de componentes (MUI, Chakra, Ant, Mantine) ou CSS-in-JS: dois sistemas de estilo no mesmo app.
- Cor fixa em classe (`bg-green-700`, `text-[#176b55]`): sempre o token (`bg-primary`, `text-prazo-31-ou-mais`).
- Cor como única informação: estado sempre com texto (ex.: ponto + "Atrasada há 9 dias").
- Texto de conteúdo abaixo de 15 px; texto auxiliar abaixo de 14 px (`text-xs` não é para conteúdo).
- Emoji na interface; fonte externa (a CSP só libera o próprio domínio); `<script>` inline (idem).
- Componente gerado pela CLI do shadcn sem revisão: ela deve importar `cn` de `@/lib/utils`, e não instalar pacotes por conta própria.

## Consequências

- Componente novo do shadcn entra com `pnpm dlx shadcn@<versão> add <nome>` a partir de `apps/web` e passa pelo mesmo lint estrito.
- Tema escuro é paleta própria (não inversão). Toda tela nova é conferida nos dois temas e em 375 px (DoD item 9).
- O axe roda nos testes do shell; contraste é conferido nos tokens, porque o jsdom não calcula layout.
