# ADR-0028 — Resíduos, fase 1: MTR, CDF, conferência, painel e prazos, sem integração com o IMA (protótipo)

**Situação:** aceita em 14/11/2026 como **protótipo** (o Kadu revisa e provavelmente refaz). Base no estudo `docs/estudos/integracao-ima-mtr.md` (seções 2, 3b e 5). Migration `20261114210000_residuos_mtr_cdf.sql`; teste `supabase/tests/470_residuos.test.sql`; domínio `packages/domain/src/residuos.ts`; API `apps/web/src/lib/api/residuos.ts`; telas em `apps/web/src/app/paginas/residuos/`.

## 1. O que entrou

1. **Registro de MTR e CDF por empreendimento**, digitado pela equipe a partir do que foi emitido no Sistema MTR do IMA, com o PDF anexado (Storage privado, `consultoria_id/mtr|cdf/<uuid>.pdf`, versão imutável).
   - Tabelas `mtr`, `mtr_item`, `cdf`, `cdf_mtr` e `obrigacao_residuo`: `consultoria_id`, RLS forçada (leitura `is_membro`), escrita só por RPC (security definer, uma transação, repetir com o mesmo id devolve o mesmo registro), FKs compostas, auditoria, `row_version` e exclusão lógica em MTR e CDF.
   - Qualquer membro ativo registra, edita e exclui MTR e CDF. Só a Gestão liga e desliga obrigações.
   - Situação do MTR digitada (`salvo | recebido | cancelado | em_armazenamento`, as do IMA). Unidades `t | kg | m3 | l | un`; quantidade com até 4 casas.
2. **Conferência CDF x MTR** e **painel de resíduos** (quantidade por resíduo, destinador e mês), calculados no banco a cada leitura; nada é gravado.
3. **Prazos das obrigações** (DMR trimestral, DMRSU mensal, Inventário Nacional, RAPP do IBAMA), ligadas por empreendimento, calculados no domínio (`prazosDaObrigacaoResiduo`) e no espelho SQL (`private.prazos_da_obrigacao_residuo`), testados com os mesmos casos. Aparecem no calendário, na visão da equipe e na aba Prazos.
4. **Navegação:** item "Resíduos" no menu (`/residuos`), com as abas "MTRs e CDFs" (escolher o empreendimento), "Conferência CDF x MTR", "Painel" e "Prazos". A lista de MTRs e CDFs de um empreendimento fica em `/empreendimentos/:id/residuos`, e a página do empreendimento ganhou a seção "Resíduos". As rotas de `/residuos` contam como "Licenças e prazos" no registro de uso da central e como acompanhamento no tempo ativo.

## 2. Regras de prazo

1. **DMR trimestral:** prazo no último dia do mês seguinte ao trimestre, janela do dia 1 ao último dia desse mês. Transição (Portaria IMA 009/2026, art. 7º), **leitura a confirmar**: a DMR do 1º semestre de 2026 é entregue de 01/07 a 30/09/2026; depois vem a do 3º trimestre de 2026, com prazo em 31/10/2026. Nenhum prazo de DMR antes de 2026.
2. **DMRSU mensal** (prefeituras e aterros de RSU): prazo no último dia do mês seguinte, janela do dia 1 ao último dia.
3. **Inventário Nacional:** até 31/03, sem janela. **RAPP do IBAMA:** de 01/02 a 31/03. A referência dos anuais é "entrega de AAAA" (não escrevemos "ano-base").
4. Prazos são `DATE`, calculados no fuso da consultoria, nunca gravados. A fase 1 não registra se a entrega foi feita: prazo vencido aparece como "Venceu há N dias", não como atraso.

## 3. Regras da conferência e do painel

1. **MTR sem CDF:** MTR salvo ou recebido, sem CDF não excluído, emitido há **mais de 30 dias corridos**. Cancelado e "em armazenamento" ficam de fora.
2. **Quantidade diferente:** item a item, soma do que os CDFs não excluídos informam para o item, comparada com o MTR **sem tolerância**. Converte t↔kg e m³↔L. Entre tipos diferentes (massa, volume, unidade), a pendência é "unidades diferentes". Item sem quantidade no CDF não entra na comparação.
3. **Painel:** massa somada em t, volume em m³; agrupa por mês de emissão, empreendimento, código do resíduo, destinador (sem acento e caixa) e unidade. MTR cancelado não entra. A tela nunca soma unidades diferentes.

## 4. O que fica para a integração (fases 2 e 3 do estudo)

- **Fase 0:** perguntas ao IMA (uso por terceiro, ambiente de teste, endereço oficial com HTTPS, `/emiteCDF` emite ou consulta, fim do login por CNPJ, termo de uso ou procuração).
- **Fase 2, só leitura:** consultar a situação dos MTRs, baixar o PDF do CDF e usar as listas oficiais de resíduo e classe, com um cliente-piloto. Hoje a situação é digitada e o código do resíduo é texto livre.
- **Fase 3:** emitir e cancelar MTR pelo Grama, com `seuCodigoReferencia` (o id do MTR no Grama) contra duplicidade.
- Tudo isso em Edge Function. DMR, DMRSU e PGRS continuam pela tela do IMA (sem API documentada). O CDF não é emitido pela consultoria (art. 10).

## 5. Decisão do Eduardo sobre a senha do MTR (para as fases 2 e 3)

O Eduardo aceita que, no futuro, o Grama guarde a senha do Sistema MTR de cada cliente, nestas condições:

1. **Usuário próprio do Grama** em cada cliente, criado pelo administrador do cliente no Sistema MTR. Nunca a senha do administrador.
2. **Cofre:** a senha fica criptografada (Supabase Vault). A tela recebe a senha uma vez, no cadastro, e nunca mais a mostra.
3. **Só a Edge Function** lê a senha e fala com o IMA. O navegador nunca fala com o IMA; nada de senha, URL ou corpo de chamada em log.
4. **Revogável:** o cliente apaga o usuário ou troca a senha, e o Grama apaga a credencial.
5. **Cláusula no contrato** com o cliente: autorização expressa, escopo (consultar ou também emitir e cancelar), responsabilidade legal do gerador, revogação e tratamento de dados (validar com advogado).

A fase 1 **não** guarda senha, CPF nem credencial. O login por CPF exigiria outra exceção à regra de CPF e não está decidido.

## 6. Pendências para revisar

- Leitura da transição da DMR (art. 7º) e o texto "entrega de AAAA" dos anuais.
- Tons dos selos de situação do MTR e das pendências (escolha de apresentação).
- Sem número único de CDF; até 100 itens por MTR e 500 MTRs por CDF; emissão no futuro recusada.
- O texto original da data não é guardado (digitação manual); muda se entrar leitura do PDF.
- A aba "Prazos" lista os prazos sem paginação (no máximo cerca de um ano por consulta).
