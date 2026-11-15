# Estudo: aprovação do orçamento com tarefas, agenda e capacidade da equipe

- **Data:** 14/11/2026
- **Situação:** estudo. Nada aqui foi construído. As regras marcadas como **proposta** ou **decisão** dependem do Eduardo (o CLAUDE.md manda perguntar, não inventar).
- **Fontes:**
  - código da `branch-do-duds` (commit a9af7e6);
  - ClickUp: Protótipos 19 a 22, cards de Dev, doc 02 Requisitos (FIN, DEM, CAP), 07 ERD, 09 Regras de negócio, proposta 357 "Prioridade por dependências";
  - ADR-0016 (automação do orçamento à execução, proposta), ADR-0017 a 0019;
  - pesquisa de mercado: Float, Runn, Resource Guru, Harvest Forecast, ClickUp Workload, Teamwork.com, Productive.io.

## 1. Resumo

Aprovar um orçamento com tarefas puxa de fato outras três coisas:

1. **Onde o trabalho mora.** Hoje a única coisa com responsável e data é a ocorrência de condicionante. O orçamento aprovado não gera nada.
2. **Quanto cada pessoa aguenta.** Hoje só existe "horas por mês" na base de custos, que só a Gestão vê. Não há jornada por dia, ausência nem feriado da consultoria.
3. **Quanto cada coisa pesa.** Condicionante e ocorrência não têm horas. Só a etapa da ocorrência tem, e essas horas não entram em cálculo nenhum.

**Proposta em uma frase:** tudo que ocupa alguém vira **trabalho com responsável, horas e janela de datas**. O Grama soma esse trabalho por pessoa e por semana, compara com a **capacidade útil** (jornada − feriados − ausências, vezes um fator de foco) e mostra o resultado em três lugares:

- na aprovação do orçamento;
- na ativação de uma licença;
- numa tela "Carga da equipe", mais a "Minha semana" de cada um.

O sistema **nunca troca o responsável sozinho**. Ele mostra o aperto e a Gestão decide.

**Ordem sugerida, em 4 fatias:**

| #   | Fatia                                                                               | Tamanho |
| --- | ----------------------------------------------------------------------------------- | ------- |
| 1   | Aprovação com tarefas                                                               | médio   |
| 2   | Jornada, feriados, ausências e carga da equipe                                      | médio   |
| 3   | Horas nas condicionantes, meta interna e prévia de impacto                          | médio   |
| 4   | Depois: reservas com horário, apontamento de horas, previsão de atraso e prioridade | grande  |

## 2. O que já existe

| Peça                  | Onde                                                                                       | O que faz hoje                                                                                           | Lacuna                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Situação do orçamento | `mudar_situacao_orcamento` (migration 20261113130000, linha 67); `SituacaoDoOrcamento.tsx` | Muda a situação e grava o histórico. O texto da tela diz: "Nenhum contrato, cobrança ou tarefa é criado" | Aprovar não gera nada                                                                                                                 |
| Item do orçamento     | `orcamento_item`                                                                           | Já tem `minutos` (horas estimadas), `responsavel_id` e `mes_previsto` (ADR-0017)                         | Um responsável por item; sem prazo em dia                                                                                             |
| Carga mensal          | `carga-da-equipe.ts`; RPC `carga_da_equipe`                                                | Soma as horas dos itens aprovados por pessoa e mês e compara com `horas_disponiveis_mes`                 | Só aparece dentro do orçamento, só para a Gestão, por mês                                                                             |
| Jornada               | `orcamento_base_equipe.horas_disponiveis_mes`                                              | Número de horas por mês, usado no preço                                                                  | Sem dia da semana, almoço, ausência ou feriado                                                                                        |
| Feriados              | `eh_feriado_nacional` e `somar_dias_uteis` (SQL); `feriadosNacionais` (domínio)            | Só os nacionais, usados no plano e na cobrança                                                           | Sem estaduais, municipais ou pontos facultativos. A contagem em dias úteis da licença está desligada por isso (`PassoPrazos.tsx:312`) |
| Ocorrência            | `ocorrencia`                                                                               | Responsável (copiado da condicionante na ativação), prazo oficial, `meta_interna`                        | `meta_interna` nunca é preenchida; sem horas                                                                                          |
| Etapa                 | `etapa`                                                                                    | Título, modo (trabalho ou espera externa), responsável, meta, `horas_estimadas`                          | As horas não entram em nenhuma soma; a etapa não aparece no calendário                                                                |
| Calendário            | `/calendario`                                                                              | Mês e semana, com prazo, meta, validade, limite de protocolo e prazos de resíduos; filtro por pessoa     | Só datas, sem horas nem carga                                                                                                         |
| Visão da equipe       | `/`                                                                                        | Prazos, "Minhas ações", atribuir                                                                         | Só ocorrências                                                                                                                        |
| Renovação             | `plano_renovacao`, `etapasRenovacaoLao`                                                    | Etapas preparatórias calculadas                                                                          | Sem responsável e sem horas                                                                                                           |
| Resíduos              | `obrigacao_residuo`                                                                        | Prazos no calendário                                                                                     | Sem responsável                                                                                                                       |

