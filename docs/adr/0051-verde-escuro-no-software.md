# ADR-0051: Verde-escuro no software, lima no site

- Situação: aceita (camada `camada/identidade-nova`)
- Data: 21/11/2026
- Revisa: ADR-0039 (revisão de 20/11/2026, "só o verde-lima")

## Contexto

Na revisão de 20/11 o software passou a usar o lima `#cdf22b` do site como única cor de destaque. No uso, o lima não serve como texto, linha nem foco no tema claro (1,2:1 no papel), o que obrigava a marca e o link a ficarem em tinta, e o botão principal pedia texto preto. O Eduardo testou um destaque verde-escuro e aprovou os valores em 21/11/2026.

## Decisão

- **O site gramaapp.com.br segue no lima.** Nada do site muda.
- **O software usa o verde-escuro `#1b4332`** como destaque. Os primitivos `--lima*` viram `--destaque*` em `apps/web/src/styles/tokens.css`:
  - claro: `--destaque #1b4332`, `--destaque-toque #24573f`, `--destaque-aperto #143326`, `--destaque-claro #dbe9e1`, `--destaque-claro-toque #cbe0d4`;
  - escuro: `--destaque-noite #2f7a57`, `--destaque-noite-toque #33825d`, `--destaque-noite-aperto #276749`, `--escolha #14261d`, `--escolha-toque #1a3226`, e `#7cc4a0` (`--destaque-brilho`) em `--link`, `--ok-texto`, `--marca-linha` e `--foco`.
- Texto sobre o destaque é sempre branco (`--acao-texto`, `--sinal-texto`) nos dois temas.
- No claro, `--link`, `--marca-linha`, `--foco` e `--ok-texto` passam a usar o verde-escuro (10,4:1 no papel).
- Componentes seguem só com os semânticos (`--acao`, `--sinal`, `--escolha`, `--foco`, `--link`, `--marca-linha`, `--ok-*`, `--estacao-*`, `--categoria-*`).
- A `--categoria-3` do calendário era verde-água e se confundia com o destaque: virou oliva.
- As microtransições seguem: "acender" preenche a estação da trilha de verde; o `pulso-lima` virou `pulso` e começa num verde médio que mantém o texto de tinta legível.
- A logo não muda (o quadrado lima da logo fica como está).

## Consequências

- Contraste AA nos dois temas: branco sobre `--acao` 11,1:1 (claro) e 5,2:1 (escuro). O hover do escuro aprovado no teste (`#378a63`) dava 4,2:1 com o branco; ficou `#33825d` (4,7:1), o mais próximo que passa no AA.
- Um teste (`identidade-verde.test.ts`) impede que `--lima` ou `#cdf22b` voltem ao software.
- O `DESIGN.md` foi atualizado com a tabela de cores nova.
