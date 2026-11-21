# ADR-0045: Exigências do órgão em tabela própria, com prazo do ofício e histórico só de acréscimo

- **Situação:** aceito em 20/11/2026. O Eduardo aceitou todas as recomendações do estudo "Oito funções no Grama sem abrir janelas novas" (pacote P3, função 3) e fixou a especificação do pacote. O Kadu revisa.
- **Depende de:** ADR-0041 (base das oito funções: fontes de prazo e grupos da busca). Camada `camada/exigencias-do-orgao`, saída da `camada/base-das-oito`.
- **Diverge de:** o ERD v1 (`07-erd-v1.md`: ofício dentro de processo, gerando ocorrência com `proposito = exigencia`). Processo e dossiê continuam fora do escopo; o ERD precisa ser atualizado por uma pessoa.

## Contexto

O órgão ambiental manda ofícios com exigências (complementação de estudo, laudo, esclarecimento) e um prazo para responder. Hoje isso vive fora do Grama. A exigência pode chegar durante o licenciamento, antes de existir licença, então não cabe na `ocorrencia` (que exige `instrumento_id`, nasce de condicionante e tem chave de idempotência própria). A base (ADR-0041) já deixou a fonte de prazo `private.linhas_de_prazo_exigencia` e o grupo de busca `private.busca_exigencias` vazios, a rota `/exigencias/:id` apontada pela Visão, pelo Calendário e pela busca, e `prazoDeOficio`/`diaUtilAnterior` de volta ao domínio.

## Decisão

1. **Duas tabelas novas**, ambas com `consultoria_id`, RLS habilitada e forçada, leitura por `private.is_membro`, escrita só por RPC `security definer`, FKs compostas, auditoria e as barreiras de suporte e comercial:
   - `exigencia`: ligada ao empreendimento e à unidade (obrigatórios, FK tripla como a licença) e, se houver, à licença da mesma unidade. Guarda número do ofício, órgão, número do processo (texto), assunto, PDF do ofício (opcional), data de recebimento com o texto original, prazo em dias e contagem (ou prazo informado com o texto original), `prazo_oficial_original`, `prazo_oficial`, `meta_interna`, responsável (`membro_id`), situação do fluxo (`aberta` ou `respondida`), exclusão lógica e `row_version`.
   - `exigencia_resposta`: **só acrescenta** (trigger barra `update`, `delete` e `truncate`). Três tipos: `resposta` (data do protocolo e número ou PDF), `anexo` (PDF com descrição) e `prorrogacao` (prazo anterior, prazo novo, meta nova e motivo).
2. **`instrumento.numero_processo`** (texto, opcional). A Gestão grava pela RPC `definir_processo_da_licenca`; a exigência herda como sugestão na tela, sem escrita implícita na licença.
3. **Prazo do ofício.** Contado a partir do **dia seguinte ao recebimento** (`prazoDeOficio` do domínio): N dias corridos ou N dias úteis (só feriados nacionais). A meta interna sugerida é `diaUtilAnterior(prazo)`: o próprio prazo, se útil; senão o dia útil anterior. A regra pura fica no domínio. O banco **não confia no front nem calcula sozinho**: a RPC recebe o prazo calculado pelo domínio, recalcula em SQL equivalente (`private.prazo_da_exigencia`, sobre `private.somar_dias_uteis`) e recusa com `prazo_divergente` se diferirem. Um teste cruzado (Vitest e pgTAP com a mesma tabela de casos) prende as duas implementações.
4. **Prazo original imutável.** `prazo_oficial_original` é travado pela trigger `private.preservar_prazo_original()` (a mesma da ocorrência). `prazo_oficial` só muda por prorrogação.
5. **Prorrogação só pela Gestão**, só com a exigência aberta, só para data posterior ao prazo atual, com motivo. Vira uma linha `prorrogacao` em `exigencia_resposta` e atualiza `prazo_oficial` e `meta_interna` na mesma transação. A decisão da Gestão é a "alteração aprovada" do ERD.
6. **Situação calculada.** O banco guarda só o fluxo (`aberta` → `respondida`, nunca de volta). Aberta, Vence hoje, Atrasada, Respondida e Respondida fora do prazo são calculadas no domínio (`situacaoDaExigencia`) a partir do prazo oficial, da data da primeira resposta e de hoje no fuso da consultoria. Atraso nunca é gravado.
7. **Papéis.** Só a Gestão registra, edita, prorroga, atribui e exclui. Todo membro vê. A Equipe registra resposta e anexo só quando é a responsável.
8. **Encaixe na base, sem tocar na união.** O pacote redefine só `private.linhas_de_prazo_exigencia(cid)` (exigências abertas e não excluídas, `codigo` = número do ofício, `titulo` = assunto, `tipo_id` e `meta_interna` nulos) e `private.busca_exigencias(p_consultoria_id, p_termo)`. `listar_prazos`, `contar_prazos`, `listar_calendario` e `buscar_no_grama` ficam como estão; os pgTAP 710 e 711 continuam passando. `'exigencia'` entra em `TIPOS_COM_RESPONSAVEL` com a RPC `atribuir_exigencia`; a Visão escolhe a RPC de atribuir pelo tipo da linha.
9. **Telas.** Aba Exigências em Acompanhamentos (uma linha em `ABAS_DE_ACOMPANHAMENTOS`, com painel próprio e a ação "Registrar exigência" da Gestão), seção Exigências no Empreendimento (uma linha em `SECOES`), "Registrar exigência" no "…" do Empreendimento (uma linha em `ACOES`, só Gestão) e o detalhe em `/exigencias/:id`.

