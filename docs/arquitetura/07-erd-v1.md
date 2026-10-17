# 07 · ERD v1

**ERD v1 — Modelo de dados · Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Base: one-pager (página "Contexto"), "Requisitos funcionais", "Requisitos não-funcionais", "Stack e ADRs" e "C4 nível 2 — Containers". Origem do modelo: ERD lógico do pacote de 30/09 (`modelo-dados.mmd` e dicionário §3.6), reduzido e traduzido para o vocabulário desta documentação.
Primeira versão do modelo relacional. Cobre as **ondas 1 a 3** (acesso, empreendimento, instrumento, condicionantes, ocorrências, evidência, renovação, processo e dossiê). Tabelas das ondas 4 a 11 aparecem na seção "Tabelas das ondas seguintes", sem diagrama. Campos de detalhe, índices e políticas de RLS ficam para as migrations.
* * *
## Diagrama
**📊 \[Diagrama — cole aqui a imagem copiada no botão “Copiar imagem”\]**
* * *
## Entidades
**CONSULTORIA** — o tenant. Toda tabela de dados tem `consultoria_id` e RLS que compara com o vínculo ativo (ADR-0003). Guarda fuso, situação (a mesma máquina de estados da central administrativa) e políticas: cota de IA e conferência independente.
**USUARIO / MEMBRO / CONVITE** — identidade global (espelho de `auth.users`) separada do **vínculo** com a consultoria, que carrega papel (`gestao | equipe`) e concessões. Responsável, conferente, autor e ator são sempre `membro_id`, nunca nome (🔁 o protótipo usava nome). Desligar um membro muda `situacao`, preserva a autoria. Convite guarda hash do token, nunca o token.
**CLIENTE / EMPREENDIMENTO / UNIDADE** — cliente contratante é opcional; empreendimento é o dono da licença e o ponto de entrada das telas; unidade é o endereço/filial onde o instrumento vale. 🔁 O protótipo misturava cliente e empreendimento em `clients`; aqui são separados desde a primeira migration, com a interface pedindo só o nome do empreendimento.
**PROCESSO / DOCUMENTO / DOCUMENTO\_VERSAO** — pedido junto ao órgão, com dossiê. Documento é a identidade lógica; cada substituição é uma versão imutável com objeto próprio no Storage, hash e autor (ADR-0008). Ponteiros `versao_vigente_id` e `versao_aprovada_id` mudam em transação. O PDF de um instrumento e o arquivo de uma evidência são versões de documento, o que dá histórico e prévia de graça.
**INSTRUMENTO** — licença ou autorização **emitida**. `alvara = true` marca o instrumento simples (unidade, PDF, validade, sem condicionantes); não há tabela separada porque os campos coincidem e a projeção de validade na visão da equipe é a mesma. `tipo` aceita o catálogo e tipos próprios da consultoria. `assinado_em_texto` preserva o texto original da data (ADR-0009). `antecessor_id` é a autorrelação de substituição. `antecedencia_renovacao_dias` é a configuração por instrumento (padrão 30).
**CONDICIONANTE / CONDICIONANTE\_VERSAO** — a condicionante é a identidade (código literal, posição, agrupador pai, papel); a versão é o conteúdo revisado. Rever uma condicionante cria versão nova; a anterior fica congelada com as ocorrências que gerou. `natureza` + `unidade_ciclo` + `intervalo_ciclo` + `data_base` + `primeira_entrega` definem a recorrência (anual = `mes`/12, bimestral = `mes`/2…). `origem` e `aceita_sem_edicao` são a base da métrica de acurácia. `depende_de_condicionante_id` + `prazo_minimo_dias` modelam a dependência com prazo mínimo após execução real (DEM-07).
**OCORRENCIA** — a entrega. Tem **exatamente uma origem**: versão de condicionante (ciclo), plano de renovação, ofício ou — na onda 5 — item de orçamento (`proposito = servico`); restrição no banco garante. `prazo_oficial_original` nunca muda; `prazo_oficial_atual` só muda por alteração aprovada; `meta_interna` é o plano. `chave_idempotencia` garante que ativar duas vezes não duplica. Situação é `aberta | em_conferencia | concluida`; **atraso é derivado da data**, não estado gravado.
**ETAPA** — passo interno da ocorrência, com responsável próprio, modo trabalho ou espera externa, horas estimadas e restantes independentes (espera não consome jornada). Base da onda 4.
**EVIDENCIA / CONFERENCIA** — evidência liga ocorrência a uma versão de documento e guarda a **data real de execução** (não a de upload). Conferência registra decisão, conferente e motivo; a função que a grava valida a política de independência. Aprovar evidência não conclui a ocorrência — quem conclui é a gestão.
**PLANO\_RENOVACAO** — snapshot do cálculo: `limite_protocolo = validade − dias_limite_protocolo`; `inicio_preparacao = limite_protocolo − antecedencia_dias`. `dias_limite_protocolo` é gravado (120 hoje) para que uma mudança de regra não reescreva planos antigos. Protocolo guarda número, data e comprovante e não altera a validade do instrumento.
**OFICIO** — exigência do órgão dentro de um processo, com regra de contagem e prazos; gera ocorrências com `proposito = exigencia` (onda 3).
**EXTRACAO\_IA** — uma execução da IA: provedor, modelo, versão do prompt, tokens, custo, duração, situação e a saída bruta validada. Nunca guarda o PDF (só a referência à versão do documento). É o registro de custo (RNF 10) e a base da avaliação com gabarito (IA-05).
**ALTERACAO\_PROPOSTA** — mudança crítica (validade, marco, regra de condicionante) com antes/depois, versão base e decisão da gestão (DEM-06). Alvo polimórfico validado na função que aplica a alteração.
**AUDITORIA** — tabela genérica append-only (entidade + id + ação + antes/depois + ator + instante do servidor), preenchida por trigger (ADR-0010).
* * *
## Decisões do modelo ✅
*   **`consultoria_id`** **em toda tabela de dados**, com RLS forçada e chaves estrangeiras compostas `(consultoria_id, id)` nas relações pai-filho — o banco impede ligar registros de consultorias diferentes mesmo com UUID conhecido (ADR-0003).
*   **Responsável, autor e ator são** **`membro_id`**, de primeira classe; é o que torna "quem fez o quê" verificável no servidor e sobrevive a troca de nome ou desligamento.
*   **Versão imutável em documento e em condicionante**; ponteiro de vigente/aprovada muda em transação. Nada é sobrescrito.
*   **Ocorrência com origem única e prazo original preservado.** Atraso e situação da visão da equipe são calculados, nunca gravados.
*   **Datas civis** **`DATE`****, instantes** **`TIMESTAMPTZ`**, texto original da data preservado (ADR-0009).
*   **Alvará é instrumento com flag**, não tabela própria; nunca recebe condicionante nem plano de renovação (restrição no banco).
*   **Auditoria é tabela genérica** com trigger, não colunas espalhadas (ADR-0010).
*   **Parâmetros de regra gravados no snapshot** (`dias_limite_protocolo`, `antecedencia_dias`, `versao_prompt`), para que mudar a regra não reescreva o passado.
*   **`row_version`** nas entidades mutáveis de decisão (instrumento, ocorrência) para controle otimista (RNF 11).
*   **Exclusão é lógica** onde há histórico (`ON DELETE RESTRICT`); eliminação física obedece à política de retenção.
* * *
## Tabelas das ondas seguintes
Entram no ERD da sua onda, com a mesma disciplina (tenant, RLS, versão, auditoria). Nomes são indicativos.

