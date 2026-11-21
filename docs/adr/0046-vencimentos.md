# ADR-0046: Outros vencimentos (alvará vira vencimento com tipo)

- **Situação:** aceito em 20/11/2026. Pacote P4 do estudo "Oito funções no Grama" (função 4, pergunta 5); o Eduardo aceitou todas as recomendações do estudo. O Kadu revisa.
- **Revê:** ADR-0041, item 5 (alvará na fonte própria `private.linhas_de_prazo_alvara`) e o ERD v1 (alvará como marca no instrumento).
- **Depende de:** ADR-0041 (base das oito: fontes de prazo e de busca, `SECOES` e `ACOES` do Empreendimento, abas de Configurações).

## Contexto

A consultoria controla, além das licenças, documentos do empreendimento que só têm validade: alvará, ART, CTF IBAMA do empreendimento, outorga, AVCB e certidões. Hoje só o alvará existe, numa tabela própria (`alvara`, migration `20261117184545_cria_alvara.sql`), que já está no beta com dados reais. Uma tabela por documento é o que os concorrentes evitam; o estudo recomendou generalizar o alvará num vencimento com tipo, sem condicionante, sem tarefa e sem a regra dos 120 dias.

## Decisão

1. **`tipo_vencimento` por consultoria**: nome (único sem acento e sem caixa), antecedência padrão em dias (60), `exige_pdf` e `ativo`. Semeado como o `tipo_instrumento`: trigger depois de criar a consultoria e preenchimento das existentes na migration, com Alvará (exige PDF, ALV-01), ART, CTF IBAMA, Outorga, AVCB e Certidão. A Gestão cria, renomeia, muda a antecedência e o `exige_pdf` e desativa. Não há exclusão de tipo.
2. **`vencimento`**: empreendimento obrigatório; unidade, licença (instrumento) e responsável técnico (para a ART) opcionais; número, órgão e notas; `emitido_em` e `valido_ate` como `DATE`, cada um com o texto original; antecedência em dias copiada do tipo e editável; PDF opcional, obrigatório só quando o tipo exige; `anterior_id` para a renovação (no máximo um sucessor vivo); `row_version`; exclusão lógica; auditoria. RLS forçada (lê quem é membro), FKs compostas, escrita só por RPC da Gestão.
3. **Situação calculada, nunca gravada** (`packages/domain/src/vencimento.ts`): renovado (tem sucessor vivo) > vencido (validade antes de hoje) > a vencer (faltam até a antecedência, inclusive) > vigente. Substitui `situacaoDoAlvara`.
4. **Renovar** cria um vencimento novo ligado ao anterior, do mesmo empreendimento, unidade e tipo, numa transação. O anterior fica guardado com o PDF e deixa de gerar prazo. Excluir o novo devolve ao anterior o papel de vigente; não se exclui um vencimento que já foi renovado.
5. **Prazo e busca**: só `private.linhas_de_prazo_vencimento` (`tipo_linha` `'vencimento'`, sem responsável, prazo = `valido_ate`, só o vigente da série) e `private.busca_vencimentos` (tipo, número e órgão) são redefinidas. A união, `listar_prazos`, `contar_prazos`, `listar_calendario` e `buscar_no_grama` não mudam.
6. **Conversão do alvará** (aditiva): cada alvará vira um vencimento do tipo Alvará com o **mesmo id**, o mesmo documento (PDF), o mesmo `anterior_id`, autor, exclusão e `row_version`. A tabela `alvara` e as quatro RPCs dela ficam. `private.linhas_de_prazo_alvara` passa a `where false`, para o prazo não sair duplicado.
7. **As RPCs antigas do alvará continuam escrevendo em `vencimento`**: uma trigger em `alvara` espelha cada inclusão e alteração no vencimento de mesmo id, para o front antigo do beta não perder dado entre a migration e a publicação do front novo. O espelho é de mão única (o front novo nunca escreve em `alvara`), nunca desfaz a exclusão de um vencimento e recusa excluir um alvará cujo vencimento já foi renovado.
8. **Front**: seção "Vencimentos" no Empreendimento no lugar da "Alvarás" (uma linha em `SECOES`), ação "Novo vencimento" no "…" do Empreendimento, só Gestão (uma linha em `ACOES`), e aba "Vencimentos" em Configurações para os tipos (uma linha em `ABAS_DE_CONFIGURACOES`). O front novo não usa mais `alvara`.

### Decisões conservadoras (não estavam na especificação nem no estudo)

- O prazo do vencimento entra na Visão e no Calendário sempre que for o vigente da série, como a validade da licença e o alvará de hoje. A antecedência não esconde a linha: ela muda a situação para "a vencer" (e servirá aos avisos do P5).
- Tipo desativado continua aparecendo nos vencimentos que já o usam e pode ser renovado; só não serve para vencimento novo. Renomear o tipo muda o nome em todos os vencimentos dele. Mudar a antecedência do tipo não muda a dos vencimentos já cadastrados.
- Texto da linha de prazo: título = tipo + número ("Alvará 200/2026"); coluna Licença = a licença ligada, quando houver. Sem unidade, `unidade_nome` vem vazio.
- Alvarás convertidos não têm o texto original da validade (o alvará nunca o guardou): fica nulo.
- A coluna "Próxima validade" da lista de Empreendimentos e o link do vencimento no Calendário (que pediria `empreendimento_id` em `listar_calendario`) ficam para depois.
- O CTF e o registro do membro continuam em `registro_profissional`; `obrigacao_residuo` continua à parte.

## Consequências

- Duas migrations aditivas, depois da base: a que cria tipos, vencimentos, RPCs e as duas fontes, e a de conversão do alvará com a trigger de espelho. A conversão roda no beta com dados reais e não apaga nada.
- O pgTAP 710 continua com 41 testes, mas as linhas dos alvarás mudam de propósito: passam de `'validade'` ("Validade do alvará") para `'vencimento'` ("Alvará", "Alvará 200/2026"), com a coluna Licença vazia. O 560 muda do mesmo jeito nas três leituras de `listar_prazos`. Os testes do pacote ficam em 750–759.
- `SecaoAlvaras`, `DialogoAlvara`, `lib/api/alvaras.ts` e `situacaoDoAlvara` saem do front; `idsRenovados` vai para `vencimento.ts`.
- Quando não houver mais front antigo, uma pessoa decide se a tabela `alvara`, a trigger de espelho e as RPCs antigas podem sair (migration própria). O ERD precisa trocar o alvará-marca pelo vencimento com tipo.
