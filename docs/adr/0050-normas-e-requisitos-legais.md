# ADR-0050: Normas que se atualizam e requisitos legais por empreendimento

- **Situação:** aceito em 20/11/2026. O Eduardo aprovou o estudo "Normas e requisitos no Grama" inteiro ("Sim, seguir todas"): valem as 13 recomendações do estudo. O Kadu revisa.
- **Escopo:** por decisão do Eduardo em 20/11/2026, entram no escopo dois itens que o CLAUDE.md lista como fora até 20/10:
  - **processos e dossiê**, só na parte de requisitos legais e evidências por empreendimento (pacotes L6 e L10);
  - **cota mensal de IA**, como cota de plataforma para o resumo de normas (pacote L4). A cota por consultoria da extração e da conferência não muda.
- **Requisitos:** LEG-01 a LEG-10, em `docs/arquitetura/02-requisitos-legislacao.md`.
- **Depende de:** ADR-0041 (fontes de prazo e de busca, abas de Acompanhamentos, seções do Empreendimento), ADR-0030 (recursos por plano) e do pacote P5 do estudo das oito funções (avisos). As camadas saem de `camada/base-das-oito`.

## Contexto

As consultorias acompanham a legislação ambiental à mão: leem o Diário Oficial, o site do IMA e as resoluções do CONSEMA, e descobrem tarde que uma IN mudou o prazo de uma renovação. O GreenLegis e os concorrentes resolvem isso para a indústria grande, com curadoria jurídica, base nacional e preço alto. Nenhum foca em SC nem liga a mudança à licença e à condicionante.

O Grama já conhece o que define quem é afetado: a atividade CONSEMA (triagem), o município da unidade e o tipo de licença. Falta gravar a atividade no empreendimento, vigiar as fontes e mostrar a mudança com a diferença entre versões.

O estudo testou cada fonte em 20/11/2026 (só leitura: robots.txt, termos, endpoints e cabeçalhos). Texto de lei e ato oficial não tem direito autoral (Lei 9.610/1998, art. 8º, IV). O limite vem do robots.txt, dos termos de uso e de CAPTCHA ou desafio anti-robô.

## Decisão

### Catálogo de normas

1. **Catálogo global em `private`.** A norma é a mesma para todas as consultorias, mas o `020_estrutura` proíbe tabela em `public` sem `consultoria_id`. O catálogo segue o padrão de `private.plano_catalogo`: tabelas em `private` (`fonte_legal`, `coleta`, `norma`, `norma_versao`, `norma_mudanca`, `norma_criterio`), RLS habilitada e forçada, sem grant para `anon` nem `authenticated`, e leitura só por RPC `security definer` que confere se quem pede é membro ativo de alguma consultoria (`buscar_normas`, `detalhe_da_norma`, `listar_fontes_legais`). O teste de estrutura não ganha exceção.
2. **Versões imutáveis.** O arquivo original vai para o Storage em bucket privado, no caminho `normas/<norma>/<uuid>`. Versão nova é linha nova, só quando o SHA-256 muda (`unique (norma_id, sha256)`); um trigger impede alterar ou apagar versão. A data de publicação é `DATE` e guarda o texto original; a coleta é `TIMESTAMPTZ`.
3. **Chave canônica** no estilo URN do LexML (`sc;ima;instrucao_normativa;2`). O LexML entra só como formato de identificador, nunca como fonte de coleta.
4. **Primeira coleta cria a versão-base sem mudança.** Quando a norma entra no catálogo pela primeira vez, a coleta grava a versão 1 e não gera `norma_mudanca`. Sem essa regra, as 82 INs do IMA apareceriam como 82 "novas" no primeiro dia. Mudança só nasce a partir da segunda versão, de uma revogação ou de ato novo publicado depois da carga inicial.
5. **Situação e "Rever" são calculados.** `situacao_na_fonte` e `revogada_em` guardam só o que a fonte publicou; a situação na tela é calculada. Um requisito fica "Rever" quando a norma tem versão mais nova que a da última avaliação; isso nunca é gravado.
6. **Classificação.** Por atividade (códigos CONSEMA 250 e 251, ou prefixos), tipo de licença (LAP, LAI, LAO, AuA, LAC, renovação), lugar (esfera e município IBGE) e tema (lista fixa: efluentes, resíduos, emissões, ruído, supressão, APP, fauna, recursos hídricos, taxas, procedimento). As 82 INs do IMA nascem com os critérios do mapa do simulador (`origem = 'simulador_ima'`). A classificação do ato pela ementa ("Altera", "Revoga", "Dá nova redação") fica em `packages/domain`, com teste.

