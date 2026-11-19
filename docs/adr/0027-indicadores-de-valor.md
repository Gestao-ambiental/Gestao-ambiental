# ADR-0027 — Indicadores de valor, etapas 2 e 3: horas devolvidas e resumo do mês (protótipo)

**Situação:** aceita em 14/11/2026 como **protótipo** (o Kadu revisa e provavelmente refaz). Continua a etapa 1 (métricas de valor da central, migration `20261114170000_metricas_de_valor.sql`). Migrations `20261114190000_tempo_poupado.sql` e `20261114200000_resumo_do_mes.sql`; testes `supabase/tests/450_tempo_poupado.test.sql` e `460_resumo_do_mes.test.sql`; domínio `packages/domain/src/horas-poupadas.ts`; front `apps/web/src/app/consultoria/tempo-ativo.ts`, `apps/web/src/app/indicadores/` e `app/paginas/central/HorasNaCentral.tsx`; Edge Function `supabase/functions/enviar-resumo-do-mes` (regra em `_shared/resumo-do-mes.ts`); agendamento `.github/workflows/resumo-do-mes.yml`.

## 1. Decisões do Eduardo

1. A **Gestão** da consultoria vê **só o total da equipe** (horas devolvidas à consultoria inteira), nunca por área nem por pessoa. Os **operadores** da central veem agregados por consultoria (ou o total da plataforma). **Ninguém vê tempo por pessoa.**
2. O resumo do mês aparece numa **tela** para a Gestão e num **e-mail mensal** para a Gestão.

## 2. Tempo ativo por tarefa

1. **Tempo ativo** = segundos com a aba visível e alguma tecla, clique, rolagem ou toque nos últimos **2 minutos** (`contaComoTempoAtivo`). O relógio só anda enquanto alguma tela da tarefa está montada (`usePrenderTarefa`); a tarefa pode atravessar telas (o cronômetro vive no módulo, por chave). Recarregar a página perde a tarefa em andamento.
2. **Onde se mede:**
   - `cadastro_licenca_ia`: começa no "Continuar" com "Extrair com IA" (`/licencas/nova` ou o passo Documento do rascunho), conta em todos os passos do cadastro daquela licença (`MolduraCadastro`) e termina no "Continuar" do passo Condicionantes (todas as propostas revisadas). Quantidade = condicionantes **da IA aceitas**. Sem nenhuma aceita (ex.: a pessoa foi para o manual), nada é gravado. O "Confirmar todos" do passo Prazos fica fora: ele confirma prazos, não condicionantes.
   - `cadastro_condicionante_manual`: do clique em "Obrigação"/"Agrupador" no passo Condicionantes até "Adicionar" (salvar a nova); quantidade 1. Cancelar ou selecionar outro item descarta.
   - `acompanhamento`: tempo na área de licenças e prazos (visão da equipe, calendário, acompanhamentos, empreendimentos, ocorrência e plano de renovação; `ehRotaDeAcompanhamento`). Grava ao sair da área, ao esconder a aba e a cada **30 minutos** ativos (blocos de no máximo 30 min). Fica em `RequerConsultoria`, só com vínculo de verdade.
   - `orcamento`: de "Novo orçamento" (diálogo aberto) até "Imprimir ou salvar PDF" ou "Marcar como enviada" na proposta pronta; conta no diálogo, no editor e na proposta daquele orçamento. Quantidade 1.
3. **Nunca registra** em modo suporte (nada começa a contar) nem na central (não usa os hooks). Falha de rede ou do banco nunca aparece para a pessoa.
4. **Banco:** `public.tarefa_cronometrada` (consultoria, membro com FK composta, tipo com check, quantidade, segundos ativos, instante). Só de inserção (trigger da auditoria barra update, delete e truncate); RLS forçada com a única política de select `using (false)`, como `uso_diario`. Escrita só por `registrar_tarefa(p_consultoria_id, p_tipo, p_quantidade, p_segundos)`, security definer, que exige **membro ativo de verdade** (o suporte não tem membro: `sem_permissao`). As triggers do suporte e da barreira comercial valem para a tabela (o só leitura comercial não grava). Teto: 30 min no acompanhamento, 8 h nas outras.

## 3. Linha de base

1. As 4 perguntas à Gestão: "Quantas licenças ativas vocês acompanham hoje?", "Quantas horas por semana a equipe gasta conferindo prazos e cobrando pessoas?", "Quantos minutos leva para cadastrar uma condicionante à mão?", "Quantas vezes por mês um prazo pegou a equipe de surpresa?".
2. Diálogo "Antes do Grama" no shell, só para a Gestão (fora do modo suporte), quando a consultoria **não tem resposta** ou a última tem **mais de 90 dias**. "Responder depois" (ou fechar) adia **7 dias** para aquela pessoa, naquele navegador (localStorage).
3. **Banco:** `public.linha_de_base`, só de inserção, sem leitura direta; `responder_linha_de_base` só Gestão de verdade; `ultima_linha_de_base` devolve só a data da última resposta (Gestão). A linha de base vigente num cálculo é a última resposta até aquele instante.

## 4. Cálculo (domínio `calcularHorasPoupadas`; banco `private.horas_poupadas_em`)

