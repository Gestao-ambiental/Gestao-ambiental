# ADR-0020 — Primeiros passos do orçamento

**Situação:** especificação de trabalho em 13/11/2026. Eduardo solicitou também a implementação nesta sessão. Não altera ADR-0018 §9 nem ADR-0019 §§11, 13 e 14. Painel de 20 personas simulado: 19 respostas completas; a estimativa média de 59 minutos não é medição de usuários reais.

## 1. Objetivo e decisões

Um convite na lista para Gestão apresenta seis passos curtos; não bloqueia criar ou ver orçamento. A configuração de cada etapa é salva no servidor e retomável por outro gestor da mesma consultoria. A base usada para cálculos permanece a última configuração completa validada até publicação explícita e atômica do rascunho. Ausente não é zero; contas e alíquotas só são zero quando informadas. Margens de 30% e 25% são exemplos de interface, não valores recomendados, e requerem confirmação.

## 2. Exibição e retomada

- Somente membro ativo da Gestão; Equipe não recebe dados financeiros nem acesso às RPCs.
- Sem base publicada, apresentar convite «Configurar em poucos passos» e «Ver orçamentos mesmo assim»; esta ação oculta automaticamente o convite para aquele membro/consultoria, em servidor, sem afetar os demais. Permanecem lista e atalho «Primeiros passos».
- Base publicada não deve ser sobrescrita ou parcialmente aplicada apenas ao abrir o fluxo. Atalho para reabrir em Custos e taxas; se uma base completa já existe, novo fluxo começa com cópia explícita dos dados e versão da base.
- Configuração incompleta ou dispensada não bloqueia listagem e criação de rascunho de orçamento; o preço mantém as pendências existentes. Convite dispensado não reaparece a cada visita; aviso de preço incompleto continua quando necessário.

## 3. Persistência, concorrência e segurança — projeto

Criar uma única linha de rascunho por consultoria, com `consultoria_id`, ID, `row_version`, `base_row_version` (0 = ausência de base), etapa salva e objeto validado de campos parciais, com nulos explícitos. Os dados monetários, quando digitados, são centavos inteiros e percentuais pontos-base; IDs de membros validados na mesma consultoria. Informações de identidade continuam em `consultoria_identidade`, pela respectiva RPC/versionamento; logo apenas depois de gravar identidade e pelo fluxo privado de documento existente. Uma tabela de preferência por membro e consultoria registra dispensar convite, vinculada por FK composta a `membro`.

```sql
-- Rascunho ilustrativo: migration real deve criar as garantias e políticas abaixo.
create table public.orcamento_configuracao_rascunho (
  id uuid primary key, consultoria_id uuid not null references public.consultoria(id),
  dados jsonb not null default '{}'::jsonb, etapa integer not null default 1,
  base_row_version integer not null default 0, row_version integer not null default 1,
  atualizado_por uuid not null, atualizado_em timestamptz not null default now(),
  unique (consultoria_id), unique (consultoria_id,id),
  foreign key (consultoria_id,atualizado_por) references public.membro(consultoria_id,id),
  check (jsonb_typeof(dados)='object'), check (etapa between 1 and 6)
);
create table public.orcamento_configuracao_preferencia (
  id uuid primary key, consultoria_id uuid not null, membro_id uuid not null,
  dispensado_em timestamptz, row_version integer not null default 1,
  unique (consultoria_id,id), unique (consultoria_id,membro_id),
  foreign key (consultoria_id,membro_id) references public.membro(consultoria_id,id)
);
```

RLS habilitada e forçada; revogar `PUBLIC`/`anon`, escrita apenas por RPC; checar `private.is_gestao` e membro ativo, papel em vínculo, `search_path` fixo e limites de tamanho. A preferência é apenas da própria pessoa; a Gestão não deve ler escolhas alheias. Garantir vínculo composto com consultoria e membro; auditar alterações críticas sem expor salários no log. Não guardar segredos nem dados reais em artefatos ou logs.

