# 02 · Requisitos funcionais

**Requisitos funcionais — Gestão Ambiental (Nexo/Vigea)** · v0.2 · 12/10/2026
Legenda: ⚠️ a definir · 🔁 diverge do protótipo ou do pacote · ✅ decidido
Base: one-pager (página "Contexto"), pacote do protótipo (05/10) e requisitos RF01–RF44 do pacote de 30/09. Em caso de divergência com um card do ClickUp, **o card prevalece**.
No AgroFuturo os requisitos funcionais são os épicos do ClickUp. Aqui os cards ainda não existem, então esta página é a **origem dos épicos**: cada módulo abaixo tende a virar um épico e cada linha uma ou mais histórias. Quando os cards forem criados, esta página passa a ser só índice.
Convenções:
*   **ID** por módulo (`LIC-03`), estável — é o que o card cita.
*   **Aceite mínimo** é o comportamento observável que fecha a história, incluindo o caso negativo.
*   **Origem** aponta o requisito equivalente no pacote de 30/09 (`RF14`) ou a seção do pacote de 05/10 (`§4.6`), para rastreabilidade.
*   Todo requisito que grava dado assume o isolamento por consultoria e a autorização no servidor (RNF 6 e ADR-0003); isso não é repetido linha a linha.
* * *

## Onda 1 — versão de teste (15/10/2026)
### ACC — Acesso, consultoria e equipe

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| ACC-01 | Cadastro, login, logout e recuperação de senha por e-mail | Senha errada recusada; recuperação expira, não revela se a conta existe e invalida sessões antigas; sem CPF em nenhum formulário | RF01 |
| ACC-02 | Criar consultoria e convidar equipe por e-mail com papel | Convite de uso único com validade; funciona em outro aparelho; desligar membro revoga acesso na hora e preserva a autoria histórica dele; ocorrências, etapas, reservas e prazos ainda atribuídos à pessoa desligada aparecem para a gestão como pendentes de redistribuição — o histórico não é apagado e as reservas não são canceladas silenciosamente | RF02 |
| ACC-03 | Papéis Gestão e Equipe aplicados no servidor | Manipular UI, ID ou payload não permite ação negada; cada tabela tem teste positivo e negativo da matriz de papéis | RF03, ADR-0005 |
| ACC-04 | Selecionar consultoria quando a pessoa tem mais de um vínculo | Troca de consultoria limpa a tela e nunca mostra dado da anterior; com um vínculo só, a seleção é automática | §3.5 |

### EMP — Empreendimento e unidade

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| EMP-01 | Cadastrar empreendimento (nome obrigatório) e unidade (endereço) | Cliente contratante e CNPJ são opcionais; duplicidade de nome ou CNPJ é sinalizada, não proibida; filiais são unidades do mesmo empreendimento; retry não duplica | RF05, §2.4 |
| EMP-02 | Tela do empreendimento | Lista instrumentos com validade e situação, unidades e — nas ondas seguintes — alvarás, processos e histórico de arquivos; voltar à carteira é sempre possível | RF06 |

### LIC — Instrumento emitido e condicionantes (caminho manual)

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| LIC-01 | Cadastrar instrumento manualmente | PDF, tipo (catálogo + tipos próprios da consultoria), número quando houver, órgão, unidade, data de assinatura/marco e validade confirmada; rascunho incompleto pode ser salvo, mas não ativado | RF14, §4.2 |
| LIC-02 | Revisar condicionantes e temas | Cada item guarda código literal, título, texto literal e subitens; natureza é obrigação, agrupador, informação geral ou condição contínua; ajustar um item não refaz o cadastro inteiro | RF15, §4.4 |
| LIC-03 | Definir prazo e recorrência | Ciclo = unidade (mês/dia) + intervalo + marco + primeira data; presets anual, semestral, trimestral, bimestral, mensal, única, na renovação, contínua; simulação mostra as próximas datas; fim de mês e bissexto testados. Prazo verificável: cada prazo registra também a contagem (dias corridos ou úteis), a data de referência, a fonte/regra aplicável (trecho do documento ou norma) e quem confirmou o cálculo; quando o documento não dá base suficiente, o item fica pendente de revisão humana — o sistema não inventa nem ajusta data, e ausência de prazo não vira prazo inventado | RF16, §4.3 |
| LIC-04 | Distribuir responsáveis | Um responsável geral com confirmação, exceções por condicionante, itens sem responsável visíveis com ação "Atribuir"; só membros ativos da consultoria; a lista de candidatos segue a ordenação de CAP-09 quando a onda 4 existir | RF17, §4.5 |
| LIC-05 | Ativar o plano de obrigações | Gera as ocorrências até o fim da vigência uma única vez, em transação; retry devolve o mesmo resultado; condicionante com revisão pendente bloqueia a ativação; contínua não gera ocorrência periódica | RF18, §4.3 |

