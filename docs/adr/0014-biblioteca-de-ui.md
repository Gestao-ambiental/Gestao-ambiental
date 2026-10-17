# ADR-0014: Biblioteca de UI e design system

- **Situação:** aceito (épico 1, tarefa 1.5), 17/10/2026. Revisado no mesmo dia, com a chegada do design system aprovado.
- **Resolve:** "Biblioteca de UI e estratégia de componentes", pendente em 05 · Stack e ADRs

## Contexto

Todas as telas dos épicos 2 a 9 entram no mesmo shell. Um dev só, prazo curto, e requisitos de interface já fixados: tema claro e escuro, WCAG 2.2 AA, celular 375 px, estados vazio/carregando/erro/sem permissão (RNF 2 e 12). O design system "Gestão Ambiental" foi exportado do Claude Design para `docs/design-system/` e é a fonte da verdade visual.

## Decisão

**O visual vem do design system em `docs/design-system`. O shadcn/ui (sobre Radix) é só base de comportamento e acessibilidade.** Tailwind CSS v4 é a forma de aplicar os tokens.

- **Tokens:** `apps/web/src/styles/global.css` importa `docs/design-system/tokens/*.css` direto, sem cópia. Componentes usam os nomes semânticos (`--surface`, `--text`, `--brand`, `--border`, `--lozenge-*`, `--space-*`, `--radius`…), nas classes do Tailwind com a sintaxe `bg-(--surface-selected)`. Tema escuro por `[data-theme="dark"]` no `<html>`, como nos tokens; o claro é o padrão.
- **Tailwind restrito ao design system:** a paleta, as sombras, os raios e a escala de texto padrão do Tailwind estão zerados (`--color-*: initial` etc.). Sobra só o que aponta para os tokens: raio 3px em tudo, sombra apenas `shadow-sobreposicao` (overlay) e `shadow-elevado` (card arrastado), escala `xs` 12 · `sm`/`base` 14 · `lg` 16 · `xl` 20 · `2xl` 24, e os papéis de tipo `titulo-tela`, `titulo-secao`, `corpo`, `corpo-medio`, `rotulo`, `rotulo-maiusculo`.
- **shadcn/ui:** os nomes que os primitivos usam (`background`, `primary`, `border`, `ring`…) apontam para os semânticos do DS. Dos primitivos, ficam só os que trazem comportamento difícil de acertar à mão: menu suspenso (`dropdown-menu`) e gaveta (`sheet`, sobre o Dialog do Radix), reescritos com o visual do DS.
- **Componentes** (`apps/web/src/components/ui`), recriados a partir de `docs/design-system/referencia-componentes`, com nomes em português:

| Referência do DS                             | Aqui                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Icon`                                       | `Icone` (máscara + `currentColor`, SVGs em `src/assets/icons`)                                 |
| `Button`                                     | `Botao`                                                                                        |
| `IconButton`                                 | `BotaoIcone` (rótulo obrigatório)                                                              |
| `Lozenge`                                    | `Selo`                                                                                         |
| `Avatar`                                     | `Avatar`                                                                                       |
| `Skeleton` / `SkeletonRows`                  | `Esqueleto` / `EsqueletoLinhas`                                                                |
| `SectionMessage`                             | `MensagemSecao`                                                                                |
| `TopBar`                                     | `BarraSuperior`                                                                                |
| `SideNav` / `SideNavSection` / `SideNavItem` | `MenuLateral` / `MenuLateralSecao` / `MenuLateralItem`                                         |
| `EmptyState`                                 | `EstadoVazio` (em `components/estados`, com `Carregando`, `EstadoErro`, `SemPermissao`)        |
| `ClientMark` / `ClientCard` / `PieceCard`    | `MarcaEmpreendimento` / `CartaoEmpreendimento` / `CartaoOcorrencia` (quando as telas chegarem) |

## O que não usar

- Hexadecimal, `rgb()` ou cor fora dos tokens do DS no código do app; as primitivas `--af-*` e `--dk-*` direto num componente.
- Outra biblioteca de componentes (MUI, Chakra, Ant, Mantine) ou CSS-in-JS.
- O visual padrão do shadcn como está: todo primitivo novo é restilizado com os tokens antes de entrar.
- Sombra para separar áreas (é linha de 1px), gradiente, imagem de fundo, ilustração, emoji.
- Logo ou `ProductMark`: o nome é "Grama", em texto.
- `lucide-react` ou outro pacote de ícones: só os SVGs do DS, via `Icone`.
- Corpo fora de 14px; nada acima de 24px; maiúscula só no rótulo de 11px.

## Consequências

- Mudança visual é feita em `docs/design-system` (com o export do Claude Design), não no app. O app só reflete os tokens.
- Primitivo novo do shadcn entra com `pnpm dlx shadcn@<versão> add <nome>` a partir de `apps/web`, é revisado (deve importar `cn` de `@/lib/utils` e não instalar pacotes por conta própria) e restilizado com os tokens.
- Pendências herdadas do DS: `--border` tem contraste 1,25:1 (o próprio README registra; campos de formulário vão precisar de `--border-strong` ou equivalente para 3:1) e as faixas de atraso do EQ-03 ainda não têm tons definidos.
