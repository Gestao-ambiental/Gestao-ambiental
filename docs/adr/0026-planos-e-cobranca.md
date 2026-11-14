# ADR-0026 — Planos, limites, teste grátis, só leitura por atraso e cobrança (protótipo)

**Situação:** aceita em 14/11/2026 como **protótipo funcional** (decisão do Eduardo: ver as telas funcionando; o Cadu revisa e provavelmente refaz). Migrations `20261114150000_planos_e_limites.sql` e `20261114160000_cobranca_simulada.sql`; testes `supabase/tests/410_planos_e_limites.test.sql`, `420_cobranca_simulada.test.sql` e duas regras novas no `020_estrutura.test.sql`; domínio `packages/domain/src/planos.ts` e `documento.ts`; front em `apps/web/src/app/plano/` e `app/paginas/central/PaginaCentralFinanceiro.tsx` e `PlanoNaCentral.tsx`.

## 1. Decisões do Eduardo

1. **Planos** (centavos inteiros + BRL): Essencial R$ 990/mês (3 pessoas, 10 empreendimentos ativos, sem orçamentos, sem IA); Equipe R$ 1.290/mês (10 pessoas, 30 empreendimentos, com orçamentos e IA); Escala R$ 2.990/mês (25 pessoas, 100 empreendimentos). **Anual = 10 mensalidades**, pago de uma vez. O catálogo vive em `PLANOS` (domínio) e em `private.plano_catalogo` (banco).
2. **Orçamentos só no Equipe e no Escala.**
3. **Passar do limite é permitido** e custa **R$ 20/mês** por pessoa ou empreendimento a mais. Antes da ação que passa do limite, a Gestão vê o novo valor mensal e confirma.
4. **Teste grátis de 10 dias úteis**, ajustável por consultoria na central.
5. **Cobrança:** Pix ou cartão (sem boleto), mensal ou anual; CNPJ **ou** CPF de quem paga. O CPF nunca é gravado (nem banco, nem log, nem armazenamento do navegador).
6. **Atraso:** aviso à Gestão; depois de **2 dias úteis** de atraso, **só leitura para todos** (veem tudo e baixam arquivos; ninguém cria nem edita) até pagar. O mesmo vale para teste acabado sem plano.
7. **Contas internas** (Envora, consultoria do Mateus): grátis para sempre, sem limite, sem cobrança, nunca bloqueiam. Marcadas pela central (operador com dois fatores, com motivo, no histórico). A migration não identifica nem altera consultorias por nome ou id.
8. **Situação e atraso são calculados, nunca gravados**: regra pura no domínio (`situacaoComercial`) e função equivalente no banco (`private.situacao_comercial_calculada`), usada pelas triggers e RPCs. O 410 confere os mesmos casos do domínio (paridade).
9. **Protótipo (mudança de escopo de 14/11/2026):** a cobrança é **simulada**, sem integração com o Asaas. Ver §4.

## 2. Decisões de implementação (tomadas com o coordenador)

1. **Dias úteis:** segunda a sexta, menos feriados nacionais (1/1, Sexta-feira Santa pela Páscoa, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12), no fuso da consultoria. Carnaval e Corpus Christi contam como dia útil. Domínio: `feriadosNacionais`, `ehDiaUtilNacional`, `somarDiasUteis`; banco: `private.pascoa`, `eh_feriado_nacional`, `somar_dias_uteis`.
2. **Beta:** consultoria criada até 31/01/2027 não é cobrada nem bloqueada até lá; o teste dela começa em 01/02/2027. Criada depois: o teste começa na criação (o próprio dia conta, se útil). A data fica em `private.configuracao_comercial.fim_do_beta`, junto com teste padrão, adicional, mensalidades do anual e tolerância.
3. **Teste, beta e conta interna liberam tudo** (como o Escala): sem limite e com orçamentos.
4. **Adicionais:** pela regra combinada, viram uma segunda assinatura mensal no Asaas, recalculada quando a contagem muda. **No protótipo** o valor é calculado na hora (`private.adicionais_centavos`, `adicionaisDoUso`) e, ao assinar, entra como cobrança própria (tipo `adicionais`).
5. **Nota fiscal automática:** fica para quando o CNPJ emissor estiver definido.
6. **Bloqueio de IA no Essencial:** não entrou (não mexemos em IA). O catálogo já tem a coluna `ia`.
7. **Orçamentos fora do plano:** dados antigos continuam legíveis; criar ou editar falha no banco com `orcamentos_fora_do_plano` ("Orçamentos fazem parte dos planos Equipe e Escala.") e a lista de orçamentos mostra o convite para o plano Equipe.