- **Minutos por condicionante à mão** = **medido** (média das tarefas manuais acumuladas até o fim do mês) com **5 ou mais** condicionantes manuais; senão o **declarado** na linha de base.
- **Cadastro (mês)** = max(0, min à mão − min com IA) × condicionantes com IA no mês ÷ 60.
- **Acompanhamento (mês)** = max(0, horas declaradas por semana × semanas do mês − horas ativas medidas no mês). Semanas = dias do mês ÷ 7; no mês atual, só os dias até hoje.
- **Total** = cadastro + acompanhamento. **Em R$** = total × hora técnica da base de custos publicada (`orcamento_base_custos.hora_tecnica_centavos`); sem base (ou zero), só horas.
- **Estimado**: sempre que há linha de base (o acompanhamento sempre parte do declarado). Sem linha de base, só o cadastro medido conta e não é estimado.
- **"Juntando dados"**: nada aparece antes de **30 dias** desde a primeira tarefa registrada **ou** de **10 condicionantes** cadastradas (IA + à mão), o que vier primeiro. Na central, quem ainda junta dados fica fora da soma e é contado à parte.
- Mês sem nenhum acompanhamento medido não devolve horas de acompanhamento (zero): sem uso, não há economia a mostrar. Corrigido antes de publicar.

## 5. Quem vê o quê

| Quem                    | O quê                                                                                                                                                                     | Onde                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Gestão                  | Só o total da consultoria: horas devolvidas (R$ quando há custo da hora, "Estimado"), % de entregas no prazo, renovações protegidas pelos 120 dias, contra o mês anterior | Tela "Resumo do mês" (`/resumo-do-mes`, menu só da Gestão; `resumo_do_mes`) e e-mail mensal |
| Equipe                  | Nada (sem permissão)                                                                                                                                                      | —                                                                                           |
| Operador (dois fatores) | Por consultoria ou total: horas devolvidas (total, cadastro, acompanhamento, R$, variação contra o mês anterior)                                                          | Central → Valor e seção Valor do detalhe (`central_horas_poupadas`)                         |
| Ninguém                 | Tempo por pessoa                                                                                                                                                          | —                                                                                           |

`resumo_do_mes` exige `is_gestao` (o suporte lê como a Gestão, como no resto do app). Reaproveita `private.metricas_de_valor_em` (etapa 1) e `private.horas_poupadas_em`.

## 6. E-mail mensal

1. **Edge Function `enviar-resumo-do-mes`** (verify_jwt = false em `supabase/config.toml`). Caminho agendado: header `x-cron-token` comparado com o segredo `CRON_TOKEN` em tempo constante; com a service role, `resumos_do_mes_pendentes` (só service role) lista o mês anterior (no fuso de cada consultoria) das consultorias **não arquivadas** que ainda não receberam; envia pelo Resend para os e-mails da Gestão ativa e grava em `public.resumo_do_mes_envio` (`registrar_envio_do_resumo`, só service role; chave consultoria + mês). **Idempotente:** rodar de novo só manda para quem ficou de fora. Falha de envio devolve 502 (o workflow fica vermelho e pode ser rodado de novo).
2. **Teste pela central:** botão "Enviar resumo de teste para mim" (Valor com uma consultoria escolhida e seção Valor do detalhe). A função chama `central_resumo_do_mes` com o JWT de quem clicou (operador com dois fatores) e manda só para o e-mail dessa conta; nada é gravado.
3. **Agendamento:** `.github/workflows/resumo-do-mes.yml`, `cron: "0 11 1 * *"` (dia 1, 08:00 de Brasília) e `workflow_dispatch`.
4. Log: só ids, etapa e código. Nunca e-mails, chave, token nem números das consultorias.

### Passo a passo para ligar o e-mail

1. Gerar um token longo e aleatório (ex.: `openssl rand -hex 32`). Não colocar no repositório.
2. Supabase (staging e depois produção), em Edge Functions → Secrets (ou `supabase secrets set --project-ref <ref> ...`): `CRON_TOKEN=<token>`; `RESEND_API_KEY` e `AVISO_REMETENTE` já existem para o aviso do suporte (conferir).
3. Aplicar as migrations (`supabase db push`, pelo fluxo normal) e publicar a função: `supabase functions deploy enviar-resumo-do-mes --project-ref <ref> --use-api` (o `verify_jwt = false` vem do `config.toml`; se publicar sem ele, use `--no-verify-jwt`).
4. GitHub → Settings → Secrets and variables → Actions: `SUPABASE_FUNCTIONS_URL` = `https://<ref>.supabase.co/functions/v1` e `CRON_TOKEN` = o mesmo token do passo 1.
5. Testar: na central, "Enviar resumo de teste para mim"; depois Actions → Resumo do mês → Run workflow (manda de verdade para a Gestão de cada consultoria pendente do mês anterior).
6. Os workflows `migrations.yml` (staging) e `deploy-producao.yml` publicam todas as Edge Functions, inclusive a `enviar-resumo-do-mes` (19/11/2026: antes só a `extrair-licenca` saía, e correções no `_shared` nunca chegavam às outras). Publicar a função não manda nada: o envio só acontece com o `CRON_TOKEN` cadastrado e o workflow do resumo chamando.

## 7. Termos

Termos de Uso §14.3 e Acordo de Dados §9.4 ganharam a frase sobre o tempo ativo por tarefa e as respostas da linha de base (quem vê o quê).

## 8. Fica para depois

- Marcar como enviada pela situação do orçamento no editor (hoje só pela proposta pronta) também terminar a tarefa `orcamento`.
- Guardar a tarefa em andamento entre recargas da página.
- Linha de base vigente por mês (hoje: a última até o instante do cálculo, para todos os meses).
- Retenção de `tarefa_cronometrada`.
- Acompanhamento sem uso no mês (ver §4).
