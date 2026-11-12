# ADR-0015: Fluent 2 como design system do Grama

- **Situação:** proposto em 11/11/2026, a pedido do Eduardo. Implementado na branch `chore/fluent-2` (opção A). Vale quando o PR for revisado e aceito.
- **Substitui:** a parte visual da [ADR-0014](0014-biblioteca-de-ui.md), que adota a "direção Jira" com raio de 3px, separação por linha e paleta AgroFuturo. O comportamento continua: Tailwind v4, Radix/shadcn para acessibilidade e componentes com nomes em português.

## Contexto

O Eduardo quer o Grama na linguagem do **Fluent 2** da Microsoft:

- superfícies em camadas, com elevação;
- cantos suavemente arredondados;
- bordas sutis;
- estados interativos bem definidos;
- verde ambiental como cor de marca;
- selos semânticos (sucesso para pago, alerta para pendente).

O app já tem cerca de 19 componentes em `apps/web/src/components/ui`. Todos consomem tokens semânticos (`--surface`, `--text`, `--brand`, `--border`, `--lozenge-*`…), em vez de cores soltas. Por isso, a troca de visual se concentra em dois lugares: os tokens e esses componentes.

Misturar não é opção: uma tela em Fluent 2 e o resto em Jira produziria um app com duas linguagens. A troca é do app inteiro, numa fatia própria.

## Opções

|                | A. Linguagem Fluent 2 sobre os nossos componentes (recomendada)              | B. Biblioteca oficial `@fluentui/react-components` (v9)                          |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Visual         | Fiel aos tokens oficiais, gerados do pacote `@fluentui/tokens`               | Fiel por definição                                                               |
| Acessibilidade | A que já temos (Radix), mais os testes atuais                                | Pronta, inclusive o `DataGrid` com navegação por teclado                         |
| Custo          | Uma fatia: tokens, mais a reestilização dos ~19 componentes; as telas herdam | Reescrever todos os componentes e telas                                          |
| Conflitos      | Nenhum com a stack atual                                                     | CSS-in-JS (Griffel) convivendo com Tailwind, que a ADR-0014 proíbe; pacote maior |

**Recomendação: A.** Ela respeita a stack que o próprio pedido cita (React, TypeScript e Tailwind "no padrão Fluent UI") e cabe para um dev só. Se um dia o app precisar de componentes muito complexos, como grade editável ou calendário, a biblioteca oficial pode entrar só para eles, com nova ADR.

## Decisão proposta (opção A)

### Tokens

- **Fonte dos valores:** um script `scripts/gerar-tokens-fluent.ts` lê `webLightTheme` e `webDarkTheme` de `@fluentui/tokens` (dependência só de desenvolvimento) e gera `docs/design-system/tokens/fluent.css` com as variáveis oficiais (`--colorNeutralBackground1`, `--shadow4`, `--borderRadiusMedium`…). Nenhum hexadecimal é digitado à mão.
- **Marca verde:** uma rampa de 16 tons (10 a 160), gerada com `createLightTheme` e `createDarkTheme` a partir de uma cor-chave verde-floresta. A cor-chave é decisão do Eduardo; ponto de partida sugerido: `#1B6B3A`, que dá cerca de 6,5:1 com texto branco.
  - Regra: o tom 80 (fundo do botão primário no claro) tem de passar 4,5:1 com branco.
  - No escuro, o primário usa o tom que passar 4,5:1 com o texto escuro.
- **Os semânticos continuam e mudam de valor.** Os nomes de hoje passam a apontar para os tokens Fluent, e as telas não mudam:

| Semântico do Grama                              | Token Fluent 2                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `--page`                                        | `colorNeutralBackground2`                                             |
| `--surface`                                     | `colorNeutralBackground1`                                             |
| `--surface-hover`                               | `colorNeutralBackground1Hover`                                        |
| `--surface-selected`                            | `colorBrandBackground2`                                               |
| `--text`                                        | `colorNeutralForeground1`                                             |
| `--text-subtle`                                 | `colorNeutralForeground3`                                             |
| `--text-link`                                   | `colorBrandForegroundLink`                                            |
| `--border`                                      | `colorNeutralStroke2`                                                 |
| `--border-strong`                               | `colorNeutralStroke1`                                                 |
| `--brand` / `--brand-hover` / `--brand-pressed` | `colorBrandBackground` / `…Hover` / `…Pressed`                        |
| `--lozenge-success-*`                           | `colorStatusSuccessBackground1` / `colorStatusSuccessForeground1`     |
| `--lozenge-warning-*`                           | `colorStatusWarningBackground1` / `colorStatusWarningForeground1`     |
| `--lozenge-danger-*`                            | `colorStatusDangerBackground1` / `colorStatusDangerForeground1`       |
| `--lozenge-inprogress-*`                        | `colorBrandBackground2` / `colorBrandForeground2`                     |
| foco                                            | `colorStrokeFocus2` (anel de 2px) + `colorStrokeFocus1` (1px interno) |

- **Forma e elevação:**
  - Raio de 4px (`borderRadiusMedium`) em controles e de 8px (`borderRadiusXLarge`) em cartões e diálogos.
  - Sombras `shadow2` e `shadow4` em cartões, `shadow16` em menus e popovers, `shadow64` em diálogos.
  - A regra "separar áreas só por linha" deixa de valer para cartões; linha continua separando linhas de tabela.