### IA — Extração assistida

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| IA-01 | Extrair dados do PDF da licença | Só PDF com texto extraível até 10 MiB; função no servidor chama o provedor com chave do servidor; saída validada por schema: identificação (tipo, número, órgão, datas) e condicionantes com texto literal, fonte (página/seção), natureza, periodicidade e prazo propostos; campo que não consta no documento fica vazio; máximo 300 itens; timeout e erro legível | RF36, §8.6 |
| IA-02 | Revisar a extração antes de qualquer efeito | Tela lista cada item proposto com aceitar / editar / descartar; nada vira prazo, responsável ou cadastro sem confirmação da gestão; o sistema registra, por item, se foi aceito sem edição (base da métrica) | §8.6, métrica |
| IA-03 | Registrar custo e aplicar cota | Cada extração guarda modelo, versão do prompt, tokens, custo, duração e resultado; cota mensal por consultoria ⚠️ valor; ao estourar, bloqueia com aviso e o caminho manual continua | RNF 10 |
| IA-04 | Degradar com segurança | Provedor indisponível, PDF escaneado ou resposta inválida mostram motivo e levam ao cadastro manual; nunca aprova, ativa ou altera cadastro automaticamente | §8.6 |
| IA-05 | Medir acurácia contra gabarito (ferramenta interna) | Dado um gabarito humano por licença, a comparação devolve cobertura de condicionantes, fidelidade de texto, prazo e periodicidade; relatório por modelo testado; base da escolha do modelo no OpenRouter | §8.7, métrica |

### EQ — Visão da equipe e calendário

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| EQ-01 | Tabela da equipe | Colunas Prazo, Demanda, Empreendimento, Licença, Responsável, Situação; ordenável; cabeçalho fixo; linha abre a ocorrência por mouse e teclado; abas "Toda a equipe" e "Minhas ações" | RF22, §9.4 |
| EQ-02 | Filtros combinados | Por membro, "sem responsável" e tipo documental; os tipos vêm dos instrumentos cadastrados pela consultoria (inclusive próprios), nunca de lista fixa; limpar restaura a equipe inteira | RF22 |
| EQ-03 | Situação calculada | Hoje, atraso ≤ 7, 8–30 e > 30 dias com tons distintos; validade, limite de protocolo e atraso de demanda rotulados separadamente; sem responsável mostra "Atribuir", não é segunda situação de atraso | §9.4 |
| EQ-04 | Calendário | Mês e semana; filtros por pessoa, unidade e sem responsável; abrir evento leva à ocorrência; distingue prazo oficial, meta interna e validade; data não muda pelo fuso do aparelho | RF23 |

* * *

