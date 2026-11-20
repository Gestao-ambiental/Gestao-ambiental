# Design system do Grama: "quadro de partidas"

Fonte da verdade visual do app (`apps/web`). Tokens em [`src/styles/tokens.css`](src/styles/tokens.css); utilitários de tipo e o tema do Tailwind em [`src/styles/global.css`](src/styles/global.css). Substitui o Fluent 2 (ADR-0015) e a proposta "Grama Fluent". Não use valores fora dos tokens.

## A ideia

**O prazo é uma partida.** Toda lista de prazos é um quadro de partidas: colunas fixas, número grande do que falta, a linha de hoje acesa. Cores e fontes são as do site **gramaapp.com.br**: papel, tinta preta e o **verde-lima** como única cor de destaque (desde 20/11/2026 não há verde-escuro no sistema). O lima marca o "agora" e a ação principal: botão em pílula, item ativo, hoje, passo atual. Títulos de tela e números do placar em **Anton** caixa alta, como o herói do site; o resto em **Outfit**.

O que isso recusa: cartões de KPI com sombra, selos em pílula colorida em toda linha, cinza neutro em tudo, ícone dentro de quadradinho, prosa cinza de ajuda.

## Regras curtas

1. **Uma ação principal por tela**, à direita do título (`<Pagina acao={…}>`). O resto é botão padrão, sutil ou vai para o menu "…".
2. **Sem sombra em painel.** Painel = folha branca com regra de 1px e raio de 16px. Só o que flutua (menu, diálogo, busca) tem sombra.
3. **Sem cartão dentro de cartão.** Dentro de um painel, separe com regra fina, não com outra caixa.
4. **Estado = palavra + forma.** O `Selo` é uma palavra colorida com uma marca de forma (quadrado, triângulo, losango, círculo). A plaqueta cheia vermelha só para atraso grave.
5. **Número tabular** (`numero`, `numero-contagem`, `numero-grande`) em toda coluna de data, valor, quantidade e documento.
6. **Lima é sinal, não decoração, e sempre preenchimento no claro.** Botão principal, item ativo, hoje, seleção forte (busca), passo atual, seleção de texto, campo do login. No claro o lima sobre o papel tem 1,2:1: nunca é texto, ícone nem linha; ali a marca e o link são tinta. No escuro, o lima pode ser texto, linha e foco.
7. **Sem texto cinza explicativo.** Rótulo, valor, estado, erro e o que falta. Nada de parágrafo de ajuda.
8. **Celular de primeira classe.** Alvos de 44px (`--controle-toque`), barra inferior com Início, Calendário, Campo e Mais; tabelas viram lista no celular.

## Cor

Estratégia: **a do site.** Papel no chão, folha branca no trabalho, areia no trilho, tinta preta em tudo que é texto e marca, lima só no destaque. Cor de estado só onde há estado.

| Token                                 | Claro                      | Escuro                | Uso                                                   |
| ------------------------------------- | -------------------------- | --------------------- | ----------------------------------------------------- |
| `--chao`                              | papel `#faf8f3`            | tinta `#08090b`       | fundo da área de conteúdo                             |
| `--folha`                             | `#ffffff`                  | `#15171a`             | painel, tabela, campo                                 |
| `--trilho`                            | areia `#f0efe9`            | `#111311`             | navegação lateral, faixa do celular                   |
| `--tinta`                             | `#08090b`                  | papel `#faf8f3`       | texto principal (18,8:1 / 18,8:1)                     |
| `--tinta-2`                           | muted `#484e45`            | `#a9ada4`             | texto secundário (8,1:1 / 8,7:1)                      |
| `--tinta-3`                           | `#5f665b`                  | `#8b9086`             | metadado, rótulo de coluna (5,6:1 / 5,5:1)            |
| `--regra` / `--regra-forte`           | line `#d2d6cd` / `#b9beb2` | `#2a2d29` / `#3a3e38` | linhas do quadro                                      |
| `--campo-borda`                       | `#7d8478`                  | `#6b7068`             | contorno de campo (3,6:1 / 3,5:1)                     |
| `--acao`                              | lima `#cdf22b`             | lima `#cdf22b`        | botão principal, com tinta preta (15,5:1)             |
| `--sinal`                             | lima `#cdf22b`             | lima `#cdf22b`        | "agora", sempre com tinta preta                       |
| `--sinal-fundo` / `--escolha`         | `#eef9c4`                  | `#22290b`             | linha de hoje, item selecionado                       |
| `--marca-linha` / `--link` / `--foco` | tinta `#08090b`            | lima `#cdf22b`        | aba ativa, link, anel de foco                         |
| `--atraso-texto`                      | `#b42318`                  | `#ff8b7e`             | atrasado, erro                                        |
| `--alerta-texto`                      | `#8a5300`                  | `#f2b95a`             | vence em breve                                        |
| `--ok-texto`                          | tinta (marca lima)         | lima                  | concluído, vigente: palavra em tinta com bolinha lima |
| `--andamento-texto`                   | `#1d4ed8`                  | `#93b4ff`             | em andamento, espera externa                          |
| `--revisao-texto`                     | `#6d3fc8`                  | `#b9a0ff`             | em conferência                                        |
| `--ia`                                | `#7c4ddb`                  | `#b9a0ff`             | o que a IA propôs (só isso)                           |
| `--estacao-feita`                     | tinta                      | line `#d2d6cd`        | estação concluída da trilha (não é lima)              |
| `--branco`                            | `#ffffff`                  | `#ffffff`             | sempre branco: QR code                                |

