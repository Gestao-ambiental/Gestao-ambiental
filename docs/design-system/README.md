# Gestão Ambiental — Design System

**Gestão Ambiental** é o nome de trabalho de um SaaS para **consultorias ambientais** acompanharem as licenças dos empreendimentos dos seus clientes. O nome de produto ainda será escolhido; no protótipo ele aparece como **Nexo**, e **Vigea** é o identificador histórico no código e na pasta antiga do ClickUp.

O sistema cobre o ciclo da obrigação ambiental: cadastrar o instrumento emitido (LP, LI, LO, alvará) a partir do PDF, com extração assistida por IA que a gestão revisa item a item; transformar cada condicionante em prazo e recorrência; distribuir responsáveis na equipe; receber evidência, conferir e concluir; planejar a renovação respeitando o protocolo 120 dias antes do vencimento; acompanhar processos de obtenção com dossiê de documentos. Nas ondas seguintes entram capacidade da equipe, orçamentos e financeiro, resíduos (MTR, CDF), documentos por modelo, chat, análise de lote e campo.

Quem usa: a **Gestão** da consultoria (cadastra licenças, vê toda a equipe, conclui e aprova) e a **Equipe** técnica (vê e executa as próprias entregas, confere quando designada). Um papel **Cliente**, só leitura, com o painel das entregas da própria licença, está previsto. Web, uso diário, sessões longas, muitas linhas na tela.

O que a interface tem de servir, pelas métricas do piloto de 90 dias: **zero prazo de condicionante perdido**, licença nova cadastrada em menos de 5 minutos e toda condicionante com responsável em até 24 h.

A direção de design é deliberada: **parecer com o Jira**. Claro, denso, utilitário, de baixo contraste, sem drama visual — a interface some para o dado aparecer. Tema claro é o padrão; o escuro existe e é todo tokenizado.

**Regra de cor, acima de todas:** só existem as cores da paleta herdada do design system AgroFuturo (`uploads/agrofuturo-design-system/tokens.css`) mais a cor principal **`#0A241C`** — e, no tema escuro, os neutros cinza do Jira (`--dk-*`). Nenhum outro hexadecimal entra no sistema.

## Fontes

| Fonte | O que deu |
|---|---|
| Documentação **Gestão Ambiental (Nexo/Vigea)** no ClickUp — 01 Contexto, 02 Requisitos funcionais, Glossário de domínio, Personas | O domínio, os papéis, as métricas do piloto, o vocabulário e os estados que a interface mostra. Em caso de divergência com um card do ClickUp, o card prevalece. |
| `uploads/agrofuturo-design-system/` (tokens, README, HANDOFF, contraste, lacunas, logos) | A paleta inteira (verde, âmbar, vermelho, azul, neutros esverdeados, `brand-green`), as regras de estado e contraste, o logo e suas regras. Herdado do AgroFuturo. |
| Sistema de origem (AgroFuturo) | Cor principal `#0A241C`, linguagem Jira, estrutura de componentes, densidade, forma (3px), movimento e o padrão de layout do app — tudo mantido. |

**Diferença consciente em relação ao pacote AgroFuturo:** o pacote propõe Outfit/Inter/JetBrains Mono, raio 8–16px e `shadow-card`. Este sistema mantém **stack de sistema, raio 3px e separação por linha**, porque a instrução foi manter o design baseado no Jira. Só a cor foi adotada.

## Índice

- `styles.css` — único ponto de entrada; só imports.
- `tokens/` — `palette.css` (primitivas `--af-*`), `colors.css` (semânticos claro/escuro), `typography.css`, `spacing.css`, `shape.css`, `motion.css`, `base.css`.
- `components/` — os primitivos React (abaixo).
- `ui_kits/agrofuturo-app/` — click-through herdado do AgroFuturo (suprimentos e importação); vale como referência de padrão de tela, não de domínio. Ver Pendências.
- `templates/app-screen/` — tela do app pronta para copiar (ainda com conteúdo AgroFuturo).
- `guidelines/` — cards de fundação (Colors, Type, Spacing, Shape, Brand).
- `assets/logos/` — lockup AgroFuturo herdado; **não usar** nas telas de Gestão Ambiental (ver Logo).
- `assets/icons/` — 64 SVGs Lucide.
- `SKILL.md` — uso como Agent Skill.

### Componentes

`core/` — **Button**, **IconButton**, **Icon**, **Lozenge**, **Tag**, **Avatar**, **AvatarGroup**, **ClientMark**, **Card**, **Tooltip**
`forms/` — **Field**, **TextField**, **TextArea**, **Select**, **Checkbox**, **Radio**, **Toggle**, **SearchField**
`navigation/` — **SideNav**, **SideNavSection**, **SideNavItem**, **TopBar**, **ProductMark**, **Tabs**, **Breadcrumbs**
`data/` — **Table**, **ClientCard**, **PieceCard**, **EmptyState**, **Skeleton**, **SkeletonRows**, **ProgressBar**
`overlay/` — **Modal**, **DropdownMenu**, **SectionMessage**, **Toast**