## Onda 2 — ciclo da obrigação, renovação e alvará
### DEM — Demandas, etapas, evidência e conferência

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| DEM-01 | Detalhe da ocorrência | Mostra fonte da exigência (instrumento + condicionante + ciclo), etapas, responsável, prazo oficial original e atual, meta interna, versões de evidência e histórico | RF19, §5.5 |
| DEM-02 | Etapas | Título, data interna, responsável (pode diferir da entrega), modo trabalho ou espera externa, estimativa de horas; "próxima ação" calculada a partir das etapas, status e conferência | RF19, §5.5 |
| DEM-03 | Evidência e conferência | Upload deixa a ocorrência "em conferência"; conferente designado aprova ou devolve com motivo; gestão conclui; política de independência ativa impede que quem produziu confira; evidência substituída não apaga a aprovada. Negativo: ocorrência concluída bloqueia novos uploads e registros de campo; para continuar, alguém autorizado precisa reabri-la com motivo, registrado no histórico — uma entrega nunca volta silenciosamente para conferência | RF20, §5.5 |
| DEM-04 | Concluir sem evidência | Só gestão, com justificativa obrigatória, registrada na auditoria; nunca por atalho silencioso; depois de concluída vale o mesmo bloqueio de DEM-03 — evidência posterior só entra após reabertura com motivo | RF20 |
| DEM-05 | Reagendar meta interna | Muda a meta interna sem tocar o prazo oficial; conclusão atrasada não desloca o restante da série | §4.3 |
| DEM-06 | Propor e aprovar alteração crítica | Mudar validade, marco ou regra de uma condicionante exige prévia de impacto (antes/depois, ocorrências afetadas); gestão decide; concluídas e evidências não são apagadas; aprovação concorrente desatualizada retorna conflito | RF21, §4.3 |
| DEM-07 | Dependência entre condicionantes | Item pode exigir prazo mínimo após a execução real de outro (ex.: laudo 90 dias após limpeza); data de evidência valida o marco; aviso de evidência de ciclo errado | §4.4 |
| DEM-08 | Agrupador e subitens | Ocorrências do grupo ligadas às dos filhos por ciclo; grupo acompanha os filhos; grupo não reserva horas nem duplica trabalho | §4.4 |
| DEM-09 | Validar data da evidência | Data de execução informada pelo usuário; data de upload não substitui coleta; evidência fora do ciclo gera aviso | §4.4 |

### REN — Renovação de LAO

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| REN-01 | Plano de renovação | Antecedência adicional configurável por instrumento (padrão 30 dias); mostra vencimento, limite de protocolo (vencimento − 120) e início da preparação (limite − antecedência); trocar 30 por 60 não muda o limite de protocolo; etapas preparatórias geradas conforme a antecedência | RF24, §4.6 |
| REN-02 | Protocolo | Registra número, data e comprovante; não altera validade original nem obrigações vigentes; após o protocolo, acompanhamento do órgão em intervalo configurado | §4.6 |
| REN-03 | Substituir instrumento | Escolher a licença nova aprovada, relacionar à antecessora, revisar pendências; evidências e histórico preservados; renovação não é duplicada | RF25 |
| REN-04 | Condicionante "na renovação" | Obrigação específica de renovação pode coexistir com série periódica (`extraRenewal`) | §4.3 |

### ALV — Alvará

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| ALV-01 | Cadastrar alvará simples | Obrigatórios: unidade/endereço, PDF e validade; número, órgão e notas opcionais; não cria condicionantes, tarefas nem regra de 120 dias; aparece no empreendimento e na visão da equipe como projeção de validade | RF26, §4.7 |
| ALV-02 | Renovar alvará | Renovado é novo registro ligado ao anterior; o anterior é conservado | §4.7 |

### EQ / ACC / AUD / NOT — complementos

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| EQ-05 | Painel Acompanhamentos | Conferências pendentes e renovações em listas compactas; renovação mostra limite de protocolo e preparação configurada | §9.4 |
| EQ-06 | Exportar ICS | Arquivo respeita o filtro atual; links prontos para criar evento no Google/Outlook; sem sincronização | RF37 |
| ACC-05 | Bloquear tela sem logout | Conteúdo oculto e notificações pausadas; desbloquear exige senha e restaura rota e contexto; sessão revogada volta ao login; rascunho de formulário não se perde | RF04, §6.6 |
| ACC-06 | Preferências de aparência | Tema claro/escuro e paleta por usuário; não muda a equipe; valor inválido cai no padrão | RF34, §9.2 |
| AUD-01 | Histórico operacional | Gestão consulta eventos da consultoria com ator, instante do servidor, ação, entidade, motivo e valor antes/depois nas entidades críticas; ninguém altera ou apaga; sem senha, chave ou PDF no log | RF28 |
| NOT-03 | Notificações internas (sino) ⚠️ comportamento mínimo a confirmar | Sino mostra, por pessoa: atribuição de ocorrência/etapa a ela, prazo próximo ou vencido, evidência ou documento devolvido para correção e nova mensagem (quando o chat existir); marca lida/não lida; abrir leva ao item. Eventos gerados por ação de alguém (atribuição, devolução, mensagem) são gravados no servidor na hora. Prazo próximo/vencido, se os alertas automáticos ficarem fora do MVP, é calculado quando a pessoa abre o sistema — depende de serviço agendado para ser disparado sozinho e não funciona com o navegador fechado (ver NOT-01) | §5 (limites de notificações) |

