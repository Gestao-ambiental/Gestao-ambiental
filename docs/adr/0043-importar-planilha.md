# ADR-0043: Importar planilha de empreendimentos e licenças

- **Situação:** aceito em 20/11/2026. O Eduardo aceitou todas as recomendações do estudo "Oito funções no Grama sem abrir janelas novas" (pacote P1, função 1). O Kadu revisa.
- **Muda:** a regra "ativar exige condicionantes revisadas" (09 Regras de negócio, linha 23) para a licença importada, e a recusa de CPF passa a valer também para a planilha.
- **Depende de:** ADR-0041 (base das oito funções: aba em Configurações e `documento_entidade_valida` com `importacao`).

## Contexto

A consultoria chega ao Grama com a carteira numa planilha. Cadastrar licença por licença, com condicionantes, adia o primeiro valor (Visão, Calendário e radar de renovação) por semanas. Nenhum concorrente brasileiro tem importação feita pela própria consultoria; o padrão do nicho é migração assistida.

O estudo apontou quatro riscos: a biblioteca de planilha do npm tem falhas conhecidas na leitura de arquivo não confiável; a planilha pode trazer CPF; o limite do plano em lote; e desfazer sem apagar dado de auditoria.

## Decisão

1. **Onde mora.** Configurações › aba **Importar** (`/configuracoes/importar`, uma linha em `ABAS_DE_CONFIGURACOES`; o Ctrl+K a encontra como "Importar planilha") e ação secundária no estado vazio de Empreendimentos. **Só a Gestão** importa: o banco barra a Equipe, o front só esconde.
2. **Duas entidades, uma por importação.** "Empreendimentos" (empreendimento, cliente, CNPJ, unidade, endereço) e "Licenças" (as mesmas colunas mais tipo, número, órgão, emissão e validade). O modelo `.xlsx` de cada uma é gerado no navegador, só com o cabeçalho.
3. **Leitura no navegador.** SheetJS 0.20.3 pelo tarball de cdn.sheetjs.com (o `xlsx@0.18.5` do npm tem CVE-2023-30533 e CVE-2024-22363), num Web Worker. CSV em UTF-8, com recuo para windows-1252, e separador `;` detectado. Aceita `.xlsx` e `.csv` de até 5 MB e 1.000 linhas.
4. **CPF nunca sai do aparelho.** Coluna com cara de CPF (cabeçalho ou valores) é descartada no Worker. Valor com cara de CPF em outra coluna vira vazio, com erro na linha. O banco recusa o lote que ainda trouxer CPF, sem gravar nada. O arquivo bruto não é guardado.
5. **Banco.** Tabelas `importacao`, `importacao_linha` (área de conferência: nada toca as tabelas reais antes de efetivar) e `importacao_mapeamento` (o último mapeamento de colunas por consultoria e entidade). RPCs numa transação cada, todas idempotentes: `criar_importacao`, `enviar_linhas_da_importacao` (lotes de 200), `conferir_importacao`, `efetivar_importacao` e `desfazer_importacao`. O banco refaz a conferência ao efetivar.
6. **Conferência em três abas:** Prontas | Com aviso | Com erro. Linha com erro não entra; o resto entra. **Duplicidade é aviso, nunca erro**: empreendimento ou licença que já existe não é criado de novo (a licença entra no empreendimento existente). Importar a mesma planilha duas vezes não duplica nada.
7. **Chaves de duplicidade.** Empreendimento: CNPJ quando houver; senão, nome e cliente normalizados. Mesmo nome com outro cliente ou CNPJ é aviso "parecido" e cria. Licença: tipo, número e órgão normalizados.
8. **Licença importada é "somente validade".** Nova coluna `instrumento.somente_validade`: a licença fica ativa sem condicionantes, entra na Visão e no Calendário pela validade (e pelo limite de protocolo, se for LAO), ganha plano de renovação quando é LAO e conta no limite do plano. Leva o selo "Sem condicionantes" onde a licença aparece.
9. **Limite do plano em lote.** A conferência mostra quantos empreendimentos passam a ter licença ativa, o limite e o adicional mensal. Ao efetivar com `p_confirmar_adicional`, o banco grava uma confirmação em `adicional_confirmado` para a quantidade final, como `confirmar_adicional` faz para uma. Sem confirmação, recusa com `adicional_nao_confirmado`.
10. **Desfazer em até 24 h, por exclusão lógica.** `empreendimento`, `unidade` e `instrumento` ganham `excluido_em` e `excluido_por`, e a leitura (RLS) passa a esconder o excluído. A licença desfeita também volta a `rascunho`, para sair de toda contagem de licença ativa. Só é desfeito o que a importação criou e ninguém mudou depois; o resto fica, e a importação diz o motivo por linha.

