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
5. **Relatório aprovado não vira evidência sozinho.** A conclusão da ocorrência continua exigindo a evidência anexada. Assim a regra de conclusão (DEM-03, DEM-09) não muda nesta camada.

## Consequências

- Tabelas novas com RLS forçada, auditoria e travas de suporte e de só leitura. O pgTAP 700 cobre o negativo de outra consultoria.
- As migrations precisam ir ao banco do beta para as telas novas funcionarem na prévia: `20261120163631_relatorio_no_grama` e as que vêm junto (ver o PR).
- Em aberto: relatório aprovado virar evidência e concluir a ocorrência. Fica para quando o Eduardo decidir.