* * *

## Onda 3 — processo de obtenção e dossiê
### PRO — Processo, documentos e movimentações

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| PRO-01 | Cadastrar processo | Unidade, órgão, fase ⚠️ (lista de fases a confirmar com Eduardo), responsável; número oficial opcional; não gera instrumento nem condicionante | RF07, §4.7 |
| PRO-02 | Dossiê com navegação | Lista de documentos à esquerda, documento selecionado em área ampla à direita; ao abrir, seleciona o mais recente; seleção preservada enquanto válida; retorno ao empreendimento sempre visível | RF08, §5.2 |
| PRO-03 | Anexar, visualizar e baixar | Upload validado (MIME, assinatura, tamanho até 25 MiB); PDF e imagem têm prévia; outros formatos têm download com estado explícito; nome original preservado | RF09, §5.3 |
| PRO-04 | Editar identificação e substituir arquivo | Título e descrição editáveis sem tocar o arquivo; substituição cria versão imutável com autor e instante; anterior continua acessível; erro de upload não troca a vigente | RF10, §5.3 |
| PRO-05 | Histórico de arquivos por empreendimento | Agrega documentos de processos, instrumentos, alvarás e evidências com origem e data; link abre a versão correta | RF11 |
| PRO-06 | Comentar e encaminhar | Comentário com autor e instante; encaminhar muda responsável e registra histórico; não equivale a envio ao órgão nem e-mail | RF12, §5.4 |
| PRO-07 | Solicitar trabalho, concluir e reabrir | Solicitação com destinatário, descrição e estado; concluir guarda a fase anterior e registra motivo; reabrir recupera; demandas abertas são mostradas antes de concluir; fechar processo não encerra obrigações de instrumento. Em processo encerrado ⚠️ proposta a confirmar: permitido visualizar, baixar, consultar histórico, exportar e reabrir (com motivo); bloqueado anexar, criar ou substituir documento, editar identificação, mudar fase, encaminhar e abrir solicitação; comentário em processo encerrado a decidir | RF13, §5.4 |
| PRO-08 | Ofícios e exigências | Vários por processo; fonte, termo inicial, contagem em dias corridos ou úteis, prazo oficial e interno; resposta guarda documento e protocolo sem apagar o anterior | RF27 |
| PRO-09 | Ligar processo ao instrumento emitido | Ao receber a licença, cadastro/revisão expressa; vínculo pedido → emissão registrado | §4.7 |
| EXP-01 | Exportar dados da consultoria | Exportação autorizada com manifesto, arquivos e IDs/vínculos; é portabilidade, não backup operacional | RF44, RNF18 |

* * *

## Onda 4 — capacidade e riscos
### CAP — Jornada, horas, metas e previsão

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| CAP-01 | Jornada individual | Por dia da semana: entrada, saída, almoço; dia desabilitado é folga; exceções por data; feriados reduzem jornada; validação de saída > entrada e almoço dentro da jornada | §6.2 |
| CAP-02 | Disponibilidade | Horas líquidas, compromissos e ausências, reservas planejadas e concluídas, horas livres; sobreposição não conta duas vezes; sem jornada ou estimativa → "insuficiente", nunca zero | §6.3 |
| CAP-03 | Reserva de trabalho | Exige jornada, data válida, janela sem almoço, sem passado, sem colisão e pessoa responsável pela etapa; soma das reservas abertas ≤ horas restantes; reatribuir ou excluir a demanda não cancela reserva silenciosamente | §6.4 |
| CAP-04 | Estimativas e apontamentos | Estimada, restante e conservadora independentes; apontamento de horas realizadas (≤ 24 por registro); espera externa não consome jornada nem aceita apontamento produtivo | §6.5 |
| CAP-05 | Intervalo e bloqueio | Política pausa ou bloqueio no almoço; exceção registra pessoa, janela e motivo; formulário sujo ou gravação pendente não perde rascunho | §6.6 |
| CAP-06 | Metas | Quantidade de demandas concluídas ou aprovadas por pessoa no período; exclui agrupadores; não mede horas | §6.7 |
| CAP-07 | Previsão de sobrecarga | Simulação determinística dia a dia com capacidade individual, dependências, reservas e horizonte (padrão 12 meses); estados `insufficient`, `overdue`, `late`, `buffer-used`, `attention`, `partial`, `on-track` com causas; cenário base e conservador; não reatribui automaticamente | §6.8, §6.9 |
| CAP-08 | Compromissos, visitas e substitutos | Compromisso com data/hora, unidade, participantes e demanda; detecta sobreposição; lista disponíveis e competências declaradas; substituição confirmada atualiza os calendários | RF31 |
| CAP-09 | Ordenação de responsáveis | Exibe membros ativos ordenados por perfil profissional preferido (configurável), compatibilidade com as competências exigidas e horas disponíveis até o prazo; mostra os critérios usados e sinaliza quando os dados são insuficientes; a atribuição só ocorre após confirmação humana; o sistema não presume habilitação profissional nem atribui automaticamente | §6 (critérios de atribuição), LIC-04, CAP-08 |

