# ADR-0059: Correções da auditoria de segurança do PR #44

- Situação: proposta (camada `camada/correcoes-seguranca`)
- Data: 22/11/2026
- Revê: ADR-0053 (dinheiro do trabalho), ADR-0045 (exigências), ADR-0058 (acesso pago)

## Contexto

A auditoria do PR #44 (`camada/previa-tudo`, commit 594dcaa) achou seis problemas: um alto, dois médios e três baixos. Em dois deles, uma comparação com nulo, de autor ou de responsável, deixava passar quem deveria ser recusado.

## Decisão

Tudo entra na migration `20261122010500_correcoes_de_seguranca.sql`, que só acrescenta. Nenhuma função pública troca de assinatura nem de retorno.

1. **`remover_apontamento`**:
   - antes de travar a linha, exige um vínculo ativo na consultoria do apontamento;
   - depois disso, remove só o autor ou quem tem a permissão financeira.

   As outras escritas do P7 já usam `is_financeiro`/`is_membro`, que nunca dão nulo, e o `lancar_horas` recusa autor nulo. Nenhuma delas mudou.

2. **Exigência**: `exigencia_para_responder` trata a falta de responsável como recusa. Numa exigência sem responsável, só a Gestão responde ou anexa.
3. **Teste grátis**: `abrir_consultoria` trava a pessoa, o e-mail e o CNPJ, sempre nessa ordem. Depois das travas, confere de novo se a consultoria já existe. A reserva em `private.teste_usado` é um `insert ... on conflict do nothing` na chave única, feito antes de criar a consultoria: só quem insere ganha o teste.
4. **Alvará**: o atalho de reenvio de `registrar_alvara` só procura a versão na mesma consultoria e na mesma unidade. Uma versão de outra consultoria recebe `versao_existente`, a mesma resposta de qualquer versão já usada.
5. **Datas civis**:
   - Toda coluna `date` das tabelas do schema `public` ganha a constraint `data_civil_*`: a data precisa ser finita e ficar entre 1900-01-01 e 2199-12-31 (`private.data_civil_valida`).
   - A constraint é `not valid`: vale para as escritas novas, e um dado antigo fora da faixa continua no banco.
   - As fontes de prazo e `listar_exigencias` ignoram só o item com data inválida, então a lista não cai.
   - No domínio ficam `dataCivilNaFaixa`, `DATA_CIVIL_MINIMA` e `DATA_CIVIL_MAXIMA`. O `CampoData` recusa datas fora da faixa e a tela traduz a constraint em mensagem.
6. **Etapas**: no máximo 200 por ocorrência (`LIMITE_DE_ETAPAS`). Um gatilho recusa a 201ª com `limite_de_etapas` e trava a ocorrência antes de contar. A tela busca as etapas em páginas de 200 até o fim, então as ocorrências antigas com mais etapas continuam mostrando todas.

## Consequências

- pgTAP 800 cobre as seis correções: os negativos de outra consultoria, de membro desligado e de pessoa sem vínculo, as travas do acesso pago e o dado antigo inválido.
- Tabela nova com coluna `date` precisa da constraint `data_civil_*` na própria migration.