## 3. O que as fontes já decidiram e o que está em aberto

**Decidido** (página 09 confirmada em 05/10, FIN e CAP no doc 02):

- Geração das demandas a partir dos itens aprovados **uma vez só**, ligadas ao orçamento e ao item (FIN-03).
- O aceite registra método, pessoa, data, referência e comprovante, com hash do conteúdo. Não é assinatura qualificada (FIN-01).
- Excluir o orçamento não apaga cobranças nem tarefas. Reabrir um orçamento aprovado que já tem pagamento é bloqueado.
- **Capacidade:**
  - Não presumir 8 h por dia. A jornada é cadastrada por pessoa e por dia, com almoço, e o almoço não é espaço livre.
  - `jornada líquida = saída − entrada − intervalo`
  - `capacidade = líquida − ocupações`
  - `livres = capacidade − reservas`
  - **Ausência de dado não é zero** e não significa que a pessoa está livre.
- Espera externa não consome jornada. Agrupador não reserva horas.
- **Nunca há reatribuição automática.** A previsão é determinística e explicável.
- Prazo oficial original nunca muda; a meta interna é plano. Concluir com atraso não desloca o resto da série.

**Proposta, ainda não validada:**

- **Protótipo 22**, sobre o aceite:
  - o aceite exige pessoa, data e referência;
  - gerar tarefas é opcional, numa caixa marcada;
  - o roteiro de tarefas é editável: título, responsável, horas e prazo interno;
  - "hora em branco significa não estimada, não zero";
  - a validação acontece toda antes de gravar;
  - repetir a aprovação não duplica.
- **Protótipo 22**, sobre o depois:
  - abre um processo de obtenção sem inventar condicionantes;
  - o menu ganha "Capacidade e riscos".
- **ADR-0016:** tabelas `demanda_servico` e `demanda_servico_etapa`, com as decisões D1 a D12 abertas.
- **Proposta 357:** "próxima ação" com dependências e caminho crítico, com 6 decisões pendentes.

**Contradições que este estudo resolve com uma recomendação** (seção 10):

1. O P22 mostra 4 tarefas de roteiro. O FIN-03 fala em uma demanda por item.
2. O ERD liga o serviço como "ocorrência com `proposito = servico`". A ADR-0016 cria tabelas próprias.
3. O P22 abre processo de obtenção, mas o processo (onda 3) ainda nem existe.
4. Nenhuma regra decidida diz de onde vêm os feriados.

## 4. A ideia central: uma "linha de trabalho" por coisa que ocupa alguém

Para somar a carga, o Grama precisa enxergar, por pessoa, tudo que pesa na agenda. Cada fonte entra na soma com o seu formato:

| Fonte                                         | Responsável   | Horas                                                         | Janela de datas                         | Já existe?                |
| --------------------------------------------- | ------------- | ------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| **Tarefa de serviço** (do orçamento aprovado) | da tarefa     | estimadas na tarefa                                           | início até o prazo interno              | Não (fatia 1)             |
| **Ocorrência de condicionante**               | da ocorrência | da condicionante, por ciclo, ou a soma das etapas de trabalho | início da preparação até a meta interna | Parcial (fatia 3)         |
| **Etapa da ocorrência** (modo trabalho)       | da etapa      | da etapa                                                      | até a meta da etapa                     | Sim, mas não é somada     |
| **Etapa de renovação da LAO**                 | do plano      | por etapa                                                     | janela da etapa                         | Não (fatia 3 ou 4)        |
| **Ausência** (férias, licença, folga)         | a pessoa      | tira a capacidade                                             | intervalo de datas                      | Não (fatia 2)             |
| **Feriado**                                   | todos         | tira a capacidade                                             | o dia                                   | Só os nacionais (fatia 2) |
| Espera externa, agrupador                     | —             | **não conta**                                                 | —                                       | Regra decidida            |