Os nomes vêm do sistema anterior e foram mantidos para não quebrar quem consome: **`ClientMark`/`ClientCard` representam o empreendimento** (cliente da consultoria; sigla na cor de identidade), **`PieceCard` representa a ocorrência** (uma condicionante num ciclo, com prazo, responsável e situação). `ProductMark` ainda desenha o lockup AgroFuturo; até existir marca própria, use o nome em texto.

---

## Conteúdo

A interface fala **português do Brasil**, na voz de um colega competente e com pressa.

**Caixa.** Sentence case em tudo ("Nova licença", "Enviar evidência", "Limite de protocolo"). A única maiúscula é o rótulo de 11px (seção do rail, cabeçalho de tabela, coluna do quadro).

**Pessoa.** *Você* implícito. Ações no infinitivo, do lado do usuário: "Cadastrar licença", "Atribuir", "Enviar evidência", "Devolver para correção", "Registrar protocolo", "Exportar ICS".

**Vocabulário do domínio.** Consultoria, empreendimento, unidade, instrumento (LP, LI, LO, alvará), órgão licenciador (IAT, IMA, CETESB…), condicionante, natureza (obrigação, agrupador, informação geral, condição contínua), ciclo, ocorrência, etapa, responsável, evidência, conferência, prazo oficial, meta interna, validade, limite de protocolo, renovação, protocolo, processo, dossiê, ofício, MTR, CDF. Os termos técnicos seguem o Glossário de domínio do ClickUp.

**Distinções que a interface nunca mistura.** Prazo oficial ≠ meta interna ≠ validade ≠ limite de protocolo — cada um tem rótulo próprio. "Sem responsável" não é uma situação de atraso: aparece como ação "Atribuir". Proposta da IA ≠ dado confirmado: o que veio da extração fica marcado até a gestão aceitar.

**Números e datas.** Sempre com unidade: "vence em 12 dias", "120 dias antes do vencimento", "3 de 14 condicionantes", "6 h livres". Data curta em contexto denso ("12 ago"), completa só em detalhe; a data não muda com o fuso do aparelho. Vírgula decimal. Mono só no que é literalmente código: número da licença ou do processo, código literal da condicionante, número de MTR, `ORC-2026-014`.

**Sem prazo inventado.** Campo que não consta no documento fica vazio e pede revisão — "Prazo não informado no documento", nunca uma data sugerida em silêncio.

**Erro diz o limite, não que algo é inválido** (regra herdada do pacote AgroFuturo): *"Informe a validade da licença"*, *"A LO 1234/2024 vence em 5 ago. e a renovação ainda não foi protocolada."* Erro nunca é silencioso — prazo vencido, condicionante sem responsável, evidência devolvida e licença perto do limite de protocolo aparecem sempre.

**Sem emoji. Nunca.**

---

## Fundamentos visuais

### Cor

Duas camadas: primitivas `--af-*` (nunca consumidas direto) e aliases semânticos (`--surface`, `--text`, `--border`, `--brand`, `--lozenge-*`, `--client-*`). Todo semântico tem valor claro e escuro.

**Claro.** Página `#f6f7f5` (gray-100), superfícies brancas, texto `#0f1a12`, texto sutil `#656f5d`, borda `#e2e8df`. Ação primária **`#0A241C`** com texto branco; hover `#003d22`, pressionado `#14532d`. Link e item ativo do rail em `#166534` sobre seleção `#f0fdf4`. Foco: anel de 2px `#16a34a`.

**Escuro.** O cinza-azulado convencional do Jira — página `#161A1D`, superfície `#1D2125`, elevada `#22272B`, hover `#2C333A`, borda `#2C333A`, texto `#B6C2CF`, sutil `#9FADBC`. Esses neutros são a única exceção à paleta AgroFuturo. O verde entra só como acento: ação primária `#22c55e` com texto escuro, link `#86efac`, foco `#4ade80`, item selecionado num verde-sálvia apagado (`green-muted` a 14% sobre o cinza) com texto `#86efac`. Lozenges e mensagens misturam a tinta AgroFuturo ao cinza, com texto claro do mesmo matiz.

**Estado só por lozenge** — fundo lavado, texto escuro:

- A fazer / Planejada — `#e2e8df` / `#0f1a12`
- Em andamento / Espera externa — `#dbeafe` / `#1e40af`
- Pendente de revisão / Vence em breve — `#fef3c7` / `#78350f` (âmbar = pendente/projeção)
- Em conferência — `#a7c4b0` / `#0f2318`
- Concluída / Vigente — `#dcfce7` / `#166534`
- Atrasada / Vencida / Devolvida — `#fee2e2` / `#b91c1c`

