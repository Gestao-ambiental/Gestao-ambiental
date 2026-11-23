# Botões e campos: hierarquia e medidas

Regra de uso dos componentes que já existem (`Botao`, `BotaoIcone`, `BotaoMais`, `classeCampo`). O visual mora nos componentes; este documento diz **qual usar onde**. Em divergência com o README, valem as medidas daqui: são as do código (`apps/web/src/styles/tokens.css`).

## 1. Hierarquia de botões

| Nível | Componente | Aparência | Quando usar | Quantos |
|---|---|---|---|---|
| 1. Primário | `Botao aparencia="primario"` | verde-escuro cheio, texto branco | A ação que conclui o propósito da tela ou do diálogo: Salvar, Criar, Enviar, Confirmar | **Um** por tela visível e um por diálogo |
| 2. Secundário | `Botao` (padrão) | contorno | Alternativa ao primário ou ação de processo: Ver proposta, Cancelar, Marcar como enviada | Até três numa barra; acima disso, vão para o menu `…` |
| 3. Terciário | `Botao aparencia="sutil"` | sem borda, preenche no hover | Ação dentro de uma seção (Escolher modelo, Filtrar) | Livre, desde que não fique ao lado do primário |
| 4. Link | `Botao aparencia="link"` | texto verde | Acrescentar linha (Adicionar item), ir a outra tela no meio do texto | Livre |
| Ícone | `BotaoIcone` | quadrado, sem texto | Ação de linha (remover, editar) e barras de ferramentas. `rotulo` obrigatório | Um por ação de linha |
| Menu | `BotaoMais` (`…`) | ícone | Ações raras: duplicar, salvar como modelo, arquivar, excluir | Um por tela ou por linha |
| Perigo | `Botao aparencia="perigo"` | vermelho cheio | **Só** no botão de confirmar dentro do diálogo de algo destrutivo | O gatilho (Excluir, Remover) fica no menu `…` ou num `BotaoIcone`; nunca vermelho cheio solto na tela |

### Regras

1. **Um primário por vez.** Telas com estados diferentes podem trocar qual botão é o primário, mas nunca mostram dois ao mesmo tempo.
2. **Ordem na barra de ações:** `[…] [secundários] [primário]`. O primário fica sempre na ponta direita (no celular, por último na pilha e em largura total).
3. **Primário sem nada a fazer some de destaque.** Exemplo: Salvar sem alterações aparece como "Salvo" (`ConfirmacaoSalva`), não como botão verde apagado. Um primário desabilitado e cinza parece quebrado e rouba a hierarquia do secundário ao lado.
4. **Ações de mudança de situação** (enviar, aprovar, recusar) são secundárias e ficam na mesma barra de ações do cabeçalho. Quando não há alteração pendente, a próxima situação natural pode virar o primário.
5. **Mesma linha, mesmo tamanho.** Nunca misturar `padrao` (38px) e `compacto` (30px) lado a lado.
6. **Botão cru é proibido.** Todo `<button>` vem de `Botao`, `BotaoIcone` ou `BotaoMais`. Exceção: a linha inteira clicável de uma lista ou tabela, que precisa de `:focus-visible`.
7. **Rótulo é verbo + objeto curto** ("Adicionar item", "Ver proposta pronta"). Sem "Clique aqui", sem ponto final.

## 2. Tamanhos

| Token | Medida | Uso |
|---|---|---|
| `--controle` | 38px | Botão, campo e seleção padrão |
| `--controle-mini` | 30px | `tamanho="compacto"`: só em barras densas (cabeçalho de tabela, filtros em chip) |
| `--controle-toque` | 44px | Mínimo no celular (já aplicado pelos componentes) |
| `--linha` | 48px | Linha de tabela |

Altura fixa escrita à mão (`h-9`, `h-10`, `h-[40px]`) não entra. Use os tokens.

## 3. Campos

1. **Uma altura só.** Input e seleção usam `classeCampo` (38px, 44 no celular). A área de texto que cresce (`[field-sizing:content]`) começa com 38px.
2. **Largura pelo conteúdo, não pela grade.**

   | Conteúdo | Largura |
   |---|---|
   | Quantidade, horas, dias | 96px (`w-24`) |
   | Reais | 160px (`w-40`) |
   | Data | 160px |
   | Seleção | a da opção mais longa, até 240px (`classeSelecao`) |
   | Nome, descrição | ocupa o que sobra |

   Um campo de "Quantidade de visitas" do tamanho de um terço da tela é erro.
