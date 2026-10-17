# 05 · Stack e ADRs

**Stack e ADRs — Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Base: one-pager (página "Contexto"), "Requisitos não-funcionais" e "C4 nível 1 — Contexto".
Um ADR (Architecture Decision Record) registra **uma** decisão: o contexto que a motivou, a decisão em si e as consequências que ela traz. Serve para o futuro entender _por que_ o sistema é assim, sem precisar reconstituir a conversa. ADRs marcados **(proposto)** valem para ondas futuras e ainda podem ser revistos quando a onda chegar.
* * *
## Stack

| Camada | Escolha |
| ---| --- |
| Frontend | React + TypeScript + Vite, SPA responsiva |
| Biblioteca de UI | ⚠️ a definir pelo dev (ex.: Tailwind + shadcn/ui); tokens visuais do protótipo como referência (pacote §9.2) |
| Backend | Supabase: PostgreSQL com Row Level Security, PostgREST (API automática), Auth, Storage, Edge Functions (Deno/TypeScript), `pg_cron` + `pg_net` para jobs |
| Banco | PostgreSQL (versão do Supabase no momento da criação do projeto), região São Paulo |
| Domínio | Módulo TypeScript puro (`packages/domain`) compartilhado entre front e Edge Functions, com os testes portados do protótipo |
| Autenticação | Supabase Auth — e-mail + senha, convite por e-mail |
| Arquivos | Supabase Storage, bucket privado, objetos imutáveis, URL assinada |
| IA | OpenRouter, atrás de um adapter na Edge Function `extrair-licenca` |
| E-mail | SMTP do Supabase Auth (construção) → Resend como SMTP customizado (produção) |
| Hospedagem do front | Vercel |
| Repositório e CI | GitHub `gestao-ambiental`, GitHub Actions |
| Testes | Vitest (domínio e front), testes de RLS no banco (pgTAP via Supabase CLI), Playwright para o fluxo principal ⚠️ quando houver tempo |
| Geoprocessamento (onda 9) | PostGIS (proposto) |