Isso é **calculado, não gravado**, como atraso e situação. Uma função de domínio recebe as linhas e devolve a carga por pessoa e por dia. O banco tem uma RPC espelho, para as telas que listam muita gente.

**Distribuição das horas pelos dias.** Proposta: dividir **igual pelos dias úteis disponíveis da pessoa** dentro da janela. Dia de feriado, ausência ou folga da jornada fica sem horas. É o padrão de Float, ClickUp e Teamwork; ninguém concentra as horas no fim por padrão. A divisão manual (o Teamwork tem "divisão personalizada") fica para a fatia 4, junto com as reservas com horário (CAP-03).

**Quando falta dado** (regra decidida: desconhecido nunca é zero):

- **Pessoa sem jornada:** a capacidade aparece como "não cadastrada" e a pessoa fica fora do cálculo de percentual.
- **Trabalho sem horas:** conta como "não estimado", numa linha à parte ("3 tarefas sem horas"), em vez de somar zero.
- **Trabalho sem data:** vai para "sem prazo", visível, sem entrar em semana nenhuma.

## 5. Fatia 1: aprovação do orçamento com tarefas

### Fluxo

Na tela do orçamento enviado ou em negociação, o botão "Marcar como aprovada" vira **"Registrar aprovação"**. Ele abre um painel com três blocos, seguindo o Protótipo 22.

**1. Registro do aceite (FIN-01)**

- Quem aprovou, pelo cliente: texto. Obrigatório.
- Data do aceite. Obrigatória, sem data no futuro.
- Referência: "e-mail de 12/11", "WhatsApp", número do pedido. Obrigatória.
- Método (e-mail, WhatsApp, reunião, documento assinado) e comprovante (arquivo no Storage, imutável). Opcionais. **Decisão A4.**
- Hash SHA-256 do conteúdo comercial da revisão aprovada: itens, valores e parcelas. Calculado pelo banco, sem ninguém ver; serve para provar depois qual versão foi aceita.

**2. Tarefas da execução**

- Caixa "Gerar tarefas com a aprovação", marcada por padrão. **Decisão A3.**
- Proposta: **uma tarefa por item do orçamento** (FIN-03), já preenchida com o que a Gestão definiu no orçamento:
  - título = descrição do item;
  - responsável = responsável do item;
  - horas = horas do item;
  - prazo interno = sugestão a partir do mês previsto do item (**decisão A5**).
- Dá para editar, remover e acrescentar tarefas antes de confirmar, como no P22.
- Hora em branco = não estimada. Responsável em branco = "sem responsável", visível.
- Do lado direito, o painel "Execução": total de tarefas, total de horas e, **a partir da fatia 2**, o impacto na carga de cada responsável. Por exemplo: "Analice: dez/2026 passa de 92% para 118% da capacidade útil".

**3. Prospecto vira empreendimento (FIN-06)**

- Se o orçamento é de um prospecto, a aprovação oferece "Cadastrar o empreendimento". Já existe a RPC `cadastrar_empreendimento_do_prospecto`. **Decisão A7:** obrigatório ou opcional.

O botão **"Confirmar aprovação"** chama **uma RPC**, numa transação:

- muda a situação;
- grava o aceite;
- cria as tarefas;
- grava o histórico e a auditoria.

Se qualquer validação falhar, nada é gravado ("sem efeitos parciais", P22).

### Regras propostas

- **Idempotente.**
  - Cada tarefa gerada guarda o `orcamento_item_id`, com chave única. Repetir a confirmação não duplica.
  - Aprovar uma revisão nova só cria tarefas para os itens novos.
  - Item removido numa revisão não apaga a tarefa: ela fica marcada "fora da revisão aprovada" para a Gestão decidir.
- **Ao reabrir um orçamento aprovado**, as tarefas continuam. A regra decidida diz que excluir o orçamento não apaga tarefas; vale o mesmo para reabrir.
- **Sem atribuição automática.** O responsável vem do que a própria Gestão escolheu no orçamento e pode ser trocado antes de confirmar.
- **Processo de obtenção:** o P22 abre um processo, mas o módulo de processo (onda 3) não existe. Proposta: **não abrir processo nesta fatia.** As tarefas ficam ligadas ao orçamento e ao empreendimento. **Decisão A6.**

### Onde as tarefas aparecem

