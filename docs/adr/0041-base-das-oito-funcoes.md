# ADR-0041: Base comum das oito funções (menu, Configurações e fontes de prazo)

- **Situação:** aceito em 20/11/2026. O Eduardo respondeu às 10 perguntas do estudo "Oito funções no Grama sem abrir janelas novas" com "manda bala em tudo": valem todas as recomendações do estudo. O Kadu revisa.
- **Revê:** o menu do Protótipo 05.
- **Depende de:** ADR-0039 (identidade visual) e ADR-0040 (relatório no Grama). A camada `camada/base-das-oito` sai da `camada/relatorio-no-grama` (#16) e junta a `camada/registro-profissional` (#3) e a `camada/planejamento` (#4).

## Contexto

O estudo distribui oito funções (importar planilha, renovação que vira orçamento, exigências do órgão, outros vencimentos, avisos, cliente final, dinheiro do trabalho e painel do dono) por telas que já existem, em pacotes paralelos. Para os pacotes da onda 1 não disputarem os mesmos arquivos, o pacote P0 prepara a base: menu, rotas, componentes comuns e as funções do banco que todos leem.

## Decisão

1. **Menu.** A Gestão passa de 11 para 9 itens e a Equipe de 7 para 6:
   - entra **Configurações** (`/configuracoes`), com as abas Equipe, Plano e cobrança, Orçamentos (Custos e taxas e Dados da proposta), Modelos e Importar (esta só aparece com o pacote P1);
   - a **Triagem de licenciamento** sai do menu e passa a ser aberta pelo Ctrl+K, pelo Empreendimento, pela licença (plano de renovação) e pelo orçamento. Esses três mandam `?empreendimento=<id>`; no P0 a Triagem só põe o nome do empreendimento no link de volta (id que não é uuid ou não vem do banco é ignorado). Pré-preencher o local ou as atividades a partir do empreendimento fica para quando houver de onde tirar esses dados;
   - o **Planejamento** (camada #4) também fica fora do menu e abre pelo Ctrl+K, só para a Gestão com o recurso `capacidade`;
   - **Resumo do mês** vira **Painel** (`/painel`; `/resumo-do-mes` redireciona);
   - **Acompanhamentos** mantém o nome; a aba Exigências entra com o pacote P3.

   Diverge do Protótipo 05 (decisão de produto do Eduardo, pergunta 1 do estudo).

2. **Ctrl+K com lista própria.** `ATALHOS_DA_BUSCA` fica separado de `ITENS_NAVEGACAO`: tirar uma tela do menu não a tira da busca.
3. **Componentes comuns.** `BotaoMais` (o "…") e `Abas` substituem as versões feitas à mão. `Abas` tem três formas com o mesmo desenho: `Abas` (estado da tela, com painel), `AbasDeFiltro` (filtros da mesma lista, botões com `aria-pressed`: situação dos orçamentos) e `AbasDeRota` (Configurações e Resíduos). O Empreendimento passa a ter uma ação principal e um "…"; as ações e as seções dele ficam em arquivo próprio, para cada pacote acrescentar uma linha.
4. **Prazos em fontes.** `private.linhas_de_prazo` vira a união de funções por fonte (ocorrência, validade, limite de protocolo, alvará, exigência e vencimento). Exigência e vencimento nascem vazias; cada pacote redefine só a sua. Nas linhas novas, `instrumento_id` é a licença ligada (ou nulo), `tipo_id` e `situacao_ocorrencia` são nulos. `listar_prazos` e `contar_prazos` ganham `p_cliente_id` (para o Painel abrir a Visão filtrada por cliente). A busca (`buscar_no_grama`) segue o mesmo desenho, com os grupos Exigências e Vencimentos vazios.
5. **Alvará vira "vencimento" com tipo** (pergunta 6). A troca é do pacote P4: no P0 o alvará da camada planejamento entra como está, numa fonte própria (`private.linhas_de_prazo_alvara`) que o P4 esvazia.
6. **`prazoDeOficio` volta ao domínio.** A vistoria geral (commit `722dd0e`) apagou `prazoDeOficio` e `diaUtilAnterior` por falta de uso. O pacote P3 (exigências) conta o prazo do ofício com essa regra, então ela volta com os testes, em vez de ser escrita de novo.
7. **Barreira comercial.** O teste de estrutura ganha uma lista de exceções: `preferencia_aviso` e `feed_calendario` (pacote P5). Consultoria inadimplente não pode impedir alguém de parar de receber aviso.

## Consequências

- Uma migration aditiva no P0 (fontes de prazo e de busca, filtros por cliente e a constraint `documento_entidade_valida` com `exigencia`, `exigencia_resposta`, `vencimento` e `importacao`). Ela precisa ir ao beta antes das telas novas.
- O pgTAP 710 fixa, com valores do cenário do próprio teste, o que `listar_prazos`, `contar_prazos`, `listar_calendario` e `buscar_no_grama` devolviam antes da refatoração.
- Os links antigos (`/resumo-do-mes`, `/configuracoes/custos`, `/configuracoes/proposta`, `/configuracoes/modelos`) continuam funcionando.
- O ERD (alvará como marca na licença) e o Protótipo 05 precisam ser atualizados por uma pessoa.
