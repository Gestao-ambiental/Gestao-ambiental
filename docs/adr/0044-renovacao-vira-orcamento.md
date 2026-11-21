# ADR-0044: Renovação de LAO vira orçamento

- **Situação:** aceito em 20/11/2026. O Eduardo aceitou todas as recomendações do estudo "Oito funções no Grama" (pergunta 3, renovação vira orçamento) e decidiu a taxa na ADR-0042. O Kadu revisa.
- **Depende de:** ADR-0041 (base das oito funções) e ADR-0042 (taxa da renovação pela fase LAO). Pacote P2, camada `camada/renovacao-orcamento`.
- **Revê:** o desenho do estudo (seção 3.2) onde a crítica do estudo o corrigiu: o catálogo `renovacao-lao` é de Joinville/SAMA e não entra no rascunho; não há "…" na linha de licença do Empreendimento.

## Contexto

A LAO precisa ser renovada até 120 dias antes do vencimento, e a renovação é serviço que a consultoria cobra. Hoje o radar (Acompanhamentos › Renovações) mostra o limite de protocolo, mas o orçamento da renovação nasce à mão, sem ligação com a licença: nada impede dois orçamentos para a mesma renovação nem mostra, no radar, que a proposta já saiu. A triagem CONSEMA calcula atividade, porte e potencial, mas não grava nada, então a taxa do IMA tem de ser refeita a cada vez.

## Decisão

1. **Orçamento ligado à licença.** `orcamento.instrumento_id` (FK composta para `instrumento`). Um orçamento é **vivo** quando não está na lixeira e não está recusado; aprovado conta como vivo (o enum não tem "cancelada"). Índice único parcial: no máximo um orçamento vivo por licença. Reabrir um recusado ou restaurar da lixeira quando a licença já tem outro vivo é barrado com `licenca_ja_tem_orcamento`.
2. **Criar pelo banco.** `criar_orcamento_de_renovacao` cria, numa transação, o rascunho pelo mesmo caminho de `criar_orcamento` (numeração, base de custos, barreira do plano), com o cliente do empreendimento da licença, o objeto "Renovação da <sigla número>" e uma despesa "Taxa do órgão na renovação (<órgão>)" com tratamento `cliente_direto`. Sem modelo e sem itens: o modelo é escolhido no editor. É idempotente pelo id e pela licença: repetir devolve o orçamento vivo que já existe. Nunca envia nada. Só a Gestão, e só para LAO ativa com plano de renovação.
3. **Taxa sugerida no domínio.** A sugestão é a da ADR-0042 (fase LAO da classe, Decreto 421/2023), calculada em `packages/domain` a partir das atividades gravadas na licença; com várias atividades, vale o **maior** valor de LAO entre elas (como a triagem já faz com estudo e potencial). Só quando o órgão da licença é o IMA; para outro órgão, ou sem atividade com valor, o campo vem vazio. Vazio vira despesa "a cotar" (estimativa nula), nunca zero. O banco não recalcula: grava o valor revisto pela Gestão.
4. **Tela sem diálogo.** "Gerar orçamento" leva a `/orcamentos/novo?renovacao=<licença>`: a tela mostra a licença e o campo da taxa, editável, e a ação principal "Criar rascunho" cria e abre o editor. Licença que já tem orçamento vivo abre direto o editor dele.
5. **Radar com horizonte.** `listar_renovacoes` ganha `p_horizonte_meses` (a tela usa 3, 6 ou 12; padrão 6) contado sobre a **validade** da LAO, com a soma de meses do calendário (dia que não existe vira o último do mês, igual a `adicionarMeses` e ao Postgres); vencidas e já protocoladas entram. Sem horizonte, o resultado é o de antes. O filtro "só LAO" passa a ser explícito pela sigla do tipo, além do plano.
6. **Coluna "Orçamento".** A Gestão vê número, situação e link, ou a ação "Gerar orçamento" (escondida quando o plano não tem orçamentos; o banco barra igual). A Equipe vê só a situação, sem número, link nem ação: a RLS do orçamento continua só da Gestão.
7. **Atividades na licença.** Tabela `atividade_licenciada` (código, descrição, porte e potencial da triagem CONSEMA 250/2024, medidas e fonte), ligada à licença por FK composta, com auditoria. Leitura por membro; escrita só pela RPC `gravar_atividades_na_licenca`, só Gestão. Na Triagem aberta com `?empreendimento=` (ou `&licenca=` vindo do plano de renovação), a ação "Gravar na licença" grava as atividades **enquadradas** numa licença do empreendimento. Gravar inclui ou atualiza pelo código e **nunca apaga** atividade já gravada; repetir igual não muda nada.
8. **"É o IMA"** quando o órgão, sem acento, caixa e pontuação, é `IMA`, `IMA SC` ou começa com `INSTITUTO DO MEIO AMBIENTE`. FATMA e outros nomes não contam.

## Consequências

- Uma migration aditiva (coluna, índice, trigger de conferência, tabela nova com RLS forçada e barreiras, duas RPCs e `listar_renovacoes` recriada com o mesmo começo de retorno). O front publicado antes dela continua funcionando: os argumentos novos têm padrão.
- Não há como remover uma atividade gravada por engano neste pacote; a taxa continua editável. Remover fica para quando houver tela das atividades da licença.
- A Equipe passa a ver a situação do orçamento da renovação (não o número nem valores). Se a Gestão preferir esconder, basta devolver nulo na função.
- O protótipo 05, o ERD (coluna e tabela novas) e a documentação de regras precisam ser atualizados por uma pessoa.
