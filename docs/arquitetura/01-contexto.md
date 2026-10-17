# 01 · Contexto (one-pager)

**Documentação do projeto — Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Conjunto de páginas no mesmo padrão da documentação do CRM AgroFuturo no ClickUp. Cada arquivo vira uma página do Doc do projeto, na ordem abaixo.
**Regra ✅:** em caso de divergência entre estas páginas e um card do ClickUp, **o card prevalece**.
Legenda usada em todas as páginas: ⚠️ a definir · 🔁 diverge do protótipo ou do pacote · ✅ decidido
* * *
## Ordem de leitura

| # | Página | O que responde |
| ---| ---| --- |
| 01 | Contexto (one-pager) | Problema, usuários, métrica, escopo em ondas, fora de escopo, riscos e decisões |
| 02 | Requisitos funcionais | O que o sistema faz, por módulo e por onda, com aceite mínimo — base para épicos e histórias |
| 03 | Requisitos não-funcionais | Carga, desempenho, disponibilidade, backup, segurança, auditoria, privacidade, custo de IA |
| 04 | C4 nível 1 — Contexto | Quem usa o sistema e com quais sistemas externos ele conversa |
| 05 | Stack e ADRs | Tecnologias escolhidas e as decisões de arquitetura com contexto e consequências |
| 06 | C4 nível 2 — Containers | As peças que rodam separadas: SPA, Supabase (Postgres, Auth, Storage, Edge Functions), IA, e-mail |
| 07 | ERD v1 | Modelo de dados das ondas 1 a 3, com decisões de modelagem e tabelas das ondas seguintes |
| 08 | Processo | Convenções de código, Definition of Ready, Definition of Done, ciclos e ordem de ataque |
| 09 | Regras de negócio | Regras transversais já decididas (citando o pacote do protótipo) e as pendentes |
| 10 | Evoluções futuras | O que foi conscientemente adiado, com motivo e gatilho para retomar |

* * *
## Fontes
*   **Pacote "reconstrução integral Nexo" (05/10/2026)** — documentação do protótipo escrita pelo Eduardo, com código, testes e decisões de produto. É a fonte das regras de negócio e das telas. Caminho: `nexo-documentacao-completa-2026-10-05/reconstrucao-integral-nexo-2026-10-05/`. Quando uma página cita "pacote §4.6", refere-se ao capítulo e seção desse pacote.
*   **Pacote "entrega dev" (30/09/2026)** — requisitos RF01–RF44, RNF01–RNF18 e ERD lógico propostos antes da remediação de segurança. Caminho: `historico-documental/docs/entrega-dev-2026-09-30/`. Os IDs de requisito daqui aparecem como "origem" nas tabelas da página 02.
*   **Documentação do CRM AgroFuturo no ClickUp** — modelo de estrutura e de processo.
*   **Sessão de decisão de 05/10/2026** (Kadu) — escopo em ondas, stack, identidade, papéis, piloto, métrica.
* * *
## Nomes
*   **Gestão Ambiental** — nome do projeto no ClickUp e no GitHub. O nome de produto será escolhido durante o processo.
*   **Nexo** — nome visível no protótipo. **Vigea** — identificador histórico no código do protótipo e nome da pasta antiga no ClickUp. Ambos aparecem entre parênteses só para ligar ao histórico.