- **Tipografia:**
  - Pilha de sistema do Fluent web: `"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif`. A Segoe UI não pode ser servida como fonte web, e a pilha de sistema não baixa nada. Inter só entraria se o Eduardo quiser a mesma letra em todos os aparelhos.
  - Escala Fluent: `caption1` 12/16, `body1` 14/20 (corpo, igual ao CLAUDE.md), `subtitle2` 16/22, `subtitle1` 20/28, `title3` 24/32.
- **Espaço e movimento:**
  - Espaçamento em 2, 4, 8, 12, 16, 20, 24 e 32 px.
  - Transições `durationFast` (150 ms) com `curveEasyEase`, desligadas em `prefers-reduced-motion`.
- **Ícones:** os SVGs do Lucide são trocados pelos **Fluent System Icons** (licença MIT), copiados para `src/assets/icons` e usados pelo mesmo `Icone` (máscara + `currentColor`). Não entra pacote de ícones em tempo de execução.

### O que fica igual

- Tailwind v4 restrito aos tokens: paleta, sombras e raios padrão do Tailwind continuam zerados.
- Radix/shadcn só como base de comportamento.
- Nomes em português (`Botao`, `Selo`, `MensagemSecao`…).
- Tema claro e escuro, WCAG 2.2 AA, 375 px no celular e corpo de 14 px.
- Sem emoji, sem gradiente, sem ilustração.

### Componentes: o que muda em cada um

| Componente                     | Fluent 2                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Botao`                        | 32px de altura (24 no compacto), raio de 4px; primário em `colorBrandBackground`; padrão com borda `colorNeutralStroke1`; sutil sem borda                 |
| `CampoTexto`, `CampoData`      | Borda `colorNeutralStroke1` com **linha inferior** `colorNeutralStrokeAccessible`, que vira marca ao focar, como o Input do Fluent                        |
| `Selo`                         | Badge do Fluent: raio cheio, `caption1` semibold; o tom vem dos tokens de status. O texto sempre diz a situação: a cor nunca carrega a informação sozinha |
| `MensagemSecao`                | MessageBar do Fluent: fundo de status, ícone, título em semibold e ações à direita                                                                        |
| Cartão (novo, `Cartao`)        | `colorNeutralBackground1`, raio de 8px, `shadow4`, padding de 16px; variante "sutil" sem sombra e com borda                                               |
| `Dialogo`, `Sheet`             | Raio de 8px, `shadow64`, véu `colorBackgroundOverlay`                                                                                                     |
| `MenuLateral`, `BarraSuperior` | NavDrawer do Fluent: item ativo com barra de marca de 3px à esquerda e fundo `colorNeutralBackground1Selected`                                            |
| Tabelas                        | Linha de 1px `colorNeutralStroke2`, cabeçalho semibold, hover `colorSubtleBackgroundHover`; rolam na própria região                                       |
| `Trilha` (novo, stepper)       | Ver o hub em [0016](0016-automacao-do-orcamento-a-execucao.md): passos numerados, o atual com `aria-current="step"`, situação escrita por extenso         |

## Consequências

- Uma fatia `chore/<id>-fluent-2` cobre o script de tokens, o `fluent.css`, os aliases, os ~19 componentes, a troca de ícones e a revisão das telas em 1366×768, 1920×1080 e 375×812, nos temas claro e escuro.
- `docs/design-system/README.md` e `LEIA-ANTES.md` deixam de ser a fonte da verdade visual. Eles viram histórico, e um novo README descreve o Fluent 2 do Grama.
- O protótipo HTML de orçamentos (prévia do Codex) continua com o visual dele até a fatia de front do módulo.
- Contraste: as bordas `colorNeutralStroke2` são decorativas. Campos e controles usam `colorNeutralStrokeAccessible` para passar 3:1 (WCAG 1.4.11).

## O que a branch `chore/fluent-2` entregou

- `scripts/gerar-tokens-fluent.mjs`, que gera `tokens/fluent.css` (459 tokens por tema) e falha se algum par obrigatório ficar abaixo de 4,5:1.
- Rampa da marca montada com os verdes que o app já usava: tom 80 = `#15803d`, o primário anterior no claro.
- Semânticos remapeados. 66 pares conferidos para 4,5:1 (texto) e 3:1 (bordas de controle e foco), nos dois temas.
- Forma e elevação:
  - raio de 4px nos controles e de 8px nos cartões e diálogos;
  - sombras `shadow4` nos cartões, `shadow16` nos menus e `shadow64` nos diálogos.
- Pilha Segoe UI Variable; títulos de tela com a variante Display.
- Componentes:
  - `Botao` padrão com contorno;
  - campos com linha inferior acessível, que vira verde no foco;
  - `Selo` em pílula com contorno do status;
  - `MensagemSecao` como MessageBar;
  - menu com itens arredondados;
  - item ativo do menu lateral com barra de marca;
  - caixas de seleção com borda acessível.
- Painéis das telas viraram cartões elevados.
- Os 69 ícones foram trocados pelos Fluent System Icons, com os mesmos nomes no código.

Ficou de fora, para a fatia do hub: `Cartao` e `Trilha` como componentes, que entram quando forem usados.

## Decisões pendentes

1. A cor-chave verde da marca.
2. Pilha de sistema (recomendada) ou Inter.
3. A fatia do Fluent 2 entra **antes** das telas novas de contrato e cobrança. Assim, o hub da ADR-0016 já nasce no visual novo.