### Coleta

7. **Coletores em Edge Function.** `coletar-normas`, com um adaptador por fonte, chamada por `pg_cron` + `pg_net` com `x-cron-token`, como a lista de espera. Os coletores são escritos e testados com o `pg_cron` **desligado** e `fonte_legal.ativa = false` até a publicação; ligar uma fonte é decisão de quem publica.
8. **Boa vizinhança.** Até 1 requisição por segundo por fonte, horários fora de pico, `User-Agent` identificado com o nome genérico do produto, pedido condicional (`ETag`, `Last-Modified`) e `Content-Type` conferido (o cache da SEMAE já devolveu o RSS no lugar do PDF). Coleta idempotente: `unique (fonte, janela)` em `coleta`.
9. **CPF removido antes de gravar.** O DOE-SC e o CIGA trazem nomes e CPF, às vezes mascarado. A remoção de padrões de CPF fica em `packages/domain` (`sem-cpf.ts`) e roda antes de qualquer gravação. Atos individuais de terceiros (LAO de outra empresa, portaria de pessoal) não viram aviso.
10. **Fontes da fase 1 (SC e Joinville):**
    - IMA · Instruções Normativas (página única com as 82 INs, PDF por versão; versão nova = `idVersao` novo);
    - IMA · Portarias (consulta JSON com vigência e "revogada por"; a revogação da IN vem daqui, porque o site das INs não marca);
    - CONSEMA (sitemap e compilações das Resoluções 250 e 251 na SEMAE);
    - DOE-SC (API JSON pública, edições por data e matérias por categoria: IMA, SEMAE);
    - ALESC (leis estaduais, com a Lei 14.675/2009 compilada);
    - DOEM de Joinville (SEI, documentos das unidades SAMA.\*, séries IN, Resolução, Portaria, Lei, Decreto).
11. **Fontes da fase 2 (federal e municípios):**
    - DOU pelo INLABS (XML diário, canal oficial para robôs, conta gratuita; credencial em segredo da Edge Function; o ZIP original fica no Storage porque o INLABS guarda só 4 meses);
    - API de Legislação do Senado (detalhe por URN com as normas que alteram cada lei vigiada);
    - Planalto (texto compilado de leis e decretos, com `ETag`, citando URL, data e "não oficial");
    - Dados abertos do CIGA (DOM-SC, 3 janelas por dia, só pelos downloads em `/dataset`), **depois do aceite do CIGA**.
12. **Fontes fora, e por quê:**
    - API do `dados.sc.gov.br`: o robots.txt bloqueia `/api/`;
    - site, busca e RSS do DOM-SC (`diariomunicipal.sc.gov.br`): robots.txt `Disallow: /`;
    - API CKAN do CIGA (`/api/`): bloqueada no robots.txt; só os downloads do dataset;
    - busca SRU do LexML: desafio anti-robô e `/busca/` proibido no robots.txt;
    - `leiturajornal` da Imprensa Nacional: robots.txt `Disallow: /` e termo de uso que proíbe robôs sem permissão escrita. Só entra como reserva do INLABS se a Imprensa Nacional autorizar por escrito;
    - sites do CONAMA e do IBAMA: robots.txt `Disallow: /` e Cloudflare. As resoluções do CONAMA chegam pelo DOU;
    - `dados.gov.br`: exige token gov.br ligado a CPF;
    - LeisMunicipais, Câmara de Joinville e PDFs do jornal de Itajaí: desafio Cloudflare ou robots.txt que proíbe;
    - Querido Diário: fora do ar desde 19/10/2026; fica como reforço futuro.

    Onde há CAPTCHA, desafio anti-robô ou proibição no robots.txt ou nos termos, o Grama não coleta e não contorna.