## 3. Como o banco garante

- **Só leitura:** trigger `BEFORE INSERT OR UPDATE OR DELETE` `_comercial_somente_leitura` (`private.bloquear_escrita_comercial`) em toda tabela de `public` com `consultoria_id` e em `consultoria`, criada por laço. Recusa com `consultoria_somente_leitura` (42501) quando a situação calculada de hoje (no fuso da consultoria) é só leitura. Dispara dentro de RPC `security definer`, então vale para toda escrita atual e futura. Leitura nunca é barrada; o Storage também recusa envio (política `arquivos_insert_membro_ativo`) e continua liberando o download.
- **Exceções:** `assinatura`, `cobranca` (o pagamento precisa), `consultoria_condicao_comercial`, `condicao_comercial_historico` (central), `consultoria_situacao_historico`, `acesso_suporte`, `acesso_suporte_evento` (a Gestão bloqueada ainda pode chamar o suporte), `uso_diario` e `auditoria` (escrita só por triggers de tabelas já barradas). Colunas liberadas: a situação mudada pela central em `consultoria` e nome/e-mail copiados da conta em `membro`. Escrita sem usuário (service role, migrations, Auth) passa. O 020 exige a trigger em toda tabela nova (com a lista de exceções) e o argumento `orcamentos` nas tabelas `orcamento*`.
- **Orçamentos:** a mesma trigger, com o 2º argumento `orcamentos`, recusa escrita em `orcamento*` quando os orçamentos não estão liberados.
- **Limites:** pessoas = membros ativos (o suporte não é membro e não conta); para convidar contam também os convites pendentes (vaga reservada). **Empreendimento ativo = empreendimento com ao menos uma licença ativa** (instrumento com o plano ativado): é o que o modelo atual tem de "ativo", e a ação que o torna ativo é ativar a primeira licença dele. As triggers `limite_do_plano` (em `convite` e `instrumento`) chamam `private.exigir_confirmacao_de_adicional`: dentro do limite (ou sem limite) passa; além do limite, só com confirmação registrada em `adicional_confirmado` para aquela quantidade e plano, senão `adicional_nao_confirmado`. A Gestão confirma por `confirmar_adicional` (que conta, calcula o valor e grava). Quem chama dentro do limite não muda nada. Aceitar convite nunca é barrado (a confirmação foi dada ao convidar).
- **Tabelas novas:** `consultoria_condicao_comercial`, `condicao_comercial_historico` (append-only), `assinatura`, `cobranca`, `adicional_confirmado` (append-only); todas com `consultoria_id`, RLS forçada, políticas pelos helpers, trigger do suporte e teste negativo. Escrita do cliente só por RPC.

## 4. Cobrança simulada (protótipo)

- `assinar_plano_simulado` (Gestão de verdade): sem plano ativo, grava a assinatura e a primeira cobrança pendente (vencimento: hoje, ou o dia seguinte ao fim do teste/beta, ou ao período já pago); com plano ativo, troca a partir do próximo vencimento (`plano_agendado`, `ciclo_agendado`, `mudanca_em`). Conta interna recusa (`conta_interna_sem_cobranca`).
- `pagar_cobranca_simulada`: o "Confirmar pagamento" do diálogo **Pagamento simulado** (no lugar da página do Asaas). Funciona mesmo em só leitura.
- `cancelar_plano_simulado`: o plano vale até o fim do período pago (`valida_ate`); depois, só leitura.
- Central: `central_simular_atraso` (cobrança vencida com vencimento retroativo, padrão 5 dias) e `central_simular_pagamento`.
- O formulário de cobrança (nome, e-mail, CNPJ ou CPF com máscara) só valida (`documento.ts`) e descarta: nada é gravado nem enviado.
- As colunas `asaas_cliente_id`, `asaas_assinatura_id`, `asaas_cobranca_id`, `invoice_url` e `situacao_asaas` existem e ficam nulas/padrão até a integração real.