### Decisões conservadoras (sem regra escrita; escolhida a opção mais segura)

- **Emissão obrigatória** na licença: vira o marco (`emissao`), e a regra `instrumento_ativo_completo` não é afrouxada. Emissão no futuro é erro (como no cadastro).
- **Tipo de licença desconhecido é erro**; a importação não cria tipo novo.
- **Licença vencida** entra, com aviso.
- **Ano com dois dígitos** é data inválida. Aceitos: dd/mm/aaaa, aaaa-mm-dd e a data do Excel.
- **CNPJ** só pelo formato (14 caracteres), como o banco já faz; sem conferir dígitos.
- **Célula numérica no Excel perde o zero à esquerda.** No CNPJ, o número ganha os zeros de volta só quando o CNPJ completo tem os verificadores certos (senão fica como veio e é "CNPJ incompleto"). Número de 9 a 11 dígitos que, completado, é CPF válido conta como CPF (sai da linha ou derruba a coluna); número menor não, para um número de licença curto não virar CPF por acaso.
- **CPF também fora do nome do arquivo e dos cabeçalhos.** O navegador tira do nome do arquivo o que tem cara de CPF; coluna cujo "cabeçalho" é um CPF (planilha sem cabeçalho) é descartada; e `criar_importacao` recusa com `cpf_nao_aceito` nome ou mapeamento que ainda tragam CPF.
- **Empreendimento que já existe mais de uma vez** (mesma chave): na aba Empreendimentos é aviso e a linha é pulada (duplicidade nunca é erro); na aba Licenças é erro, porque não há como saber em qual deles a licença entra.
- **Unidade em branco:** licença usa a única unidade do empreendimento existente; com várias, é erro; sem nenhuma, cria "Matriz" (o nome que o cadastro já sugere). Endereço sem unidade é erro.
- **Empreendimento que já existe** não ganha unidade nova pela aba Empreendimentos (a linha é pulada).
- **Sem "Completar condicionantes"** neste pacote: só o selo. Completar fica para depois.
- **Cliente criado pela importação fica** ao desfazer (pode já estar em uso; não tem exclusão lógica).
- **A confirmação do adicional fica** ao desfazer (`adicional_confirmado` é de cobrança e só recebe linhas).
- **Desfazer mantém** o que tem qualquer outro dado ligado (orçamento, resíduos, relatório, alvará, condicionante, PDF, extração, protocolo ou plano de renovação alterado) ou foi editado depois. A busca de dependentes lê as chaves estrangeiras do catálogo, então tabela nova entra sozinha.
- **Linhas guardadas** sem prazo de descarte (histórico e "Baixar erros"). Não há CPF nelas.
- **Auditoria** na `importacao` e nas licenças (motivo `importacao:<id>` e `desfazer_importacao:<id>`); não nas linhas nem no mapeamento.
- **Sem modelo com linha de exemplo**: dado de exemplo nunca substitui dado ausente (09 Regras de negócio, linha 19).
- **Sem Edge Function**: nada de segredo nem de rede externa.

## Consequências

- Uma migration aditiva: três tabelas, quatro colunas por tabela existente (`excluido_em`, `excluido_por` em três; `somente_validade` em `instrumento`), as políticas de leitura de `empreendimento`, `unidade` e `instrumento` com `excluido_em is null`, e a guarda de `private.instrumento_para_editar` contra licença desfeita. O pgTAP 710 continua 41/41.
- Leitura com `service_role` ou `security definer` que não filtra licença `ativo` ainda enxerga empreendimento e unidade desfeitos (ex.: métricas da central). As contagens de licença ativa já não os veem.
- Muda a regra 09:23 e o fluxo do Protótipo do cadastro: a documentação precisa ser atualizada por uma pessoa.
- `database.types.ts` foi editado à mão no formato do gerador; o CI gera o definitivo.