3. **Números à direita, texto à esquerda**, com `numero` (algarismos tabulares).
4. **Rótulo em cima**, a 4px do campo (`CampoRotulado`, `CampoTexto`). Em tabela, o rótulo é o cabeçalho da coluna e o campo leva `aria-label`.
5. **Placeholder** só mostra o formato ("1h30", "dd/mm/aaaa") e nunca imita um valor preenchido nem um campo desabilitado. Se o campo vazio parece cinza e travado, troque o placeholder por nada.
6. **Desabilitado** é `disabled` de verdade (fundo `--off`), com o motivo no `title` quando não for óbvio.

## 4. Alinhamento

1. **Mesmo recuo dentro do quadro.** Título da seção, campos, tabelas e o link "Adicionar" usam o mesmo recuo lateral (`--e-4`). Recuos diferentes (12px num bloco, 16 no outro) fazem os campos "andarem" entre seções.
2. **Tabela com campo que cresce fica no topo.** Se uma célula pode ter mais de uma linha (nome do serviço), todas as células da linha usam `align-top`, e o texto solto (custo, preço) usa `leading-(--controle)` para ficar na altura do controle ao lado.
3. **Cartão lateral fixo começa alinhado ao conteúdo, não ao cabeçalho.** O resumo de valores (preço, custo) é `sticky`, mas o topo dele coincide com o topo do primeiro quadro, não com a trilha de etapas.
4. **Grade de campos** usa colunas iguais só quando os campos têm o mesmo tipo de conteúdo; senão, use `flex` com as larguras da tabela acima.

## 5. Inventário (23/11/2026)

Levantamento no código de `camada/beta-integrado` (d95d067). É lista para conferir tela a tela, não para trocar por busca e substituição.

| Achado | Onde | Situação |
|---|---|---|
| Células no meio com nome de serviço que cresce | Orçamento, tabela de serviços | Corrigido neste PR |
| Resumo de valores começando na altura da trilha | Orçamento | Corrigido neste PR |
| Recuo 12px no conteúdo e 16px no título | Orçamento, todas as seções | Corrigido neste PR |
| Coluna de horas estreita (80px) | Orçamento | Corrigido neste PR (96px) |
| Mais de um primário no mesmo arquivo (conferir se aparecem juntos) | PaginaConvite (6), GravarNaLicenca, PaginaRelatorio, PainelAgora, PaginaImportacao, PaginaDetalheVistoria (4 cada), PassoCondicionantes, PaginaExigencia, PaginaFoto, PaginaPlanoRenovacao, PaginaRedefinirSenha (3 cada) | Conferido (PR do app, 23/11): corrigidos Visão da equipe, Triagem, Ocorrência, Condicionantes, Plano de renovação, Minhas vistorias e Relatório; os demais já tinham um primário por estado. Resta: ocorrência com etapa pendente e arquivo escolhido mostra dois verdes |
| `<button>` cru fora dos componentes | 20 arquivos (BuscaGlobal, PaginaCalendario, PaginaTriagem, PaginaMinhaSemana, PaginaVisaoEquipe, TabelaLicencas e outros) | A conferir: linha clicável pode ficar |
| Altura escrita à mão | 28 ocorrências: PassoCondicionantes (5), PaginaVisaoEquipe, PaginaMinhasVistorias, PaginaChecklist, PaginaCalendario (4 cada) e outras | Trocado nos controles (campo, calendário, condicionantes, campo de data). Ficam cabeçalhos de tabela, células, logo e abas (o componente Abas usa 44px) |
| Salvar primário desabilitado e cinza ao lado de "Ver proposta" | Orçamento, cabeçalho | Corrigido neste PR: sem alteração, aparece "Salvo" |
| Dois primários (Salvar e "Continuar para…") com alteração pendente | Orçamento | Corrigido neste PR: com o Salvar à vista, o Continuar vira secundário |
| "Escolher modelo" com contorno no título da seção | Orçamento | Corrigido neste PR: terciário (sutil) |
| "Mudar situação" numa segunda linha, em tamanho compacto | Orçamento | Proposta: levar para a barra do cabeçalho (regra 1.4) |
| Campos de visitas em grade de três colunas iguais | Orçamento | Corrigido neste PR: 160px cada |
| README diz botão de 32px; o código usa 38px | docs/design-system/README.md | Corrigido neste PR |

### Rodada do app inteiro (23/11/2026)

- **Salvar por seção** (Perfil, Dados da proposta, Relatório): o botão só aparece com alteração; depois de salvar, "Salvo".
- **Detalhes do serviço** saiu do editor de orçamento (pedido do Eduardo): outros custos e ART/RRT por serviço não são mais editados ali; os valores gravados continuam.
- **Ações de "acrescentar linha"** (Adicionar pessoa, conta, faixa) seguem como link de 22px, pela regra 1. Os atalhos "Digitar o custo da hora" e "Detalhar contas do mês" viraram sutil (38px).