13. **Contatos com os órgãos antes da produção:** aviso de cortesia à SEA (DOE-SC), pedido de aceite ao CIGA e conta no INLABS. Quem envia é o Eduardo; os textos estão em `docs/contatos-com-orgaos.md`.

### Resumo por IA e revisão

14. **IA só sobre texto público.** Mesmo provedor de hoje (OpenRouter), com `data_collection: deny`, saída em JSON Schema e prompt versionado no código (`norma-v1`). A IA recebe só o texto da norma e a diferença; nenhum dado de consultoria vai à IA. Ligar a norma aos empreendimentos é SQL e domínio, sem IA. A IA sugere critérios (atividades, licenças, municípios); eles só valem depois que o operador confirma (`origem = 'ia_confirmada'`). A IA nunca muda situação de requisito.
15. **Cota de plataforma.** O resumo é feito uma vez por mudança e serve a todas as consultorias. O custo é da plataforma: fica numa tabela própria em `private` (chamadas e limite, no padrão de `limite_extracao_ia`: teto de resumos por dia e de custo por mês), **fora de `private.uso_de_ia`**, que é por consultoria. Não consome a cota de extração nem de conferência. Se a cota estourar, a mudança aparece sem resumo, com o link oficial.
16. **Mudança só gera aviso depois de publicada.** A mudança detectada aparece na fila "Mudanças para revisar" da Central, com a diferença, o resumo da IA e os critérios sugeridos. O operador do Grama confere e publica (`publicar_mudanca`, que cria os `aviso_norma` numa transação) ou descarta com motivo. Mudança não publicada não aparece para as consultorias. Na tela, o resumo leva o rótulo "Resumo por IA · revisado em dd/mm/aaaa".

### Requisitos legais

17. **Requisito por norma, com dispositivo opcional.** De 10 a 30 por empreendimento. A lista é sugerida pela triagem (atividade CONSEMA → IN do IMA, CONSEMA 250/251, Lei 14.675 e normas do município), não montada à mão. `sugerir_requisitos` é idempotente: só insere os que faltam.
18. **A Triagem grava as atividades no empreendimento** (`atividade_licenciada`, com a versão do catálogo usada), por botão explícito. O município IBGE da unidade é gravado ao salvar o local. Sem isso não há como dizer quem é afetado.
19. **Situações.** Três gravadas (Conforme, Não conforme, Não se aplica) e as outras calculadas em `packages/domain` (Sugerido, Não avaliado, Rever, Ação atrasada). A avaliação só acrescenta (histórico) e guarda a versão da norma avaliada.
20. **Papéis.** A Equipe avalia e cria ação. Só a Gestão marca "Não se aplica", e a justificativa é obrigatória. A regra vale no servidor (RPC), não só na tela.
21. **Plano de ação e evidência.** A ação tem responsável (`membro_id`) e prazo `DATE`, e vira a 7ª fonte de `linhas_de_prazo` (`private.linhas_de_prazo_acao_legal`): aparece na Visão, no Calendário e em "Minhas ações" sem tela nova. A evidência é o documento imutável do Grama ligado ao requisito, com validade opcional.

### Plano e avisos

22. **Plano.** O aviso de mudança de norma vale em todos os planos (o custo é da plataforma). Requisitos, conformidade e relatório ficam no plano Equipe ou acima, com o recurso de plano `legislacao` (check `plano_catalogo_recursos`, `planos.ts`, `recursos.ts` e `catalogo_comercial`).
23. **Como chega o aviso.** No resumo diário do P5, como um tipo de aviso, sem e-mail por mudança. E-mail imediato só quando uma norma que afeta licença ativa for revogada. Sem sino (NOT-03 continua fora).
24. **Quem recebe.** A Gestão e os responsáveis pelas condicionantes da licença afetada. Quem não tem nada a ver com aquela licença não recebe.

### Onde mora na interface

25. **Nenhum item novo no menu.** Cada parte entra como linha nas listas do P0: aba **Normas** em Acompanhamentos, detalhe em `/normas/:id` (fora do menu), grupo **Normas** no Ctrl+K (`private.busca_normas`), seção **Requisitos legais** no Empreendimento, selo "norma mudou" na tabela de licenças, quadro **Conformidade** no Painel (só Gestão) e fila "Mudanças para revisar" na Central do operador.

