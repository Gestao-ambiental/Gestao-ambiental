# ADR-0057: Quiz "Antes do Grama" no site

- Situação: proposta (camada `camada/quiz-antes-do-grama`)
- Data: 21/11/2026
- Revê: ADR-0027 (linha de base e tempo poupado), no ponto em que o diálogo abria sozinho no app

## Contexto

O diálogo "Antes do Grama" fazia 4 perguntas à Gestão no primeiro acesso (licenças ativas, horas por semana conferindo prazos, minutos para cadastrar uma condicionante à mão, surpresas por mês) e alimentava as métricas de valor e o tempo poupado. O Eduardo pediu que as perguntas virem um quiz no site, respondido antes do convite.

## Decisão

- **Site**: a RPC pública `responder_quiz_antes_do_grama(p_id, p_licencas_ativas, p_horas_semana_conferindo, p_minutos_por_condicionante, p_surpresas_por_mes, p_contato)` grava sem login (anon) em `private.quiz_antes_do_grama`. O `p_id` é gerado pelo site; repetir corrige as respostas e acrescenta o contato. O contato é opcional (o quiz vem antes ou junto da inscrição na lista de espera, que continua igual).
- **Limites**, como na inscrição: as faixas da `linha_de_base` (0 a 100 000 licenças, 0 a 168 h, 0 a 1 440 min, 0 a 1 000 surpresas), contato validado e normalizado como na lista, 20 envios por hora por origem (IP só em hash, apagado depois de 1 hora) e teto global de 600 por hora. Sem texto livre, então sem CPF. Ninguém lê a tabela direto (RLS forçada, sem grants).
- **Convite**: quando a primeira Gestão de uma consultoria nova entra (`criar_consultoria`), um gatilho no `membro` procura o quiz não usado do mesmo e-mail e grava a primeira `linha_de_base` com as respostas e a data do quiz. O quiz fica marcado como usado e não muda mais.
- **App**: o diálogo não abre mais sozinho. A Gestão corrige ou preenche em Configurações › "…" › Antes do Grama.

## Consequências

- Migration `20261121210500_quiz_antes_do_grama.sql` e pgTAP 780.
- Quem se inscreveu pelo WhatsApp não tem o quiz ligado automaticamente (o convite é por e-mail); preenche em Configurações.
