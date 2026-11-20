# Design system do Grama: "quadro de partidas"

Fonte da verdade visual do app (`apps/web`). Tokens em [`src/styles/tokens.css`](src/styles/tokens.css); utilitários de tipo e o tema do Tailwind em [`src/styles/global.css`](src/styles/global.css). Substitui o Fluent 2 (ADR-0015) e a proposta "Grama Fluent". Não use valores fora dos tokens.

## A ideia

**O prazo é uma partida.** Toda lista de prazos é um quadro de partidas de rodoviária: colunas fixas, número grande do que falta, a linha de hoje acesa. A casca é a **placa verde de rodovia** (verde-placa, letra branca, Overpass, desenhada a partir da letra das placas) e o **sinal verde-lima** do logotipo marca o "agora": item ativo, hoje, seleção, passo atual.

O que isso recusa: cartões de KPI com sombra, selos em pílula colorida em toda linha, cinza neutro em tudo, ícone dentro de quadradinho, prosa cinza de ajuda.

## Regras curtas

1. **Uma ação principal por tela**, à direita do título (`<Pagina acao={…}>`). O resto é botão padrão, sutil ou vai para o menu "…".
2. **Sem sombra em painel.** Painel = folha branca com regra de 1px e raio de 10px. Só o que flutua (menu, diálogo, busca) tem sombra.
3. **Sem cartão dentro de cartão.** Dentro de um painel, separe com regra fina, não com outra caixa.
4. **Estado = palavra + forma.** O `Selo` é uma palavra colorida com uma marca de forma (quadrado, triângulo, losango, círculo). A plaqueta cheia vermelha só para atraso grave.
5. **Número tabular** (`numero`, `numero-contagem`, `numero-grande`) em toda coluna de data, valor, quantidade e documento.
6. **Lima é sinal, não decoração.** Só em: item ativo da navegação, hoje, seleção forte (busca), passo atual, seleção de texto, botão principal no tema escuro.
7. **Sem texto cinza explicativo.** Rótulo, valor, estado, erro e o que falta. Nada de parágrafo de ajuda.
8. **Celular de primeira classe.** Alvos de 44px (`--controle-toque`), barra inferior com Início, Calendário, Campo e Mais; tabelas viram lista no celular.

## Cor

Estratégia: **comprometida na casca, contida no trabalho.** O trilho é verde; a folha é branca; cor de estado só onde há estado.

| Token                       | Claro                 | Escuro                | Uso                                        |
| --------------------------- | --------------------- | --------------------- | ------------------------------------------ |
| `--chao`                    | `#f5f8f5`             | `#0b1410`             | fundo da área de conteúdo                  |
| `--folha`                   | `#ffffff`             | `#121e19`             | painel, tabela, campo                      |
| `--trilho`                  | `#0b4632`             | `#0e2a20`             | navegação lateral, faixa do celular        |
| `--tinta`                   | `#0f1f18`             | `#e7efe9`             | texto principal (17:1 / 16:1)              |
| `--tinta-2`                 | `#3f5047`             | `#a7b7ad`             | texto secundário (8,6:1 / 8,9:1)           |
| `--tinta-3`                 | `#5b6b62`             | `#8a9b91`             | metadado, rótulo de coluna (5,6:1 / 5,9:1) |
| `--regra` / `--regra-forte` | `#d9e1dc` / `#b4c0b8` | `#20302a` / `#2c3d35` | linhas do quadro                           |
| `--campo-borda`             | `#7a8a81`             | `#6b7d73`             | contorno de campo (3,6:1)                  |
| `--acao`                    | verde-placa `#0e5a3f` | lima `#e5ff73`        | botão principal                            |
| `--sinal`                   | lima `#e5ff73`        | lima `#e5ff73`        | "agora" (tinta escura sobre ele, 15:1)     |
| `--sinal-fundo`             | `#f0ffb3`             | `#26330f`             | linha de hoje                              |
| `--atraso-texto`            | `#b42318`             | `#ff8b7e`             | atrasado, erro (6,6:1 / 7,5:1)             |
| `--alerta-texto`            | `#8a5300`             | `#f2b95a`             | vence em breve                             |
| `--ok-texto`                | `#0e6b45`             | `#7dd9a8`             | concluído, vigente                         |
| `--andamento-texto`         | `#1d4ed8`             | `#93b4ff`             | em andamento, espera externa               |
| `--revisao-texto`           | `#6d3fc8`             | `#b9a0ff`             | em conferência                             |
| `--ia`                      | `#7c4ddb`             | `#b9a0ff`             | o que a IA propôs (só isso)                |

Cada estado tem `-texto`, `-fundo` e, quando precisa, `-borda`. Superfícies de interação: `--toque` (hover), `--aperto` (pressionado), `--escolha` / `--escolha-toque` (selecionado), `--off` (desabilitado), `--flutuante`, `--veu`.

**Trilho:** `data-superficie="trilho"` redefine os semânticos (tinta branca, toque translúcido, foco lima). Qualquer componente posto no trilho se ajusta sozinho.

## Tipo

**Overpass** (variável, auto-hospedada via `@fontsource-variable/overpass`; CSP `font-src 'self'`). Uma família só, em várias medidas e pesos: o espécime manda.

