# Simulador de Licenciamento do IMA: o que ele faz e o que o Grama replica

Fonte: <https://consultas.ima.sc.gov.br/simulador>, lida em 19/11/2026.

## Como o simulador funciona

- A página pede **município**, **atividade CONSEMA** e até **duas variáveis** (parâmetro principal e,
  em 5 atividades, um secundário).
- O cálculo é um `POST /simulador/simular`, que devolve HTML e exige **reCAPTCHA**. Não automatizamos
  esse passo.
- A página já traz embutida a lista das 309 atividades. Por código, ela informa:
  - a tipologia;
  - a **Instrução Normativa (IN)** do IMA;
  - se a atividade paga **TFASC**;
  - a **tabela da taxa** (`tabelaCalculo`: 2, 3 ou 0);
  - o potencial poluidor geral.

  Porte, estudo e licença vêm como `INDEFINIDO`, porque o servidor é quem calcula.

## O que o Grama replica

| Simulador                 | Grama                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Porte, estudo, modalidade | Calculados pela CONSEMA 250/2024 consolidada (`triagem-licenciamento.ts`), já no PR da triagem                   |
| Taxa de análise por fase  | `calcularTaxaDoIma` (`taxa-do-ima.ts`): Lei 14.262/2007 com os valores do Decreto 421/2023                       |
| IN da atividade           | Link para a IN no site do IMA, com aviso quando o site marca a IN como revogada                                  |
| TFASC                     | Indica se a atividade paga, mas não calcula o valor (que depende do porte da empresa)                            |
| Município                 | O mapa e a habilitação municipal (CONSEMA 251/2024) decidem quem licencia; no município, a taxa é a do município |

Os dados por atividade são extraídos por `scripts/ima-simulador/extrair-dados.mjs`, que gera
`packages/domain/src/dados-simulador-ima.ts`. Para atualizar, baixe as duas páginas e rode o script
(as instruções estão no cabeçalho dele).

## Taxa de análise (Decreto 421/2023)

- **Tabela 02:** a classe junta porte e potencial geral (por exemplo `M,G`). Cobra-se LAP, LAI e LAO
  em cada fase. Na renovação, cobra-se a LAO de novo (item 2.6).
- **Tabela 03:** vale para as atividades agropecuárias que o simulador marca com 3. As classes vão de
  I-A a III-B.
  - A LAI de III-A está publicada como R$ 1.044,27, valor que não fecha com o total da coluna
    (R$ 4.581,45). O Grama usa o valor publicado e avisa.
- **Fórmulas (tabela 0):** usam os itens 13 (suinocultura) e 14 (agropecuárias), com fator 1 na LAP,
  1,5 na LAI e 1,25 na LAO.
  - **Sem fórmula no decreto:** 01.54.04, 01.54.05 e 47.10.10 não têm fórmula. O Grama diz isso e
    não estima.
  - **Carcinicultura (03.32.00):** a fórmula usa a área útil, mas o Grama entra com a lâmina
    d’água (LA) informada, e avisa.
- **AuA:** R$ 68,56 (item 8). Na suinocultura, R$ 37,39 (item 8.1). No Grama, porte mínimo e porte
  único são sempre AuA.
- **EIA/RIMA:** soma-se o custo da análise do estudo por hora técnica (item 3). O Grama só avisa,
  porque esse custo depende das horas.

Não encontramos reajuste estadual depois do Decreto 421/2023. Antes de usar os valores numa proposta,
confira se houve decreto novo.

## Divergências encontradas entre o simulador e a resolução vigente

- **Potencial poluidor:** em 11.90.02 e 17.21.00, o simulador usa G, enquanto a 250 consolidada diz
  M. O simulador ainda cita a CONSEMA 98/2017 em 294 das 309 atividades.
- **IN revogada:** o simulador aponta 01.40.00 para a IN 12 e 12.80.00 e 12.80.10 para a IN 19. O
  site de INs marca as duas como revogadas.
- **Antenas:** 34.16.00 e 34.16.10, da 250, não estão no simulador.
