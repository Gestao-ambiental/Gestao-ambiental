# 06 · C4 nível 2 — Containers

**C4 nível 2 — Diagrama de Containers · Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Base: "C4 nível 1 — Contexto", "Stack e ADRs" e "Requisitos não-funcionais".
O diagrama de containers abre a caixa do sistema e mostra as peças que **rodam separadas** — cada uma é um processo, serviço ou armazenamento próprio. Detalhe interno de cada peça não entra aqui.
* * *
## Diagrama
**📊 \[Diagrama — cole aqui a imagem copiada no botão “Copiar imagem”\]**
* * *
## Containers
**Front — React + TypeScript + Vite (Vercel).** Aplicação de página única servida como arquivos estáticos. Fala direto com o Supabase pelo `supabase-js`, com o JWT do usuário. Funciona bem no **celular** para a equipe em campo. Não contém regra de autorização: o que ele esconde é apresentação (ADR-0003). Usa o módulo de domínio para **simular** (próximas datas da recorrência, datas de renovação, disponibilidade) antes de gravar — o que o usuário vê na prévia é o que o banco vai gerar.
**Auth (Supabase).** Cadastro, login, recuperação de senha e convite por e-mail. Emite o JWT que todos os outros containers usam. A tabela de membros (vínculo + papel) é do banco, não do Auth: o JWT identifica a pessoa; o vínculo ativo é resolvido no banco a cada requisição.
**PostgREST (Supabase).** API REST gerada a partir das tabelas. Toda leitura e escrita comum passa por aqui **com RLS**. Operações que mudam várias tabelas de uma vez (ativar plano de obrigações, aprovar alteração crítica, concluir ocorrência, registrar aceite) são **funções do banco chamadas por RPC**, que revalidam o vínculo e rodam em uma transação.
**PostgreSQL (Supabase, São Paulo).** Coração do sistema: dados, regras de integridade (chaves compostas por consultoria, restrições), RLS forçada, funções transacionais, triggers de auditoria e `pg_cron` para tarefas agendadas (ADR-0013). Datas civis em `DATE`, instantes em `TIMESTAMPTZ` (ADR-0009). Guarda também o registro de cada extração de IA, com custo.
**Storage (Supabase).** Bucket privado com PDFs de licença, evidências, documentos do dossiê e modelos. Objetos **imutáveis**; metadados e hash no banco (ADR-0008). Acesso por URL assinada de curta duração emitida após checar o vínculo; política de Storage por consultoria como segunda barreira. A IA lê o PDF daqui, nunca recebe do navegador.
**Edge Functions (Supabase, Deno/TypeScript).** Onde vive o que precisa de **segredo** ou de **rede externa**: `extrair-licenca` (valida JWT, vínculo, cota e tamanho; lê o PDF do Storage; chama o OpenRouter pelo adapter; valida a resposta por schema; grava rascunho e registro de custo), emissão de URL assinada quando a política de Storage não basta, e, no futuro, envio de e-mail operacional. Usam o mesmo módulo de domínio do front.
* * *
## Decisões desta camada ✅
*   **Sem servidor próprio.** Não há API NestJS, Nginx, VPS ou worker separado. O "backend" é o Postgres com RLS + funções + Edge Functions. Diverge do AgroFuturo por decisão (ADR-0002).
*   **Três lugares para lógica, com regra clara:** cálculo puro → `packages/domain`; escrita transacional → função do banco; segredo ou rede → Edge Function. Nunca regra de negócio só no front.
*   **Escrita multi-tabela sempre por RPC**, nunca por várias chamadas do front — é o que garante "ou tudo ou nada" e idempotência (RNF 11).
*   **A IA é chamada pela Edge Function, de forma síncrona**, com timeout de 120 s. O front mostra progresso e espera. Fila entra só com gatilho (ADR-0006).
*   **Auditoria por trigger** no próprio banco (ADR-0010): nenhum container precisa lembrar de auditar.
*   **Dois projetos Supabase** (staging e produção) e previews na Vercel por PR. Segredos por ambiente.
*   **Service role** só em Edge Functions e migrations; o front usa sempre a chave anônima + JWT do usuário.
* * *
## Fluxo de referência — cadastrar uma licença com IA
1. Gestão abre o empreendimento e escolhe "Nova licença"; o front cria o **instrumento em rascunho** (PostgREST, RLS).
2. Front pede URL assinada de upload e envia o PDF ao **Storage**; grava metadados e hash em `DOCUMENTO_VERSAO`.
3. Front chama a Edge Function **`extrair-licenca`** com o id do instrumento.
4. A função valida JWT e vínculo, checa a **cota** da consultoria, lê o PDF do Storage, chama o **OpenRouter**, valida o JSON por schema, grava a proposta em `EXTRACAO_IA` (com modelo, prompt, tokens, custo, duração) e cria as **condicionantes propostas** ligadas ao instrumento, marcadas como "proposta pela IA".
5. Front mostra a **tela de revisão**; gestão aceita, edita ou descarta item a item; cada decisão fica registrada (base da métrica).
6. Gestão define recorrência e responsáveis; o front **simula** as próximas datas com o módulo de domínio.
7. Gestão clica "Ativar": o front chama a **RPC** **`ativar_instrumento`**, que revalida tudo, gera as ocorrências até o fim da vigência **em uma transação**, com chave de idempotência, e dispara os triggers de auditoria.
8. A visão da equipe lê as ocorrências por PostgREST, já filtradas por RLS.
Se o passo 4 falhar (provedor fora, PDF escaneado, cota estourada), o instrumento continua em rascunho e a gestão segue pelo caminho manual a partir do passo 5.
* * *
## Pendências ⚠️
*   Confirmar o limite de tempo de execução das Edge Functions no plano usado e se 120 s cabem; caso contrário, extrair o texto do PDF antes e reduzir o payload.
*   Decidir se a URL assinada de download é emitida pela política de Storage (mais simples) ou sempre por Edge Function (mais controlável) — provavelmente política no MVP.
*   Atualização da visão da equipe entre aparelhos: polling simples no MVP; Realtime quando o chat entrar (onda 8).