RPC de leitura retorna rascunho, estado de convite e versões, sem criar registro em leitura. RPC de salvar passo verifica versão do rascunho (`0` para criação), valida chave/estrutura e escopo da etapa, mantém dados das outras etapas e retorna nova versão; rejeita alteração cruzada ou substituição cega e permite repetição idempotente por chave de operação. Guardar dados incompletos sem substituir null por zero. Gerar erro explícito para versão obsoleta; usuário pode comparar, recarregar ou cancelar, nunca sobrescrever em silêncio. Salvar e depois avançar; erro mantém os campos editados na tela.

RPC de publicar trava base e rascunho em ordem determinística, compara `base_row_version` com a base efetiva, valida todos os campos completos e membros ativos, aplica a **mesma** validação e fórmula do banco atual numa única transação e marca rascunho concluído. Se outra pessoa salvou Custos e taxas, mostrar conflito com opção de comparar, retomar base atual ou cancelar; nunca mesclar automaticamente custo ou equipe. Ausência de `row_version` na API atual deve ser tratada explicitamente: incluir retorno/checagem em RPC compatível ou usar RPC nova; não presumir que `salvar_base_de_custos` atual oferece concorrência. Escritas concorrentes no primeiro insert precisam de restrição única e tratamento determinístico. Os campos adicionais da base não editados no fluxo devem ser preservados, não apagados. Na falha nenhuma parte passa a valer. Testar RLS forçada, gestor de outro tenant, Equipe, membros cruzados, comparação de versões, concorrência, idempotência, falhas a meio e paridade entre TypeScript e Postgres.

## 4. Telas e validação

Progresso textual «Passo N de 6»; «Voltar», «Salvar e continuar», estado «Salvando…», «Salvo» ou erro acionável. Ao avançar, focar título e avisar leitura de tela. Sempre há «Ver orçamentos mesmo assim»; sair sem gravar alterações recentes deve avisar. Reabertura retoma último passo salvo; não confundir reabrir com republicar.

1. **Sua equipe:** selecionar membros com login e «Como recebe»: CLT, pró-labore, estágio, diária ou projeto; custo e horas conforme forma; mostrar «Custo da hora técnica» calculado pela regra existente. «Dias/horas no mês não informados; capacidade não calculada. Fica fora da média e do rateio; a hora de custo continua válida.» Para continuar exige ao menos uma pessoa válida e custo/h calculável; dias no mês na diária e horas mensais em projeto continuam opcionais. Não inventar encargos; confirmar com contabilidade. Se a soma de horas da equipe não representar horas faturáveis, pedir valor explícito no passo seguinte sem recalcular jornada.
2. **Contas do mês:** «Total das contas por mês (R$)» ou «Detalhar contas do mês»; campo obrigatório, aceita zero digitado. «Horas faturáveis por mês» deve ser informada/confirmada conforme regra existente; se derivada da equipe pela base atual, mostre origem e permita revisar sem reclassificar horas. Mostrar «Contas do mês por hora: R$ X por hora. Já entra no custo de cada serviço do orçamento, pelas horas dele.» Quando faltam horas, mostrar pendente, não zero. Validar soma do detalhe = total ou derivar uma vez, sem dupla contagem de equipe.
3. **Como vocês cobram:** pelo menos uma linha de tabela própria com «Serviço, atividade ou nível», «Unidade», «Preço (R$)», «Tempo por unidade (opcional)», mínimo e faixas opcionais conforme código; hora, m², hectare, diária, campanha e pacote. Não preencher referências por profissão; preservar atalho ACEAMB histórico já existente como opcional. Respeitar regras de faixas e preço fechado. Valor ausente não é zero; exibir erros específicos e manter o que já foi digitado.
4. **Tributos e margens:** «Tributos sobre o faturamento (%)» obrigatório mesmo se 0; «Peça à contabilidade a alíquota efetiva; imposto pago ÷ faturamento é só aproximação e varia por período e regime.» «Margem desejada (%)», «Margem mínima (%)» e confirmação explícita de valores iniciais. Outros campos de taxa cobrados no código não podem ser omitidos silenciosamente: solicitar valor ou confirmação explícita de ausência, inclusive cobrança, assinatura e percentual, antes da promoção. Usar limites e validação existentes, com erro associado ao campo.
5. **Sua proposta (opcional):** «Razão social», «CNPJ», «Texto de apresentação padrão», «Salvar dados» e «Enviar logo»; logo desabilitado até identidade salva e só PNG/JPEG, limite e checagens existentes. Não substituir telefone/endereço ou logo já existentes; `row_version` independente, conflitos e validação atuais. «Fazer depois» conserva dados da base, não apaga identidade.
6. **Pronto:** resumo «Custo médio por hora da equipe», «Contas do mês por hora», «Preços cadastrados», pendências e botão «Criar o primeiro orçamento». Mostrar desconhecido quando ausente e não prometer que uma proposta específica tem preço. Antes de publicar mostrar diferenças e versão da base; publicação só após validação. O botão vai à lista com diálogo de criação explicitamente aberto; após erro de publicação não avançar nem fingir que salvou.

