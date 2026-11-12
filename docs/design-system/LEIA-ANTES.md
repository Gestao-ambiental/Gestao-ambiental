# Design system Gestão Ambiental (Grama)

> **Desde 11/11/2026 o visual é Fluent 2** ([ADR-0015](../adr/0015-fluent-2-como-design-system.md)).
> - `tokens/fluent.css` é gerado do pacote oficial `@fluentui/tokens` por `scripts/gerar-tokens-fluent.mjs`. Não edite à mão.
> - `colors.css`, `shape.css`, `typography.css` e `motion.css` mantêm os nomes semânticos de sempre, agora apontando para o Fluent.
> - Os ícones são os Fluent System Icons (`icons/LEIA-ME.md`).
> - `palette.css`, o `README.md` (direção Jira) e `referencia-componentes/` ficam como histórico. Para cor, raio, sombra e tipo, valem a ADR-0015 e os tokens.

Exportado do design system "Gestão ambiental" do Claude Design em 17/10/2026. Foi a fonte da verdade visual até a ADR-0015.

- `README.md` — regras do sistema: direção Jira, paleta, tipo, densidade, estados, vocabulário de interface.
- `styles.css` + `tokens/` — os tokens reais. O app importa estes valores; não invente cor, raio ou tamanho fora deles.
- `icons/` — 64 SVGs Lucide usados no protótipo.
- `referencia-componentes/` — os componentes React do protótipo (estilo inline). **Referência de visual e de API, não código para copiar como está.**

Ajustes em relação ao README:
- Ignore tudo que fala de logo, `ProductMark`, `ui_kits/agrofuturo-app` e `templates/`: são herança do AgroFuturo e não vieram neste pacote. O nome no front é **Grama**, em texto, sem logo.
- Os nomes `ClientMark`/`ClientCard` = empreendimento e `PieceCard` = ocorrência. No código novo, use nomes do domínio (`MarcaEmpreendimento`, `CartaoOcorrencia`…).
