# 03 · Requisitos não-funcionais

**Requisitos não-funcionais — Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Legenda: ⚠️ a definir · ✅ decidido
Base: one-pager (página "Contexto"), RNF01–RNF18 do pacote de 30/09 e capítulo 10 do pacote de 05/10. Em caso de divergência com um card do ClickUp, o card prevalece.
Metas numéricas são compromissos de projeto para o piloto, não SLA contratual. Viram SLA só quando medidas em produção.
* * *
## 1\. Carga e escala ✅
*   Piloto com **1 consultoria (Filtroville), 6 usuários**: 1 gestão e 5 equipe.
*   Ordem de grandeza por consultoria: dezenas de empreendimentos, dezenas a poucas centenas de instrumentos, milhares de ocorrências geradas (uma licença de 5 anos com 20 condicionantes mensais gera 1.200 ocorrências).
*   Consequência: escala não é gargalo. Um projeto Supabase, instância única, sem cache dedicado. Listas paginadas desde o início porque as ocorrências crescem rápido mesmo com poucos usuários.
## 2\. Plataforma ✅
*   **Somente web.** Sem app nativo. Desktop é o uso principal (gestão); celular precisa funcionar bem para a equipe consultar a carteira e anexar evidência em campo.
*   Viewports de referência: 1366×768, 1920×1080 e 375×812. Tabelas rolam dentro da própria região, nunca a página inteira.
*   Sem modo offline no MVP. A onda 10 é troca manual de pacote, não sincronização.
*   Navegadores: versões atuais de Chrome, Edge e Firefox; Safari em iOS para a equipe em campo.
## 3\. Desempenho ✅
*   Leitura e escrita comuns (listas, detalhe, salvar formulário): **< 500 ms no percentil 95** medidos no cliente, a partir de Joinville, com o banco em São Paulo.
*   Tela útil (interativa): **< 2 s**.
*   Extração por IA: **até 120 s** com indicador de progresso e timeout explícito; é a única operação em que o usuário espera mais de alguns segundos.
*   Ativação do plano de obrigações (geração das ocorrências): **< 5 s** para uma licença de 5 anos; roda em uma transação no banco.
*   Acima de 3 s em operação comum é defeito.
## 4\. Disponibilidade ✅
*   Indisponibilidade tolerada: **até 4 horas em dia útil**. Os prazos do domínio são diários; ninguém protocola às 2 da manhã.
*   Sem alta disponibilidade, failover ou multi-região.
*   Monitor de uptime externo com alerta (item da Fundação) atende ao requisito.
*   Supabase Free pausa projetos inativos: **inaceitável com dados reais** → Pro é gate de go-live.
## 5\. Backup e recuperação ✅
*   **Banco:** backup diário gerenciado (Supabase Pro, 7 dias de retenção). Perda máxima aceitável: **24 horas**. Restauração em projeto isolado testada **ao menos uma vez antes do go-live** (item da Fundação).
*   **Arquivos (Storage):** o backup diário do Supabase cobre o banco, não os objetos do Storage. Consequências: (a) objetos são **imutáveis** — nunca sobrescrever, toda substituição é um objeto novo (ADR-0008); (b) exclusão é lógica; (c) ⚠️ definir exportação periódica dos objetos para um segundo bucket antes do go-live ou aceitar a durabilidade do provedor como suficiente para o piloto.
*   Backup de código: GitHub é a origem; nada vive só na máquina do dev.
## 6\. Segurança e permissões ✅
Princípio: **toda autorização é aplicada no servidor** — Row Level Security no Postgres e funções do banco — nunca apenas ocultando elementos na interface (ADR-0003). O futuro portal do cliente e a central administrativa encontram uma barreira que já existe.
*   **Isolamento por consultoria:** toda tabela de dados tem `consultoria_id`, RLS habilitada e forçada, e política que compara com o vínculo ativo da sessão. Chaves estrangeiras compostas `(consultoria_id, id)` impedem ligar a ocorrência de A ao documento de B mesmo com UUID conhecido. Nenhuma tabela entra em produção sem teste negativo (usuário de outra consultoria recebe zero linhas, não erro revelador).
*   **Papéis:** Gestão e Equipe no vínculo, nunca no usuário. Permissões específicas (financeiro, exportação) são concessões no vínculo. Nome, flag ou header enviados pelo cliente nunca são autoridade.
*   **Arquivos:** bucket privado; política de Storage por consultoria; upload e download por URL assinada de curta duração emitida pelo servidor após checar o vínculo; validação de MIME, assinatura e tamanho (PDF e imagens até 25 MiB; PDF para IA até 10 MiB); HTML e SVG nunca servidos como documento ativo; PDF renderizado em canvas, sem scripts.
*   **Segredos:** chave do OpenRouter, service role do Supabase e credenciais de e-mail vivem só nas Edge Functions e no CI; nunca no front, no repositório ou em log.
*   **Sessão:** JWT do Supabase Auth; revogação ao desligar membro; recuperação de senha não revela existência de conta; rate limit do Auth ativo.
*   **Conteúdo:** todo texto livre escapado na renderização; CSV com fórmulas neutralizadas; CSP restritiva no front; dependências auditadas no CI.
*   **Dados restritos** (nunca visíveis fora de Gestão/Equipe da própria consultoria, e alguns só com concessão): custo e margem de orçamento, notas internas, horas e metas da equipe, dados financeiros.
*   Dentro da consultoria: **Equipe** vê a carteira inteira (política da consultoria pode restringir no futuro); **Gestão** ativa, aprova, conclui e administra.
## 7\. Auditoria ✅
Trilha de auditoria (quem, o quê, quando, valor antes/depois, instante do servidor) obrigatória em:
*   Ativação, alteração de regra e substituição de instrumento
*   Condicionante: versão revisada e descarte de item proposto pela IA
*   Ocorrência: conclusão (com ou sem evidência), reatribuição, mudança de prazo oficial
*   Conferência: aprovação e devolução
*   Renovação: protocolo registrado
*   Vínculos: convite, papel, desligamento
*   Extração: cada chamada, com modelo, custo e resultado (sem o PDF)
Implementação por **tabela append-only alimentada por trigger** (ADR-0010). Usuário comum não altera nem apaga. Demais operações: log de aplicação comum.
## 8\. Internacionalização e localização ✅
*   País: **Brasil**. Idioma: **português (pt-BR)**. Documento: **CNPJ** do empreendimento (opcional) — **sem CPF** de usuário.
*   Fuso: `America/Sao_Paulo` por consultoria (campo da consultoria, para não refazer quando entrar cliente de outro fuso).
*   **Datas civis** (assinatura, validade, prazo, primeira entrega) persistidas como `DATE`; instantes (upload, decisão, auditoria) como `TIMESTAMPTZ`. Prazo nunca muda pelo fuso do aparelho. Exibição `dd/mm/aaaa`.
*   Dinheiro (onda 5): **BRL**, inteiros em centavos, com código de moeda junto do valor — custo zero agora e evita migração se entrar outra moeda.
## 9\. Privacidade e regulação ✅
*   **LGPD.** Inventário de dados pessoais: nome e e-mail dos usuários; nomes de responsáveis técnicos e contatos nos cadastros e nos PDFs. Finalidade: operação do serviço contratado pela consultoria. Papéis: **consultoria = controladora**, **Envora Ambiental = operadora**, Supabase/Vercel/OpenRouter = suboperadores.
*   **Residência:** banco e arquivos em São Paulo (Supabase região `sa-east-1`).
*   **IA:** o PDF da licença é enviado ao provedor via OpenRouter, fora do Brasil. Exigências: (a) termo de uso aceito pela gestão da consultoria autorizando o envio das licenças à IA; (b) rotas do OpenRouter configuradas para provedores que **não retêm nem treinam** com o conteúdo; (c) só o PDF da licença vai à IA — nunca evidências, documentos do dossiê ou mensagens. ⚠️ A cláusula contratual é pendência jurídica da Envora, não bloqueio técnico.
*   **Retenção e término:** ao encerrar o contrato, a consultoria exporta os dados (RF EXP-01) e os dados são excluídos após prazo ⚠️ a definir. Desligar membro mantém autoria histórica, impede novas ações.
*   **Normas ambientais:** regras de prazo (120 dias) são configuração versionada por tipo de instrumento e jurisdição, não constante no código, para que uma mudança de norma não exija deploy nem reescreva o passado.
## 10\. Custo controlado e dependências externas ✅
*   **IA:** cota de extrações por consultoria por mês ⚠️ valor (proposta: 30 no piloto); limite de 10 MiB e 300 condicionantes por extração; uma chamada ao provedor por extração; registro de custo por chamada; alerta quando o consumo mensal passar de ⚠️ R$ a definir; corte seguro ao estourar, com o caminho manual intacto.
*   **OpenRouter** e **serviço de e-mail** são **dependências não bloqueantes**: se caírem, o cadastro, a revisão e o calendário continuam; a extração mostra erro legível.
*   **Supabase** e **Vercel** são bloqueantes. Mitigação: monitor de uptime, backup testado, e a escolha de Postgres + SQL padrão para que a saída do Supabase, se um dia for preciso, seja uma migração de hospedagem, não uma reescrita (ADR-0002).
*   Planos: Free durante a construção; **Pro do Supabase obrigatório antes de dado real**; Vercel Free enquanto couber.
## 11\. Consistência e concorrência ✅
*   Operações que escrevem em várias tabelas (ativar plano, aprovar alteração, registrar aceite) rodam em **uma função do banco, em uma transação**: ou tudo ou nada.
*   **Idempotência:** ativação e geração de ocorrências usam chave de idempotência; retry devolve o mesmo resultado.
*   **Controle otimista:** entidades mutáveis têm `row_version`; aprovação ou edição sobre versão desatualizada retorna conflito (409) sem descartar a edição local.
*   Upload não conclui; aprovação de versão não conclui processo; comentário não é protocolo; reserva concluída não é entrega aceita; pagamento não valida obrigação ambiental — separações do domínio que o schema e as funções preservam.
## 12\. Acessibilidade e leitura ✅
*   Alvo **WCAG 2.2 AA**: teclado em tudo, foco visível, nomes acessíveis em botões de ícone, contraste, zoom 200 % sem perda, informação nunca só pela cor. Avaliação automática no CI + revisão manual nas telas da onda; **não se declara conformidade só por lint**.
*   Texto de conteúdo 15–16 px; auxiliares ≥ 14 px; números com dígitos tabulares.
*   Tema claro e escuro com paletas próprias (tokens do protótipo como ponto de partida, §9.2); sem emoji na interface; cor semântica pequena com texto de estado.
*   Estados mínimos em toda tela: vazio, carregando, erro, não autorizado, arquivo ausente, sem responsável, prazo hoje, atraso, espera do órgão, processo fechado, sessão trocada, operação pendente.
## 13\. Observabilidade ✅
*   Logs de Edge Functions e do banco sem PDF, senha, chave ou token; `correlation_id` por requisição.
*   Métricas mínimas: erros por função, latência p95, extrações por consultoria, custo de IA acumulado no mês, fila de e-mail (quando existir).
*   Alarmes: uptime, erro 5xx acima de ⚠️ limiar, custo de IA acima do orçamento.
*   Falhas não dependem de usuário mandar print.
## 14\. Manutenibilidade e testes ✅
*   **Domínio separado da interface e do provedor:** datas, recorrência, renovação, próxima ação, disponibilidade e previsão em módulo TypeScript puro, com os testes do protótipo portados (ADR-0007). Não copiar o monólito de tela do protótipo.
*   **Migrations versionadas** no repositório (Supabase CLI); schema nunca editado à mão no painel.
*   **CI** em todo PR: lint, checagem de tipos, testes de domínio, testes de RLS (positivo e negativo por tabela), build; preview por PR.
*   Ambientes: local (`supabase start`), staging e produção, com projetos Supabase separados; segredos por ambiente.
*   Versionamento de regra e de prompt: toda extração registra a versão do prompt e o modelo; toda regra de renovação é versionada.
## 15\. Portabilidade ✅
*   A consultoria pode exportar seus dados e arquivos com IDs, vínculos e manifesto (RF EXP-01). Nenhuma escolha de provedor impede a retirada dos dados.
*   Postgres padrão, sem extensão exclusiva do Supabase no domínio (exceções documentadas: Auth, Storage e, na onda 9, PostGIS, que é padrão Postgres).
* * *
## Pendências ⚠️
*   Valor da cota mensal de extrações e do orçamento de IA por consultoria (item 10).
*   Estratégia de cópia dos objetos do Storage (item 5): segundo bucket periódico ou aceitar durabilidade do provedor no piloto.
*   Prazo de retenção após término de contrato (item 9).
*   Limiares de alarme (item 13).
*   Termo de uso com cláusula de envio de documentos à IA — pendência jurídica da Envora.