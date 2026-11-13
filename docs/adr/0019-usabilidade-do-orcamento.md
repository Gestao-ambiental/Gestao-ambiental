# ADR-0019 — Usabilidade do orçamento e responsabilidade técnica

**Situação:** proposta para Eduardo revisar, 12/11/2026. Especificação somente: sem alteração de código, migration, dados ou regras aprovadas. Claude implementa por fatias após as decisões. Complementa [ADR-0018](0018-unidades-de-cobranca-e-melhorias-do-orcamento.md), segue [Fluent 2](0015-fluent-2-como-design-system.md) e não resolve as decisões D1–D12 de [ADR-0016](0016-automacao-do-orcamento-a-execucao.md).

## 1. Método e limites

- Foram lidos o pedido completo, incluindo os anexos A e B, a passagem, as instruções, ADRs 0015–0018, o código atual e os resultados do teste, incluindo as alterações de interface ainda **sem commit**. Não alterar esse trabalho.
- O segundo painel teve 20 personas **simuladas**, 19 respostas completas e uma cortada; reagiram a uma descrição, não usaram o produto. As contagens são sinais direcionais, não entrevistas reais, taxa de conversão ou estudo estatístico. A média de 59 minutos é autoestimativa do painel, não tempo cronometrado. Consultar `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20-v2/{sintese.md,roteiro.md,results.json}` e síntese do primeiro painel.
- **Observação direta:** demonstração local isolada, Brave automatizado, viewport 1366×768 e 375×812. Naveguei lista, custos, dados da proposta, diálogo de novo orçamento, serviços existentes, preço, parcelas, prévia, confirmação de situação e duplicação com preços; a cópia fictícia abriu como rascunho. Em 375 px, documento tinha 375 px; tabela de serviços media 1.040 px dentro de região de 341 px e a de despesas 600 px dentro de 341 px. Em 1366 px, as tabelas observadas tinham 1.076 px e cabiam na região de mesma largura. A demo recarrega dados na memória. **Não executei do zero uma configuração completa, não validei todas as ações nas duas larguras, nem teclado, contraste, zoom, tema escuro, leitor de tela ou envio/PDF real.** Não alegar conformidade WCAG a partir deste exame.
- Evidências de código: `PaginaCustosETaxas.tsx`, `PaginaOrcamento.tsx`, `SituacaoDoOrcamento.tsx`, `DialogosDeCopia.tsx`, `DialogoModelo.tsx`, `PaginaDadosDaProposta.tsx`, `PaginaProposta.tsx`, `PaginaOrcamentos.tsx` e `catalogo-servicos.ts`. O cabeçalho «Hora de venda» e o seletor «Sem ART/RRT / Com ART / Com RRT» estão nas linhas de serviço. O exemplo da demo já tinha uma despesa «ART do responsável técnico», incluída no preço: o nome não separa taxa do trabalho. **A distinção entre trabalho técnico e taxa de registro está na nota de `catalogo-servicos.ts`, não no ADR-0017.**

### As dez fricções prioritárias

| # | Problema e evidência | Pessoas do painel simulado |
|---|---|---|
| 1 | «Rateio por hora estimada» não dizia se entrava no custo; **17/19**. O texto local não commitado já diz «Contas do mês por hora… Já entra no custo…»: melhora sem comprovação de reteste. | Tainá, Beatriz, Renata, Antônio e outros; lista completa no `results.json` |
| 2 | «Hora técnica» parecia preço ao cliente; **13/19**. A troca local para «Custo da hora técnica», «Custo médio por hora da equipe» e «Custo por hora de {profissão}» ajuda; validar compreensão. | Tainá, Antônio, Henrique, Renata e outros |
| 3 | Contas e tributos não eram conhecidos na hora; **16/19** e **14/19** respectivamente. | Ronaldo, Tainá, Lívia; Fernanda para tributo; demais no JSON |
| 4 | «Capacidade desconhecida» apareceu para **14/19**, 10 a entenderam como erro; foi o passo mais difícil para 8. O texto local associa ausência de jornada/dias ao dado, mas ainda precisa de teste. | Juliana, Antônio, Carolina, Paulo, Wellington, Renata, Diego, Aline |
| 5 | Primeira configuração longa: média simulada **59 min**; seis grupos pedem decisões diferentes antes da proposta. | Exemplos: Ronaldo, Tainá, Lívia, Fernanda; não há contagem específica de quem pediu fluxo mínimo |
| 6 | Tabela de serviços obriga rolagem lateral dentro da região em 375 px; observação direta acima. | Edgar e Fernanda criticaram largura/leitura no painel anterior; contagem do segundo painel para cartões não quantificada |
| 7 | Seletor «Sem ART/RRT / Com ART / Com RRT» repetido em cada linha cria peso e ambiguidade sobre quantidade/taxa. | Eduardo solicitou simplificação; Gilmara estranhou RRT; Fernanda quer «Inclui ART» visível. Não há contagem para a repetição. |
| 8 | «Acréscimo sobre horas de venda e contas» confundiu **7/19**; «margem» confundiu parte do painel. | Edgar, Wellington e outros; Carolina pediu exemplo margem × markup. Trocar palavra é decisão de produto. |
| 9 | Duplicação deixou **5/19** em dúvida sobre despesas; texto local já explica que estimativas acompanham «com os preços». | Confirmar nomes individuais no JSON; não atribuir a todos uma fala não comprovada. |
| 10 | Confirmação a cada transição, salvamento manual e textos pequenos adicionam atrito. | Wellington: confirmações; Tainá e Wellington: internet de campo; Edgar: histórico pequeno. Não confundir pedido offline com confirmação de perda efetiva. |