## Pacotes e ordem

Cada pacote é uma camada no `edukarnopp3/grama`. Nada vai ao Supabase do beta sem revisão. Pacotes da mesma onda não tocam os mesmos arquivos.

| Onda        | Pacote                           | Conteúdo                                                                                                                                                        | Depende de          |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 0 · base    | **L0** catálogo de normas        | Tabelas em `private`, RPCs de leitura, domínio (chave, diferença, classificação, sem CPF), fontes vazias de busca e de prazo, este ADR, carga das 82 INs do IMA | —                   |
| 0 · base    | **L3** triagem grava             | `atividade_licenciada`, `unidade.municipio_ibge`, botão na Triagem, pgTAP negativo                                                                              | em paralelo ao L0   |
| 1 · coleta  | **L1** IMA e CONSEMA             | Coletores de INs, portarias e SEMAE; `pg_cron` + `pg_net` desligados; alerta quando a fonte falha ou muda o formato                                             | L0                  |
| 1 · coleta  | **L2** DOE-SC, ALESC e Joinville | Filtro de categoria e unidade SAMA.\*, remoção de CPF, teste de fumaça diário                                                                                   | L0                  |
| 1 · coleta  | **L4** IA e revisão              | `resumir-mudanca`, cota de plataforma, fila na Central, `publicar_mudanca`                                                                                      | L0                  |
| 2 · telas   | **L5** aba Normas                | `aviso_norma`, aba em Acompanhamentos, `/normas/:id` com diferença, grupo no Ctrl+K, selo na licença                                                            | L0, L3, L4          |
| 2 · telas   | **L6** requisitos legais         | Requisito, avaliação, ação (7ª fonte de prazo), evidência, seção no Empreendimento, recurso `legislacao`                                                        | L0, L3              |
| 2 · telas   | **L7** avisos                    | Tipo "mudança de norma" no resumo diário do P5 e e-mail de revogação                                                                                            | P5, L5              |
| 3 · alcance | **L8** federal                   | INLABS, API do Senado, Planalto com `ETag`                                                                                                                      | L0, conta no INLABS |
| 3 · alcance | **L9** municípios pelo CIGA      | Dados abertos do DOM-SC                                                                                                                                         | L0, aceite do CIGA  |
| 3 · alcance | **L10** relatório e painel       | "Mudanças que afetam você", matriz legal, quadro Conformidade, base legal da condicionante                                                                      | L5, L6              |

Antes do L2, conferir se a API do DOE-SC continua igual. Antes do L8, ler os termos e o esquema do XML do INLABS quando ele sair da manutenção.

## Consequências

- O catálogo não aparece no PostgREST: toda leitura passa por RPC. Quem não é membro ativo de nenhuma consultoria recebe zero linhas (teste negativo no pgTAP).
- A escrita no catálogo é só da service role (coleta) e do operador (publicação). Consultoria nenhuma escreve em norma.
- As 82 INs entram como versão-base: o primeiro dia não gera avisos. A primeira mudança real só aparece depois da segunda coleta com SHA-256 diferente ou de uma portaria de revogação.
- O L0 cria as fontes vazias `private.linhas_de_prazo_acao_legal` (L6) e `private.busca_normas` (L5), como o P0 fez com exigência e vencimento. A guarda de tipo de `prazos.ts` entra junto, para um tipo de linha novo não quebrar a Visão.
- As Edge Functions hoje não importam `packages/domain`. O L0 tenta um import map no `deno.json`; se não der, as regras da coleta ficam em `_shared` com teste Deno, como a conferência.
- Recurso de plano novo (`legislacao`) muda o check do catálogo comercial, o domínio de planos e o front; vai junto com o L6.
- Os coletores dependem de sites de terceiros: mudança de formato deve gerar alerta (`fonte_legal.ultimo_erro`), nunca aviso falso. O INLABS sai do ar às vezes; dia útil sem ZIP gera alerta e reprocessamento.
- Fica a cargo de pessoas: card no ClickUp, atualização do doc 02 com os LEG, do ERD, do CLAUDE.md (escopo) e o envio dos contatos com os órgãos.