Cada passo: carregamento anunciado; vazio com orientação; erro junto ao campo e sumário focável; sem permissão sem dados; retentativa sem perder valores. Notebook 1366×768: coluna de leitura e progresso; celular 375×812: um único fluxo sem scroll horizontal, controles empilhados, navegação/foco não encobertos. Fluent 2 e tokens, corpo 14 px, sem emoji, claro/escuro, teclado e WCAG 2.2 AA; conferir manualmente além de axe.

## 5. Testes e fatias

1. Domínio + persistência parcial: nulo/zero, leitura e escrita por passo, versões, campos permitidos, isolamento entre consultorias e papéis, rejeição de referências cruzadas, concorrência e idempotência. PgTAP negativo e `row_version`, testes de falha e auditoria sem salários.
2. Publicação transacional: simular edição concorrente da base e de outro gestor, estado incompleto, sem apagar campos existentes, cálculo de cada forma, snapshots de orçamento e rollback. Comparar centavos domínio/banco e chamadas legadas.
3. Interface de seis passos e convite: criação, pausa, outra sessão, avanço/retorno, saída dispensada por membro, sem permissão, estados de erro, recuperação de conflito, identidade/logo e navegação para criar orçamento. Unitários + acessibilidade automatizada e teste visual e teclado em duas larguras/temas, sem dados reais.
4. Documentar resultado realmente implementado, suite executada, pendências, executor PGlite e job de banco do CI separadamente; preservar WIP do Claude. Não publicar ou fazer commit sem solicitação específica do usuário.

## 6. Questões de produto e recomendações

1. Convite dispensado por membro ou consultoria? Recomendo **por membro e consultoria**, para não ocultar de outra pessoa da Gestão.
2. Rascunho compartilhado pela consultoria ou pessoal? Recomendo **compartilhado por consultoria**, com versão e conflito explícito; preferência de ocultar é individual.
3. Etapa sem equipe com custo manual? Recomendo oferecer alternativa manual existente, preservando a escolha aprovada de não bloquear o módulo; etapas incompletas permanecem rascunho sem promoção.
4. Reabrir após base completa? Recomendo link explícito e criar cópia com versão, jamais reaplicar sem confirmar.
5. Quando ficam valendo dados? Recomendo somente publicação explícita no resumo; passos anteriores são rascunho durável e nunca afetam o cálculo.
6. Identidade opcional independente ou parte de transação da base? Recomendo RPC e versão próprias, como existe hoje, informando claramente que a identidade salva já vale para propostas.

Estas escolhas não devem ser tratadas como respostas do Eduardo; implementar com mensagens e controles que permitam revisão, sem mudanças silenciosas de base, e registrar o que de fato foi concluído.

## 7. Implementação local iniciada — 13/11/2026

O modelo de convite e etapas, a migration de rascunho e preferência por membro, as RPCs de gravação e promoção e os adaptadores da API foram iniciados localmente. A gravação usa versão otimista e aceita repetição idempotente da última operação com o mesmo conteúdo. A promoção usa uma transação, reaproveita o cálculo existente e rejeita alterações concorrentes na base. A suíte PGlite `290` passou com 20 verificações, incluindo isolamento, dados incompletos, conflitos, repetição e reversão se as horas calculadas diferirem das informadas. Na criação de base, os valores de visita e quilômetro precisam ser informados explicitamente; não se converte ausência em zero.

