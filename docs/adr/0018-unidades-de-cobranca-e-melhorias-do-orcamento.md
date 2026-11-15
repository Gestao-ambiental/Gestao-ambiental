# ADR-0018 — Unidades de cobrança e melhorias do orçamento

**Situação:** proposta de pesquisa e especificação, 12/11/2026. As respostas do Eduardo estão na §9 e as fatias 2 a 6 foram implementadas (§10 a §14); o resto continua proposta. Complementa [ADR-0017](0017-orcamento-margem-no-fim-visitas-e-catalogo.md); as decisões D1–D12 do [ADR-0016](0016-automacao-do-orcamento-a-execucao.md) continuam pendentes.

## 1. Contexto e pesquisa

O domínio atual tem modos `tabela` e `margem` no orçamento inteiro. Após a alteração local mais recente, o acréscimo incide sobre **horas de venda selecionadas e rateio das contas**, não sobre o custo da equipe. Custos internos seguem separados. Visita tem preço fixo. A carga usa minutos por responsável e mês em orçamentos aprovados, mais a prévia do orçamento em tela. O botão de aprovação e as integrações externas ainda não foram implementados. Referências: `packages/domain/src/preco-do-orcamento.ts`, `carga-da-equipe.ts`, ADR-0017 e as duas migrations locais.

O teste citado foi com **20 personas simuladas**, 19 respostas completas e uma parcial; ninguém operou uma tela real. As contagens são indícios de produto, não pesquisa estatística com clientes. Fonte: painel simulado, fora do repositório. O relato aponta 17/19 para cobrança não horária, 17/19 para modelos locais e 13/19 para dificuldades com piso.

**Fontes externas consultadas em 12/11/2026; fatos, sem importar valores de mercado:**

