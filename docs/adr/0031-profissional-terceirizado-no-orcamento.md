# ADR-0031 — Profissional terceirizado no orçamento

**Situação:** aceita em 14/11/2026 como **protótipo** (o Kadu revisa). Migration `20261115020000_terceirizado_no_orcamento.sql`; teste `supabase/tests/510_terceirizado_no_orcamento.test.sql`; domínio `packages/domain/src/preco-do-orcamento.ts` (`custoDoTerceiro`, `precificarOrcamento`); tela `apps/web/src/app/paginas/orcamentos/PaginaOrcamento.tsx` (`CelulaResponsavel`, `CamposDoTerceiro`).

## 1. Contexto

O ADR-0018 (P6) decidiu que o terceiro sem login entraria como custo ou despesa do serviço. Isso funcionava por "Outros custos (R$)" e "Despesas de terceiros", ambos sem acréscimo e sem dizer quem era o terceiro. O Eduardo pediu a opção de adicionar um profissional terceirizado no orçamento, sem precisar de login.

## 2. Decisões do Eduardo (14/11/2026)

1. **Onde:** no "Responsável" de cada serviço, que ganha a opção "Terceirizado". O terceirizado tem nome e profissão e não conta na carga da equipe.
2. **Custo:** por hora (vezes as horas do serviço) ou valor fechado pelo serviço inteiro.
3. **Preço ao cliente:** leva o acréscimo do orçamento. "Pela margem", o acréscimo incide também sobre o custo do terceiro. "Pela tabela", o serviço continua com a linha da tabela de preços, e o custo do terceiro só reduz a margem.
4. **Proposta:** não mostra o terceirizado. Como já era, custo e responsável não aparecem.

## 3. Regras implementadas

- **Dados no item:** `terceiro_nome` (obrigatório para ser terceirizado, até 120 caracteres), `terceiro_profissao` (lista fixa do ADR-0021, opcional), `terceiro_cobranca` (`hora` ou `fechado`) e `terceiro_valor_centavos` (nulo = a informar).
- **Restrições na tabela:**
  - os quatro campos vazios, ou nome com cobrança;
  - terceirizado nunca tem `responsavel_id`;
  - `salvar_orcamento` recusa responsável com terceirizado e cobrança fora de hora/fechado (`item_invalido`).
- **Custo do serviço:** valor do terceiro + "Outros custos".
  - Por hora: round(minutos × valor ÷ 60).
  - Fechado: o próprio valor.
  - **Sem rateio das contas do mês**, porque a hora não é da equipe. Esta escolha é do Claude e está na seção 5 para confirmar.
- **"Pela margem":** a venda do serviço é o custo do terceiro, que entra na base do acréscimo como as horas de venda. A linha da tabela não é usada nem exigida.
- **"Pela tabela":** o preço vem da linha da tabela (ou do preço digitado), como antes; o terceiro muda só o custo e o lucro.
- **Sem base de custos (orçamento rápido):** nada muda; vale o preço digitado.
- **Valor em branco:** o preço fica pendente ("Informe o valor do terceirizado para calcular o preço.").
- **Duplicar:**
  - o terceirizado vai junto;
  - com os preços, leva o valor;
  - sem os preços, o valor fica em branco e o preço pendente, como as outras estimativas.
- **Modelo da consultoria:** não guarda o terceirizado, assim como não guarda o responsável.
- **Divisão do valor:** ganha a linha "Terceirizados"; o "Custo da equipe" passa a excluí-los.
- **Domínio e banco** dão os mesmos centavos (`private.itens_do_preco` e `private.preco_pendente` mudaram no lugar, com as mesmas concessões).

## 4. Tela

No "Responsável pelo item", a última opção é "Terceirizado". Escolhida, aparecem embaixo:

- "Nome";
- "Profissão" (lista do Grama);
- "Por hora" ou "Valor fechado";
- o valor em reais.

Escolher um membro de novo descarta o terceirizado. Sem nome, o salvar avisa "Item N: informe o nome do terceirizado.".

## 5. Para o Eduardo confirmar

- **Rateio das contas:** hoje o serviço terceirizado não leva rateio das contas do mês (aluguel, energia…). Se a consultoria quiser que ele também pague parte da estrutura, basta incluir o rateio pelas horas do serviço.

## 6. Fica para depois

- Mais de um profissional no mesmo serviço (fatia 7 do ADR-0018).
- Cadastro de terceirizados frequentes para escolher numa lista, em vez de digitar o nome a cada orçamento.