A interface dos seis passos e as correções desta primeira versão estão na §8.

## 8. Revisão e implementação (13/11/2026)

### 8.1 Achados na revisão do que o Codex começou

Ficaram do desenho do Codex:

- o rascunho único por consultoria;
- a preferência por membro;
- a versão otimista;
- a repetição idempotente pela chave da operação;
- a auditoria sem o conteúdo;
- o gatilho que confere a versão da base dentro de `salvar_base_de_custos`.

A migration só tinha sido aplicada no PGlite, então foi reescrita no mesmo arquivo. Corrigido:

1. **Horas travavam a publicação.** Com equipe, `salvar_base_de_custos` ignora as horas digitadas e usa a soma da equipe; a checagem `horas_divergentes` recusava quase toda publicação. Agora, com equipe, as horas vêm da equipe (regra de sempre) e o passo 2 mostra a origem; sem equipe, valem as digitadas.
2. **Base nova nunca publicava.** Visita e km eram obrigatórios, mas nenhum dos seis passos tinha esses campos.
3. **Custo da hora digitado não existia.** A publicação exigia equipe e mandava hora técnica 0; a entrada manual aprovada no P2 ficava de fora.
4. **Sem validação por passo.** Qualquer JSON era aceito, inclusive membro de outra consultoria e texto no lugar de número. Agora cada passo confere:
   - chaves permitidas e tipos;
   - limites iguais aos de `salvar_base_de_custos`;
   - membro ativo da consultoria, sem repetir.
5. **Rascunho preso depois de conflito.** A versão da base ficava gravada para sempre; se alguém salvasse Custos e taxas, a publicação dava conflito sem saída. Entraram `descartar_rascunho_configuracao_orcamento` e o botão "Recomeçar com os valores atuais".
6. **Cópia sem versão.** A criação do rascunho não dizia de qual versão da base a tela copiou os valores. Agora recebe essa versão (erro `base_alterada` se mudou) e `obter_base_de_custos` devolve `row_version`.
7. **"Continuar depois" impossível.** Salvar sempre avançava a etapa; agora a tela diz onde retomar.
8. **Limite de tamanho curto.** 32 KB por passo não cabiam a equipe ou a tabela de preços nos limites de 100 linhas; valem os limites de linhas e textos de Custos e taxas.
9. **Leitura incompleta.** A leitura não dizia se havia base. Agora devolve `base_configurada`, a versão da base, as pendências e quem salvou por último.

### 8.2 O que existe agora

- **Banco** (`20261113140336_rascunho_primeiros_passos_orcamento.sql`):
  - tabelas `orcamento_configuracao_rascunho` e `orcamento_configuracao_preferencia`, com RLS forçada, FK composta e escrita só por RPC;
  - RPCs `obter_rascunho_…`, `salvar_passo_…`, `descartar_rascunho_…`, `dispensar_convite_…` e `publicar_configuracao_orcamento`;
  - pendências em `private.pendencias_da_configuracao`, iguais às do domínio.
- **Publicação:**
  - trava o rascunho e depois a base, confere a versão e recusa se houver pendência;
  - chama a mesma `salvar_base_de_custos` numa transação;
  - mantém o piso da base e devolve a versão nova.
- **Domínio** (`primeiros-passos-orcamento.ts`): `pendenciasDaConfiguracao`, `horasDaEquipe`, `custosFixosDoRascunho` e `resumoDaConfiguracao`, com os mesmos cenários do pgTAP.
- **Tela** `/orcamentos/primeiros-passos` (`PaginaPrimeirosPassos.tsx`):
  - os passos usam as mesmas peças de Custos e taxas (`PecasDaBase.tsx` e `campos-da-base.ts`, extraídos sem mudar Custos e taxas) e o formulário de Dados da proposta;
  - "Passo N de 6", com a situação de cada passo em texto ("atual", "salvo", "alterado, não salvo");
  - foco no título ao trocar de passo;
  - "Salvar e continuar" e "Salvar e continuar depois";
  - pergunta antes de sair com mudança não salva;
  - erro no topo do passo, com ação para conflito de versão e para base alterada.