- **No orçamento aprovado:** a lista "Tarefas geradas", com responsável, prazo, horas e situação (P22, print 06).
- **Em "Minhas ações", na visão da equipe:** ao lado das ocorrências, com o rótulo "Serviço". Isso responde à D12 da ADR-0016 com "sim, entram".
- **No calendário:** o prazo interno da tarefa, como evento "Tarefa", com forma e rótulo próprios. Informação nunca só pela cor.
- **Ações sobre a tarefa:** iniciar, concluir e reabrir, pelo responsável ou pela Gestão. Trocar responsável, prazo e horas: só a Gestão.

### Dados (rascunho)

```
tarefa_servico
  id, consultoria_id
  orcamento_id            FK composta
  orcamento_item_id       FK composta, nulo para tarefa acrescentada à mão; único quando preenchido
  empreendimento_id       FK composta, nulo enquanto for prospecto
  titulo                  texto, obrigatório
  responsavel_id          membro_id, nulo = sem responsável
  minutos_estimados       inteiro, nulo = não estimada (nunca 0 por falta de dado)
  inicio                  DATE, nulo = a partir da aprovação
  prazo_interno           DATE, nulo = sem prazo
  situacao                a_fazer | em_andamento | concluida | cancelada
  fora_da_revisao         boolean (item saiu numa revisão)
  concluida_em, concluida_por
  row_version, criado_em, criado_por

orcamento_aceite
  id, consultoria_id, orcamento_id, revisao
  aprovado_por_cliente (texto), data_aceite DATE, referencia, metodo
  comprovante_documento_id (opcional), conteudo_sha256
  registrado_por (membro_id), registrado_em TIMESTAMPTZ
```

Ambas as tabelas seguem o padrão do projeto:

- RLS forçada;
- leitura por membro ativo, escrita só por RPC;
- gatilhos de auditoria e de suporte/comercial só leitura;
- teste pgTAP negativo de outra consultoria.

O aceite é dado comercial, então só a Gestão o lê.

**Por que não reaproveitar a ocorrência** (o caminho que o ERD indicava):

- A ocorrência exige `instrumento_id` e `prazo_oficial_original`. Um serviço contratado não tem licença, porque muitas vezes é justamente para obtê-la, e não tem prazo **legal**, só prazo combinado.
- Forçar o serviço na ocorrência faria o "prazo oficial" significar duas coisas, e todas as telas de prazos teriam de tratar a exceção.
- Uma tabela própria, somada na carga e listada em "Minhas ações", dá o mesmo resultado sem mexer no que já funciona. **Decisão A1.**

**Carga mensal atual:** depois que as tarefas existirem, `carga_da_equipe` passa a somar as tarefas (e não mais os itens) dos orçamentos aprovados. Assim nada é contado duas vezes.

## 6. Fatia 2: jornada, feriados, ausências e carga da equipe

### Jornada de cada pessoa (CAP-01)

- Fica na tela da Equipe, no cadastro de cada membro.
- É preenchida pela Gestão, e a própria pessoa pode ver a sua.
- Para cada dia da semana: trabalha ou não, entrada, saída e intervalo (início e fim).
- **Validação:** saída depois da entrada; intervalo dentro da jornada.
- Mostra o total: "Segunda: 8 h líquidas · Semana: 40 h".
- **Sem padrão de 8 h** (regra decidida). Quem não tem jornada aparece como "jornada não cadastrada".
- Um botão "Copiar para os outros dias" agiliza o preenchimento. Também dá para copiar de outra pessoa.
- **Relação com a base de custos:** a base tem `horas_disponiveis_mes`, usado no preço. Proposta: quando a jornada existir, Custos e taxas mostra "Pela jornada: 168 h/mês" como sugestão, sem sobrescrever o número que a Gestão definiu. **Decisão B5.**

### Feriados

- **Nacionais:** automáticos. O cálculo já existe no banco e no domínio, inclusive a Páscoa e as datas móveis.
- **Da consultoria:** cadastro da Gestão em Configurações, com data, nome e tipo (estadual, municipal, ponto facultativo, recesso da empresa). Serve para o feriado de Joinville, a data magna de SC e o recesso de fim de ano.
- Atenção a um detalhe: APIs públicas como a BrasilAPI marcam Carnaval e Corpus Christi como "nacionais", mas eles são ponto facultativo. Por isso não usamos API externa: os nacionais vêm do nosso cálculo e o resto, a consultoria cadastra.
- **Ganho de brinde:** com a tabela de feriados da consultoria, dá para **ligar a contagem em dias úteis** no cadastro de prazos da licença. Ela está desligada hoje esperando isso (`PassoPrazos.tsx:312`, LIC-03). **Decisão B3:** se os prazos legais usam os mesmos feriados da agenda.