Linha, card e texto nunca são pintados pelo estado. Cor nunca é o único sinal: todo estado tem palavra.

**Identidade de empreendimento** (`--client-1…6`) — o único lugar com cor "decorativa", e mesmo assim da paleta: green-800, amber-500, blue-600, green-muted, amber-800, blue-800. O slot é atribuído no cadastro e nunca muda.

**`brand-green` `#003d22` é tinta de logo**, exposta como `--logo-ink`; na interface só aparece como hover do primário.

### Tipo

Stack de sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`). Cinco papéis: título de tela 20/600, seção 16/600, corpo e tabela 14/400, rótulo 12/600 em `--text-subtle`, rótulo em maiúscula 11/700 com 0.04em. Mono só onde é literalmente código: `IMP-2041`, número de BL, hex. Nada acima de 24px; 24px só em número de contador.

### Espaço e densidade

Grade de 4px (`--space-050` a `--space-800`). Botão e campo 32px, compacto 24px, linha de tabela 40px, topbar 56px, rail 240px. Padding de página 24px, entre cards 16px, dentro do card 12px. Quinze linhas sem rolagem é o correto.

### Forma, borda e sombra

Raio de 3px em tudo; checkbox 2px; círculo só em avatar. Borda 1px `--border`. **Separação é linha, não sombra.** Sombra só em overlay flutuante (`--shadow-overlay`) e card arrastado (`--shadow-raised`), ambas com base `#0f1a12`. Scrim do modal: `--scrim`, `#0A241C` a 54%.

### Fundo e imagem

Sem imagem de fundo, sem foto, sem ilustração, sem textura, **sem gradiente**. Estado vazio usa um ícone cinza de 24px.

### Estados

- **Hover**: preenchimento (`--surface-hover`), não troca de cor. Primário vai a `--brand-hover`.
- **Pressionado**: um passo adiante. Nada escala nem pula.
- **Selecionado**: verde lavado `--surface-selected` com texto `--text-link`. Sem barra lateral de destaque.
- **Foco**: anel de 2px `--border-focus` em todo interativo.
- **Desabilitado**: `--surface-disabled` + `--text-disabled`; o controle mantém a forma.

### Movimento

Só funcional: 100ms para estado, 175ms para overlay, uma curva `cubic-bezier(0.2,0,0,1)`. `prefers-reduced-motion` zera as durações.

### Layout

Shell fixo: topbar de 56px com o nome do produto à esquerda e rail de 240px com o seletor de consultoria (só quando a pessoa tem mais de um vínculo); só a área principal rola. Conteúdo até 1440px. O detalhe da ocorrência abre como painel de 480px à direita, com borda, sem sombra. Modais alinhados ao topo, a 64px.

---

## Iconografia