- **Lista de orçamentos:**
  - o convite aparece sem base publicada e sem dispensa da pessoa, e mostra quem salvou por último;
  - "Ver orçamentos mesmo assim" fica guardado no banco;
  - atalhos "Primeiros passos" (lista) e "Configurar em passos" (Custos e taxas);
  - ao publicar, abre o diálogo de novo orçamento (`?novo=1`).

### 8.3 Escolhas de implementação (confirmadas pelo Eduardo em 13/11/2026)

Foram o caminho mais próximo das regras que já estavam aprovadas. O Eduardo confirmou as oito em 13/11/2026; mudar alguma delas agora é decisão nova.

1. **Horas com equipe:** a soma das horas da equipe, como em Custos e taxas. O passo 2 explica e manda ajustar no passo 1. Pedir horas faturáveis separadas da jornada mudaria a regra de cálculo.
2. **Visita e km opcionais (passo 3):** em branco, a base fica com 0, que Custos e taxas e o orçamento já mostram como "não cadastrado". A coluna da base não aceita nulo; mudar isso mexe no cálculo do orçamento.
3. **Taxas (passo 4):** em branco ficam pendentes. O botão "Não pagamos nenhuma destas taxas" preenche 0 por ação explícita.
4. **Avançar com pendência:** "Salvar e continuar" aceita passo incompleto (nulo continua nulo); só a publicação exige tudo. O resumo lista o que falta, com link para o passo, e oferece "Criar orçamento sem preço calculado".
5. **Sem atalho ACEAMB nos primeiros passos:** o pedido diz que cada consultoria cadastra os próprios preços. O atalho continua em Custos e taxas.
6. **"Ver orçamentos mesmo assim" dentro do fluxo** também dispensa o convite para a pessoa.
7. **Passo 5 com o formulário inteiro de Dados da proposta** (contato e endereço também): a RPC da identidade grava todos os campos juntos, e um formulário parcial apagaria os outros.
8. **Reabrir com base publicada:** os campos vêm da base; publicar substitui a base ("Usar estes valores e criar orçamento").

### 8.4 Verificação

- **PGlite:**
  - `node ferramentas-locais/pg/rodar.mjs . 290`: 62 verificações aprovadas;
  - suíte completa de banco aprovada.
- **Domínio:** 678 testes.
- **Web:** 218 testes, sendo 12 dos primeiros passos, com axe nos passos 1, 4 e 6.
- **Qualidade:** typecheck, ESLint sem avisos e build aprovados.
- **Demo local** (`?base=vazia` simula a consultoria sem base):
  - a 1366×768, claro: passos 1 a 6, erro de preço em branco, aviso de dados da proposta não salvos e publicação até o diálogo de novo orçamento;
  - a 375×812, escuro: passo 1 e resumo, sem rolagem lateral, com foco no título ao trocar de passo;
  - Custos e taxas mostrou a base publicada.

### 8.5 Pendências conhecidas

- **Job `banco` do CI:** não rodou; o PGlite não substitui o Supabase de verdade.
- **Concorrência real:** duas sessões ao mesmo tempo não foram testadas. A proteção vem da restrição única, de `row_version` e do gatilho da base.
- **Custos e taxas sem `row_version`:** a página continua salvando por último quem salvar; se alguém salvar lá depois de uma publicação, sobrescreve, como já acontecia antes.
- **Auditoria antiga:** `orcamento_base_equipe` já registrava remuneração antes desta mudança. A auditoria nova, do rascunho, não registra.
- **Zeros antigos em Custos e taxas:** preço em branco na tabela e conta detalhada em branco continuam virando 0 lá (comportamento antigo); nos primeiros passos, não viram.
- **Sem conferência visual:**
  - passos 2 a 5 a 375 px;
  - tema escuro a 1366 px;
  - leitor de tela real;
  - zoom de 200%.
- **Tipos das RPCs:** escritos à mão em `database.types.ts`, como no resto do módulo.