### Ausências

- **Campos:** pessoa, de, até, tipo (férias, licença, folga, curso, outro) e observação.
- **Quem lança:** a Gestão lança para qualquer pessoa. **Decisão B4:** se a própria pessoa pode lançar a dela.
- **Quem vê o quê:** a equipe vê só "Ausente" nos dias, sem o tipo. O tipo pode ser dado sensível (licença médica). **Decisão B4.**
- **Ao lançar:** se a pessoa tem trabalho com prazo dentro da ausência, aparece um aviso ("Analice tem 2 tarefas e 1 condicionante com prazo nesse período"). O sistema não mexe em nada.

### Capacidade útil

```
capacidade bruta do dia = jornada líquida do dia da semana
                          − feriado (dia inteiro)
                          − ausência (dia inteiro)
capacidade útil         = capacidade bruta × fator de foco
```

**Fator de foco:** é a parte da jornada que sobra para trabalho planejado, descontando reunião, e-mail, administrativo e imprevistos.

- **Referência de mercado:** serviços profissionais planejam 70% a 85% (SPI Research, Kantata; 100% é tratado como sinal de alerta).
- **Proposta:** um valor da consultoria, que a Gestão pode ajustar por pessoa. Um coordenador, por exemplo, tem menos foco.
- **Decisão B1:** o valor padrão. Minha sugestão é 80%. Mostrar 100% sem fator seria fingir que ninguém atende telefone.

### Tela "Carga da equipe" (Gestão; **decisão B6** sobre a Equipe ver)

- **Grade:** pessoas nas linhas, 12 semanas nas colunas. Mês nas colunas é opção.
- **Cada célula** mostra o texto "26/29 h" e uma barra, com três estados (**decisão B2**, os limites):
  - até 85%: normal;
  - de 85% a 100%: "Atenção", em amarelo, com ícone;
  - acima de 100%: "Acima", em vermelho, com ícone e número.
- **Outros estados da célula:** ausência em cinza com a palavra "Ausente"; feriado com o nome.
- **Clicar na célula** abre o que compõe aquela semana: tarefas, ocorrências e etapas, com horas, e o que está sem horas.
- **Linha de alerta:** "Sem jornada: 1 pessoa · Trabalho sem horas: 7 itens · Sem prazo: 3 tarefas".
- **"Incluir orçamentos em negociação"**, desligado por padrão, mostra as horas tentativas com contorno pontilhado e a palavra "Tentativo" (padrão Float/Runn). A ADR-0019 já deixou a prévia de negociação para depois. **Decisão B7.**
- A tabela rola na própria região, nunca a página. No celular, a grade vira lista por pessoa, com a semana atual e as próximas.

### Tela "Minha semana" (todos)

- **Celular:** faixa de 7 dias no topo, tocável. Cada dia mostra "6/8 h" e uma barrinha. Embaixo, a lista do dia.
- **Desktop:** a mesma coisa em colunas.
- **Ordem da lista:**
  1. prazos legais (ocorrências);
  2. tarefas de serviço;
  3. etapas;
  4. "sem horas";
  5. "sem prazo".
- Mostra também o feriado e a ausência do dia.
- **Pode ser uma aba nova na visão da equipe** ("Minhas ações" já existe; a semana fica do lado). **Decisão B8:** aba ou página.

## 7. Fatia 3: o que acontece com a agenda quando uma licença é cadastrada

### Como é hoje

A ativação do plano gera uma ocorrência por ciclo até o fim da validade, com o responsável da condicionante. As ocorrências aparecem na tabela e no calendário só como **datas**: não pesam em horas e não têm meta interna. A pessoa recebe 40 prazos novos e ninguém sabe se cabe.

### O que falta para a licença "pesar" na agenda

**1. Horas por ciclo na condicionante.** É um campo opcional no passo de prazos do cadastro, ao lado da recorrência: "Quanto trabalho cada entrega dá? (horas)".

- Sem preenchimento, a condicionante fica "não estimada", nunca zero.
- Vale para todas as ocorrências da série. Se a ocorrência tiver etapas de trabalho com horas, a soma das etapas prevalece.
- Agrupador e condição contínua não têm esse campo, pela regra decidida.

**2. Quando começar a preparar.** É outro campo opcional: "Começar N dias antes do prazo". Define o início da janela em que as horas se distribuem.

**3. Meta interna automática.** É uma regra da consultoria: "meta interna = prazo oficial − X dias". Hoje a meta nunca é preenchida.