Contraste AA conferido com accesslint e axe (color-contrast) no claro e no escuro em Visão, Orçamentos, Ocorrência, Calendário e cadastro de licença: zero violações.

Cada estado tem `-texto`, `-fundo` e, quando precisa, `-borda`. Superfícies: `--toque` (areia, hover), `--aperto` (pedra, pressionado), `--escolha` (lima claro, selecionado), `--off`, `--flutuante`, `--veu`.

**Trilho:** `data-superficie="trilho"` redefine os semânticos para o fundo do trilho. **Login:** o painel do layout público é um campo lima com o logotipo preto (`<MarcaGrama escura />`).

## Tipo

As fontes do site, auto-hospedadas (CSP `font-src 'self'`): **Outfit** variável (`@fontsource-variable/outfit`) em toda a interface e **Anton** (`@fontsource/anton`) só nos destaques: título de tela em caixa alta e números do placar e da coluna "Faltam".

| Utilitário         | Fonte             | Medida         | Peso | Uso                           |
| ------------------ | ----------------- | -------------- | ---- | ----------------------------- |
| `titulo-tela`      | Anton, caixa alta | 34/38, +0,01em | 400  | título da tela (h1)           |
| `titulo-painel`    | Outfit            | 20/26          | 650  | título de painel e diálogo    |
| `titulo-secao`     | Outfit            | 16/22          | 650  | seção, aba                    |
| `corpo`            | Outfit            | 14/20          | 400  | texto e tabela                |
| `corpo-medio`      | Outfit            | 14/20          | 600  | ênfase, rótulo de botão       |
| `rotulo`           | Outfit            | 12/16          | 600  | rótulo de campo, metadado     |
| `rotulo-maiusculo` | Outfit            | 11/16, +0,08em | 650  | cabeçalho de coluna do quadro |
| `numero-contagem`  | Anton             | 26             | 400  | coluna "Faltam"               |
| `numero-grande`    | Anton             | 46             | 400  | placar (contadores)           |
| `numero`           | —                 | —              | —    | só liga os numerais tabulares |

## Espaço, forma, tamanho

- Grade de 4px: `--e-05` 2 · `--e-1` 4 · `--e-15` 6 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 20 · `--e-6` 24 · `--e-8` 32 · `--e-10` 40 · `--e-12` 48 · `--e-16` 64.
- Controle 38px (`--controle`), mini 30px, toque 44px; linha do quadro 48px (`--linha`), densa 40px.
- Raio: `--raio-mini` 4px (plaqueta, contador), `--raio` 10px (campo, item de menu), `--raio-painel` 16px (painel, menu, diálogo), `--raio-redondo` (botões em pílula como no site, botão de ícone, avatar, estação da trilha).
- Trilho 232px; barra superior 60px; conteúdo até 1440px com margem de 32px no desktop e 16px no celular.
- Sombra só em `--sombra-flutuante` e `--sombra-dialogo`.

## Ícones

Phosphor, peso **bold** (MIT), por máscara com `currentColor` (`<Icone nome=… />`). 16px no texto, 18px em botão de ícone, 20px no trilho e na barra inferior, 32px em estado vazio. Lista e correspondência em [`src/assets/icons/LEIA-ME.md`](src/assets/icons/LEIA-ME.md).

## Movimento

Curto, com saída exponencial (`--saida`, `cubic-bezier(0.16, 1, 0.3, 1)`), nunca atrasa um clique. Só onde explica o que aconteceu; nada decorativo em loop (o brilho do esqueleto é o único, e só enquanto carrega).

| Token             | Valor | Uso                                                                   |
| ----------------- | ----- | --------------------------------------------------------------------- |
| `--dur-rapida`    | 120ms | estado: cor, borda, aperto do botão                                   |
| `--dur-media`     | 200ms | menu, diálogo, chegada (`entrar`), estação que acende, check do salvo |
| `--dur-indicador` | 220ms | indicador que desliza: item do menu, segmentado, aba                  |
| `--dur-lenta`     | 360ms | assinatura (`virar-placa`)                                            |
| `--dur-pulso`     | 640ms | pulso lima, só cor, uma vez                                           |

**Microtransições (20/11/2026, "dar vida" sem animação):**

