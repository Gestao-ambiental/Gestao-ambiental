# ADR-0017: Orçamento com margem no fim, contas do mês, visitas e catálogo de Joinville

- **Situação:** aceito pelo Eduardo em 11/11/2026. Implementado na branch local `local/orcamentos-fluent`.
- **Requisitos:** ORC-01 (catálogo), ORC-02 (proposta) e ORC-03 (cronograma).
- **Origem:** comparação com a prévia de orçamentos feita no ChatGPT/Codex, que tinha o catálogo, as contas do mês e o deslocamento.

## Decisões

1. **Margem única, escolhida no fim.**
   - Os itens mostram só horas, outros custos e custo.
   - Na seção "Preço e margem", a pessoa escolhe a margem do orçamento. Ela vem preenchida com a margem desejada da base.
   - Preço total = (custos + visitas + despesas incluídas + taxas fixas) ÷ (1 − margem − tributos − taxas).
   - O preço é repartido entre os serviços pelo custo de cada um, com centavos por maior resto.
   - Itens não têm mais preço manual nem margem por item.
2. **Contas do mês detalhadas** em Custos e taxas (aluguel, energia, água, internet…).
   - A soma vira o custo fixo mensal.
   - Os nomes sugeridos vêm sem valor: o sistema não inventa número.
   - Cada orçamento mostra quanto cobre de cada conta, pelas horas estimadas.
3. **Visita técnica: valor fixo e por km.**
   - A base guarda o valor de uma visita e o custo por km.
   - O orçamento guarda a quantidade de visitas, os km por visita (ida e volta) e outros gastos por visita.
   - Custo = visitas × (valor + km × custo do km + outros).
   - As visitas são uma linha própria da proposta.
4. **Catálogo fixo no sistema**, em `apps/web/src/app/paginas/orcamentos/catalogo-servicos.ts`.
   - 56 modelos: os 52 da prévia, mais 4 serviços da carta de Joinville que faltavam (canil/gatil, transportador de efluentes, transportador de RCC e MTR).
   - Foram retiradas as referências a propostas de clientes.
   - Ao aplicar um modelo, as etapas viram itens e as despesas entram a cotar. Etapas condicionais começam desmarcadas.
   - Horas e preço de tabela por consultoria ficam para depois.

## Onde vive cada regra

- **Domínio:** `packages/domain/src/preco-do-orcamento.ts` (`precificarOrcamento`, `custoDasVisitas`, `rateioPorConta`), com teste. O preço é calculado em inteiros, para dar o mesmo centavo que o banco.
- **Banco:** migration `20261111230000_orcamento_margem_no_fim_contas_e_visitas.sql`.
  - `private.precificar_orcamento` grava o preço de cada item e o das visitas ao salvar o rascunho.
  - `salvar_base_de_custos` aceita as contas, a visita e o km.
  - A lista devolve total nulo enquanto o preço estiver pendente.
- **Testes:**
  - `supabase/tests/190_orcamentos.test.sql`: 60 testes, incluindo um caso que confere o mesmo centavo do domínio.
  - Testes de tela em `orcamentos.test.tsx`.

## Consequências

- Rascunhos antigos com preço manual por item passam a ter o preço calculado ao serem salvos de novo. Propostas enviadas não mudam.
- Despesa incluída a cotar, falta de base ou falta de itens deixam o preço pendente: zero nos itens e total nulo na lista, nunca um zero enganoso.
- As 4 composições novas do catálogo são sugestões de escopo e precisam de revisão técnica, como as demais.

## Atualização de 12/11/2026: orçamento para prospecto

- **O que muda:** o orçamento pode nascer para um **prospecto**, alguém que pediu preço e ainda não está cadastrado (ORC-02, "cliente/prospecto"). A lista de empreendimentos não recebe quem só pediu preço.
- **Dados:** nome obrigatório; CNPJ, contato, e-mail e telefone opcionais. Nunca CPF.
- **Cadastro:** "Cadastrar como empreendimento", no próprio orçamento, cria o empreendimento e liga o orçamento a ele.
  - Se o CNPJ já está cadastrado na consultoria, liga ao empreendimento existente em vez de duplicar.
  - Repetir não cria outro empreendimento.
  - Os dados do prospecto ficam como histórico.
- **Pendente:** a conversão automática na aprovação (FIN-06) espera a etapa de aprovação do orçamento.
- **Onde vive:**
  - migration `20261112090000_orcamento_para_prospecto.sql`, com `private.gravar_prospecto` e `public.cadastrar_empreendimento_do_prospecto`;
  - testes em `supabase/tests/200_orcamento_prospecto.test.sql` (22 testes).