- A ativação passa a gravá-la, e o reagendamento da meta (DEM-05) muda só ela.
- **Decisão C2:** o valor de X e se cada condicionante pode ter o seu. Precedente: a renovação já usa "antecedência" configurável, com 30 dias de padrão.

Com isso, cada ocorrência vira uma linha de trabalho: responsável, horas, janela entre o início da preparação e a meta interna.

### Prévia de impacto na ativação (a parte que você pediu: "ver como vai ficar o calendário de cada um")

O passo **Ativar plano** (Protótipo 15) já mostra uma prévia das ocorrências. Ele ganha um bloco "**Impacto na agenda**":

```
Impacto na agenda (próximos 12 meses)

Analice    jan  fev  mar   abr  mai  jun ...
  já tinha 70%  82%  88%   75%  ...
  com esta 78%  90%  106%  81%  ...      <- mar: "Acima: 31 h de 29 h úteis na semana de 16/03"
Helena     sem jornada cadastrada — não dá para calcular
Eduardo    ...
3 condicionantes sem horas estimadas não entraram na conta
```

**Regras da prévia:**

- **Não bloqueia a ativação.** A Gestão pode voltar ao passo de responsáveis e trocar alguém, ou ativar assim mesmo.
- O sistema **não sugere quem pega**. A ordenação de responsáveis por disponibilidade (CAP-09) fica para a fatia 4.
- A mesma prévia aparece na **aprovação do orçamento** (fatia 1, depois que a fatia 2 existir) e ao **trocar o responsável** de uma condicionante ou tarefa.

### Exemplo (números ilustrativos, não são regra)

**Analice:**

- Jornada: segunda a quinta das 8h às 17h, com 1 h de almoço (8 h líquidas); sexta das 8h às 12h. Total: 36 h por semana.
- Com foco de 80%, a capacidade útil é de cerca de 29 h por semana.

**Ela recebe uma LAO com três condicionantes:**

| Condicionante                  | Recorrência | Horas por ciclo | Começar       | Prazo         |
| ------------------------------ | ----------- | --------------- | ------------- | ------------- |
| Monitoramento de efluentes     | mensal      | 3 h             | 10 dias antes | dia 10        |
| Relatório de automonitoramento | semestral   | 16 h            | 30 dias antes | 31/03 e 30/09 |
| Inventário de resíduos         | anual       | 8 h             | 20 dias antes | 30/06         |

**Premissa:** a meta interna é 5 dias antes do prazo.

**Março (o relatório semestral cai no fim do mês):**

| Semana   | Já tinha (tarefas) | Entra com a licença               | Total    | Útil | Situação         |
| -------- | ------------------ | --------------------------------- | -------- | ---- | ---------------- |
| 02–06/03 | 20 h               | efluentes 3 h + relatório ≈ 4,2 h | ≈ 27,2 h | 29 h | Atenção (94%)    |
| 09–13/03 | 26 h               | relatório ≈ 4,2 h                 | ≈ 30,2 h | 29 h | **Acima (104%)** |
| 16–20/03 | 22 h               | relatório ≈ 4,2 h                 | ≈ 26,2 h | 29 h | Atenção (90%)    |
| 23–27/03 | 12 h               | relatório ≈ 3,4 h                 | ≈ 15,4 h | 29 h | Normal (53%)     |

As 16 h do relatório se dividem igualmente pelos 19 dias úteis entre 02/03 (início da preparação) e 26/03 (meta interna), cerca de 0,84 h por dia. As 3 h do monitoramento caem entre 02/03 e 05/03 (meta interna do prazo de 10/03).

**O que a Gestão vê na prévia:** "Analice fica acima na semana de 09/03". Três saídas possíveis, todas decididas por ela:

- mover uma tarefa de serviço;
- adiantar o início do relatório;
- passar o monitoramento de março para outra pessoa.

### Renovação e resíduos

- **Renovação:**
  - as etapas preparatórias da LAO (já calculadas) ganham responsável no plano de renovação, mais horas por etapa;
  - assim, os 4 a 6 meses de preparação também pesam na agenda.
- **Resíduos:**
  - as obrigações ganham responsável;
  - as horas ficam para depois;
  - poucas horas por obrigação, então pesam pouco.
- **Decisão C4:** se as duas coisas entram na fatia 3 ou na 4.

## 8. Fatia 4: depois (registrar, não construir agora)

São requisitos que já existem no doc 02. Ficam fora das fatias 1 a 3 porque mudam o modelo do calendário: de "dia inteiro" para "hora marcada".