## 2. ART/RRT: comparação e proposta

**Pedido original de Eduardo:** «acho que o negocio ali sem SEM ART/com ART ficou exagerado em todos os negocios, talvez ele poderia ser uma caixa de seleção inclusive, tá? ficaria mais clean, e uma caixa de seleção que aparece até como um item, pq normalmente vai ter uma ou duas ARTS no máximo por serviço». A interpretação «uma ou duas no orçamento inteiro» é hipótese, não deve virar limite: uma anotação pode cobrir vários itens e diferentes profissionais/órgãos podem exigir mais registros; confirmar caso a caso.

| Alternativa | Vantagens | Limitações |
|---|---|---|
| Caixa «ART» por serviço | familiar e pouca largura | não diferencia RRT, multiplica controles e sugere um registro por item; mesmo registro em vários serviços pode virar várias taxas |
| ART/RRT como item, como visita | preço visível, fácil localizar | mistura honorário, atividade, registro e taxa; pode contar tempo e taxa duas vezes; item comercial não demonstra qual profissional ou serviços cobre |
| **Seção «Responsabilidade técnica» no orçamento** | uma anotação liga vários serviços, explicita profissional/tipo/taxa; remove seleção repetida | requer migração e edição acessível; mais trabalho inicial |

**Recomendação proposta:** seção única após serviços, recolhida quando vazia: «Responsabilidade técnica (ART/RRT)»; botão «Adicionar responsabilidade técnica». Mostrar uma linha resumida por registro planejado, não limitar a duas: «Tipo», «Profissional», «Serviços vinculados», «Taxa de registro» e «Número do registro (opcional)». Ação «Adicionar outra» fica discreta. Quando não informado, mostrar «Nenhum registro informado»; não dizer que não se aplica. Tipo **escolhido manualmente** («ART», «RRT» e «Outro» se Eduardo aprovar); não inferir profissão/órgão nem criar por padrão. Associar a um ou mais itens; permitir profissional ainda não definido como pendência, sem inventar pessoa. O vínculo profissional é `membro_id` quando existente; profissional externo exige decisão separada. Número é texto opcional e só é apresentado se preenchido e escolhido para divulgação; não é prova de emissão, quitação, registro ou habilitação. Não impedir proposta anterior à existência do número.

**Separação dos valores:** trabalho de elaboração e responsabilidade técnica pode ser serviço/honorário com horas próprias **se contratado**; registro é um documento/compromisso de responsabilidade; taxa é despesa de terceiro distinta, informada ou «A cotar». A seção pode reunir esses controles visualmente, mas cada valor deve ter uma única origem de cálculo. A taxa deve vincular-se a uma despesa existente ou criar uma única despesa mediante ação explícita «Adicionar taxa às despesas»; nunca fazer as duas coisas ou somar também em «Outros custos». Mesmo registro cobrindo três serviços continua uma taxa, salvo a pessoa registrar outra. Tratamento: incluída, paga diretamente ou reembolso, conforme regras existentes. A obrigação concreta, atribuições, modalidade, número e valores devem ser confirmados pela pessoa responsável e conselho competente, sem diagnóstico automático.