* * *

## Onda 5 — comercial e financeiro
### ORC — Orçamentos

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| ORC-01 | Catálogo de serviços e preços | Por consultoria; preços iniciais são exemplo editável, não tabela oficial | §7.1 |
| ORC-02 | Proposta | Cliente/prospecto, empreendimento ou processo, objeto, itens com quantidade/unidade/preço, desconto por item e geral, impostos, repasses, opcionais, entregas, exclusões, validade e condições; obtenção, acompanhamento e outro serviço são linhas separadas; honorário ≠ taxa do órgão | RF38, §7.1 |
| ORC-03 | Cronograma de pagamento | Entrada e parcelas ou etapas; centavos distribuídos por maior resto, soma sempre igual ao total, sem parcela negativa; limites de preço, quantidade e parcelas testados | §7.1 |
| ORC-04 | Ciclo de vida | Rascunho → enviada → negociação → aprovada / recusada; só rascunho é editável; enviada muda por revisão preservando a anterior; numeração `ORC-AAAA-NNN`; modelos reaproveitáveis | §7.1 |
| ORC-05 | Documento da proposta | HTML/PDF sem custo, margem ou notas internas; texto livre escapado; CSV com fórmulas neutralizadas | §7.1 |

### FIN — Pós-aceite e financeiro

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| FIN-01 | Registrar aceite | Método, pessoa, data, referência e comprovante; hash SHA-256 do conteúdo comercial (não é assinatura qualificada) | §7.2 |
| FIN-02 | Minuta de contrato | Partes obrigatórias, campos escapados, aviso de revisão jurídica; "preparar e-mail" abre `mailto:`, não envia | §7.2 |
| FIN-03 | Demandas de serviço | Geradas a partir dos itens aprovados, uma vez, com etapas; ligadas ao orçamento e ao item | §7.2 |
| FIN-04 | Recebíveis da consultoria | Valores que a consultoria recebe dos clientes dela — não trata da assinatura do próprio Nexo (ver BIL-01); derivados do cronograma; pagamento parcial e estorno com motivo; saldo e status derivados; reabrir aprovado com pagamento é bloqueado; excluir orçamento não apaga cobranças | RF39, §7.2 |
| FIN-05 | Acesso ao financeiro | Permissão específica além do papel; não é item de menu escondido | §3.5 |
| FIN-06 | Prospecto vira empreendimento | Na aprovação, com validação de CNPJ e duplicidade | §7.1 |

* * *

## Onda 6 — resíduos
### RES — Prestadores, coleta, MTR e CDF

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| RES-01 | Prestadores | Transporte, destinação ou ambos; situação, atendimento, classes de resíduo, região, licença (número, tipo, validade) e autorização adicional | RF40, §7.3 |
| RES-02 | Elegibilidade | Licença ausente, vencida, inatividade ou classe incompatível bloqueiam; região fora ou validade próxima avisam; conferência é dos dados digitados, não consulta ao órgão | §7.3 |
| RES-03 | Pedido de coleta | Por empreendimento gerador, com resíduos, unidades e escopo | §7.3 |
| RES-04 | Propostas e comparação | Registrar propostas recebidas; normalizar custo por coleta/mês; massa não compara com volume sem conversão; menor custo só entre elegíveis e comparáveis; parcial exige complemento | §7.3 |
| RES-05 | Contratação | Edição do pedido invalida propostas; desfazer contratação só antes do MTR | §7.3 |
| RES-06 | MTR e CDF | Número de MTR único; coleta respeita contratação; prazo e recebimento de CDF; falta de CDF gera pendência; arquivos ligados à condicionante; sem emissão em portal oficial | RF41, §7.3 |