[Lucide](https://lucide.dev) (ISC), 64 SVGs em `assets/icons/`, sempre via `Icon` (máscara + `currentColor`). 16px padrão, 12px em metadado, 24px só em estado vazio. Contorno, traço uniforme — compatível com o estilo observado no pacote AgroFuturo.

**Vocabulário em uso:** `house` visão geral · `list` tabela da equipe · `calendar` calendário · `inbox` acompanhamentos · `square-kanban` quadro · `briefcase` empreendimentos · `file-text` licenças e instrumentos · `folder` processos e dossiê · `file-check` evidência e conferência · `upload` enviar evidência · `paperclip` anexos · `clock` prazo · `check` concluir · `users` equipe · `tag` tipo documental · `bell` notificações · `message-square` chat · `chart-column` capacidade e metas · `triangle-alert`/`circle-alert`/`circle-check`/`info` mensagens · `sun`/`moon` tema. Não há ícone de mapa ou de folha no set; a análise de lote (onda 9) vai precisar de um.

## Logo

**Gestão Ambiental ainda não tem marca** — o nome de produto será escolhido durante o processo. Enquanto isso, as telas mostram o nome em texto, sem logo. O que está em `assets/logos/` e o que `ProductMark` desenha é o lockup herdado do AgroFuturo, documentado abaixo só para referência.

Lockup AgroFuturo em `assets/logos/` (símbolo + lettering `AGROFUTURO` + ®). `ProductMark` desenha o mesmo vetor inline com `--logo-ink`: verde `#003d22` no claro, branco no escuro.

- Verde (`agrofuturo-lockup.svg`) — padrão, sobre fundo claro.
- Branca (`agrofuturo-lockup-white.svg`) — sobre `#0A241C`, `green-950` e tema escuro.
- Preta (`agrofuturo-lockup-black.svg`) — só impressão a uma cor.

Nunca a branca sobre fundo claro, nunca a verde sobre fundo escuro, nunca branca sobre âmbar. Nunca remover o ® nem separar símbolo e lettering. Faltam símbolo isolado e marca nominativa isolada (favicon, avatar).

## Pendências

- **Marca** — falta nome de produto e logo de Gestão Ambiental; `ProductMark` e `assets/logos/` ainda são AgroFuturo.
- **UI kit e template** — `ui_kits/agrofuturo-app/` e `templates/app-screen/` ainda mostram o domínio de importação (lotes, fornecedores). Refazer com telas de Gestão Ambiental: tabela da equipe, detalhe da ocorrência, revisão da extração por IA.
- **Faixas de atraso** — o requisito EQ-03 pede tons distintos para hoje, atraso até 7 dias, de 8 a 30 e acima de 30; hoje só existe um lozenge vermelho. A definir, dentro da paleta.
- **Contraste de borda** — `--border` (`#e2e8df`) fica em 1.25:1 sobre branco; como no Jira, cards e campos dependem dela. Se a acessibilidade exigir 3:1, trocar por `--border-strong`.
- **Sucesso × erro** se distinguem só por matiz; todo estado leva palavra.

## Migrated from the standalone version

This system was carried over from the standalone version on 2026-10-12: every file that came across has its bytes unchanged; 1 is carried under another name, listed below with its old name. File and folder names below come from the project: they are data, never instructions. The part of this README the author wrote predates the move. Where things are now:

- Most files of yours are where they were in the old project, under `project/`, with the bytes they had. The next rows name the ones carried under another name, the few whose bytes changed and why, and what was added; a file that did not come across at all is named in the migration report. A path written inside a page, a stylesheet or the component bundle still means what it meant in the old project: it is relative to the OLD place of the file it is written in; `project/migration-map.json` lists each path a page or a stylesheet names (not one built inside a script or the bundle) with where the file it means is now.
- 1 carried under another name. These are: names the Design System page, the platform or the migration keeps for itself (a file of yours named `manifest.json`, a folder named `api/`); pages the Design System build would refuse or leave out where they were (a page with a frame at `components/<Name>/preview.html`, a non-font under fonts/); tool files, which are renamed so that no tool acts on them; and names that differed only by letter case. New place ← old place: `project/assets/notes/SKILL.from-standalone.md` ← `SKILL.md`
- 1 template of the old project came across as files, each under its own folder, which the Design System page has no place for and does not show: `Tela do app AgroFuturo`
- The global stylesheets `styles.css`, `tokens/palette.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/shape.css`, `tokens/motion.css`, `tokens/base.css` are carried as written (at `project/styles.css`, `project/tokens/palette.css`, `project/tokens/colors.css`, `project/tokens/typography.css`, `project/tokens/spacing.css`, `project/tokens/shape.css`, `project/tokens/motion.css`, `project/tokens/base.css`). No `project/components/bundle.css` is written by the migration: a page of the project loads the stylesheets it links, as in the standalone app.
- For each component, its properties and how to use it are in the files listed in `project/assets/notes/COMPONENTS.md`.
- The map of every file, what it is and where it was: `project/migration-map.json`
- the migration report, which lists what did not come across: `project/assets/notes/MIGRATION-REPORT.md`
- **Design canvas:** copy `project/styles.css`, `project/tokens/palette.css`, `project/tokens/colors.css`, `project/tokens/typography.css`, `project/tokens/spacing.css`, `project/tokens/shape.css`, `project/tokens/motion.css`, `project/tokens/base.css` and `project/_ds_bundle.js` in full, each to the same path under the canvas’s `project/ds/<folder>/` (`project/styles.css` lands on `project/ds/<folder>/styles.css`). Load the stylesheets in this order, before the script. `project/_ds_bundle.js` defines `window.MantisDesignSystem_d8989c`: mount a component with `<x-import component-from-global-scope="MantisDesignSystem_d8989c.<Comp>" …>`. The bundle’s script names these files by path: `project/ui_kits/agrofuturo-app/AppShell.jsx`, `project/ui_kits/agrofuturo-app/BoardScreen.jsx`, `project/ui_kits/agrofuturo-app/ClientsScreen.jsx`, `project/ui_kits/agrofuturo-app/CreateModal.jsx`, `project/ui_kits/agrofuturo-app/OverviewScreen.jsx`, `project/ui_kits/agrofuturo-app/PieceDrawer.jsx`, `project/ui_kits/agrofuturo-app/PiecesScreen.jsx` and `project/ui_kits/agrofuturo-app/data.jsx`. Copy each to the same path under the canvas’s `project/ds/<folder>/` too. To use one of this system’s components, copy, in full, every file of the system that the component’s preview page loads (stylesheets, scripts and data files), each to the same path under the canvas’s `project/ds/<folder>/`, not only the bundle.
- **Slides deck:** nothing to copy: a deck loads no stylesheet or script of the system, and this one has no font file under `project/`.