Fontes oficiais verificadas em **12/11/2026**: [Confea — ART](https://www.confea.org.br/servicos-prestados/anotacao-de-responsabilidade-tecnica-art), [CFBio — perguntas frequentes](https://cfbio.gov.br/perguntas-frequentes/) e [CAU/BR — RRT](https://transparencia.caubr.gov.br/perguntas-frequentes-registro-de-responsabilidade-tecnica-rrt/). Elas distinguem registros e conselhos; regras e procedimentos variam. Não usar uma norma de um conselho para inferir prazo ou obrigação de outro. Nenhuma taxa ou prazo é definido aqui.

**Proposta pronta:** exibir uma seção comercial curta «Responsabilidade técnica» com «Inclui ART»/«Inclui RRT» apenas para registros que a consultoria explicitamente incluiu no escopo; listar serviços cobertos de modo legível. «Número: …» opcional e configurável por registro; sem número, não colocar número fictício ou «emitida». A taxa aparece como despesa incluída, paga diretamente ou reembolso segundo a decisão comercial; não publicar custo interno nem expor taxa em duplicidade. Preservar histórico e versões. Em tela, alertar se dados não estão definidos, sem acusar irregularidade.

### Rascunho do domínio/banco — não executar

O modelo exige decisão de produto. Uma entidade por anotação planejada e tabela de associação suportam muitos serviços e não criam no máximo duas linhas; taxa continua na despesa existente. Dinheiro é inteiro em centavos; PK/FK de locatário compostas. Mesmo orçamento e consultoria para os itens e despesa vinculados; validar também se membro é ativo quando selecionado e se a despesa não está vinculada a duas responsabilidades, salvo decisão explícita.

```sql
-- ESBOÇO: não é migration; conferir nomes reais/índices antes de implementar.
create table public.orcamento_responsabilidade (
 id uuid primary key, consultoria_id uuid not null, orcamento_id uuid not null,
 tipo text not null check (tipo in ('art','rrt','outro')),
 membro_id uuid, descricao text, numero text, incluir_na_proposta boolean not null default true,
 despesa_id uuid, row_version integer not null default 1,
 unique (consultoria_id,id), unique (consultoria_id,orcamento_id,id),
 unique (consultoria_id,despesa_id),
 foreign key (consultoria_id,orcamento_id) references public.orcamento(consultoria_id,id),
 foreign key (consultoria_id,membro_id) references public.membro(consultoria_id,id),
 foreign key (consultoria_id,despesa_id) references public.orcamento_despesa(consultoria_id,id)
);
create table public.orcamento_responsabilidade_item (
 id uuid primary key, consultoria_id uuid not null, orcamento_id uuid not null,
 responsabilidade_id uuid not null, item_id uuid not null,
 unique (consultoria_id,id), unique (consultoria_id,responsabilidade_id,item_id),
 foreign key (consultoria_id,orcamento_id,responsabilidade_id)
   references public.orcamento_responsabilidade(consultoria_id,orcamento_id,id)
 -- Adicionar FK composta que garanta que item_id pertence ao MESMO orçamento;
 -- pode exigir UNIQUE adicional no pai, não apenas (consultoria_id,id).
);
```

RLS habilitada e forçada, leitura por papel compatível com orçamento e escrita autorizada por RPC transacional; `security definer` com `search_path` fixo e verificações explícitas, grants mínimos e `row_version`. Não usar só ocultação visual para custo. Conferir mesma consultoria **e mesmo orçamento** para despesa e item na RPC/FK; o esboço acima ainda não fecha completamente essa restrição. Em snapshots de proposta enviada/aprovada, congelar vínculos, tipo, texto e taxa comercial; código atual usa dados de identidade atuais, portanto congelamento integral ainda é pendência conhecida. Não alterar migration aplicada. Testar domínio e banco com mesmos centavos, RLS negativa entre consultorias/equipe, FKs cruzadas, concorrência e auditoria.

**Exemplos fictícios em centavos:** honorários de serviço 100.000; trabalho técnico específico 20.000 como item de serviço com horas; taxa 5.000 como uma despesa incluída. Total sem tributos/taxas adicionais = **125.000**, não 130.000: 100.000+20.000+5.000. Se taxa for paga diretamente ao conselho, proposta comercial = **120.000**, com 5.000 informados por fora; custo/resultado conforme o tratamento real e sem creditar 5.000 como receita. Se a taxa estiver «A cotar», não transformar null em zero ou declarar total final fechado. Dois registros com taxas de 5.000 cada somam 10.000; um registro ligado a três serviços continua 5.000. A fórmula atual de tabela/acréscimo, tributos e visitas deve ser aplicada pelo domínio existente e reproduzida em pgTAP; esses exemplos isolam apenas contagem de honorários e despesas e não definem valores de conselho.

**Migração do campo atual `orcamento_item.responsabilidade_tecnica`:** aditiva e reversível. Preservar snapshot/original e, para cada item `art` ou `rrt`, criar um registro de origem legada vinculado a esse item, tipo preservado, profissional/numero/despesa não preenchidos; `null` permanece «não informado», não vira «sem necessidade». **Não agrupar automaticamente** itens com mesmo tipo: não há prova de que sejam um único registro; oferecer revisão humana para agrupar/desvincular e impedir taxas automáticas. Não criar taxa nem usar rótulo da despesa para deduzir vínculo. Em proposta histórica, manter o texto anterior «Inclui ART/RRT» até nova revisão autorizada; não reescrever propostas enviadas ou aprovadas. Para novos rascunhos usar apenas a nova estrutura; manter compatibilidade de leitura/escrita em transição e não duplicar a exibição. Exportar contagens por tipo e vínculo, ensaiar rollback e preservação de snapshots, modelos e cópias, e só remover coluna antiga numa migration posterior aprovada.

## 3. Fluxo e mudanças de usabilidade

Todas as opções abaixo são propostas, mantendo Fluent 2/tokens existentes, corpo 14 px, foco visível, teclado, estados vazio/carregando/erro/sem permissão, tema escuro e informação não dependente de cor. Esforços são estimativas de engenharia para revisão, não prazos. Não há teste real de usuários após os textos não commitados.

| Tela; antes → depois exato | 1366 px / 375 px | Acessibilidade, efeito e esforço |
|---|---|---|
| **Custos e taxas:** «Rateio por hora estimada» → manter alteração local «Contas do mês por hora: R$ X por hora. Já entra no custo de cada serviço do orçamento, pelas horas dele.» | Resultado junto às contas em ambas; quebrar texto no celular. | Texto associado ao resultado, não cor; não alterar fórmula. **Pequeno**. |
| **Custos e capacidade:** «Hora técnica (R$)» → manter «Custo da hora técnica (R$)»; «Custo médio por hora da equipe» e «Custo por hora de {profissão}». | Campos alinhados no notebook; empilhados no celular. | Identificar explicitamente custo interno, sem confundir com venda. **Pequeno**, já há WIP local. |
| **Pessoa por diária:** «capacidade desconhecida» → «Dias no mês não informados; capacidade não calculada.» e «Fica fora da média e do rateio; a hora de custo continua válida.» Projeto: adaptar ao campo de horas ausente. | Ao lado da própria pessoa; no celular, abaixo do campo, não apenas no rodapé. | `aria-describedby` para ajuda e estado, não usar vermelho como erro. Não prometer que média inclui essa pessoa. **Pequeno/médio**. |
| **Primeira configuração:** «Ainda não configurado…» → «Falta configurar para calcular o preço» + lista com «Custo da equipe», «Horas faturáveis», «Contas do mês», «Preço dos serviços», «Tributos e taxas» e links para trechos. | Resumo antes dos seis grupos; no celular uma lista curta empilhada. | Foco no primeiro campo acionado; pendências anunciadas. Não substituir valores ausentes por zero presumido. **Médio**. |
| **Custos e taxas longos:** «Custos e capacidade», «Contas do mês», «Visita técnica e deslocamento», «Tabela de preços», «Margens», «Tributos e taxas» → ordem: equipe/custo, horas e contas, preço dos serviços, tributos/taxas, margens, visitas. «Detalhar contas do mês» opcional quando valor total for informado. | Grupos curtos com resumo e expansão; em 375 px pilha vertical. | Expansores com nome/estado; erro abre e focaliza o grupo certo. **Médio**. |
| **Calcular pela equipe:** propor entrada «Calcular pela equipe» em destaque, preservando «Digitar o custo da hora e as horas» como alternativa. | Opções visíveis, formulário progressivo nas duas larguras. | Não apagar valores existentes ao alternar; exigir aviso antes de mudança destrutiva. Tornar padrão só após P2. **Médio**. |
| **Hora/mês e alíquota:** «Horas no mês» e «Tributos sobre o faturamento (%)» → manter os textos locais, com ajuda «Exemplo: 40 h por semana ≈ 173 h por mês; informe sua jornada real» e «Consulte sua contabilidade; a alíquota efetiva pode variar por período e regime.» | Ajuda sob o próprio campo; no celular manter leitura com quebra. | Os números são exemplo, não recomendação nem cálculo de jornada oficial. A razão imposto/faturamento pode ser aproximação, não substituir alíquota fiscal efetiva validada pelo contador. **Pequeno**. |
| **Serviços:** «Hora de venda» → «Preço do serviço» ou «Tabela de preços»; recomendo «Tabela de preços» por incluir hora, m² e pacote. | Notebook: nome, horas, tabela, responsável/mês e preço; custos extras e cálculo em «Detalhes do serviço» sem esconder campos necessários. 375 px: cartões da seção 4. | Nome de cada campo inclui nome/índice do serviço; erro visível. **Médio**. |
| **Preço:** «Acréscimo sobre horas de venda e contas (%)» → preservar nome aprovado, acrescentar «Sobre o que incide: venda dos serviços que recebem acréscimo + contas atribuídas a eles; pacotes fechados ficam de fora.» | Exibir valor da base e ajuda adjacente; sem tabela larga no celular. | Exemplo fictício: base R$ 1.000, acréscimo 20% = R$ 200; sem impostos/custos adicionais, preço R$ 1.200. É acréscimo sobre base, não margem de 20% sobre venda. **Pequeno**. Trocar a palavra exige P5. |
| **Margens:** «Margem desejada / mínima / que sobra» → manter rótulos; ajuda «Desejada: meta de cálculo quando aplicável. Mínima: referência de alerta. Que sobra: resultado estimado após custos e taxas.» | Pequeno resumo de texto nas duas larguras. | Diferenciar os conceitos e não prometer meta de margem quando o cálculo é acréscimo. **Pequeno**. |
| **Duplicar:** manter a explicação local «estimativas das despesas, que não voltam a cotar» em «Duplicar com os preços»; acrescentar «O mês não é copiado; escolha novo mês para calcular a carga.» | Duas ações lado a lado ou empilhadas; descrição junto a cada botão. | Não copiar preço sem escolha explícita; não reescrever decisão. **Pequeno**. |
| **Situação:** hoje toda ação abre «Confirme a mudança de situação» com «Observação (opcional)». Recomendo confirmar enviada, aprovada, recusada e reabrir quando congelam, registram decisão, alteram carga ou revisão; avaliar ação rápida somente «Em negociação» com histórico e opção de observação. | Botões agrupados sem excesso; em celular empilhados e com nome claro. | Não substituir confirmação por undo que não preserve auditoria; P6 decide. **Médio**. |
| **Salvar:** hoje «Salvar», com outras ações bloqueadas durante alterações. Recomendo manter salvamento manual por enquanto; depois avaliar «Salvando…», «Salvo», «Não salvo» e retentativa explícita com proteção contra conflito. | Estado próximo ao botão, inclusive no celular. | Autosave exige projeto da seção 6; não anunciar offline seguro. **Grande** se automático. |
| **Histórico e ajuda:** histórico usa `text-xs`; ajustar para corpo 14 px e contraste de tokens, com linhas e espaçamento adequados; «Histórico da situação». | Expandível, com quebra de texto e datas legíveis. | Foco visível, texto sem depender de cor; testar aumento 200%, teclado e tema escuro. **Pequeno**. |
| **Proposta e identidade:** «Dados da proposta», «Enviar logo» desativado até salvar, «Texto de apresentação padrão», «Imprimir ou salvar PDF». | Explicar junto ao logo «Salve os dados para habilitar o envio»; propor nome/objeto e total legíveis em 375 px. | Logo com texto alternativo, contraste, impressão; usuário decide conteúdo; validar PDF visualmente em vez de presumir qualidade. **Pequeno/médio**. |

O caminho observado na demo usou orçamento existente: não comprova jornada completa desde base vazia, nem que um usuário real encontre todos os botões. As recomendações dos demais passos são revisão de fonte e do roteiro, com validação visual pendente.

## 4. Cartões de serviço em 375 px

Preservar os **mesmos dados e regras do formulário desktop**, sem reconstruir estado em uma segunda fonte. Cada cartão tem cabeçalho com número/nome, unidade/quantidade e preço resumido, estado «Faltam horas», «Preço pendente» ou «Completo» conforme validação existente; botões nomeados «Editar [serviço]» e «Remover [serviço]». Não sinalizar completo se a regra de aprovação exige algo faltante.

Ao expandir, ordem: (1) «Serviço», (2) «Tabela de preços»/unidade e quantidade ou preço fechado, (3) «Horas estimadas», (4) «Responsável» e «Mês previsto», com carga e capacidade sem duplicar aprovados, (5) «Outros custos (R$)», (6) «Custo estimado» e «Preço» apenas a quem tem permissão, (7) botão remover. A seleção de ART/RRT sai do cartão somente depois da migração aprovada. Mudança de unidade mostra controles condicionais; sugestão de horas mantém regra de edição manual existente. Ao inserir serviço, abrir cartão e levar foco ao nome; ao remover, confirmar conforme comportamento existente, preservar valores dos outros e mover foco de forma previsível. Não usar índice visual como identidade do item.

Cartões não podem truncar rótulos ou depender de arrastar; controles tocáveis e espaçados, ampliação, `aria-expanded`/`aria-controls`, erros no campo e resumo por texto, estados de carregamento e sem permissão. Despesas também precisam de layout responsivo; não mascarar tabelas com `overflow:hidden`. Testar em 375×812 e 1366×768, temas claro/escuro, teclado/zoom, aceitação de hora decimal e `1h30`, quantidade/faixas/pacote, foco, custo e centavos iguais ao desktop. Na tela de orçamento, a largura observada era 1.040 px para 341 px úteis: os cartões eliminam esse deslocamento lateral, sem reescrever a lógica.

## 5. Caminho mínimo de configuração

**Fato do código atual:** há `camposDe` com margem desejada inicial `30`, tributos vazios e leitura que pode converter vazio em zero; isto não prova que zero é alíquota real. A base exige validação, horas, margens, percentuais e uma linha de preço quando o cálculo precisa dela. «Pela margem» atual também precisa das horas de venda selecionadas. A situação de conclusão exige horas e preço. Não assumir que só equipe + tabela basta para preço completo.

**Proposta de fluxo:** permitir criar o rascunho sem base, mostrar «Preço e custo ainda não calculados» e a lista ligada aos campos. Para preço confiável: (1) pelo menos uma composição de equipe **ou** custo/h informado; (2) horas faturáveis positivas e contas mensais informadas, inclusive zero apenas quando o usuário afirmar zero; (3) tabela própria com unidade e preço para itens não fechados, tempos e quantidades; (4) tributação e taxas efetivas informadas/confirmadas e parcelas aplicáveis; (5) modalidade de cálculo e percentual selecionados. Valores existentes preservados, mas pré-preenchimento de `30` e `0` não é chancela: exibir «Confirme os valores da sua consultoria» e não afirmar que são apropriados. Logo, texto padrão, detalhamento linha a linha das contas, fonte da tarifa, visita sem uso, faixas, número de ART ainda inexistente e nome/telefone opcionais ficam para depois. CNPJ/identidade: necessários somente conforme validação e exigência acordada para proposta, não presumir regra legal.

Se alterações forem necessárias para salvar a base incompleta, isso muda domínio, RPC, schema e estados de pendência; não simular campos faltantes como zero apenas no front. Preservar custo/tributo desconhecido até preenchido; explicar «Preencha para calcular» e não exibir margem de certeza. P1/P2 dependem de Eduardo.

## 6. Salvamento, situação e repetição

- **Autosave:** não aprovar como ajuste somente visual. Há `row_version`, edição simultânea, status e documentos: incluir fila por orçamento, debounce com `flush` antes de navegação/status/duplicar, `row_version` de resposta, uma gravação em voo, revisão de conflito 409 mostrando «Outra pessoa alterou este orçamento. Compare antes de substituir.»; manter alterações locais durante a sessão e impedir ações que dependam do salvo. Idempotência/repetição, falhas de rede, indisponibilidade, retomada e alteração por outra aba devem ser testados; sem sucesso do servidor exibir «Não salvo». Nunca prometer sincronização/offline sem armazenamento durável, resolução de conflitos e política de segurança para dados financeiros. Manter botão manual no primeiro PR.
- **Situação:** aprovada conta na carga; enviada congela edição e reabertura cria revisão. Recusada é decisão com registro. Por isso, o pedido «confirmar só aprovar/reabrir» não deve ser aplicado indiscriminadamente. Avaliar apenas «Em negociação» sem modal, mas preservando estado, pessoa, horário, erros, concorrência e opção de observação. P6.
- **Despesas repetidas:** aproveitar modelo da consultoria com valores sem preço e a duplicação que pergunta sobre preços, distinguindo valor a cotar. Não criar sugestão de taxa/ART automaticamente nem gravar duas linhas. Atalho pode adicionar despesa já cadastrada com revisão; qualquer catálogo persistente é decisão posterior.

## 7. Anexo A — pedidos pontuais

| Pedido e pessoa simulada | Tratamento proposto |
|---|---|
| Detalhar contas cansa — Ronaldo, Tainá, Lívia | **Agora:** aceitar total das contas e manter detalhamento opcional; dizer onde obter valores. Sem inventar contas ou alíquotas. |
| Avisar abaixo da mínima na configuração — Paulo | **Agora:** mostrar se a meta informada está abaixo da mínima, sem confundir com margem efetiva de orçamento ainda inexistente; não bloquear sem decisão. |
| Resultado da equipe mais visual — Beatriz | **Agora:** resumo numérico em cartões, sem gráfico na primeira fatia; gráfico depois se houver dados comparáveis e descrição acessível. |
| Memória da hora de custo — Marcos | **Agora:** «Ver cálculo»: custo informado ÷ horas informadas = custo/h; no modo diário/projeto mostrar divisor correto, aproximação e centavos. Sem alterar fórmula. |
| Horas variam no mês — Patrícia | **Agora:** texto «Use o mês que deseja estimar; atualize quando souber» e distinguir base global do mês previsto; variação mensal por pessoa exige novo modelo e fica depois. |
| Tempo por unidade em dias — Gilmara | **Depois:** entrada opcional em dias com horas por dia informadas, conversão explícita para minutos e edição; não assumir 8 h. No presente, ajuda «Você pode digitar horas estimadas diretamente». |
| «Empreendimento» soa urbano — Gilmara | **Agora:** ajuda «Empreendimento ou propriedade» no cadastro/lista/proposta onde couber, sem renomear entidade técnica nem dados antigos. |
| «Revisão» soa técnico — Gilmara | **Agora:** ajuda «Uma nova versão para editar; a proposta anterior fica preservada»; manter rótulo até decisão. |
| Metodologia/legislação no objeto — Antônio | **Agora:** orientar texto editável no objeto/premissas; conferência humana e fonte aplicável. Não gerar citações legais automaticamente. |
| Porte junto do serviço — Henrique | **Agora:** permitir descrever a informação no texto do serviço/objeto existente; estrutura/unidade específica fica Anexo B. |
| Dar destaque ao «Inclui ART» — Fernanda | **Agora:** melhorar contraste tipográfico e resumo se campo atual marcado; migração para seção apenas após P7. Não afirmar registro realizado. |
| Letra maior no total/objeto — Edgar, Beatriz | **Agora:** hierarquia tipográfica e corpo 14 px, impressão e responsividade verificadas; não mudar conteúdo. |
| «Reabrir como revisão» mais visível — Tainá | **Agora:** manter nome aprovado, botão claro perto do estado e ajuda sobre versão anterior; não reabrir automaticamente. |
| Duplicação para outro mês e carga — Antônio | **Agora:** «O mês não é copiado; selecione um mês para recalcular a carga. Só orçamentos aprovados contam como comprometidos.» |
| Atalho para adicionar serviço — Wellington | **Depois:** escolher combinação que não colida com navegador/leitor de tela, documentar e manter botão visível; sem atalho não descobrível. |
| Cadastrar 16 pessoas uma a uma — Aline | **Depois:** seleção em lote de membros existentes com revisão individual de custo e horas; não inventar dados nem importar salários. Agora, manter cadastro progressivo. |

## 8. Anexo B — funções que faltam: apenas classificação

| Função e solicitantes simulados | Proposta |
|---|---|
| Unidades de nicho/unidade livre — Henrique, Thiago, Juliana, Marcos, Diego, Gilmara, Tainá | **Depois:** ampliar lista ou unidade livre requer validar escala e cálculos; ADR-0018. |
| Pacote com várias profissões/hectare com relatório — Aline, Thiago, Paulo | **Depois:** múltiplas alocações e custo por pessoa ainda dependem de modelo e testes; ADR-0018 fatia 7. |
| Custo real «Por projeto» separado do preço de pacote — Juliana | **Depois:** depende da composição por pessoa, sem dupla contagem; ADR-0018. |
| Exportar memória de cálculo/custo × preço — Marcos, Juliana, Diego, Tainá, Aline | **Depois:** autorização financeira e exportação segura; ADR-0018. |
| Envio e-mail/WhatsApp/link de assinatura — Juliana, Fernanda, Carolina | **Depois:** canais, privacidade e custos aguardam D11 e demais decisões do ADR-0016. |
| Anexar ART e número — Juliana, Carolina, Marcos, Aline | **Depois:** número opcional proposto na seção 2, anexo depende de Storage privado e revisão; não afirmar emissão. |
| Contrato mensal recorrente — Patrícia | **Depois:** não é parcela; ADR-0018 e decisões do ADR-0016. |
| Suporte/tutorial guiado — Edgar, Gilmara, Lívia, Renata, Tainá | **Depois:** ajudas curtas agora; guia completo depende de teste de fluxo inicial real. |
| Sem internet no campo — Tainá, Wellington | **Depois:** exige armazenamento durável seguro, conflitos e sincronização; autosave não equivale a offline. |
| Permissões por usuário — Marcos, Paulo | **Depois:** exige autorização real no servidor e revisão do modelo; não só ocultar custo. |
| Desconto comercial — Diego | **Depois:** precisa definir incidência e preservar snapshots/centavos. |
| Lembrete de reajuste de tabela — Carolina, Diego | **Depois:** depende de regra de data e permissão; não reajustar preço automaticamente. |
| Importar planilha de custos/preços — Wellington, Aline | **Depois:** dados financeiros precisam de prévia, consentimento e validação. |
| Painel de carga com orçamentos em aprovação — Paulo | **Depois:** mostrar negociação como prévia separada; só aprovados contam na carga, decisão já tomada. |
| Contingência para clima — Antônio | **Depois:** depende de estimativa configurada, sem inventar percentual. |
| Cor e fonte da proposta — Thiago | **Depois:** requer acessibilidade e impressão sem quebrar identidade. |
| CRM ou CAR — Juliana, Gilmara | **Depois:** definir integração, finalidade, origem e autorização; não presumir API disponível. |
| Referência de piso por conselho ou margem do setor — Aline, Antônio | **Nunca nesta proposta:** Eduardo já decidiu sem piso e sem tabela por profissão; não reabrir nem inventar valores. ACEAMB existente permanece opcional como decidido. |

## 9. Fatias sugeridas — uma por PR

1. **Texto e leitura:** aproveitar WIP local, ajustes de custo/rateio/capacidade, explicação de duplicação, 14 px no histórico, ajuda de tributo validada; testes de rótulos e estados, tema escuro e 375 px.
2. **Primeira configuração:** resumo de pendências e agrupamento, preservando valores, sem fingir zero; mudanças de validade passam por domínio/RPC e pgTAP. Testar base vazia e completa e persistência.
3. **Cartões mobile:** uma fonte de estado e regras já existentes, sem alterar cálculos; testes de edição/validação/teclado, quantidade, faixas e parcelas, 375 px e 1366 px.
4. **ART/RRT:** somente após P7–P10; schema aditivo/RLS/FKs, RPC, domínio e pgTAP com os cenários em centavos, migração reversível, snapshots, proposta e testes de não vazamento. Auditar despesas pré-existentes.
5. **Situação/repetição:** apenas após P6; reduzir confirmação segura, manter histórico e conflitos, esclarecer cópias; testes de mudança inválida, revisão, carga e concorrência.
6. **Autosave ou trabalho offline:** PR separado depois de decisão e projeto de segurança; testes de falha, perda de rede, conflitos multiaba, duplicidade, recarga e status. Não chamar rascunho na memória de persistido.

## 10. Perguntas para Eduardo — propostas, não decisões

1. **P1 Caminho mínimo:** (A) rascunho livre com pendências, cálculo só após confirmação de dados necessários (**recomendo**); (B) exigir toda a configuração antes de criar rascunho.
2. **P2 Equipe padrão:** (A) destacar «Calcular pela equipe» e manter entrada manual (**recomendo**); (B) manter o formato atual. Em ambos preservar dados ao trocar.
3. **P3 Parcelas e alíquotas:** (A) pedir confirmação explícita dos valores pré-preenchidos antes de apresentar preço confiável (**recomendo**); (B) usar valores atuais com aviso. Não inferir alíquota de mercado.
4. **P4 Serviços:** (A) cartões no celular e detalhes recolhíveis no desktop (**recomendo**); (B) tabela atual com rolagem. Qual detalhe precisa ficar sempre aberto no notebook?
5. **P5 Linguagem:** (A) manter «acréscimo» aprovado e explicar a base (**recomendo**); (B) outro rótulo a escolher. Margem continua resultado distinto.
6. **P6 Confirmações:** (A) manter para enviada, aprovada, recusada e reabrir; avaliar ação rápida para negociação (**recomendo**); (B) todas atuais; (C) somente aprovar e reabrir, aceitando impacto nas outras transições.
7. **P7 ART/RRT:** (A) seção única com um ou mais registros e serviços vinculados (**recomendo**); (B) caixa por serviço; (C) item comercial. A observação de uma ou duas ARTs não impõe limite: confirma que não há teto fixo?
8. **P8 Tipo/profissional:** (A) escolher ART/RRT manualmente e profissional membro, com pendência se desconhecido (**recomendo**); (B) sugestão pela profissão sempre editável; (C) incluir outros profissionais/registro sem login após nova especificação. Não presumir conselho.
9. **P9 Taxa:** (A) associar uma despesa existente ou criar outra explicitamente, com tratamento escolhido (**recomendo**); (B) apenas lançar manualmente em Despesas. Nunca somar em dois lugares.
10. **P10 Proposta:** (A) mostrar «Inclui ART/RRT» quando marcado e número só se informado e escolhido para divulgação (**recomendo**); (B) sempre ocultar número; (C) mostrar número sempre que informado. Não significa registro emitido.
11. **P11 Autosave:** (A) manter manual agora e estudar automático com `row_version` e conflitos (**recomendo**); (B) priorizar autosave robusto como próximo épico. Não implica modo offline.
12. **P12 Formas de pagamento por projeto/diária:** (A) ajuda e capacidade desconhecida quando faltar dado (**recomendo**); (B) exigir dias/horas antes de avançar. Só aprovado continua contando na carga.

**Entrega:** nenhuma decisão de produto nova foi aprovada; esta ADR não altera as telas ou as mudanças locais existentes. Validar visualmente fluxo completo nas duas larguras e com pessoas reais antes de declarar eficácia.

## 11. Respostas do Eduardo (12/11/2026)

Todas as recomendações foram aceitas:

- **P7, P9 e P10 (ART/RRT):** seção única "Responsabilidade técnica (ART/RRT)" no orçamento, sem limite fixo de registros.
  - Cada registro tem tipo, profissional, os serviços que cobre, a taxa e o número opcional.
  - A taxa liga-se a uma despesa existente ou cria uma, por ação explícita, e é cobrada uma vez só.
  - A proposta mostra "Inclui ART/RRT" quando marcado. O número só aparece se informado e escolhido para divulgação.
  - A lista por serviço sai depois da migração.
- **P1 e P3 (primeira configuração):** o rascunho pode ser criado antes de configurar tudo, com a lista "Falta configurar para calcular o preço". Os valores que já vêm preenchidos pedem confirmação. Nada vira zero presumido.
- **P4 (celular):** cartões por serviço a 375 px. No notebook, os detalhes do serviço ficam recolhíveis.
- **P2:** "Calcular pela equipe" em destaque, mantendo a entrada manual e preservando os dados ao trocar.
- **P5:** a palavra "acréscimo" fica, com a explicação da base.
- **P6:** mantém a confirmação em enviada, aprovada, recusada e reabrir. Avaliar ação rápida só para "Em negociação".
- **P8:** o tipo ART/RRT é escolhido à mão, com profissional membro ou pendência se desconhecido.
- **P11:** "Salvar" continua manual por enquanto.
- **P12:** diária ou projeto sem dias ou horas continua permitido, com aviso de capacidade não calculada.

## 12. Implementado: fatia 1 (textos e leitura)

Só texto e leitura, sem regra nova e sem migration.

- **Custos e taxas:**
  - rótulos de custo ("Custo da hora técnica", "Custo médio por hora da equipe", "Custo por hora de {profissão}");
  - "Contas do mês por hora… Já entra no custo de cada serviço";
  - aviso "Dias (ou Horas) no mês não informados; capacidade não calculada. Fica fora da média e do rateio; a hora de custo continua válida.", embaixo do próprio campo e ligado por `aria-describedby`;
  - texto de horas no mês e do sócio;
  - ajuda da alíquota;
  - explicação de desejada, mínima e que sobra;
  - aviso, sem bloquear, quando a desejada fica abaixo da mínima;
  - dica das contas do mês;
  - ajuda da taxa por documento assinado.
- **Orçamento:**
  - exemplo fictício do acréscimo;
  - ajuda do objeto (metodologia e legislação, conferindo a fonte);
  - histórico da situação em 14 px;
  - confirmação do reabrir: "uma nova versão para editar. O histórico guarda quando foi reaberta". Não diz que a versão anterior fica guardada, porque o sistema ainda não guarda o conteúdo da revisão anterior;
  - duplicar: estimativas que não voltam a cotar, mês não copiado e só aprovados na carga;
  - responsável sem jornada: "(jornada não informada em Custos e taxas)".
- **Novo orçamento:** "Empresa, obra ou propriedade rural já cadastrada no Grama."
- **Proposta:** "Inclui ART/RRT" em destaque.
- **Dados da proposta:** texto de como habilitar a logo.
- **Celular:** faixas presas à esquerda, ART sem a palavra "Registro", proposta com margem menor e o link "Abrir empreendimento" só no aviso de prospecto.
- **Ficaram para outras fatias:**
  - "Ver cálculo" da hora de custo;
  - resultado da equipe em cartões;
  - reabrir mais visível (ele segue na fila "Mudar situação").
