# Design system Gestão Ambiental (Grama)

Exportado do design system "Gestão ambiental" do Claude Design em 17/10/2026. É a fonte da verdade visual do app.

- `README.md` — regras do sistema: direção Jira, paleta, tipo, densidade, estados, vocabulário de interface.
- `styles.css` + `tokens/` — os tokens reais. O app importa estes valores; não invente cor, raio ou tamanho fora deles.
- `icons/` — 64 SVGs Lucide usados no protótipo.
- `referencia-componentes/` — os componentes React do protótipo (estilo inline). **Referência de visual e de API, não código para copiar como está.**

Ajustes em relação ao README:
- Ignore tudo que fala de logo, `ProductMark`, `ui_kits/agrofuturo-app` e `templates/`: são herança do AgroFuturo e não vieram neste pacote. O nome no front é **Grama**, em texto, sem logo.
- Os nomes `ClientMark`/`ClientCard` = empreendimento e `PieceCard` = ocorrência. No código novo, use nomes do domínio (`MarcaEmpreendimento`, `CartaoOcorrencia`…).