- [SEINFRA-PA, planilha orçamentária e composições](https://seinfra.pa.gov.br/site/upload/Licitacao_arquivo/1742571834-4.Planilhas%28Or%C3%A7ament%C3%A1ria%2CBDI%2CRlat%C3%B3riodeconsolida%C3%A7%C3%A3ocustosm%C3%A3odeobraeComposi%C3%A7%C3%A3ounit%C3%A1ria%29.pdf?id=1751235376): um contrato público apresenta relatórios, campanhas e equipe/mês como unidades. Não prova que sejam universais.
- [CAU/BR, Preço Inteligente](https://caubr.gov.br/workshop-preco-inteligente-do-custo-ao-valor-passa-por-quatro-cidades-do-parana/): cita hora e m² como formas de cobrança. [CAU/BR, contratação](https://caubr.gov.br/contrate-um-arquiteto-12-passos/) destaca escopo, prazo, visitas e registro de responsabilidade. Não importar tabelas por profissão.
- [Stripe, faixas e volume](https://stripe.com/resources/more/tiered-pricing-101-a-guide-for-a-strategic-approach): distingue faixas progressivas, em que cada bloco tem tarifa própria, de volume, em que uma tarifa vale para toda a quantidade. É analogia matemática, não preço de consultoria.
- [Zoho FSM, listas de preços](https://help.zoho.com/portal/en/kb/fsm/catalog-and-pricing/articles/pricebooks) descreve preços por serviço e quantidade; [Zoho Books, API de orçamentos](https://www.zoho.com/books/api/v3/estimates/) documenta unidade, quantidade e preço por item. São referências de modelagem, não fornecedores escolhidos.
- [Sebrae, Precifique](https://precifique-apps.pr.sebrae.com.br/precifique/home): custos, despesas, tributos e lucro são parâmetros da empresa; resultado é estimativa, sem percentual universal.

**Lacuna:** não encontrei fonte suficiente para generalizar como todas as consultorias rurais no Brasil cobram por hectare ou porte. São opções solicitadas, não regra de mercado ou enquadramento legal automático.

## 2. Propostas por necessidade

### 2.1 Unidades e horas

Problema 17/19: era preciso usar horas fictícias para representar outra unidade. Eduardo já decidiu aceitar **hora, m², hectare, diária, campanha, pacote e porte**; cada consultoria informa seus próprios preços. Nenhuma tabela por profissão será adicionada. O atalho ACEAMB já existente continua opcional, isolado e identificado como histórico.

**Proposta:** separar, no item, (1) **unidade vendida, quantidade e tarifa** de (2) **minutos estimados de execução, responsável e mês**. Horas são obrigatórias para concluir, mas podem ficar pendentes em rascunho; ausência não vira zero. A consultoria pode informar minutos por unidade na própria tabela; a sugestão é editável e guarda origem e tempo final. Pacote, diária e campanha também têm horas estimadas. Nunca derivar horas automaticamente de área sem coeficiente explícito e revisão da pessoa.

Evoluir a atual `orcamento_base_custos.horas_venda` para **Tabela de preços**, com ID estável, nome/atividade, unidade, forma, preço, minutos sugeridos opcionais e fonte opcional. Profissão não é chave obrigatória. Item guarda snapshot/versionamento da tarifa, faixas, mínimo e base: a alteração posterior de tabela não muda proposta enviada ou aprovada. Preservar a representação antiga até validar migração e paridade.

- **Preço simples:** quantidade decimal exata até quatro casas × centavos por unidade; arredondar metade para cima uma vez no fim da linha. Discretos como pacote e campanha inteiros no lançamento, salvo decisão contrária. `1 ha = 10.000 m²` é conversão física, não conversão de preço ou horas.
- **Faixas:** propor progressivas e configuradas pela consultoria; limites crescentes e contíguos a partir de zero e última faixa aberta. Cada trecho recebe seu valor; somar em precisão exata e arredondar uma vez por linha. Exatamente 500 pertence à primeira faixa `até 500`; 500,0001 também usa a segunda no excedente. Lacuna, sobreposição ou quantidade não coberta impedem concluir. Preço mínimo opcional: `max(soma das faixas, mínimo)` antes das despesas. Fator de complexidade opcional em pontos-base, digitado pela consultoria e aplicado à soma antes do mínimo. Recomendo preço simples primeiro e faixas numa fatia seguinte. Nunca inferir complexidade ou enquadramento ambiental.
- **Pacote:** quantidade 1, preço fechado digitado, escopo e horas próprias. Não receber acréscimo automático. Calcular o valor que sobra após custos, rateio, tributos e taxas; não mudar o pacote ao atualizar a tabela. Um orçamento misto `margem` + pacote exige a regra em 4.1; até implementá-la, bloquear combinação com aviso claro, não alterar preço silenciosamente.
- **Diária/campanha:** registrar quantidade, composição da equipe, horas por pessoa, logística e o que está incluído. Barco, hospedagem, alimentação e deslocamento entram **uma só vez**: gasto próprio em outros custos diretos; terceiro em despesa com tratamento «Incluída», «Reembolso» ou «Cliente paga». A proposta mostra preço e tratamento escolhidos, sem custo interno.
- **Porte:** uma característica configurável da atividade, não unidade física nem classificação legal automática. Consultoria informa referência, por exemplo cabeças, e rótulo da classe; se o critério for normativo, profissional consulta a fonte atual e revisa. Nunca sugerir enquadramento apenas pela classe.
- **Recorrência:** recomendo depois das unidades básicas. Mensalidade é prestação contínua contratada, não 12 parcelas de venda única. Precisa de vigência, entregas, competência, renovação/cancelamento, reajuste aprovado, recebedor, calendário e geração idempotente de cobranças. Gateways, assinatura, liberação, envio e D1–D12 de 0016 seguem pendentes.
- **Proposta pública:** ex.: «Projeto · 1.250 m² · Total R$ …», «2 campanhas · Total R$ …» ou «Pacote · R$ …». Mostrar preço unitário quando aplicável; em faixas oferecer detalhamento e não representar média como tarifa contratual. Padrão: sem custo, rateio, margem, horas ou responsáveis; expor horas apenas se usuário escolher incorporá-las ao escopo público.

Para equipe com várias pessoas/meses, propor alocações por membro e mês cuja soma seja o tempo total. Até essa fatia, há somente um responsável: não atribuir a ele artificialmente todas as horas de uma equipe. Sem responsável/capacidade, mostrar desconhecido. Alternativas descartadas: converter toda venda em hora fictícia (distorce capacidade) e somente preço fechado (não representa quantidade ou medição). Progressivo versus volume e coexistência dos modos ficam para P1/P3.

### 2.2 Remuneração sem «Pelo piso»

Problema: 13/19 confundiram piso e como remunerar; não é validação trabalhista. Decisão de Eduardo: remover controles e ajuda «Pelo piso» / «Piso por hora»; não inventar piso ou encargos. Cadastro manual restrito à Gestão por `membro_id`; remuneração e disponibilidade são dimensões distintas.

| Forma        | Entradas informadas                                                                      | Custo/h e carga propostas                                                                               |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| CLT          | salário e custo mensal total incluindo encargos/benefícios informados; horas disponíveis | total ÷ horas; capacidade em minutos informada                                                          |
| Pró-labore   | custo mensal total e horas disponíveis                                                   | total ÷ horas; não confundir retirada de lucro com custo                                                |
| Estágio      | bolsa e custo mensal completo informado; horas disponíveis                               | total ÷ horas; sem inferir regime ou direitos                                                           |
| Por diária   | custo por diária, horas por diária e dias disponíveis no mês                             | custo ÷ horas da diária; capacidade = dias × horas quando informados; caso contrário desconhecida       |
| Por projeto  | custo total contratado e horas estimadas para o projeto                                  | custo ÷ horas do projeto; capacidade mensal só se informada; não duplicar custo como despesa e trabalho |
| Meio período | jornada reduzida em uma das formas acima, não tipo de contrato                           | usar custo e horas efetivamente informados, sem reduzir automaticamente                                 |

Dividir centavos por horas com metade para cima; custo do item = minutos × custo/h ÷ 60. Separar horas disponíveis, pagas e faturáveis; estas últimas seguem o cadastro atual. Ausente é desconhecido, não zero. Responsável continua membro com login; prestador sem login depende de P6. Contador valida custos e encargos; software não calcula enquadramento trabalhista nem percentuais legais.

**Migração de piso:** preservar valores e snapshots. Na base ativa, linha `pelo_piso=true` passa a «forma ainda não informada», mostrando custo mensal gravado e horas para confirmação; não classificar como CLT automaticamente. Guardar cópia de origem, flag de revisão e plano de reversão. Remover campo da interface; remover coluna antiga somente em migration futura após inventário, backup e validação. Linhas sem piso mantêm custo/horas e tipo não inferido. Não recalcular históricos automaticamente.

### 2.3 Modelos nacionais

Problema 17/19: catálogo atual é local de Joinville. Um modelo de serviço não deve trazer preço pronto nem presumir documentos exigidos; exceção independente: atalho ACEAMB histórico já existente.

| Opção                         | Benefício                                      | Custo/risco e recomendação                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salvar orçamento como modelo  | reutiliza trabalho e constrói catálogo próprio | **Médio; recomendo primeiro:** copiar apenas descrição, escopo, unidade e horas revisadas; sem cliente, valores, membros, contratos ou arquivos privados                               |
| Duplicar orçamento            | 2/19 pediram; rápido para repetição            | **Baixo/médio; recomendo junto:** novo rascunho, novo ID e revisão de cliente/datas; copiar preços só mediante escolha explícita (P7), nunca vínculos de cobrança, contrato ou tarefas |
| Modelos genéricos sem cidade  | ajuda começar                                  | **Médio/alto; depois:** estruturas editáveis sem preços ou promessa regulatória, revisão técnica obrigatória                                                                           |
| Importar planilha de serviços | útil para catálogo grande                      | **Alto; depois:** mapeamento, prévia, validação por linha, duplicatas e confirmação                                                                                                    |

Rejeitar aplicar o catálogo municipal de Joinville como se fosse nacional. Não enviar modelo/IA como interpretação ambiental operacional sem revisão e fonte.

### 2.4 Outras melhorias: agora, depois ou nunca

São recomendações, não decisões. Contagem não especificada significa que a síntese não quantifica isoladamente.

| Necessidade                                      |                                                            Painel | Proposta e alternativa                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enviado, negociação, aprovado, recusado (ORC-04) |                                                              7/19 | **Agora:** registrar manualmente estado, autor/membro, data e revisão com `row_version`. Rascunho mostra carga como prévia; aprovado entra uma vez no comprometido; reversão/revisão exige regra explícita. Não afirmar que envio/assinatura aconteceu nem criar cobrança automaticamente. D3/D4 e demais do 0016 continuam pendentes. |
| Enviar por e-mail/WhatsApp                       |                                                              2/19 | **Depois:** preparar mensagem/link mediante clique e revisão, distinguindo preparado, envio informado e confirmação. Integração, provedor, custos e D11 ainda pendentes.                                                                                                                                                               |
| Duplicar                                         |                                                              2/19 | **Agora**, conforme P7 e 2.3; nunca copiar contratos, cobranças, tarefas ou histórico operacional.                                                                                                                                                                                                                                     |
| Logo/CNPJ, texto, ART/RRT, letra maior           |       logo 4; CNPJ 1; ART/RRT 6; texto/letra sem contagem isolada | **Agora:** identidade, texto revisável e leitura responsiva. ART/RRT opcional por profissional, digitada e conferida; não presumir registro ou exigência. Definir dados públicos em P8.                                                                                                                                                |
| Margem mínima por tipo                           |                                                                 1 | **Depois:** aviso configurável por categoria, sem mínimos inventados e sem bloquear silenciosamente.                                                                                                                                                                                                                                   |
| Rateio de contas uniforme                        |                                                                 4 | **Depois:** manter por hora e explicar; futuramente pesos auditáveis, preservando o total por maior resto. Não presumir que campo não usa escritório.                                                                                                                                                                                  |
| BDI, XLSX e trilha para licitação                |        ao menos 2 mencionam o conjunto; por item não quantificado | **Depois:** memória interna e XLSX seguro contra fórmulas em texto; trilha com membro/revisão; BDI configurável sujeito a edital e revisão técnica/contábil. Sem fórmula legal universal inventada.                                                                                                                                    |
| Importar histórico de planilha                   |                                                                 1 | **Depois:** staging, prévia, mapeamento, erros por linha e confirmação; sem criar contratos/cobranças/tarefas automaticamente.                                                                                                                                                                                                         |
| Painel de carga da equipe toda                   |                                                                 1 | **Depois:** Gestão, por membro/mês, capacidade conhecida e comprometido; preservar desconhecido e sigilo de remuneração.                                                                                                                                                                                                               |
| Linguagem                                        | 1 desconfiou de margem, 1 confundiu markup, 3 não entenderam base | **Agora:** «Valor que sobra (estimativa)» = receita menos custos e tributos/taxas; «Acréscimo sobre trabalho e contas» = percentual sobre a base exibida; «Sobre o que incide» = valores de venda das horas selecionadas + rateio. Acrescentar exemplo curto e explicar que acréscimo não é margem da venda.                           |
| Tela celular                                     |                                         2 citaram largura/leitura | **Agora:** cartões por item a 375 px com nome, unidade, quantidade, valor e editar; detalhes expansíveis para horas, responsável, mês e custos internos. Sem rolagem horizontal da página.                                                                                                                                             |

## 3. Modelo de dados — rascunho SQL, não executar

Quantidade exata `numeric(18,4)`, centavos inteiros, percentuais em pontos-base e minutos inteiros. Limitar operações ao menor entre os limites do domínio, banco e `Number.MAX_SAFE_INTEGER`. Snapshots preservam os parâmetros de cada revisão. Os nomes são proposta; conferir schema e migrations reais antes de implementar.

```sql
-- ESBOÇO: não é migration e não pode ser executado como está.
create table public.orcamento_tabela_preco (
  id uuid primary key, consultoria_id uuid not null references public.consultoria(id),
  nome text not null, unidade text not null check (unidade in ('hora','m2','ha','diaria','campanha','pacote')),
  regra text not null check (regra in ('simples','faixa_progressiva','fechado')),
  preco_unitario_centavos bigint check (preco_unitario_centavos >= 0),
  minimo_centavos bigint check (minimo_centavos >= 0),
  minutos_por_unidade numeric(18,4) check (minutos_por_unidade >= 0),
  fonte text, versao integer not null default 1, row_version integer not null default 1,
  unique (consultoria_id,id)
);
create table public.orcamento_tabela_faixa (
  id uuid primary key, consultoria_id uuid not null, tabela_preco_id uuid not null,
  ordem integer not null check (ordem > 0), ate_quantidade numeric(18,4),
  preco_unitario_centavos bigint not null check (preco_unitario_centavos >= 0),
  unique (consultoria_id,id), unique (consultoria_id,tabela_preco_id,ordem),
  foreign key (consultoria_id,tabela_preco_id) references public.orcamento_tabela_preco(consultoria_id,id)
);
create table public.orcamento_item_alocacao (
  id uuid primary key, consultoria_id uuid not null, orcamento_item_id uuid not null,
  membro_id uuid not null, mes_previsto date not null, minutos integer not null check (minutos > 0),
  unique (consultoria_id,id), unique (consultoria_id,orcamento_item_id,membro_id,mes_previsto),
  foreign key (consultoria_id,orcamento_item_id) references public.orcamento_item(consultoria_id,id),
  foreign key (consultoria_id,membro_id) references public.membro(consultoria_id,id),
  check (extract(day from mes_previsto)=1)
);
-- orcamento_item: unidade_venda, quantidade_venda numeric(18,4), origem_preco,
-- preco_fechado_centavos, tabela_preco_id, snapshot_preco jsonb, minutos existente,
-- origem_minutos, porte_rotulo, porte_quantidade, porte_unidade; FK composta para tabela.
-- orcamento_base_equipe: tipo_recebimento nullable, custo_mensal_centavos existente,
-- custo_diaria_centavos, minutos_por_diaria, custo_projeto_centavos, minutos_projeto,
-- capacidade_mes_minutos nullable, pendente_confirmacao; meio período é jornada.
```

RPC transacional valida valores condicionais e soma das alocações ao concluir; rascunho pode estar incompleto. Continuidade, ordenação e faixa final aberta exigem validação entre linhas, não apenas `CHECK`. Tabelas novas: `consultoria_id`, FK composta, RLS habilitada **e forçada**, leitura restrita à Gestão quando envolver preços/custos, escrita via RPC, `revoke` de `PUBLIC`/`anon` e grants explícitos. `security definer` com `search_path` fixo e verificação explícita de membro ativo e papel; testar papel proprietário/BYPASSRLS. Não confiar em ocultação no front. pgTAP negativo para outra consultoria, Equipe e vínculos cruzados; teste de concorrência com `row_version`. Se modelos forem tabelas, mesmos controles. Proposta pública usa projeção autorizada, sem campos internos.

## 4. Fórmulas e exemplos

Todos os números são **fictícios para testes**, não preços sugeridos. Operações em inteiros/numeric não negativos; arredondamento metade para cima ao fim da linha. Repartição de centavos por maior resto, desempate por ordem e ID estáveis, preserva soma. Lucro negativo é prejuízo. Testar overflow e evitar float.

### 4.1 Misto com acréscimo: proposta ainda não aprovada

O código atual escolhe um modo para todo o orçamento. Para coexistência futura: `F` = soma dos preços fechados protegidos; `V` = visita fixa existente; `B` = bases de venda dos demais itens + rateio atribuído apenas aos não fixos; `K` = outros custos diretos não fixos + despesas incluídas atribuídas a eles + taxas fixas; `a=acréscimo/10000`; `t=(tributos+taxas percentuais)/10000`. Propor `A = arred[(B + arred(B×a) + K + arred((F+V)×t))/(1−t)]`; total = `F+V+A`. O rateio do item fixo entra no custo/margem, não também em B. Se não houver itens não fixos, nunca alterar F para atingir meta: exibir resultado/prejuízo. Excluir despesas pagas diretamente ou reembolsadas de F/B/K. Visitas continuam fixas. Esta fórmula é **proposta**, não implementação atual, e requer verificar incidências, arredondamentos, limite `margemPb+tributos+taxas` atual e P1; o arredondamento agregado precisa de testes com 1 centavo. Recusar divisor inválido ou `t≥100%`.

### 4.2 m² com faixas

1.250 m²: primeiros 500 × 200 centavos = 100.000; 750 restantes × 150 = 112.500; serviço **212.500**. Tempo 1.800 min = 30 h; custo/h 4.000 → 120.000; contas 1.200/h → 36.000; despesa incluída 10.000. Total cobrado **222.500**; custo **166.000**; sobra **56.500**; margem ≈ **25,39% = 2.539 pb**. Carga: 1.800 min no mês do responsável. Em 500 m², serviço = 100.000; em 500,0001, produto decimal exato antes do arredondamento final. Tributos, taxas, visitas e acréscimo = zero.

### 4.3 hectare

12,5 ha × 8.000 centavos/ha = **100.000**. Tempo 1.200 min = 20 h; custo/h 3.000 → 60.000; contas 1.000/h → 20.000; custo direto extra 5.000 já incluído no preço fixado: custo **85.000**, venda **100.000**, sobra **15.000**, margem **15% = 1.500 pb**. Carga 1.200 min. No modo tabela atual, que soma custo direto extra ao preço, a transição precisa distinguir preço final informado e valor-base para não cobrá-lo duas vezes. Demais taxas/visitas/acréscimo = zero.

### 4.4 diária com logística

3 diárias de equipe × 50.000 = **150.000**. Duas pessoas, cada uma 3 × 8 h = **1.440 min**, total 2.880 min. Custos/h 3.000 e 2.000 → 72.000+48.000 = **120.000**; contas 400/h × 48 = **19.200**; barco/hospedagem em despesa incluída **25.000**. Venda **175.000**; custo **164.200**; sobra **10.800**, margem ≈ **6,17% = 617 pb**. Carga é 1.440 min para cada pessoa, não 2.880 para ambas. Depende da fatia de múltiplas alocações. Demais taxas/visitas/acréscimo = zero.

### 4.5 pacote e hora

Pacote fixo **120.000**, 1.200 min; serviço por hora 450 min = 7,5 h × 16.000 = **120.000**. Custos/h 3.000 → 60.000+22.500 = **82.500**; contas 1.000/h × 27,5 h = **27.500**; despesa incluída **10.001**. Venda **250.001**; custo **120.001**; sobra **130.000**, margem ≈ **52,00% = 5.200 pb**. Repartir 10.001 entre dois preços iguais: **5.001 e 5.000**, por ordem estável; soma exata. Pacote mantém honorários de 120.000, despesa discriminada e sem acréscimo. Carga: 1.200 e 450 min nos responsáveis/meses respectivos. Demais taxas/visitas/acréscimo = zero.

Vitest **e pgTAP**, com mesmos números: fronteira exata e decimal das faixas, zero/nulo, mínimo, progressivo versus volume, meia unidade de centavo, despesas e divisão por maior resto; dados de prestador sem dupla contagem; várias pessoas/meses; concorrência; snapshots; prejuízo; percentual não zero, taxa fixa, visita, F=0/A=0 e divisor inválido; limites/overflow; negativos de RLS; ausência de custos internos na proposta. Exemplos são expectativas de especificação e não testes executados.

## 5. Telas, rótulos e acessibilidade

- **Custos e taxas → Equipe:** «Como esta pessoa recebe»; «Salário mensal (CLT)», «Pró-labore», «Bolsa de estágio», «Por diária», «Por projeto»; campos contextuais «Custo total do mês», «Horas disponíveis no mês», «Custo por diária», «Horas por diária», «Dias disponíveis no mês», «Custo do projeto», «Horas estimadas no projeto». Meio período é jornada. Ajuda curta: «Informe os custos da sua empresa; confirme encargos com a contabilidade.» Remover controles de piso após migração.
- **Tabela de preços:** «Nome do serviço ou atividade», «Unidade de cobrança», «Preço por unidade», «Preço mínimo (opcional)», «Tempo sugerido por unidade (opcional)», «Faixas de quantidade», «Até» e «Valor por unidade». Nenhum preço por profissão preenchido automaticamente.
- **Serviços:** «Serviço», «Como cobrar», «Quantidade», «Preço por unidade»/«Preço fechado», «Horas estimadas para executar», «Responsável», «Mês previsto», «Outros custos diretos»; em campo, «Pessoas e horas» e «Logística». Ajuda: «As horas estimam o custo e a carga da equipe; não mudam a unidade cobrada.» Porte informa critério da consultoria, não enquadramento legal.
- **Preço:** «Preço ao cliente», «Trabalho da equipe», «Contas da consultoria», «Despesas incluídas», «Tributos e taxas informados», «Valor que sobra (estimativa)», «Acréscimo sobre trabalho e contas» e «Sobre o que incide». Sinalizar pacote fixo, pendência ou prejuízo em texto.
- **Parcelas:** manter cronograma existente; não chamar de mensalidade recorrente. **Proposta:** «Dados da consultoria», «Logo», «CNPJ», «Texto da proposta», «Registro de responsabilidade (opcional)», «Imprimir ou salvar PDF»; revisão humana e dados internos ausentes.
- **375 px:** cartões empilhados, controles de largura integral, «Editar serviço» e «Remover [nome]», expansão acessível, foco visível, mensagens associadas aos campos, resumo sem cobrir ações. Fluent 2, claro/escuro, vazio, carregando, erro e sem permissão. Teste visual e teclado além de axe; axe sozinho não comprova WCAG 2.2 AA.

## 6. Migração

1. Inventariar schemas, migrations efetivamente aplicadas, snapshots e estados; preservar o WIP local. Backup restaurável e primeiro teste em staging/cópia sem dados reais no repositório. Não presumir que as duas migrations não commitadas foram aplicadas.
2. Campos aditivos, preservando inicialmente `horas_venda`, `base_horas_venda`, `hora_venda_id`, `minutos`, responsável e mês. Tabela antiga migra como unidade `hora`, preservando ID, preço e origem; minutos seguem autoridade do custo/carga. Guardar quantidade derivada com precisão e testar 1h20 sem perda. Visita fixa não vira item sem reconciliação.
3. Comparar resultados em centavos de rascunhos existentes, inclusive acréscimo atual, visitas, despesas, parcelas, lixeira e limites. Onde falta hora de venda manter pendência, sem preço fictício. Orçamentos enviados/aprovados preservam snapshot, sem recálculo automático.
4. Aplicar plano de piso da seção 2.2. Em múltiplas alocações, backfill de responsável/mês/minutos só quando válidos; alternar para **uma única fonte** de carga, sem somar tabela nova e campos antigos, nem contar aprovado e orçamento atual duas vezes. Reconciliar demandas já geradas antes de mudar a fonte.
5. Testar rollback e restore sem perda, snapshots, RLS, contagens e diferenças; usar feature flag até validação. Excluir campos antigos apenas em migration posterior, com backup e aceite. Não registrar dados privados nos relatórios.

## 7. Fatias, uma por PR

1. **Baseline:** testes do estado local, inclusive duas migrations não commitadas, snapshots, totais e custos; paridade domínio/pgTAP e backup. Sem mudar resultado.
2. **Unidades simples, pacote e horas separadas:** regras puras, schema aditivo, RPC/RLS, snapshots, UI/PDF, testes de hectare/pacote/hora. Modo misto somente com P1 aprovado. Testar 375 px, tema escuro e centavos.
3. **Remuneração e remoção do piso:** migração revisável e sem perda; testes de CLT, diária, projeto, desconhecido, isolamento e custo duplicado.
4. **Faixas e mínimo:** editor, integridade e cálculo exato; fronteiras, progressivo/volume, maior resto e paridade; complexidade conforme P3.
5. **Modelos próprios e duplicação:** política de cópia de P7, isolamento, histórico e testes de dados não copiados.
6. **ORC-04 e proposta:** transições manuais, concorrência, cliente, identidade pública, carga sem duplicação; não executar automações do 0016 antes das decisões.
7. **Múltiplas alocações e painel**, se aprovado: backfill e fonte única, segurança, pessoas/meses e desconhecidos.
8. **Depois:** envio real, recorrência, BDI/XLSX, importação histórica, margem por categoria e pesos de rateio, cada qual com especificação, custos e aceite. Cada PR inclui domínio, banco, pgTAP negativo, UI/estados, acessibilidade e documentação; não afirmar conexão externa sem ela existir.

## 8. Perguntas para Eduardo — pendentes

1. **P1. Modos mistos:** (A) hora, área e pacote por item, pacote protegido do acréscimo (**recomendo**); (B) um modo por orçamento. Aprova a precedência proposta em 4.1?
2. **P2. Tempo:** (A) horas obrigatórias antes de finalizar, sugestão opcional e editável (**recomendo**); (B) permitir concluir com custo/carga desconhecidos e aviso.
3. **P3. Faixas:** (A) progressivas com mínimo opcional, complexidade manual depois (**recomendo**); (B) volume; (C) ambos com escolha explícita. O mínimo cobre só honorários?
4. **P4. Recorrência:** (A) depois, como contrato separado de parcelas (**recomendo**); (B) descrição manual agora. Não aprova gatilhos ou provedores de 0016.
5. **P5. Capacidade:** (A) mostrar desconhecida quando não informada (**recomendo**); (B) exigir disponibilidade antes de atribuir. Várias pessoas/meses entram no lançamento?
6. **P6. Terceiro sem login:** (A) começar só com membros, custo externo como despesa (**recomendo**); (B) criar recurso sem login com segurança própria.
7. **P7. Reuso:** (A) modelo sem preço/dados pessoais e cópia de orçamento com opção explícita de copiar preços (**recomendo**); (B) cópia sem preços; (C) só modelos.
8. **P8. Proposta:** (A) identidade por consultoria e ART/RRT opcional por profissional (**recomendo**); (B) dados somente por documento. Quem edita e o que fica público?
9. **P9. Carga/status:** (A) registrar decisão manual e contar somente aprovados, sem iniciar execução (**recomendo**); (B) mostrar também reservas de negociação separadas. Como reverter aprovação e evitar duplicação?
10. **P10. Rateio:** (A) manter por hora e explicar (**recomendo**); (B) pesos por categoria depois; (C) centros de custo. Não presumir que campo elimina contas fixas.
11. **P11. Envio:** (A) preparar mensagem para revisão humana primeiro (**recomendo**); (B) API depois de escolher provedor e custos. D11 continua aberto.
12. **P12. Mínimo e despesas:** mínimo cobre só honorários (**recomendo**) ou inclui despesas? Como identificar custo direto já embutido na tarifa para evitar cobrança dupla?

**Limite, na data da proposta:** nenhuma regra nova foi aprovada ou implementada, nenhum código/migration foi modificado, e não foram executados testes de banco nem realizadas integrações externas neste trabalho.

## 9. Respostas do Eduardo (12/11/2026)

Todas as recomendações foram aceitas:

- **P1:** cada serviço escolhe a unidade de cobrança no mesmo orçamento. O pacote fica protegido do acréscimo e só mostra o que sobra (ou o prejuízo).
- **P2:** as horas estimadas são obrigatórias para concluir. No rascunho podem ficar pendentes. A tabela de preços pode sugerir minutos por unidade, e a sugestão é editável.
- **P3 e P12:** as faixas são progressivas. O preço mínimo é opcional e vale só para os honorários, sem despesas. As faixas entram depois do preço simples.
- **P5 e P6:** o responsável continua sendo um membro com login. Capacidade não informada aparece como "desconhecida", nunca como zero. Terceiro sem login entra como custo ou despesa do serviço.
  - Continua valendo um responsável por serviço (ADR-0017). Várias pessoas no mesmo serviço (fatia 7) ficam para depois.
- **P7:** "Salvar como modelo" guarda só escopo, unidade e horas, sem cliente nem preço. "Duplicar orçamento" cria um rascunho novo e pergunta se copia os preços.
- **P8:** a identidade da consultoria (logo, CNPJ, dados) é cadastrada uma vez, e só a Gestão edita. A ART/RRT é opcional por serviço, e o texto da proposta é editável antes do PDF.
- **P9:** a situação muda manualmente (enviado, em negociação, aprovado, recusado), com quem e quando. Só aprovado conta na carga. Reabrir um aprovado volta a rascunho com nova revisão. Nada de contrato ou cobrança automáticos.
- **P4, P10 e P11:** ficam para depois, como recomendado:
  - mensalidade recorrente, como contrato próprio;
  - rateio por hora, com explicação;
  - envio, preparando a mensagem para revisão humana.

## 10. Implementado: fatia 2 (unidades simples, pacote e horas separadas)

- **Tabela de preços:** é o antigo grupo "Hora de venda (tabela)" de Custos e taxas. Cada linha ganhou "Unidade" (hora, m², hectare, diária, campanha ou pacote) e "Tempo por unidade" (opcional).
  - Ficou em `orcamento_base_custos.horas_venda` (jsonb), com as chaves `unidade` e `minutos_por_unidade`. Linhas antigas valem como hora.
  - Não foi criada a tabela `orcamento_tabela_preco` do rascunho: a cópia por orçamento (`base_horas_venda`) já garante que a proposta não muda depois. Quando as faixas entrarem (fatia 4), vale reavaliar uma tabela própria.
- **Item:** ganhou `quantidade numeric(18,4)` e `preco_fechado_centavos`.
  - **Venda do item:** hora = horas × preço; m², ha, diária e campanha = quantidade × preço; pacote = preço fechado.
  - **Outros custos:** passam para o preço em todas as unidades, menos no pacote.
  - **Horas:** continuam sendo do custo, do rateio e da carga.
  - **Pendência:** sem quantidade, ou pacote sem preço, a pendência é `quantidade_pendente`.
- **Pela margem (P1):** o pacote fica fora do acréscimo. O acréscimo incide sobre a venda e as contas dos outros itens.
  - Tributos e taxas percentuais cobrem também pacotes e visitas: `A = round(((B + round(B×a) + K) × 10000 + (F + V) × t) / (10000 − t))`.
  - Só pacotes: o preço é o fechado, mais as despesas repartidas por maior resto.
- **Tela:**
  - Abaixo do preço de cada serviço aparece "Quantidade" (com a unidade) ou "Preço fechado". Assim a tabela não ficou mais larga.
  - A quantidade sugere as horas pelo tempo por unidade. A sugestão é editável: quando a pessoa muda as horas, elas deixam de acompanhar.
  - Sem horas, aparece "Informe as horas estimadas".
  - A proposta mostra "12,5 ha × R$ 80,00/ha" ou "Pacote".
- **Ainda não:** bloquear a conclusão sem horas (P2) entra com a mudança de situação (fatia 6).
- **Onde vive:**
  - migration `20261113090000_unidades_de_cobranca.sql`;
  - domínio em `preco-do-orcamento.ts`;
  - testes em `preco-unidades.test.ts` e em `supabase/tests/240_unidades_de_cobranca.test.sql` (17 casos, com os mesmos centavos).

## 11. Implementado: fatia 3 (como cada pessoa recebe, sem piso)

- **Saiu o "pelo piso":** a tela não pede mais piso por hora. O banco ignora `pelo_piso` e `p_piso_hora_centavos` se chegarem; a coluna antiga fica sem uso.
- **Como recebe:** cada linha da equipe diz a forma, e a tela mostra só os campos dela:
  - Salário (CLT), Pró-labore, Bolsa de estágio: custo do mês e horas no mês. Hora de custo = custo ÷ horas.
  - Por diária: custo da diária, horas por diária e, opcional, dias no mês. Hora = custo ÷ horas da diária; com os dias, custo do mês = dias × diária e capacidade = dias × horas.
  - Por projeto: custo e horas do projeto e, opcional, horas no mês. Hora = custo ÷ horas do projeto; o custo não vira custo do mês.
  - Linha antiga sem forma aparece como "Ainda não informado" e conta como mensal até alguém confirmar.
- **Médias:** a hora técnica média, as horas da equipe, o rateio das contas e a hora por profissão usam só quem tem custo e horas do mês conhecidos. A hora de custo de cada membro vale sempre (é a que o orçamento usa pelo responsável).
- **Capacidade desconhecida:** sem horas no mês, a jornada fica nula, nunca zero. A tela mostra "capacidade desconhecida" na equipe e no responsável do serviço.
- **Ajuda na tela:** "Informe os custos da sua empresa; confirme encargos com a contabilidade." Nenhum valor de mercado sugerido.
- **Onde vive:**
  - domínio em `packages/domain/src/remuneracao.ts` (`resumoDaPessoa`, `horaDeCustoPorMembro`, `linhasMensaisDaEquipe`), testes em `remuneracao.test.ts`;
  - migration `20261113100000_remuneracao_da_equipe.sql` (colunas `tipo_recebimento`, `custo_diaria_centavos`, `horas_por_diaria`, `dias_no_mes`, `custo_projeto_centavos`, `horas_projeto`; custo e horas do mês passam a aceitar nulo);
  - pgTAP `250_remuneracao_da_equipe.test.sql` (9 casos, mesmos centavos do domínio).

## 12. Implementado: fatia 4 (faixas progressivas e preço mínimo)

- **Onde ficou:** dentro da própria linha da tabela de preços (`orcamento_base_custos.horas_venda`), nas chaves `faixas` (`[{ate, valor_centavos}]`) e `minimo_centavos`.
  - A cópia por orçamento (`base_horas_venda`) leva as duas: a proposta não muda quando a tabela muda depois.
  - A tabela própria `orcamento_tabela_preco` do rascunho continua sem necessidade.
- **Faixas (P3):** progressivas, só em m², hectare, diária e campanha.
  - Até 10 faixas, limites positivos e crescentes, só a última aberta ("acima de"). Começam em zero, então não há lacuna nem quantidade descoberta.
  - Cada trecho paga o valor da sua faixa. A soma é exata e arredondada uma vez, metade para cima.
  - 500 fica toda na faixa "até 500"; 500,0001 põe só 0,0001 na seguinte.
  - Com faixas, o "Preço por unidade" da linha não entra no cálculo (guarda o da primeira faixa, só para mostrar).
- **Preço mínimo (P12):** opcional, nunca no pacote, e vale só sobre os honorários: `max(venda pela tabela, mínimo)`.
  - Outros custos e despesas vêm depois.
  - Pela margem, o mínimo entra na base do acréscimo.
- **Fator de complexidade:** não entrou (P3 deixou para depois). Nada é inferido.
- **Tela:**
  - Na tabela de preços, "Usar faixas" abre as faixas embaixo da linha, com "Até" e "Valor por unidade". Os botões são "Adicionar faixa" e "Usar preço único".
  - Há também a coluna "Preço mínimo (R$)".
  - No orçamento, a escolha do preço mostra "preço por faixas" e "mínimo".
  - A proposta mostra a quantidade com as faixas ("1.250 m² por faixas: até 500 m²: R$ 2,00/m²; acima de 500 m²: R$ 1,50/m²") e avisa quando o preço mínimo valeu. Nunca mostra uma média como tarifa.
- **Onde vive:**
  - domínio em `preco-do-orcamento.ts` (`valorPorFaixas`, `problemaDasFaixas`), testes em `preco-faixas.test.ts`;
  - migration `20261113110000_faixas_e_minimo.sql` (`private.faixas_invalidas`, `private.faixas_limpas`, `private.valor_por_faixas`, `private.itens_do_preco` e `salvar_base_de_custos`);
  - pgTAP `260_faixas_e_minimo.test.sql` (14 casos, mesmos centavos do domínio).

## 13. Implementado: fatia 5 (modelos próprios e duplicar)

- **Salvar como modelo (P7):** botão no orçamento. Parte do que está salvo no banco, nunca do que o aparelho manda.
  - Guarda o objeto, os serviços (descrição, horas, linha da tabela de preços e unidade), as despesas (descrição e tratamento, sem valor), as premissas e as exclusões.
  - Nunca guarda cliente, prospecto, preços, outros custos, preço fechado, quantidades, estimativas, responsáveis, meses, parcelas ou prazos.
  - Nome único entre os modelos ativos da consultoria. A exclusão é lógica e confere a versão.
  - Tabela `orcamento_modelo` com `consultoria_id`, RLS forçada (só a Gestão lê), escrita só por RPC e auditoria.
- **Usar um modelo da consultoria:** aparece em "Escolher modelo", na seção "Modelos da consultoria", acima do catálogo de Joinville (lista paginada, com busca e "Excluir").
  - Os serviços entram com a mesma linha da tabela de preços, se ela ainda existir; o preço vale o da tabela atual.
  - As despesas entram a cotar, com o tratamento salvo. As premissas e exclusões são acrescentadas sem repetir.
- **Duplicar:** botão no orçamento, que pergunta "Duplicar sem os preços" ou "Duplicar com os preços".
  - Cria um rascunho novo, com o número seguinte, para o mesmo cliente ou prospecto. Passa pelo mesmo `criar_orcamento` e `salvar_orcamento`, então valem as mesmas regras.
  - Sempre vão: serviços (com ids novos), horas, quantidades, linha da tabela (se ainda existir), responsáveis ativos, despesas, parcelas, prazos, validade, destinatário, premissas, exclusões, forma de preço e visitas (quantidade e km).
  - Só com os preços: acréscimo, outros custos, preço fechado, estimativas das despesas e outros gastos por visita. Sem eles, esses valores ficam vazios e as despesas voltam a cotar.
  - Nunca vão: mês previsto, situação, histórico, lixeira. A tabela de preços e a base de custos são sempre as atuais.
  - `orcamento.duplicado_de` registra a origem; a tela mostra "Cópia de 2026-041".
  - Repetir a chamada com o mesmo id devolve a mesma cópia.
- Com alterações não salvas, "Duplicar" e "Salvar como modelo" ficam desabilitados ("Salve antes").
- **Onde vive:**
  - migration `20261113120000_modelos_e_duplicar.sql` (`salvar_modelo_de_orcamento`, `listar_modelos_de_orcamento`, `excluir_modelo_de_orcamento`, `duplicar_orcamento` e `obter_orcamento` com `duplicado_de`);
  - pgTAP `270_modelos_e_duplicar.test.sql` (22 casos, inclusive o que não pode ser copiado, Equipe e outra consultoria);
  - tela em `DialogosDeCopia.tsx` e `DialogoModelo.tsx`.
- **Ainda não:** renomear ou editar um modelo (exclua e salve de novo) e duplicar a partir da lista.

## 14. Implementado: fatia 6 (situação manual, identidade, ART/RRT e apresentação)

- **Situação manual (ORC-04, P9):** o painel "Mudar situação" no orçamento mostra só as mudanças permitidas a partir da situação atual. Cada mudança pede confirmação e aceita uma observação opcional.
  - Rascunho vai para enviada ou aprovada.
  - Enviada vai para negociação, aprovada, recusada ou reabrir.
  - Negociação vai para aprovada, recusada ou reabrir.
  - Aprovada só vai para reabrir.
  - Recusada vai para negociação ou reabrir.
  - Reabrir volta a rascunho como a revisão seguinte. Se estava aprovado, deixa de contar na carga.
  - O histórico (`orcamento_situacao`, append-only) guarda de qual situação, para qual, revisão, membro, instante e observação. A tela mostra o histórico recolhido.
  - Só "aprovada" conta na carga (`carga_da_equipe` já filtrava). Nada de contrato, cobrança ou tarefa automáticos (0016 continua pendente).
  - Com alterações não salvas, os botões esperam o salvar.
- **Concluir sem horas (P2):** sair do rascunho exige ao menos um serviço, horas em todos (`horas_pendentes`) e preço sem pendência (`preco_pendente`).
- **Identidade (P8):** página "Dados da proposta" (`/configuracoes/proposta`, link na lista de orçamentos).
  - Campos: razão social, CNPJ (aceita o alfanumérico), endereço, telefone, e-mail, site, texto de apresentação padrão e logo.
  - A logo é PNG ou JPEG de até 2 MB, objeto novo no Storage e versão em `documento`, com exclusão lógica. Só pode ser enviada depois dos dados salvos.
  - Tabela `consultoria_identidade`: uma linha por consultoria, RLS forçada (só a Gestão lê), escrita só por RPC, auditoria e `row_version`.
  - Nenhum valor é sugerido.
- **ART/RRT por serviço:** campo "Registro" abaixo de cada serviço (sem, com ART, com RRT). A proposta mostra "Inclui ART". Não presume exigência nem número de registro.
- **Texto da proposta:** "Apresentação da proposta" no orçamento, editável no rascunho. Vazio usa o padrão da identidade. A duplicação copia o texto e a ART/RRT.
- **Proposta impressa:** logo, razão social, CNPJ, endereço e contato no topo; apresentação antes do objeto; "Inclui ART/RRT" por serviço. Continua sem custo, margem, horas ou responsáveis.
- **Onde vive:**
  - migration `20261113130000_situacao_e_proposta.sql`;
  - pgTAP `280_situacao_e_proposta.test.sql` (31 casos);
  - tela em `SituacaoDoOrcamento.tsx`, `PaginaDadosDaProposta.tsx` e `PaginaProposta.tsx`;
  - API em `lib/api/identidade.ts`.
- **Ainda não:** número da ART/RRT e registro profissional no perfil, envio da proposta (P11) e congelar a identidade na proposta enviada (hoje a proposta mostra os dados atuais da consultoria).