- **Decisões tomadas sem confirmação do Eduardo:**
  - o CNPJ é opcional;
  - o nome do empreendimento criado é o nome do prospecto, sem preencher o cliente contratante.

## Atualização de 12/11/2026: visita técnica com preço fixo

- **O que muda:** a visita técnica deixa de receber a margem. O valor da visita e o valor por km cadastrados em Custos e taxas são **preço**, não custo.
- **Por quê:** na simulação da Envora (hora a R$ 150 e visita a R$ 250), a margem alta, perto de 79%, transformava R$ 250 de visita em R$ 1.182 na proposta.
- **Fórmulas:**
  - preço dos serviços = (custo dos itens + despesas incluídas + taxas fixas) ÷ (1 − margem − tributos − taxas), repartido entre os itens pelo custo de cada um;
  - preço das visitas = visitas × (valor da visita + km × valor do km + outros gastos), sem margem;
  - preço total = serviços + visitas.
- **Lucro na divisão do valor:** é a margem dos serviços, menos os tributos e as taxas percentuais que incidem sobre as visitas.
- **Onde vive:**
  - `packages/domain/src/preco-do-orcamento.ts` (`valorDasVisitas`, `precificarOrcamento`);
  - migration `20261112100000_visita_com_preco_fixo.sql` (`private.precificar_orcamento`).

## Atualização de 12/11/2026: preço pela tabela de hora de venda, custo por profissão e piso

- **Tabela de hora de venda por profissão e atividade ou nível:** cada linha é algo como Eng. ambiental · Júnior, Eng. ambiental · Avaliação e perícia ambiental ou Biólogo · Sênior, com a fonte do valor.
  - Um botão preenche com a tabela ACEAMB de 2015 corrigida pelo IPCA até ago/2026: Júnior R$ 214,19, Sênior R$ 356,98, Máster R$ 446,22 e Perícia R$ 356,98.
  - Outras profissões (biólogo, eng. civil, arquiteto) entram com os valores que a consultoria informar. Não há valor inventado.
- **Duas formas de preço:**
  - **pela tabela**: cada serviço escolhe uma linha, e o preço = horas × hora de venda + outros custos; a margem vira resultado;
  - **pela margem**: como antes.
- **Forma padrão:** com tabela cadastrada, o orçamento novo nasce pela tabela.
- **Pendência:** item sem hora válida deixa o preço pendente.
- **Custo por profissão:** cada pessoa da equipe tem profissão, e a base guarda a hora técnica de cada profissão (parte técnica ÷ horas faturáveis de quem é dela).
  - O custo de cada serviço usa a profissão da hora escolhida.
  - Sem ninguém daquela profissão na equipe, vale a média da equipe.
  - Isso vale nas duas formas de preço: pela margem, a linha escolhida define só a profissão do custo.
- **Piso por hora** (substituído pelo ADR-0018 §11: saiu o "pelo piso"): é informado pela consultoria, sem inventar o divisor legal do piso de engenheiro (Lei 4.950-A/66).
  - Quem está "pelo piso" recebe horas no mês × piso por hora, e a remuneração acompanha a carga de cada mês.
- **Onde vive:**
  - migration `20261112110000_preco_pela_tabela_e_piso.sql`, com `private.itens_do_preco` e `private.precificar_orcamento`;
  - no domínio, `precificarOrcamento` e `custoHoraPorProfissao`;
  - testes em `supabase/tests/210_preco_pela_tabela.test.sql` (17 testes).

## Atualização de 12/11/2026 (2): equipe por membro, responsável e mês de cada serviço

Decisões do Eduardo: a consultoria paga o piso (ou o pró-labore) pela jornada, mas quanto dessas horas vira serviço, e se é técnico ou administrativo, é decidido em cada orçamento. Quando o contrato for assinado e pago, a tarefa já tem que nascer para a pessoa certa.

- **Equipe da base = membros com login.** Cada linha escolhe um membro ativo (uma vez só), com custo do mês e horas no mês (jornada).
  - Saíram o aproveitamento e a parte técnica em %. A hora de custo de cada pessoa é custo ÷ horas.
  - A hora técnica média (Σ custos ÷ Σ horas) vale para o serviço sem responsável. As contas do mês são rateadas pelas mesmas horas.
  - Quem ainda não tem conta precisa ser convidado antes de entrar na equipe.