| Onda | Tabelas | Observação |
| ---| ---| --- |
| 2 | `PREFERENCIA_USUARIO` (tema, paleta) | Por usuário, fora do estado da consultoria |
| 3 | `COMENTARIO` (processo ou documento), `SOLICITACAO_INTERNA` (tipo, destinatário, estado), `EXPORTACAO` (manifesto) | Comentário ≠ protocolo; solicitação tem estado próprio |
| 4 | `JORNADA` (membro, dia da semana, entrada, saída, almoço), `JORNADA_EXCECAO` (data), `FERIADO` (consultoria), `COMPROMISSO` (ausência, visita, participantes), `RESERVA` (membro, etapa, data, janela, horas, \`planned | done |
| 5 | `CATALOGO_SERVICO`, `ORCAMENTO` (numeração `ORC-AAAA-NNN`, situação, revisão), `ORCAMENTO_ITEM`, `ORCAMENTO_MODELO`, `CRONOGRAMA_PAGAMENTO`, `ACEITE` (método, hash), `MINUTA`, `RECEBIVEL`, `PAGAMENTO`, `ESTORNO` | Valores em centavos com moeda; custo e margem internos; ocorrência com `proposito = servico` liga ao item |
| 6 | `PRESTADOR` (transporte/destinação, licença, classes, região), `PEDIDO_COLETA`, `PROPOSTA_COLETA`, `CONTRATACAO_COLETA`, `MTR`, `CDF` | Número de MTR único por consultoria; CDF com prazo e pendência |
| 7 | `PERFIL_DOCUMENTOS` (editor preferido por usuário), `MODELO_DOCX` (versão, campos detectados), `DOCUMENTO_EDITAVEL` (snapshot de dados usados, vínculo Google opcional) | Editável e PDF são versões separadas do mesmo documento |
| 8 | `CANAL`, `MENSAGEM` (autor, instante do servidor), `LEITURA_CANAL` (membro, último lido) | Realtime do Supabase |
| 9 | `BASE_CARTOGRAFICA` (fonte, versão, licença), camadas PostGIS, `CATALOGO_RESTRICAO` (versão, tolerância), `ANALISE_LOTE` (geometria, resultado, versão do catálogo) | ADR-0012 |
| 10 | `REGISTRO_CAMPO` (fotos, notas, coordenadas), `PACOTE_CAMPO` (exportação/importação, conflitos) | Importador ≠ autor declarado |
| 11 | `PLANO_PLATAFORMA`, `CONCESSAO_PLATAFORMA` (identidade da operadora, MFA), `AUDITORIA_PLATAFORMA` | Fora do escopo de qualquer consultoria; sem acesso a documentos |

* * *
## Pendências ⚠️
*   Lista de fases do processo de obtenção (`PROCESSO.fase`) — vem do Eduardo.
*   Confirmar se `tipo` de instrumento é texto livre com sugestões ou tabela `TIPO_INSTRUMENTO` por consultoria (afeta o filtro dinâmico EQ-02); proposta: tabela por consultoria, semeada com LAO/LAP/LAI/AuA/alvará.
*   Regras de renovação por tipo e jurisdição (`REGRA_RENOVACAO` versionada) — no MVP só LAO tem regra (120); as demais ficam sem plano de renovação automático até haver fonte.
*   Modelagem da política "equipe vê só a própria carteira", se algum cliente pedir (concessão no membro ou política na consultoria).