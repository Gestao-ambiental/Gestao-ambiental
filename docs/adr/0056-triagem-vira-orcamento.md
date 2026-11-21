# ADR-0056: Triagem vira orçamento

- Situação: proposta (camada `camada/triagem-orcamento`)
- Data: 21/11/2026
- Relaciona: ADR-0031 (modelos de orçamento), ADR-0044 (renovação vira orçamento), decisões de preço de 12/11/2026 (sem tabela por profissão)

## Contexto

O Eduardo pediu: "Normalmente tu confere o enquadramento pra orçar algo pra um cliente. Se virou trifásico e a consultoria já tem cadastrados os valores de trifásico, deveria poder importar." Não havia onde guardar "valores por modalidade".

## Decisão

- **Valores da modalidade = um modelo de orçamento marcado com a modalidade** (`orcamento_modelo.modalidade`: `trifasica`, `AuA` ou `LAO`). É o lugar que a consultoria já usa para repetir itens e preços; sem tabela nova e sem preço por profissão. No máximo um modelo vivo por modalidade.
- **Orçar**, na conclusão da triagem (só Gestão, só com empreendimento): `criar_orcamento_da_triagem` cria o rascunho pelo caminho comum (`criar_orcamento`), grava `orcamento.modalidade` e, numa transação:
  - com valores: importa itens e preços fechados do modelo, as despesas dele a cotar e as premissas e exclusões;
  - sempre: a taxa do órgão como despesa paga direto pelo cliente (repasse). No IMA, "Taxa do IMA (Lei estadual 14.262/2007, valores do Decreto 421/2023)" com a maior taxa entre as atividades, como na renovação (ADR-0044); sem valor calculado, a cotar. No município, "Taxa do município", a cotar.
  - Idempotente pelo id.
- **Sem valores**: o rascunho sai com a modalidade e a taxa; o editor mostra "Guardar como valores da modalidade". `salvar_valores_da_modalidade` guarda os itens do orçamento como o modelo da modalidade (sem a taxa do órgão) e manda o anterior para a lixeira dos modelos.
- Mapeamento modalidade → licenças do pacote (trifásica: LAP, LAI, LAO), objeto, nome dos valores e despesa da taxa em `packages/domain/src/triagem-orcamento.ts`.
- Triagem sem empreendimento (prospecto) não tem "Orçar" nesta versão.

## Consequências

- Migration `20261121200000_triagem_vira_orcamento.sql` (colunas e RPCs aditivas) e pgTAP 770.
- A triagem passa a ler o contexto da consultoria (papel), como na `camada/renovacao-orcamento`.