- **Piso por hora** (substituído pelo ADR-0018 §11) só aparece, abaixo da equipe, quando alguém está pelo piso. Vazio com alguém pelo piso, a base não salva. "Como calcular" explica a conta dos 8,5 salários mínimos, sem fixar o valor do salário mínimo.
- **Responsável por serviço (um por serviço).** O custo do serviço usa a hora do responsável. Sem responsável, a da profissão da hora de venda; sem ninguém dessa profissão, a média. Responsável de outra consultoria ou desligado é recusado (`responsavel_invalido`).
- **Técnica ou administrativa muda só o preço**: vira uma linha da tabela de hora de venda (ex.: "Administrativo · Protocolo"). O custo é sempre a hora da pessoa.
- **Mês previsto e carga.** Cada serviço tem o mês previsto (primeiro dia do mês, `DATE`). Ao escolher o responsável e o mês, a tela mostra as horas dele naquele mês (orçamentos aprovados + este) contra a jornada, e avisa por texto quando passa.
  - `public.carga_da_equipe` (só Gestão) devolve a jornada e as horas comprometidas por membro e mês, do mês atual no fuso da consultoria em diante.
  - Enquanto não houver o passo de aprovação no produto (ORC-04), só orçamentos marcados como aprovados contam.
- **Depois da aprovação** (ADR-0016), cada serviço vira uma etapa da demanda com o responsável escolhido no orçamento, e a gestão pode trocar.
- **Onde vive:** mesma migration `20261112110000_preco_pela_tabela_e_piso.sql` (nunca aplicada fora desta máquina); domínio em `carga-da-equipe.ts`, `custoHoraPorMembro` (depois substituída por `horaDeCustoPorMembro`, em `remuneracao.ts`) e `horaDeCustoDaPessoa`; testes em `supabase/tests/220_responsavel_e_carga.test.sql`.

## Atualização de 12/11/2026 (3): lixeira e proposta pronta

- **Lixeira (decisões do Eduardo).** Excluir manda o orçamento para a lixeira (exclusão lógica, com quem excluiu e quando); dá para restaurar. Qualquer situação pode ir, menos aprovado. Na lixeira, o orçamento não muda até ser restaurado (trigger no banco). O número não é reaproveitado. Excluir nunca apaga cobranças nem tarefas (regras de negócio, §7.2).
  - Banco: migration `20261112170000_lixeira_de_orcamentos.sql`, com `excluir_orcamento`, `restaurar_orcamento` e `listar_orcamentos(..., p_lixeira)`; testes em `supabase/tests/230_lixeira_de_orcamentos.test.sql`.
  - Tela: botão de excluir em cada linha (com confirmação), botão "Lixeira" na lista e "Restaurar" na lixeira e no próprio orçamento.
- **Proposta pronta (ORC-05).** `/orcamentos/:id/proposta`, fora do menu lateral: serviços com valor, visitas, total, parcelas, o que fica por conta do cliente (taxa do órgão e reembolsos), prazos, premissas e exclusões. Sem custo, margem, horas, responsáveis nem notas internas. "Imprimir ou salvar PDF" usa a impressão do navegador. Abre no fim das parcelas, no cabeçalho do orçamento e na lista.
- **Ainda não feito:**
  - serviços de preço fechado (RAP, EAS, PRAD, PGRS; e a tabela do CAU, que é por área e complexidade, não por hora);
  - deslocamento por faixa;
  - CTF por porte;
  - sugestão de hora pelo modelo do catálogo ou pelo responsável do serviço.

## Atualização de 12/11/2026: acréscimo sobre trabalho e contas

- Decisão do Eduardo: o percentual escolhido incide sobre a soma do trabalho da equipe e do rateio das contas da consultoria. Outros custos dos itens e despesas incluídas não recebem esse acréscimo.
- Tributos e taxas percentuais são cobertos no preço dos serviços, inclusive os que incidem sobre visitas de valor fixo; taxas fixas também são incluídas. A margem efetiva sobre a venda pode diferir do percentual escolhido.
- O preço de rascunhos pela margem é recalculado ao salvar com a regra nova; a visita mantém seu valor.

## Atualização de 12/11/2026: hora de venda na base do acréscimo

- Eduardo confirmou que o acréscimo incide sobre as horas de venda selecionadas e o rateio das contas. Exemplo: 3 × R$ 214,19 + R$ 2,88 = R$ 645,45; com 30%, R$ 839,09 antes de tributos e despesas.
- O custo interno da equipe permanece para cálculo do lucro estimado, mas não substitui nem se soma novamente à hora de venda. Despesas de terceiros continuam sem acréscimo.
- Para qualquer forma de preço é necessário selecionar hora de venda válida por item. Rascunhos antigos sem hora de venda ficam pendentes até sua seleção.
