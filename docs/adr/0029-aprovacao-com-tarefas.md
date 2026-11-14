# ADR-0029: Aprovação do orçamento com tarefas

- **Situação:** aceito em 14/11/2026. É protótipo funcional, e o Cadu revisa.
- **Requisitos:** FIN-01 (aceite) e FIN-03 (demandas de serviço), além do Protótipo 22.
- **Estudo:** [docs/estudos/aprovacao-tarefas-e-capacidade.md](../estudos/aprovacao-tarefas-e-capacidade.md), fatia 1.
- **Decisões:** A1 a A8 do estudo. O Eduardo pediu que eu seguisse as minhas recomendações.

## Decisão

1. **Aprovar registra o aceite.** O aceite tem quem aprovou pelo cliente, a data e a referência, todos obrigatórios. O método é opcional. Há um registro por revisão, na tabela `orcamento_aceite`.
   - O banco grava um SHA-256 do conteúdo comercial da revisão (itens, preços, despesas, parcelas, premissas). Isso não é assinatura qualificada.
   - Só a Gestão lê o aceite.
   - O comprovante em arquivo ficou para depois.
2. **Tarefas em tabela própria (`tarefa_servico`), não como ocorrência.** A ocorrência exige licença e prazo oficial, e um serviço contratado não tem nenhum dos dois. Cada tarefa tem:
   - responsável (`membro_id`);
   - horas estimadas, com nulo = não estimada, nunca zero;
   - prazo interno (`DATE`);
   - situação: a fazer, em andamento, concluída ou cancelada.
3. **Uma tarefa por serviço, editável antes de confirmar.** O roteiro já vem com o responsável, as horas e o fim do mês previsto que a Gestão escolheu no orçamento. Dá para tirar e acrescentar tarefas. A caixa "Gerar tarefas" vem marcada.
4. **Uma transação só (`aprovar_orcamento`).** Ela valida tudo antes de gravar e muda a situação pelo mesmo caminho de `mudar_situacao_orcamento`.
   - O serviço que já tem tarefa (de uma revisão anterior) não ganha outra, pela chave única do item.
   - A tarefa cujo serviço saiu numa revisão continua existindo, marcada "fora da revisão aprovada".
   - Reabrir ou excluir o orçamento não apaga tarefas.
5. **Permissões.**
   - **Todo membro ativo:** vê as tarefas (sem valores).
   - **Responsável:** inicia, conclui e reabre a própria tarefa.
   - **Gestão:** edita, acrescenta, cancela e restaura.
6. **Onde aparecem:**
   - no orçamento, em "Tarefas da execução";
   - na visão da equipe, com o rótulo "Serviço" ("Minhas ações" mostra só as da pessoa);
   - no calendário, pelo prazo interno.
7. **A carga da equipe conta a tarefa no lugar do item**, pelo mês do prazo interno. Nada conta duas vezes. Tarefas concluídas e canceladas saem da conta.
8. **O processo de obtenção não é aberto na aprovação**, porque o módulo de processo ainda não existe. **O prospecto não precisa virar empreendimento** para aprovar.
9. **Tabela de orçamento segue a regra do plano.** O aceite segue a regra comercial do plano (orçamentos só no Equipe e no Escala). A tarefa é execução e fica editável em qualquer plano ativo.

## Fora desta fatia

Ficaram de fora:

- jornada, feriados, ausências e a tela de carga da equipe (fatia 2);
- horas na condicionante e prévia de impacto (fatia 3);
- comprovante do aceite em arquivo;
- roteiros por tipo de serviço.

## Nota

A branch `claude/terceirizado-orcamento` também usa o número 0028. Ao juntá-la, o ADR dela vira 0031 (a 0030 é a de recursos por plano).
