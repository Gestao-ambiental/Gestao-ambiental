# ADR-0023 — Orçamento rápido (preço digitado e orçamento sem configuração)

**Situação:** aceita em 14/11/2026, regras decididas pelo Eduardo. Altera a ADR-0020 §2 (o convite grande da lista sai) e a ADR-0018 P7 (o modelo passa a guardar o preço digitado). Motivo: num painel simulado, 45 de 50 donos largariam a configuração de custos e 28 querem orçar sem passar por ela.

## Decisões

1. **Preço digitado.** Um serviço do orçamento pode ter o preço digitado direto, sem linha da tabela de preços: `orcamento_item.hora_venda_id` nulo e `preco_fechado_centavos` preenchido (coluna que já existia para o pacote; sem mudança de tabela). Vale como preço fechado, igual ao pacote: não recebe acréscimo de margem; tributos e taxas percentuais da base, quando há base, incidem como no pacote. As horas estimadas do serviço continuam valendo para custo e carga da equipe.
2. **Sem configuração** (orçamento sem base, `base_registrada_em` nulo): preço = soma dos preços digitados + despesas de terceiros incluídas (repartidas pelos serviços na proporção do preço, por maior resto) + visitas × valor de cada visita. O valor de cada visita reaproveita `outros_por_visita_centavos`, com o rótulo "Valor de cada visita"; o km não entra. Sem tributo, taxa ou margem. Custo, lucro e margem aparecem como **não calculados**, nunca zero. Continuam deixando o preço pendente: despesa incluída a cotar, serviço sem preço digitado e serviço ligado à tabela de preços.
3. **Com configuração.** O preço digitado fica disponível na mesma lista da tabela de preços ("Preço digitado"). O Grama mostra se o preço cobre o custo com a margem resultante que já existia: com algum preço digitado, a situação da margem compara a margem que sobra com a mínima, e um lucro negativo vira o aviso "O preço não cobre o custo".
4. **Lista de orçamentos.** Sai o bloco "Configure os preços em poucos passos" (e o "Ver orçamentos mesmo assim"). No lugar, o link discreto "Calcular preço pelos custos" para `/orcamentos/primeiros-passos`, que some quando a configuração está publicada. Os primeiros passos não mudam.
5. **Nada bloqueia o orçamento rápido:** criar, adicionar serviço com preço digitado, ver o total, abrir a proposta, duplicar (com os preços) e salvar como modelo. O modelo guarda o preço digitado de cada serviço sem linha da tabela (`preco_digitado_centavos` no item do modelo); os demais preços continuam fora do modelo.

## Onde vive

- Regra pura: `precificarOrcamento` em `packages/domain/src/preco-do-orcamento.ts` (testes em `preco-orcamento-rapido.test.ts`).
- Banco: `supabase/migrations/20261114120000_orcamento_rapido.sql` reescreve `private.itens_do_preco`, `private.preco_pendente`, `private.precificar_orcamento` (mesmos centavos do domínio) e `public.salvar_modelo_de_orcamento`. Sem tabela nova; RLS e concessões iguais. Teste pgTAP `supabase/tests/380_orcamento_rapido.test.sql`, com o negativo de outra consultoria.
- Tela: `PaginaOrcamento.tsx` (escolha entre a tabela e "Preço digitado"; sem base, só o digitado) e `PaginaOrcamentos.tsx` (link discreto).

## Consequências

- Item que já tinha `hora_venda_id` nulo e preço fechado (pacote copiado com preços depois que a linha sumiu da tabela) passa a valer como preço digitado em vez de ficar pendente. O preço gravado desses rascunhos se atualiza no próximo salvamento.
- "Duplicar sem os preços" continua limpando o preço fechado, inclusive o digitado, como já fazia com o pacote.