### Decisões conservadoras (o estudo e a especificação não fixam)

- Unidade obrigatória: a fonte de prazo da base exige unidade em toda linha.
- Licença, se informada, tem de ser da mesma unidade (trigger e RPC).
- Prazo em dias limitado a 1–365; recebimento nunca no futuro; protocolo nunca no futuro nem antes do recebimento.
- Prazo em dias corridos que cai em fim de semana ou feriado **não** é empurrado para o dia útil seguinte (é o que `prazoDeOficio` faz); a meta interna é que antecipa. Erra para o lado seguro.
- A meta sugerida nunca fica antes do recebimento: ofício recebido no fim de semana com prazo curto (ex.: sábado, 1 dia corrido) teria o dia útil anterior antes do recebimento, que o banco recusa; aí a sugestão é o próprio recebimento.
- Trocar o PDF no diálogo gera uma versão nova (id e caminho novos). O Storage não sobrescreve, então repetir com o mesmo caminho depois de um erro deixaria o objeto antigo com o nome e o SHA-256 do arquivo novo. Repetir com o mesmo arquivo mantém o id (idempotente).
- Prazo informado pelo órgão (data no ofício, sem dias) é aceito, com o texto original obrigatório.
- PDF do ofício opcional no registro; anexos e PDF de resposta só em PDF (mesma conferência do alvará).
- Resposta exige número do protocolo ou PDF. A primeira resposta encerra a exigência; respostas seguintes (complementação) só acrescentam.
- Sem reabrir: resposta registrada por engano fica no histórico. Exigência sem nenhuma linha de histórico pode ser excluída (lógica) pela Gestão.
- Editar não muda datas de recebimento, prazo, unidade nem licença: errou o prazo, exclui e registra de novo (enquanto não há histórico).
- Exigência respondida não muda de responsável nem é prorrogada.
- A meta interna da exigência não vira evento "meta" no Calendário (a base só gera meta de ocorrência; mudar isso é mexer em `listar_calendario`).
- Disponível em todos os planos; nenhum recurso novo.
- Sem atalho "Registrar exigência" no Ctrl+K (a especificação não pede; `ATALHOS_DA_BUSCA` é da base).
- A aba Exigências não mostra contagem (a página de Acompanhamentos só conta as abas dela).
- Nenhuma exigência no seed nem em `testes.criar_dados_sinteticos`: mudaria os valores fixos do pgTAP 710.

## Consequências

- Uma migration aditiva (`exigencias_do_orgao`), com horário depois de `20261120211810`. Vai ao beta depois da migration da base (`20261120183218`).
- pgTAP 740–749: estrutura, RLS e outra consultoria com zero linhas, travas (original, fluxo, só acrescenta), permissões por papel, RPCs, teste cruzado do prazo e as fontes de prazo e de busca com dados reais.
- O front ganha `packages/domain/src/exigencia.ts`, `apps/web/src/lib/api/exigencias.ts` e `apps/web/src/app/paginas/exigencias/*`.
- Limitação conhecida: só feriados nacionais na contagem em dias úteis (estaduais e municipais ficam para depois).
- O ERD v1 e o PRO-08 precisam ser atualizados por uma pessoa (exigência sem processo).