- **Botão:** encolhe para 97% ao apertar; o primário "acende" no hover com um halo lima curto, que some ao apertar.
- **Indicadores que deslizam** (`IndicadorDeslizante`): a plaqueta lima do item atual do menu, o cheio do segmentado e o traço da aba são um elemento só, movido por `transform`. Na primeira medida aparece no lugar; depois desliza.
- **Trilha:** a estação nova se preenche de lima ao avançar (`acender`).
- **Chegadas:** mensagens e o corpo da etapa entram com fade e 4px (`entrar`); linhas de tabela novas com fade curto, sem mexer embaixo do ponteiro.
- **Menus e popovers** abrem de onde foram chamados (`transform-origin` do Radix, 97% → 100%) e fecham mais rápido; diálogo centrado abre do centro.
- **Pulso lima** (`pulso-lima`): o "vence hoje" da Visão ao chegar. Só cor.
- **Salvo:** `ConfirmacaoSalva`, check lima que aparece de 60% sem quicar, com o texto em `role="status"`.

**Movimento-assinatura:** `virar-placa`, o número da coluna "Faltam" sobe e se revela como plaqueta de painel ao chegar, em cascata de 28ms por linha. Uma vez, na chegada.

**Movimento reduzido:** `prefers-reduced-motion` zera as durações e tira `entrar`, `marcar`, `virar-placa` e o brilho do esqueleto; a estação da trilha só troca de cor e o pulso lima fica (é só cor). A busca Ctrl+K abre sem animação. Os testes (jsdom) não rodam CSS: nada depende de tempo.

## Componentes

| Componente            | Arquivo                                             | Notas                                                                                                                                             |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Casca                 | `app/layout/AppShell.tsx`                           | trilho de areia (desktop), faixa de areia + barra inferior (celular), busca Ctrl+K                                                                |
| Página                | `app/paginas/Pagina.tsx`                            | `titulo`, `acao`, `meta`, `voltar`                                                                                                                |
| Botão                 | `components/ui/botao.tsx`                           | pílula; `primario` (lima + tinta), `padrao`, `sutil`, `perigo`, `link`; `compacto`; `selecionado`                                                 |
| Botão de ícone        | `components/ui/botao-icone.tsx`                     | nome acessível obrigatório; 44px no celular                                                                                                       |
| Situação              | `components/ui/selo.tsx`                            | palavra + forma; `perigoForte` = plaqueta cheia                                                                                                   |
| Campo                 | `components/ui/campo-texto.tsx`, `estilos-campo.ts` | `classeCampo`, `classeSelecao`, `classeAreaTexto` para nativos                                                                                    |
| Trilha                | `components/ui/trilha.tsx`                          | linha de trajeto: estação cheia `--estacao-feita` (feito), lima com aro (atual), vazada + tracejado (futuro); `podeEscolher`, `compactaNoCelular` |
| Placar                | `components/ui/placar.tsx`                          | `Placar` + `ItemDoPlacar`: faixa única, número de 40px; botão quando filtra                                                                       |
| Segmentado            | `components/ui/segmentado.tsx`                      | grupo colado, selecionado em tinta cheia; um só desenho no app                                                                                    |
| Contagem              | `app/paginas/visao/Contagem.tsx`                    | coluna "Faltam" do quadro                                                                                                                         |
| Mensagem              | `components/ui/mensagem-secao.tsx`                  | faixa no fundo do estado, sem borda                                                                                                               |
| Estados               | `components/estados/*`                              | vazio (ícone 32 + título), carregando (esqueleto 48px), erro, sem permissão                                                                       |
| Menu, diálogo, gaveta | `dropdown-menu.tsx`, `dialogo.tsx`, `sheet.tsx`     | diálogo sobe do rodapé no celular                                                                                                                 |

## Padrões de tela

- **Quadro (lista de prazos, documentos, MTRs):** painel com regra de 1px; cabeçalho em `rotulo-maiusculo`; linhas de 48px com regra leve; primeira coluna é o que se escaneia (contagem, data, número do documento) em numeral tabular; hover em `--toque`; linha de hoje em `--sinal-fundo`. Paginação "1–20 de 54" no rodapé. No celular, cada linha vira item com a contagem à esquerda.
- **Placar (contadores que filtram):** uma faixa só, dividida por regras, número de 40px e rótulo embaixo; ativo com fundo `--escolha` e traço de 3px embaixo. Não são cartões soltos.
- **Abas:** texto 16/700, ativa com traço de 3px `--marca-linha`, contagem em plaqueta escura. Contagem zerada não aparece.
- **Situação longa:** a plaqueta cheia mostra o rótulo curto ("Vencida", "Protocolo vencido"); os dias ficam na coluna "Faltam" e o rótulo completo vai para o leitor de tela.
- **Sem sigla em linha:** o nome do empreendimento já identifica; nada de quadradinho de iniciais repetido em toda linha.
- **Detalhe:** título grande com o número do documento, linha `meta` com órgão e situação, conteúdo em coluna e dados laterais sem caixa.
- **Formulário:** rótulo em cima, campo de 36px, erro em vermelho forte embaixo, ação principal no fim à direita (no celular, largura total).