- **Reserva com horário (CAP-03):** "terça das 14h às 17h no relatório X". Fica no calendário como confirmado, separado da previsão.
- **Apontamento de horas (CAP-04):** horas realizadas por tarefa, com estimada, restante e conservadora.
- **Compromissos e visitas (CAP-08):** com hora, participantes e detecção de sobreposição. Liga com a Vistoria móvel.
- **Previsão de atraso e "próxima ação" (CAP-07, proposta 357):** dependências entre etapas, caminho crítico, folga e prioridade. A proposta 357 tem 6 decisões pendentes, e o próprio texto diz que "nenhum número de horas, prazo ambiental, peso de pontuação ou critério profissional foi aprovado".
- **Ordenação de responsáveis (CAP-09):** sugere por disponibilidade e competência, sempre com confirmação humana.
- **Roteiros por serviço:** modelos de tarefas por tipo de serviço do catálogo. Por exemplo, "Obtenção de LAO" gera visita, levantamento, elaboração e protocolo, como no exemplo do P22. Isso permite que um item vire várias tarefas.
- **Exportar ICS (EQ-06)** e **lembretes por e-mail** da agenda da pessoa.

## 9. Permissões

| Dado                                            | Gestão                         | Equipe                                      |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------- |
| Aceite do orçamento (quem aprovou, comprovante) | vê e registra                  | não vê (**decisão A8**)                     |
| Tarefas de serviço                              | vê todas, cria, edita, atribui | vê todas (**B6**); inicia e conclui as suas |
| Jornada                                         | edita todas                    | vê a própria                                |
| Ausência                                        | lança para todos               | vê "Ausente" sem o tipo (**B4**)            |
| Feriados da consultoria                         | edita                          | vê                                          |
| Carga da equipe                                 | vê                             | **decisão B6**: vê a própria ou a de todos  |
| Horas por mês e remuneração (base de custos)    | vê                             | não vê (já é assim)                         |

**A regra de acesso continua a mesma:** o banco libera o que for de um membro ativo da consultoria. A tela só esconde por apresentação, nunca por segurança.

## 10. Decisões para o Eduardo

**Atualização de 14/11/2026:** o Eduardo pediu que eu seguisse as minhas recomendações. A1 a A8 foram aplicadas na fatia 1 ([ADR-0029](../adr/0029-aprovacao-com-tarefas.md)); B e C valem como ponto de partida das fatias 2 e 3.

Cada decisão traz a minha recomendação. Nada disso é regra até você dizer.

**A. Aprovação e tarefas**

| #   | Pergunta                                                             | Recomendação                                                                            |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A1  | Tarefa de serviço em tabela própria ou como ocorrência (ERD)?        | Tabela própria (seção 5)                                                                |
| A2  | Uma tarefa por item do orçamento ou roteiro de várias tarefas (P22)? | Uma por item agora, editável antes de confirmar; roteiros por serviço depois            |
| A3  | Gerar tarefas é opcional (caixa) ou sempre?                          | Caixa marcada por padrão                                                                |
| A4  | Campos obrigatórios do aceite                                        | Pessoa, data e referência obrigatórios; método e comprovante opcionais; hash automático |
| A5  | Prazo interno sugerido                                               | Último dia do mês previsto do item, editável; sem mês, fica sem prazo                   |
| A6  | Abrir processo de obtenção na aprovação?                             | Não nesta fatia (o módulo de processo não existe)                                       |
| A7  | Prospecto precisa virar empreendimento para aprovar?                 | Oferecer, sem obrigar                                                                   |
| A8  | A Equipe vê o aceite?                                                | Não, é dado comercial                                                                   |

**B. Capacidade**

| #   | Pergunta                                                     | Recomendação                                               |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| B1  | Fator de foco padrão                                         | 80%, ajustável por pessoa                                  |
| B2  | Limites de "Atenção" e "Acima"                               | 85% e 100%                                                 |
| B3  | Prazos legais em dias úteis usam os feriados da consultoria? | Sim; liga a contagem em dias úteis da licença              |
| B4  | A pessoa lança a própria ausência? A equipe vê o tipo?       | A Gestão lança; a equipe vê só "Ausente"                   |
| B5  | Horas por mês da base de custos vêm da jornada?              | Mostrar como sugestão, sem sobrescrever                    |
| B6  | A Equipe vê a carga dos colegas?                             | Sim, em horas e %, sem dado de custo (ajuda a pedir ajuda) |
| B7  | Orçamento em negociação aparece na carga?                    | Como "Tentativo", desligado por padrão                     |
| B8  | "Minha semana" é aba da visão da equipe ou página?           | Aba ao lado de "Minhas ações"                              |