| Utilitário         | Medida         | Peso | Uso                           |
| ------------------ | -------------- | ---- | ----------------------------- |
| `titulo-tela`      | 28/32, −0,02em | 800  | título da tela (h1)           |
| `titulo-painel`    | 20/26          | 750  | título de painel e diálogo    |
| `titulo-secao`     | 16/22          | 700  | seção, aba                    |
| `corpo`            | 14/20          | 400  | texto e tabela                |
| `corpo-medio`      | 14/20          | 650  | ênfase, rótulo de botão       |
| `rotulo`           | 12/16          | 650  | rótulo de campo, metadado     |
| `rotulo-maiusculo` | 11/16, +0,08em | 750  | cabeçalho de coluna do quadro |
| `numero-contagem`  | 22             | 800  | coluna "Faltam"               |
| `numero-grande`    | 40             | 800  | placar (contadores)           |
| `numero`           | —              | —    | só liga os numerais tabulares |

## Espaço, forma, tamanho

- Grade de 4px: `--e-05` 2 · `--e-1` 4 · `--e-15` 6 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 20 · `--e-6` 24 · `--e-8` 32 · `--e-10` 40 · `--e-12` 48 · `--e-16` 64.
- Controle 36px (`--controle`), mini 28px, toque 44px; linha do quadro 48px (`--linha`), densa 40px.
- Raio: `--raio-mini` 3px (plaqueta, contador), `--raio` 6px (controle), `--raio-painel` 10px (painel, menu, diálogo), `--raio-redondo` (avatar, estação da trilha).
- Trilho 232px; barra superior 56px; conteúdo até 1440px com margem de 32px no desktop e 16px no celular.
- Sombra só em `--sombra-flutuante` e `--sombra-dialogo`.

## Ícones

Phosphor, peso **bold** (MIT), por máscara com `currentColor` (`<Icone nome=… />`). 16px no texto, 18px em botão de ícone, 20px no trilho e na barra inferior, 32px em estado vazio. Lista e correspondência em [`src/assets/icons/LEIA-ME.md`](src/assets/icons/LEIA-ME.md).

## Movimento

Curto, com saída exponencial (`--saida`), nunca atrasa um clique: `--dur-rapida` 120ms (estado), `--dur-media` 200ms (menu, diálogo), `--dur-lenta` 360ms (assinatura). Botão afunda 1px ao apertar.

**Movimento-assinatura:** `virar-placa`, o número da coluna "Faltam" sobe e se revela como plaqueta de painel ao chegar, em cascata de 28ms por linha. Uma vez, na chegada. `prefers-reduced-motion` zera as durações.

## Componentes

| Componente            | Arquivo                                             | Notas                                                                                      |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Casca                 | `app/layout/AppShell.tsx`                           | trilho verde (desktop), faixa verde + barra inferior (celular), busca Ctrl+K               |
| Página                | `app/paginas/Pagina.tsx`                            | `titulo`, `acao`, `meta`, `voltar`                                                         |
| Botão                 | `components/ui/botao.tsx`                           | `primario`, `padrao`, `sutil`, `perigo`, `link`; `compacto`; `selecionado`                 |
| Botão de ícone        | `components/ui/botao-icone.tsx`                     | nome acessível obrigatório; 44px no celular                                                |
| Situação              | `components/ui/selo.tsx`                            | palavra + forma; `perigoForte` = plaqueta cheia                                            |
| Campo                 | `components/ui/campo-texto.tsx`, `estilos-campo.ts` | `classeCampo`, `classeSelecao`, `classeAreaTexto` para nativos                             |
| Trilha                | `components/ui/trilha.tsx`                          | linha de trajeto: estação cheia (feito), lima com aro (atual), vazada + tracejado (futuro) |
| Contagem              | `app/paginas/visao/Contagem.tsx`                    | coluna "Faltam" do quadro                                                                  |
| Mensagem              | `components/ui/mensagem-secao.tsx`                  | faixa no fundo do estado, sem borda                                                        |
| Estados               | `components/estados/*`                              | vazio (ícone 32 + título), carregando (esqueleto 48px), erro, sem permissão                |
| Menu, diálogo, gaveta | `dropdown-menu.tsx`, `dialogo.tsx`, `sheet.tsx`     | diálogo sobe do rodapé no celular                                                          |

## Padrões de tela

- **Quadro (lista de prazos, documentos, MTRs):** painel com regra de 1px; cabeçalho em `rotulo-maiusculo`; linhas de 48px com regra leve; primeira coluna é o que se escaneia (contagem, data, número do documento) em numeral tabular; hover em `--toque`; linha de hoje em `--sinal-fundo`. Paginação "1–20 de 54" no rodapé. No celular, cada linha vira item com a contagem à esquerda.
- **Placar (contadores que filtram):** uma faixa só, dividida por regras, número de 40px e rótulo embaixo; ativo com fundo `--escolha` e traço de 3px embaixo. Não são cartões soltos.
- **Abas:** texto 16/700, ativa com traço de 3px `--marca-linha`, contagem em plaqueta escura.
- **Detalhe:** título grande com o número do documento, linha `meta` com órgão e situação, conteúdo em coluna e dados laterais sem caixa.
- **Formulário:** rótulo em cima, campo de 36px, erro em vermelho forte embaixo, ação principal no fim à direita (no celular, largura total).
