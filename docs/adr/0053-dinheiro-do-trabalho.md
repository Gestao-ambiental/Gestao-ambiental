# ADR-0053: Dinheiro do trabalho (P7)

- Situação: proposta (camada `camada/dinheiro-do-trabalho`)
- Data: 21/11/2026
- Relaciona: ADR-0027 (tempo poupado), ADR-0029 (aprovação com tarefas), ADR-0041 (base das oito funções)

## Contexto

Depois de aprovado, o orçamento some da vista do dono: não se sabe quantas horas o serviço consumiu nem quanto já entrou. O estudo das 8 funções (P7) pede horas lançadas e recebimentos sobre as parcelas, sem integração bancária.

## Decisão

- **Permissão financeira no vínculo** (`membro.financeiro`, padrão verdadeiro): vale para a Gestão; a Equipe nunca vê dinheiro. Ligada e desligada no "…" da pessoa em Configurações › Equipe (`definir_permissao_financeira`). A última pessoa com ela não a perde (`ultimo_financeiro`).
- **`apontamento_horas`**: autor, orçamento, item ou tarefa (exatamente um), data, minutos de 1 a 1440 e nota. Só o autor e a Gestão leem. `lancar_horas` é idempotente pelo id e só aceita orçamento aprovado e tarefa não cancelada; `remover_apontamento` é exclusão lógica.
- **`orcamento_recebimento`** (não `cobranca`, que é a assinatura do Grama): parcela, valor em centavos com a moeda, data, nota. Só quem tem a permissão financeira lê e registra. `estornar_recebimento` marca, nunca apaga.
- **Parcelas**: valor pelo maior resto, igual a `distribuirPorMaiorResto` (`private.parcelas_com_valor`); vencimento combinado (`orcamento_parcela.vence_em`, `definir_vencimento_da_parcela`) ou, sem ele, a data do aceite mais os dias da parcela.
- **Travas**: orçamento aprovado com recebimento não volta a rascunho (`orcamento_com_recebimento`); parcela com recebimento não é apagada (`parcela_com_recebimento`), então `salvar_orcamento` não a remove.
- **Telas**: seção "Execução" no orçamento aprovado (orçado × lançado por serviço, lançar e remover horas; parcelas com a situação em palavra, registrar e estornar recebimento) e "A receber" no placar de Orçamentos (`a_receber_dos_orcamentos`, função nova: `resumo_dos_orcamentos` não muda de assinatura).
- `private.dinheiro_dos_orcamentos(cid)` devolve aprovado, recebido, a receber e vencido por orçamento, para o painel do dono (P8).

## Consequências

- Migration `20261121173000_dinheiro_do_trabalho.sql` e pgTAP 730.
- Lançar horas pela Visão ou pela tarefa da Equipe fica para depois; hoje a Gestão lança na seção Execução.