* * *

## Onda 7 — documentos por modelo
### DOC — DOCX e Google Documentos

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| DOC-01 | Preferência de editor | Por usuário: arquivos, Google ou Word | §8.1 |
| DOC-02 | Modelos DOCX da consultoria | Upload com validação (ZIP ≤ 10 MiB, sem macro, ActiveX, embed ou relação externa); campos suportados identificados; versão anterior recuperável | RF30, §8.4 |
| DOC-03 | Criar documento por modelo | Dentro de processo aberto; escolhe modelo e nome; confere só os campos usados; gera cópia nova com snapshot dos dados; modelo original intacto; preencher campo não altera cadastro | §8.2, §8.3 |
| DOC-04 | Editável e PDF | Substituir DOCX volta a rascunho e preserva o anterior; registrar versão PDF é snapshot separado; aprovação explícita por versão; independência quando ativa | §8.2 |
| DOC-05 | Google Documentos | Sem configuração: vincular URL válida manualmente; com OAuth (`drive.file`): copiar modelo, substituir marcas, exportar PDF/DOCX; token só em memória; bloquear ou sair encerra a sessão Google | §8.5 |

* * *

## Onda 8 — chat

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| CHAT-01 | Canal da equipe | Um canal por consultoria; autoria e instante do servidor; histórico paginado; não lidas por membro; mensagem aparece em outro aparelho sem recarregar; retry não duplica; texto escapado | RF29, §5.7 |

* * *

## Onda 9 — análise de lote

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| GIS-01 | Localizar e desenhar lote | Busca de endereço, desenho ou seleção de lote, camadas e imagens de referência | RF42, §7.4 |
| GIS-02 | Motor de análise | Geometria validada; cruzamento com catálogo versionado de restrições (APP por trecho, zoneamento, inundação, patrimônio, UC); base ausente → "não verificado", nunca "sem restrição"; relatório cita fonte, versão e tolerância | RF42, ADR-0012 |
| GIS-03 | Salvar no empreendimento | Resumo, alertas e restrições gravados por escolha explícita; reabrir mostra o resumo, não recalcula | §7.4 |

* * *

## Onda 10 — campo

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| CAMPO-01 | Registros de campo | Fotos, notas, coordenadas e hora do aparelho ligados a uma ocorrência; são registro, não prova inviolável; ocorrência concluída não aceita novo registro sem reabertura (ver DEM-03) | RF32, §5.8 |
| CAMPO-02 | Pacote manual | Exportar/importar pacote validado (consultoria declarada, IDs conhecidos, limites); importador autenticado ≠ autor declarado; conflito preserva alternativas | §5.8 |

* * *

## Onda 11 — central administrativa (logo após o MVP)

| ID | Requisito | Aceite mínimo | Origem |
| ---| ---| ---| --- |
| ADM-01 | Central da operadora | Listar, detalhar e alterar consultorias (situação `trial`/`active`/`suspended`/`archived`, plano, limites de assentos, storage e IA/mês) com motivo, versão e idempotência; auditoria própria; MFA e permissão de plataforma; sem acesso a documentos, mensagens ou dados das consultorias; sem "entrar como cliente". Usuários e vínculos individuais ⚠️ a decidir: proposta é a central ver só a contagem de assentos usados por consultoria, sem listar, alterar ou remover pessoas e vínculos — isso fica com a gestão de cada consultoria | §10.5 |

* * *

## Descritos, fora do MVP

| ID | Requisito | Por que está aqui |
| ---| ---| --- |
| NOT-01 | Resumo diário por e-mail de prazos próximos e sem responsável, com antecedências configuráveis; job roda com navegador fechado; deduplicação | Pedido do cliente; depende de job agendado e provedor de e-mail transacional (ADR-0013). Gatilho em "Evoluções futuras". O sino (NOT-03) não substitui: sem esse serviço, nada é avisado com o navegador fechado |
| NOT-02 | Sincronização com Google Calendar / Outlook | Depende de OAuth e idempotência de eventos; ICS (EQ-06) atende antes |
| IMP-01 | Importação em lote de empreendimentos e instrumentos (CSV/planilha) | Dados do piloto serão recadastrados; necessário a partir da segunda consultoria |
| IA-06 | OCR para PDF escaneado | Hoje PDF sem texto é recusado com aviso |
| IA-07 | Fila assíncrona de extração com aviso ao usuário | Hoje é síncrona; gatilho: timeout da função ou volume |
| BIL-01 | Faturamento da assinatura do Nexo (planos, cobrança das consultorias, inadimplência e efeito na situação da conta) | Não é coberto por FIN-04, que trata do que a consultoria recebe dos clientes dela. ⚠️ Se entrar no escopo, precisa de requisitos próprios |