## 5. Telas

- **Plano e cobrança** (`/configuracoes/plano`, menu só da Gestão): situação (em teste até, beta até, conta interna, ativa, em atraso, somente leitura, teste encerrado, cancelada), pessoas e empreendimentos contra o limite, adicionais e valor mensal, escolher/trocar plano (mensal ou anual mostrando as 10 mensalidades; Pix ou cartão), dados de quem paga, cancelar e histórico de cobranças com "Pagar". Equipe vê "sem permissão" e a faixa.
- **Faixas** (no shell): todos veem "Somente leitura até o pagamento"; a Gestão vê "Cobrança vencida" (com o dia em que fica só leitura) e "A cobrança do Grama vence hoje", com "Pagar".
- **Diálogo do adicional** ao convidar pessoa e ao ativar a licença que torna um empreendimento ativo, quando o banco pede a confirmação.
- **Central:** página **Financeiro** (`/admin/financeiro`: MRR = mensal + anual/12 + adicionais, ticket médio, receita por plano, mensal × anual, pagantes, em teste, teste acabando nos próximos 3 dias úteis, beta, internas, em atraso, somente leitura, cancelados, teste encerrado; lista paginada por grupo) e, no detalhe da consultoria, **Plano e cobrança** (situação, uso, cobranças, ajustar dias de teste, marcar/desmarcar conta interna com motivo e histórico, simular atraso e pagamento).

## 5a. Parâmetros pela central (protótipo, 14/11/2026)

- Migration `20261114180000_parametros_comerciais.sql`; teste `supabase/tests/440_parametros_comerciais.test.sql`; página `/admin/parametros` (`PaginaCentralParametros.tsx`).
- **Fonte da verdade é o banco.** `catalogo_comercial()` (qualquer pessoa logada) devolve os 3 planos e a configuração; o front mostra preço, nome e limite a partir dele (hook `useCatalogoComercial`, cache compartilhado). As funções de valor do domínio (`valorDoCiclo`, `adicionaisDoUso`, `passagemDoLimite`, `situacaoComercial` etc.) recebem o catálogo como parâmetro; `PLANOS` e as constantes ficam só como padrão (`CATALOGO_PADRAO`).
- **Edição só pelo operador com dois fatores** (`central_atualizar_plano`, `central_atualizar_configuracao_comercial`), com **motivo obrigatório** e validação pelos checks das tabelas. Cada mudança grava antes e depois (jsonb), motivo, quem e quando em `private.parametro_comercial_historico` (append-only, mesma trigger do histórico da central); `central_historico_parametros` lista, paginado.
- **Vale para as próximas cobranças.** A cobrança guarda o próprio `valor_centavos` ao ser criada; as funções do banco leem catálogo e configuração no momento do cálculo (nenhuma usa número fixo), então cobranças já criadas não mudam e as seguintes saem com o valor novo. O MRR da central passa a usar o preço novo para todas as assinaturas.
- Tolerância do atraso, dias de teste padrão e fim do beta valem **na hora** para a situação calculada (inclusive de quem já está em teste sem dias próprios ou em atraso), porque situação é calculada e nunca gravada.

## 6. Fica para depois

- **Integração real com o Asaas** (sandbox e produção com CNPJ): clientes, assinaturas (plano e "Adicionais do Grama"), página de pagamento (`invoiceUrl`), webhook com `asaas-access-token` e idempotência por id do evento, recálculo dos adicionais e CPF enviado direto ao Asaas sem gravar.
- **E-mail de cobrança vencida** pelo Resend no dia em que vence (hoje só a faixa).
- **Nota fiscal automática** (quando o CNPJ emissor estiver definido).
- **IA fora do Essencial.**
- Assinatura feita depois do teste acabado: hoje libera a escrita pela tolerância de 2 dias úteis antes do primeiro pagamento; decidir se deve exigir o pagamento antes.
- Termos 5.4 e 5.5 (adicionais no anual e troca de plano) seguem em aberto no texto; a implementação cobra adicionais por mês e troca no próximo ciclo.
