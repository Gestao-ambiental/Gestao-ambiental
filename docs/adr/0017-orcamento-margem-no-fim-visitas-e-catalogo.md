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

## Atualização de 12/11/2026: preço pela tabela de hora de venda e piso por hora

- **Hora de venda por nível:** Custos e taxas cadastra a hora de venda por nível. Um botão preenche com a tabela ACEAMB de 2015 corrigida pelo IPCA até agosto de 2026: Júnior R$ 214,19, Sênior R$ 356,98 e Máster R$ 446,22.
- **Duas formas de preço no orçamento:**
  - **pela tabela**: preço do item = horas × hora de venda do nível + outros custos, e a margem vira resultado;
  - **pela margem**: como antes.
- **Forma padrão:** com níveis cadastrados, o orçamento novo nasce pela tabela.
- **Pendência:** item sem nível válido deixa o preço pendente.
- **Piso por hora:** é informado pela consultoria, sem inventar o divisor legal do piso de engenheiro (Lei 4.950-A/66).
  - Quem está "pelo piso" recebe horas no mês × piso por hora.
  - A remuneração acompanha a carga de cada mês.
- **Onde vive:**
  - migration `20261112110000_preco_pela_tabela_e_piso.sql`;
  - `precificarOrcamento` com `formaDePreco`;
  - testes em `supabase/tests/210_preco_pela_tabela.test.sql` (16 testes).
- **Ainda não feito:**
  - os serviços de preço fechado da tabela (RAP, EAS, PRAD, PGRS);
  - o deslocamento por faixa (0–50 km, 50–150 km, diária);
  - o CTF por porte.