* * *

## Pendências ⚠️
*   Lista de fases do processo de obtenção (PRO-01) — confirmar com Eduardo.
*   Valor da cota mensal de extrações por consultoria (IA-03).
*   Política de independência de conferência: ligada ou desligada por padrão (DEM-03).
*   Intervalo padrão de acompanhamento do órgão após protocolo (REN-02).
*   Ações permitidas em processo encerrado (PRO-07) — confirmar a proposta, inclusive se comentário é permitido.
*   Central administrativa vê ou administra usuários e vínculos individuais? (ADM-01) — confirmar a proposta.
*   Faturamento da assinatura do Nexo está no escopo? (BIL-01)
*   Comportamento mínimo do sino e em que onda entra; alertas automáticos de prazo ficam fora do MVP? (NOT-03)
*   Quem configura o perfil profissional preferido e onde as competências exigidas são declaradas (CAP-09).
* * *

## Histórico de versões
*   v0.1 · 05/10/2026 — versão inicial.
*   v0.2 · 12/10/2026 — CAP-09 (ordenação de responsáveis); bloqueio de nova entrega em ocorrência concluída (DEM-03/04, CAMPO-01); prazo verificável (LIC-03); notificações internas (NOT-03); redistribuição ao desligar membro (ACC-02); escopo de processo encerrado (PRO-07), da central administrativa (ADM-01) e do financeiro (FIN-04, BIL-01).
Aditivo funcional · EMP-03 — Cadastro de veículos vinculados a empreendimentos e licenças

Origem: necessidade operacional relatada por Eduardo em 14/10/2026, relacionada a transportadores de resíduos perigosos que mantêm várias placas associadas a diferentes LACs.

Objetivo: registrar a frota no empreendimento e consultar quais veículos estão vinculados a cada licença ou alvará, sem depender de planilhas externas.

Comportamento esperado
• Cadastrar cada veículo dentro do empreendimento, tendo a placa como identificador obrigatório.
• Associar um veículo a uma ou mais licenças já cadastradas; cada licença pode ter vários veículos. A associação usa os instrumentos existentes, incluindo LAC e tipos próprios cadastrados pela consultoria, sem catálogo fixo.
• Exibir a lista de placas no empreendimento e os veículos vinculados ao abrir cada licença. Usar dados já registrados da licença, como tipo e número, sem duplicar esses campos no cadastro do veículo.
• Permitir localizar a frota por placa e preservar o histórico quando um vínculo com uma licença for encerrado ou alterado; não apagar associações anteriores.
• Aplicar os papéis existentes, autorização no servidor, isolamento por consultoria e empreendimento, e trilha de auditoria às operações de criar, editar, associar e encerrar vínculos.

Limites de escopo e segurança
• Este requisito cobre cadastro, consulta e vínculo da frota. Não inclui integração com órgão ambiental, validação automática de regularidade ou conclusão sobre autorização para transporte. A equipe responsável confirma os dados e enquadramentos.
• Credenciais de portais ambientais, como o IMA, são dados sensíveis: não devem ser guardadas nos campos do veículo nem exibidas com as placas. Seguem os requisitos de acesso e proteção da página 03 · Requisitos não funcionais.
• Anexos de documentos dos veículos ficam fora do escopo inicial até serem definidos tipos aceitos, retenção e permissões.

Ponto a confirmar no detalhamento: além da placa, quais campos opcionais do veículo são necessários? Recomendação: começar com placa e associação à licença; só tornar outros dados obrigatórios após validação com a operação. Nenhuma regra legal foi inferida nesta especificação.

Histórico: v0.3 · 14/10/2026 — adicionado EMP-03 para cadastro, consulta e histórico de veículos associados a empreendimentos e instrumentos.