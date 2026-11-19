# Triagem de licenciamento pela CONSEMA 250/2024

Estudo e primeira fatia da triagem (enquadramento) de licenciamento ambiental em Santa Catarina. A
pergunta é a mesma do Simulador de Licenciamento do IMA: dada a atividade e o seu parâmetro técnico,
qual é o porte, a modalidade e o estudo ambiental.

## Como o IMA faz

- O simulador fica em https://consultas.ima.sc.gov.br/simulador. A pessoa escolhe o município, a
  atividade (código CONSEMA) e informa até dois parâmetros numéricos.
- A lista de atividades vem embutida no HTML da página: 309 itens com código, descrição, sigla e
  unidade do parâmetro, potencial poluidor geral e tipologia. Porte, estudo e licença vêm como
  "INDEFINIDO".
- O enquadramento é calculado no servidor (`POST /simulador/simular`, protegido por reCAPTCHA).
  Por isso não reproduzimos a resposta do simulador. A lógica abaixo sai da resolução, que é pública.
- A lista do simulador ainda traz o rótulo da CONSEMA 98/2017, que foi revogada. Em dois itens o
  potencial poluidor geral diverge da 250/2024: 11.90.02 e 17.21.00 são M na resolução e G no
  simulador. Aqui vale a resolução.

## Base normativa

- **CONSEMA 250/2024**, consolidada até a 314/2026 (DOE/SC 08/06/2026). Traz a listagem estadual
  (Anexo VI) e os parâmetros técnicos (Anexo VII). PDF: https://www.semae.sc.gov.br/?wpdmdl=3480
- **CONSEMA 251/2024**, consolidada até a 300/2025: atividades de impacto local, licenciadas pelo
  município, em três níveis (Anexo I, catálogo em `catalogo-consema-251.ts`, 404 entradas, 207
  atividades). PDF: https://www.semae.sc.gov.br/?wpdmdl=3481
- **LC 140/2011**: competência entre União, Estado e Município.

Regras da 250/2024 usadas no código:

| Regra                                                                            | Artigo       | Onde                      |
| -------------------------------------------------------------------------------- | ------------ | ------------------------- |
| Modalidades: trifásica (LAP, LAI e LAO), AuA e LAC; AuA só onde o Anexo VI prevê | Art. 9º      | `FaixaDePorte.modalidade` |
| O estudo é o da atividade de maior complexidade                                  | Art. 10, §1º | `concluirTriagem`         |
| Abaixo do menor limite: cadastro com Certidão de Conformidade Ambiental          | Art. 14      | `abaixo_do_limite`        |
| AuA ou faixa sem estudo indicado: estudo dispensado                              | Art. 22      | `estudo: null`            |

Não existe uma matriz que calcule o estudo a partir de porte e potencial. O Anexo VI já indica,
para cada código e faixa de porte, o estudo entre parênteses: (RAP), (EAS) ou (EIA). O potencial
poluidor é informativo e pesa na taxa e na audiência pública.

## Como o catálogo é gerado

`scripts/consema-250/gerar-catalogo.mjs` lê o texto da resolução consolidada
(`scripts/consema-250/r250-consolidada-314-2026.txt`, extraído do PDF oficial) e gera
`packages/domain/src/catalogo-consema-250.ts`:

```
node scripts/consema-250/gerar-catalogo.mjs 250 scripts/consema-250/r250-consolidada-314-2026.txt packages/domain/src/catalogo-consema-250.ts
node scripts/consema-250/gerar-catalogo.mjs 251 scripts/consema-250/r251-consolidada-300-2025.txt packages/domain/src/catalogo-consema-251.ts
corepack pnpm exec prettier --write packages/domain/src/catalogo-consema-25*.ts
```

O gerador falha se alguma faixa não for interpretada. Ele também trata as particularidades do texto:

- O texto consolidado repete o código quando há redação nova. Vale a última, registrada em
  `redacaoDada`. São 20 itens.
- A frase "O porte P será licenciado por AuA" vale para um porte. "Esta atividade será licenciada
  por AuA" e "Todos os portes…" valem para todos.
- Quando o item aceita dois parâmetros ("AU(1) ≤ 80 ou PM ≤ 2.000"), a triagem aceita qualquer um.
  Se caírem em portes diferentes, vale o maior, com aviso. Essa leitura conservadora não está
  escrita na resolução.
- Erros de digitação do original corrigidos e testados: "40.000.00" em 03.34.00 e 03.34.02 (é
  40.000.000) e "Porte Média" em 10.50.20.
- A ressalva "EAS ou EIA, se AI ≥ 100" da hidrelétrica (34.11.01) vai como aviso.

Os testes do domínio conferem o catálogo inteiro:

- 311 atividades vigentes, sem código repetido;
- todo parâmetro definido no Anexo VII;
- faixas de cada parâmetro contíguas, sem buraco nem sobreposição;
- todos os 309 códigos do simulador do IMA presentes, conferido na geração.

Quando sair nova resolução que altere a 250, baixe o PDF consolidado, extraia o texto, substitua o
`.txt` e rode o gerador.

## O que ainda não entra

- A habilitação de cada município (a tela pede o nível; ver docs/estudos/enquadramento-automatico.md).
- Taxas (Lei SC 14.262/2007) e o custo estimado.
- Ligação com orçamento e empreendimento. A triagem ainda não é gravada, então não há tabela, RLS
  nem pgTAP.
- Competência federal (IBAMA) e casos especiais: terras indígenas e quilombolas (Anexo VIII),
  supressão de vegetação e audiência pública.

O resultado é uma triagem para orientar a proposta, não um enquadramento oficial. A tela diz isso.