**C. Licença na agenda**

| #   | Pergunta                                                                                    | Recomendação                                                   |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| C1  | Horas por ciclo e "começar N dias antes" na condicionante                                   | Opcionais, sem padrão (vazio = não estimada)                   |
| C2  | Meta interna automática: quantos dias antes do prazo? Por consultoria ou por condicionante? | Por consultoria, com exceção por condicionante; o número é seu |
| C3  | A prévia de impacto bloqueia ativar ou aprovar quando alguém passa de 100%?                 | Não bloqueia; só mostra                                        |
| C4  | Responsável e horas na renovação e nos resíduos: fatia 3 ou 4?                              | Renovação na 3, resíduos na 4                                  |

## 11. Fatias e testes

| Fatia                    | Entrega                                                                                    | Banco                                                                                        | Domínio                                                | Telas                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| 1. Aprovação com tarefas | Aceite, tarefas geradas, tarefas em "Minhas ações" e no calendário                         | `orcamento_aceite`, `tarefa_servico`, RPC `aprovar_orcamento` (idempotente), ações da tarefa | sugestão de prazo, validação do aceite                 | painel de aprovação, lista de tarefas no orçamento, rótulo "Serviço" |
| 2. Capacidade            | Jornada, feriados, ausências, Carga da equipe, Minha semana                                | `jornada_membro`, `feriado_consultoria`, `ausencia`, RPC `carga_por_semana`                  | `capacidadeDoDia`, `distribuirHoras`, `cargaPorSemana` | jornada no membro, feriados em Configurações, carga, minha semana    |
| 3. Licença na agenda     | Horas e antecedência na condicionante, meta interna, prévia de impacto, dias úteis ligados | colunas na versão da condicionante, ativação grava a meta                                    | `metaInterna`, `impactoNaCarga`                        | passo de prazos, bloco de impacto na ativação e na aprovação         |
| 4. Depois                | Reservas, apontamento, previsão, prioridade, roteiros, ICS                                 | —                                                                                            | —                                                      | —                                                                    |

**Em todas as fatias** valem as regras do projeto:

- testes de domínio para cada cálculo;
- pgTAP com o teste negativo de outra consultoria em cada tabela nova;
- Vitest nas telas, com o caminho de erro;
- estados vazio, carregando, erro e sem permissão;
- celular e tema escuro;
- `corepack pnpm verificar` verde antes de entregar.

**Datas:** jornada e ausência são `DATE` e horário local, nunca no fuso do aparelho. "Hoje" vem do fuso da consultoria (ADR-0009).

**Casos de teste que importam:**

- aprovar duas vezes não duplica;
- revisão nova cria só as tarefas dos itens novos;
- pessoa sem jornada sai como "não cadastrada", não como 0% livre;
- trabalho sem horas não soma zero;
- feriado e ausência zeram o dia;
- espera externa e agrupador não contam;
- a ativação grava a meta e nunca toca o prazo oficial;
- outra consultoria não vê nada.

## 12. Referências de mercado

- **Float:** horas por dia por pessoa; feriados importados por região; divisão igual entre os dias; tentativo com contorno; vermelho acima da capacidade. <https://support.float.com/en/articles/4188692-allocate-time>
- **Runn:** confirmado e tentativo contra a "capacidade efetiva"; tentativo desligado por padrão. <https://help.runn.io/en/articles/11517226-capacity-dashboard>
- **Resource Guru:** quando não cabe, oferece "hora extra" ou "lista de espera". <https://help.resourceguruapp.com/en/articles/2942080-booking-clashes-the-waiting-list-overtime-and-capacity-planning>
- **Teamwork.com:** a proposta vira projeto, escolhendo tentativo ou confirmado; as linhas de horas viram tarefas. <https://www.teamwork.com/blog/quote-with-full-margin-visibility-and-seamless-project-conversion/>
- **Productive.io:** separa horas vendidas, estimadas e agendadas. <https://help.productive.io/en/articles/13001867-the-deal-overview-tab>
- **Utilização em serviços profissionais:** meta de 70% a 85%; 100% é alerta. <https://www.kantata.com/blog/article/professional-services-utilization-benchmarks>
- **BrasilAPI de feriados:** só nacionais, e marca Carnaval e Corpus Christi como nacionais. <https://brasilapi.com.br/api/feriados/v1/2026>
