# ADR-0040: Relatório escrito no Grama, com revisão e IA no texto

- **Situação:** aceito em 20/11/2026. O Eduardo aprovou ("Sim, fazer"); o Kadu revisa.
- **Revê:** a decisão 2 da ADR-0036 ("o rascunho do relatório não fica no Grama").
- **Depende de:** ADR-0036 e ADR-0037 (modelos e conferência por IA) e ADR-0039 (identidade visual). A camada `camada/relatorio-no-grama` junta a `identidade-nova` (#15, que traz a #10) e a `conferencia-ia` (#11, que traz a `vistoria-geral` #6).

## Contexto

O pedido do Eduardo, nas palavras dele: "um módulo de texto integrado pra poder escrever os documentos ali mesmo... e principalmente durante a revisão colocar uma IA que já dá uma revisada nos documentos e pode indicar alguns pontos que estão incorretos para quem for conferir, ou até antes mesmo". Modelos de layout e papel timbrado não são prioridade.

## Decisão

1. **O relatório vive no Grama.** Nasce de um modelo, já preenchido pelo domínio (`preencherModelo` + `dados_para_relatorio`), e é editado no mesmo editor TipTap dos modelos.
   - A tabela `relatorio` guarda o estado atual: título, conteúdo, situação, `row_version`, autor, revisor e motivo da devolução.
   - A tabela `relatorio_versao` guarda uma linha por conteúdo salvo, append-only, com autor e instante.
2. **Revisão.** A situação vai de `rascunho` para `em_revisao`, depois para `devolvido` (com motivo) ou `aprovado`.
   - **Edita:** o autor (ou a Gestão) no rascunho e no devolvido. Na revisão, quem confere: o conferente designado da ocorrência ou, sem ele, a Gestão.
   - **Corrige:** o revisor corrige no mesmo texto, e a correção vira uma versão nova.
   - **Aprova ou devolve:** com a conferência independente da consultoria, quem escreveu não aprova nem devolve.
   - **Aprovado:** não se edita.
   - **RPCs:** `criar_relatorio`, `salvar_relatorio` (versão nova na mesma transação, controle otimista, sem versão quando nada mudou), `enviar_relatorio`, `devolver_relatorio`, `aprovar_relatorio` e `permissoes_do_relatorio` (só para a tela).
3. **O Word é a saída.** "Exportar .docx" gera o arquivo no navegador, como na fatia 2 da ADR-0036. O caminho antigo continua: anexar um .docx ou PDF pronto como evidência.
4. **IA no texto.** A `conferencia_ia` passa a conferir a evidência ou uma versão do relatório, nunca os dois. `iniciar_conferencia_relatorio` devolve o conteúdo da versão e o contexto do cadastro. A Edge Function `conferir-relatorio` lê o texto do JSON do editor (`textoDoDocumento`) e roda as mesmas regras fixas e a mesma IA, com a cota somada à da extração.
   - O apontamento ganha `substituicao`: o texto exato que troca o trecho (prompt `conferencia-v2`).
   - Na tela, o trecho fica sublinhado no editor. "Aplicar sugestão" troca o trecho, e "Ignorar" grava o índice em `conferencia_ia.ignorados` (`ignorar_apontamento`).
   - "Conferir antes de enviar" salva e confere enquanto a pessoa escreve. Enviar para revisão também confere. A IA não bloqueia nada.
5. **O relatório aprovado vira a evidência da ocorrência sozinho** (decisão do Eduardo, 20/11/2026: "vira evidência da ocorrencia sozinho").
   - **Arquivo:** ao aprovar, a tela gera o .docx da versão aprovada, com o mesmo gerador do "Exportar .docx", e o envia ao Storage como objeto novo e imutável em `consultoria_id/evidencia/<uuid>.docx`. Gerar o .docx no Postgres não é possível, e numa Edge Function seria outro motor de conversão para manter igual ao do navegador. Por isso a evidência é um arquivo de verdade, e não um ponteiro para a versão do relatório. Assim nada muda em quem lê evidência (lista, download, conferência por IA, conclusão).
   - **Banco:** `aprovar_relatorio` confere o objeto (caminho, MIME .docx, tamanho) e, na mesma transação da aprovação, registra a versão do documento (nome original, MIME, tamanho, SHA-256, autor e instante), a evidência com a data real de execução informada por quem aprova (DEM-09) e a conferência aprovada por quem revisou. `relatorio.evidencia_id` aponta para ela.
   - **Sem atalho:** a evidência sai "enviada" por quem escreveu e "conferida" por quem revisou, com o mesmo critério de `conferir_evidencia` (conferente designado ou Gestão, nunca o autor com a independência ligada). A ocorrência fica em conferência com a última evidência aprovada, e só a Gestão conclui, por `concluir_ocorrencia`, como hoje.
   - **Ocorrência fechada ou ocupada:** com a ocorrência concluída (`ocorrencia_concluida`) ou com outra evidência esperando conferência (`aguardando_conferencia`), a aprovação é recusada. Primeiro se resolve a ocorrência.
   - **Sem ocorrência:** o relatório só fica aprovado, com "Exportar .docx".
   - Se a aprovação falhar depois do envio, o objeto fica sem uso no Storage, como qualquer envio interrompido.

## Consequências

- Tabelas novas com RLS forçada, auditoria e travas de suporte e de só leitura. O pgTAP 700 cobre o negativo de outra consultoria.
- As migrations precisam ir ao banco do beta para as telas novas funcionarem na prévia: `20261120163631_relatorio_no_grama` e as que vêm junto (ver o PR).