* * *
## ADR-0001 — Reconstruir do zero, com o protótipo como referência
**Contexto.** Existe um protótipo (Nexo) completo em vanilla JS, com estado cifrado no navegador, IndexedDB para anexos, Cloudflare Pages e Functions, 427 testes passando. Ele validou regras e telas com quem entende do domínio. Mas não é multi-tenant, não tem servidor, não sincroniza entre aparelhos, usa nome de pessoa como chave e mistura cliente com empreendimento. O próprio pacote diz que "converter o produto inteiro seria nova implementação, não restauração".
**Decisão.** A versão comercial é **reconstruída do zero** sobre a stack desta página. O protótipo passa a ser: (a) fonte das regras de negócio, (b) referência de telas e tokens visuais, (c) origem da lógica de domínio e dos seus testes, que são **portados** para TypeScript (ADR-0007). Nenhum arquivo de `dist/` é copiado como código de produção.
**Consequências.**
*   Nada do que o protótipo "já faz" conta como pronto; cada módulo é reconstruído na sua onda, com RLS, auditoria e testes.
*   O conhecimento acumulado não se perde: regras, casos de borda e fixtures de teste vêm de graça.
*   Os dados da Envora no protótipo são **recadastrados**, não migrados — o volume cabe e evita migrar um modelo que vai ser substituído.
*   O protótipo é desligado quando a Filtroville estiver na versão nova; até lá, não recebe funcionalidade nova.
* * *
## ADR-0002 — Supabase como backend, em vez de API própria em VPS
**Contexto.** Duas opções realistas: (A) o stack da casa no AgroFuturo — NestJS + PostgreSQL + R2 em VPS Hostinger; (B) Supabase — Postgres gerenciado com RLS, Auth, Storage e Edge Functions. Um desenvolvedor, projeto paralelo, 10 dias para a onda 1, e o requisito central é **isolamento por consultoria aplicado no servidor**.
**Decisão.** **Supabase**, projeto na região São Paulo. API de dados pelo PostgREST com RLS; operações transacionais em funções do banco (RPC); lógica que precisa de segredo ou chamada externa em Edge Functions.
**Consequências.**
*   Auth com convite, bucket privado com URL assinada, backup diário (Pro) e RLS vêm prontos — é o que o prazo pede.
*   O dev já opera Supabase em outro produto; zero curva de aprendizado.
*   **A autorização vive no SQL** (políticas e funções), não numa camada de serviço. Exige disciplina: toda tabela nasce com RLS e teste negativo (DoD).
*   Lógica de negócio fica em três lugares possíveis — front, função do banco, Edge Function. Regra: **cálculo puro no módulo de domínio (ADR-0007); escrita transacional em função do banco; segredo ou rede externa em Edge Function**. Nunca regra de negócio só no front.
*   Dependência bloqueante de um provedor. Mitigação: Postgres e SQL padrão, migrations versionadas, sem extensão exclusiva no domínio — sair do Supabase é migrar hospedagem, não reescrever.
*   Diverge do padrão AgroFuturo/AgroIkemba: os projetos **não compartilham esqueleto**. Aceito porque são produtos de empresas diferentes com perfis de risco diferentes.
* * *
## ADR-0003 — Autorização aplicada no servidor, por RLS e funções; a interface só apresenta
**Contexto.** Várias consultorias no mesmo banco; portal do cliente e central da operadora previstos. Dados internos (notas, horas, custo, margem, financeiro) não podem vazar entre consultorias nem para o cliente final.
**Decisão.** Toda decisão de acesso é avaliada **no banco**: RLS habilitada e **forçada** em toda tabela de dados, política baseada no vínculo ativo (`consultoria_id` do membro autenticado), papel e concessões lidos de tabela, não de claim editável. Operações que mudam várias tabelas são funções `security definer` que revalidam o vínculo antes de escrever. Esconder campo na interface é apresentação, nunca segurança.
**Consequências.**
*   Chamar a API direto com outro `consultoria_id` devolve zero linhas; chamar a função com ID de outra consultoria falha.
*   Chaves estrangeiras compostas `(consultoria_id, id)` em toda relação pai-filho — o banco impede ligar ocorrência de A a documento de B.
*   Papel do Supabase usado pela API nunca tem `BYPASSRLS`; a service role fica restrita a Edge Functions e migrations.
*   Custa disciplina desde a primeira tabela; o DoD tem item para isso.
* * *
## ADR-0004 — Identidade por e-mail, sem CPF
**Contexto.** O protótipo identifica a pessoa por CPF + senha, porque não tinha e-mail nem servidor. Na versão comercial há Supabase Auth com e-mail, e o CPF seria dado pessoal armazenado sem finalidade clara (LGPD). 🔁 Diverge do protótipo.
**Decisão.** Login por **e-mail + senha**; entrada na consultoria por **convite por e-mail**; recuperação de senha por e-mail. Nenhum CPF de usuário no sistema.
**Consequências.**
*   Menos dado pessoal para proteger; recuperação de acesso funciona de verdade (no protótipo não havia).
*   Uma pessoa pode ter vínculo com várias consultorias pelo mesmo e-mail (modelo de vínculo), mas o piloto não testa isso.
*   CNPJ do empreendimento continua existindo, como dado de empresa, opcional.
* * *
## ADR-0005 — Dois papéis no vínculo: Gestão e Equipe; conferente é designação
**Contexto.** O pacote de 30/09 propunha quatro papéis (admin de acesso, gestor técnico, analista, conferente). Consultorias de 1 a 20 pessoas; no piloto, 1 gestão e 5 equipe. 🔁 Diverge do pacote.
**Decisão.** Papel no **vínculo** (membro), nunca no usuário: **Gestão** (administra equipe, instrumentos, atribuições, mudanças oficiais, confirmação final) e **Equipe** (executa etapas, envia evidência, comenta, encaminha). **Conferente** é uma designação por ocorrência. Permissões extras (financeiro, exportação) são **concessões** no vínculo, não papéis novos.
**Consequências.**
*   Matriz de permissões cabe numa tela; testes positivo/negativo por tabela ficam enumeráveis.
*   Se uma consultoria precisar de "analista que não vê a carteira dos outros", isso vira política da consultoria, não papel novo — registrado em "Evoluções futuras".
*   A central da operadora (onda 11) tem identidade e permissões separadas; gestão de consultoria nunca vira acesso de plataforma.
* * *
## ADR-0006 — IA via OpenRouter atrás de um adapter; saída é rascunho; extração síncrona
**Contexto.** A extração do PDF é o diferencial e a métrica principal (≥ 90 % de aceitação sem edição). O protótipo tem prompt, schema de saída e validação prontos para Gemini. A escolha de modelo deve ser por custo-benefício contra um gabarito, e pode mudar. O PDF enviado sai do país.
**Decisão.** A Edge Function `extrair-licenca` chama o **OpenRouter** por meio de um **adapter** com interface própria (`extrair(pdf) → ExtracaoProposta`), de modo que trocar modelo ou provedor é trocar configuração, não código de domínio. Começa-se testando **modelos GPT com o mesmo prompt do protótipo**; a escolha final e o fallback saem da avaliação com gabarito (IA-05). A saída é **validada por schema** e gravada como **rascunho** — nada vira prazo, responsável ou cadastro sem revisão da gestão. A extração é **síncrona** (o gestor espera na tela, com timeout de 120 s).
**Consequências.**
*   Chave do OpenRouter só na Edge Function; o navegador nunca fala com o provedor.
*   Cada extração registra modelo, versão do prompt, tokens, custo, duração e resultado (tabela `EXTRACAO_IA`) — é o que permite medir a métrica e controlar custo.
*   Rotas do OpenRouter configuradas para provedores que não retêm nem treinam com o conteúdo; termo de uso com a consultoria (RNF 9).
*   Fila assíncrona, OCR e avaliação contínua ficam em "Evoluções futuras" com gatilhos.
*   IA indisponível **não bloqueia**: o caminho manual é completo (LIC-01 a LIC-05).
* * *
## ADR-0007 — Lógica de domínio em módulo TypeScript puro, portada do protótipo com os testes
**Contexto.** O protótipo concentra em `domain.js`, `forecast.js`, `workforce.js`, `quotes.js`, `deal.js` e `collect.js` regras complexas e testadas: `addMonths` com fim de mês e bissexto, `occurrences`, `laoRenewalDates`, `nextAction`, `availabilityFor`, `forecastPortfolio`, `allocateCents`. São funções puras. Reescrever do zero reintroduziria bugs já corrigidos.
**Decisão.** Criar `packages/domain` em TypeScript, **sem dependência de React, Supabase ou rede**, portando essas funções e **seus testes** (convertidos de `node:test` para Vitest). O front usa o módulo para simular (ex.: próximas datas) e as funções do banco/Edge Functions usam a mesma lógica quando precisam calcular no servidor (ex.: gerar ocorrências na ativação).
**Consequências.**
*   Mesma regra no cliente e no servidor; a simulação na tela bate com o que o banco grava.
*   Onde a regra precisa rodar em SQL (geração de ocorrências em transação), a implementação SQL é testada **contra** o módulo TypeScript com os mesmos casos.
*   O porte é tarefa explícita de cada onda, não "copiar e colar": nomes mudam para o vocabulário desta documentação; política de datas (`addMonths`) é preservada, não substituída por "somar 30 dias".
* * *
## ADR-0008 — Arquivos no Supabase Storage, objetos imutáveis, metadados e hash no banco
**Contexto.** PDFs de licença, evidências, documentos do dossiê e modelos DOCX. O backup diário do Supabase cobre o banco, não os objetos do Storage. Substituir arquivo precisa preservar o anterior.
**Decisão.** Um bucket privado por ambiente, caminho `consultoria_id/<entidade>/<uuid>`; **nunca sobrescrever** um objeto — substituição cria objeto novo e uma linha nova em `DOCUMENTO_VERSAO` (ou equivalente) com nome original, MIME, tamanho, SHA-256, autor e instante; exclusão é lógica. Upload e download por URL assinada emitida depois de checar o vínculo; política de Storage por consultoria como segunda barreira.
**Consequências.**
*   Histórico de versões é consequência do modelo, não feature extra.
*   Perder uma linha do banco não perde o arquivo e vice-versa; o hash permite reconciliar.
*   ⚠️ A cópia dos objetos para um segundo bucket (ou exportação periódica) precisa ser decidida antes do go-live (RNF 5).
* * *
## ADR-0009 — Datas civis como `DATE`, instantes como `TIMESTAMPTZ`, fuso por consultoria
**Contexto.** O domínio é feito de prazos civis (validade "até 12/01/2027") que não podem mudar pelo fuso do aparelho, e de instantes (upload, decisão) que precisam de ordem absoluta. O protótipo já separa `YYYY-MM-DD` de timestamps.
**Decisão.** Assinatura, validade, prazo oficial, meta interna e primeira entrega são `DATE`. Captura, envio, decisão e auditoria são `TIMESTAMPTZ`. A consultoria tem campo de fuso (`America/Sao_Paulo` no piloto). Guardar também o **texto original** da data do documento junto do valor normalizado.
**Consequências.**
*   Virada de dia e horário de verão histórico não movem prazo.
*   Cálculo de recorrência roda sobre datas civis no módulo de domínio; conversão só na exibição.
*   Custa um teste de conversão por tela que mostra data.
* * *
## ADR-0010 — Auditoria por tabela append-only alimentada por trigger
**Contexto.** RNF 7 exige trilha (quem, o quê, quando, antes/depois) em ativação, condicionantes, conclusões, conferências, protocolo, vínculos e extrações. Implementar na aplicação espalha a regra e esquece caminhos (função do banco, Edge Function).
**Decisão.** Tabela `AUDITORIA` genérica (entidade, id, ação, ator, instante do servidor, antes e depois em JSONB, motivo) preenchida por **triggers** nas tabelas críticas, com o ator vindo do contexto da sessão. RLS: a consultoria lê a própria auditoria; ninguém atualiza ou apaga.
**Consequências.**
*   Todo caminho de escrita é auditado, inclusive os que ninguém lembrou.
*   Acrescentar entidade auditada é acrescentar um trigger, sem mudar schema.
*   Auditoria nunca guarda PDF, senha ou token; o `depois` de um upload é o metadado, não o arquivo.
* * *
## ADR-0011 — Vercel para o front, Supabase São Paulo para o resto; Free na construção, Pro como gate de go-live
**Contexto.** Carga baixíssima (6 usuários), um dev, custo precisa ser próximo de zero até existir cliente pagando. Supabase Free pausa projeto inativo e não tem backup; Vercel Free atende SPA.
**Decisão.** Front na **Vercel** (projeto novo, deploy por PR e por push na `main`); banco, Auth, Storage e Edge Functions no **Supabase, região São Paulo**. Planos **Free durante a construção**. **Upgrade para Supabase Pro é condição para colocar qualquer dado real** — é o que entrega backup diário e remove a pausa por inatividade.
**Consequências.**
*   Custo zero até o go-live; depois, Supabase Pro + Vercel Free (⚠️ revisar quando o tráfego justificar Pro na Vercel).
*   Staging é um segundo projeto Supabase (Free) e um preview na Vercel.
*   Sem servidor para operar: sem Nginx, PM2, dump agendado ou VPS. Backup e restauração ficam por conta do provedor + teste de restauração na Fundação.
*   Dados no Brasil; o front na Vercel é só arquivo estático.
* * *
## ADR-0012 (proposto) — PostGIS para a análise de lote
**Contexto.** O protótipo roda o motor GIS com Turf.js em Cloudflare Functions, com bases cartográficas congeladas (limite de Joinville, hidrografia por trecho, números OSM) e catálogo de restrições com tolerância assumida de 15 m. Na stack nova, o Postgres do Supabase tem PostGIS.
**Decisão (a confirmar na onda 9).** Bases cartográficas como tabelas PostGIS versionadas (fonte, data, licença de uso); geometria do lote validada no servidor; cruzamento por consulta espacial; catálogo de regras versionado. Front com MapLibre.
**Consequências.**
*   Sem segundo runtime só para geometria; análise fica no mesmo banco, com a mesma RLS.
*   Exige política de atualização das bases e licença de uso **antes** de operar — por isso a onda é a 9.
*   "Não verificado" ≠ "sem restrição" continua regra inegociável.
* * *
## ADR-0013 (proposto) — Jobs com `pg_cron` + `pg_net`, sem fila externa
**Contexto.** Notificações por e-mail (NOT-01), acompanhamento de protocolo e, no futuro, extração em fila precisam de algo que rode sem navegador aberto. Volume minúsculo.
**Decisão (a confirmar quando a primeira tarefa agendada entrar).** `pg_cron` agenda; a tarefa grava numa tabela de fila no próprio Postgres; `pg_net` ou Edge Function agendada consome e envia; idempotência por chave na linha da fila. Sem Redis nem serviço de fila.
**Consequências.**
*   Mesmo raciocínio do ADR-0007 do AgroFuturo: um serviço a menos; jobs pendentes entram no backup do banco.
*   Gatilho para reavaliar: volume de fila que o Postgres não sustente — improvável no horizonte.
* * *
## Próximos ADRs prováveis ⚠️
*   Biblioteca de UI e estratégia de componentes (antes da onda 1 começar).
*   Realtime do Supabase para o chat (onda 8) e para atualizar a visão da equipe entre aparelhos.
*   OAuth Google: quem é dono do projeto Google Cloud e das cópias de documento quando um membro sai (onda 7).
*   Estratégia de cópia dos objetos do Storage (antes do go-live).
*   Política de "analista vê só a própria carteira", se alguma consultoria pedir.