# ADR-0016: Automação do orçamento à execução (contrato, cobrança e demandas)

- **Situação:** proposto em 11/11/2026. **Não implementar** antes de o Eduardo decidir os itens D1 a D12 (fim do documento).
- **Requisitos:** FIN-01 (aceite), FIN-02 (minuta), FIN-03 (demandas de serviço), FIN-04 (recebíveis), FIN-05 (acesso ao financeiro) e ORC-04 (ciclo de vida).
- **Visual:** Fluent 2, conforme a [ADR-0015](0015-fluent-2-como-design-system.md).

## 1. O pedido e o que ele muda no que já está decidido

O pedido descreve este fluxo:

1. O orçamento é aprovado.
2. O contrato é gerado e enviado para assinatura eletrônica, por e-mail ou WhatsApp.
3. Quando o contrato é assinado, sai a cobrança Pix ou boleto da 1ª parcela.
4. O pagamento dá baixa automática.
5. A execução é liberada, com as tarefas geradas pelo modelo do serviço.

Como o pedido conflita com a documentação e o CLAUDE.md, o desenho fica assim:

| Pedido original                                                      | Documentação hoje                                                                                                               | Neste desenho                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma schema                                                        | Supabase: migrations SQL pela CLI, RLS forçada, RPC para escrita multi-tabela (ADR de stack)                                    | Migrations SQL com RLS, políticas e teste pgTAP negativo                                                                                              |
| `Proposal`, `Contract`, `Transaction`, `Project`, `Task`             | Nomes em português                                                                                                              | `orcamento` (já existe), `contrato`, `cobranca`, `demanda_servico`, `demanda_servico_etapa`. "Projeto" vira **demanda de serviço**, o termo do FIN-03 |
| Gateway (Asaas) e assinatura (ZapSign)                               | C4 de contexto: "Nenhum gateway de pagamento, assinatura digital qualificada […] faz parte do contexto"                         | Os dois entram como sistemas externos **atrás de um adaptador**. Muda o C4 (decisão D1)                                                               |
| Contrato enviado automaticamente                                     | FIN-02: minuta com aviso de revisão jurídica; "preparar e-mail" abre `mailto:`, não envia                                       | O contrato só sai depois de a gestão revisar e clicar em "Enviar para assinatura" (D4)                                                                |
| Status `WAITING_SIGNATURE`, `PAYMENT_PENDING`… gravados no orçamento | `situacao_orcamento` = rascunho, enviada, negociação, aprovada, recusada (ORC-04); atraso e situação derivada **não se gravam** | Cada entidade tem a própria situação de decisão; "vencida", "aguardando pagamento" e o passo do fluxo são **calculados**                              |
| "Repasse de taxas" no painel financeiro                              | Valor cobrado é o que o contrato diz                                                                                            | O repasse é decidido **no orçamento**, antes da assinatura. No hub ele só aparece (D5)                                                                |
| `external_contract_id`, `gateway_charge_id`                          | —                                                                                                                               | `id_externo` em `contrato` e `cobranca`, único por conexão                                                                                            |

## 2. Fluxo e máquinas de estado

```
Orçamento         rascunho ─► enviada ─► aprovada ◄── (contrato assinado)
                                    └──► recusada  ◄── (assinatura recusada, D9)

Contrato          minuta ─(gestão revisa + "Enviar para assinatura")─► aguardando_assinatura
                                                                       ├─► assinado
                                                                       ├─► recusado
                                                                       └─► cancelado (expirou ou a gestão cancelou)

Cobrança (uma     a_emitir ─(provedor aceitou)─► emitida ─► paga ─► estornada
por parcela)          │                            └─► cancelada
                      └─ "vencida" = emitida e hoje > vencimento, calculado no fuso da consultoria, nunca gravado

Demanda de        aguardando_liberacao ─(regra D3 satisfeita)─► liberada ─► concluida
serviço                                                                └─► cancelada
```

Princípios que valem para os dois provedores:

1. **O webhook é um aviso, não a fonte da verdade.** A Edge Function confere o token, registra o evento e **relê o objeto na API do provedor**, com a chave da consultoria, antes de mudar qualquer coisa. Isso resolve eventos falsos, fora de ordem e repetidos.
2. **Idempotência pelo banco.** `private.evento_externo` tem `unique (provedor, id_evento)`. Evento repetido devolve 200 sem efeito. Cada transição é uma RPC numa transação.
3. **Rede fora da transação (outbox).** A RPC que registra a assinatura só cria as cobranças `a_emitir`. Outra Edge Function, `emitir-cobrancas`, chama o gateway e registra o resultado. Se o gateway cair, a cobrança fica `a_emitir` e é retentada: por agendamento, ou pelo botão "Emitir de novo".
4. **Retentativa sem duplicar.** Toda cobrança vai ao gateway com `externalReference = cobranca.id`. Antes de criar, a função procura por essa referência.
5. **Caminho manual sempre existe.** "Registrar assinatura" (FIN-01) e "Registrar pagamento" (FIN-04) funcionam sem provedor. A automação só preenche os mesmos campos.
6. **Excluir ou estornar não apaga trabalho** (regras de negócio, §7.2): o estorno marca a cobrança e avisa, mas não cancela a demanda.

## 3. Modelo de dados (rascunho das migrations)

Convenções do projeto:

- Em toda tabela: `consultoria_id`, FK composta `(consultoria_id, id)`, `enable` + `force row level security`, trigger `private.auditar()` e `row_version` onde há decisão.
- Dinheiro em centavos com `moeda`.
- `DATE` para datas civis; `TIMESTAMPTZ` para instantes.
- Sem CPF.

```sql
-- Situações de decisão (o que é derivado, como "vencida", não entra aqui)
create type public.situacao_contrato  as enum ('minuta', 'aguardando_assinatura', 'assinado', 'recusado', 'cancelado');
create type public.situacao_cobranca  as enum ('a_emitir', 'emitida', 'paga', 'cancelada', 'estornada');
create type public.forma_cobranca     as enum ('pix', 'boleto', 'pix_ou_boleto');
create type public.situacao_demanda   as enum ('aguardando_liberacao', 'liberada', 'concluida', 'cancelada');
create type public.situacao_etapa     as enum ('a_fazer', 'em_andamento', 'concluida');

-- Conta da consultoria em cada provedor (D2: cada consultoria conecta a própria conta).
create table public.conexao_provedor (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  finalidade text not null check (finalidade in ('assinatura', 'cobranca')),
  provedor text not null check (provedor in ('zapsign', 'asaas')),
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  segredo_vault_id uuid not null,      -- chave de API no Supabase Vault; nunca na tabela, no front ou em log
  token_webhook_hash text not null,    -- SHA-256 do token que o provedor manda no cabeçalho do webhook
  ativa boolean not null default true,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint conexao_provedor_consultoria_id_id_key unique (consultoria_id, id),
  constraint conexao_provedor_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict
);
create unique index conexao_provedor_uma_ativa
  on public.conexao_provedor (consultoria_id, finalidade) where ativa;

create table public.contrato (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  orcamento_revisao integer not null,        -- revisão do orçamento que o contrato reflete
  situacao public.situacao_contrato not null default 'minuta',
  documento_versao_id uuid not null,         -- PDF imutável (tabela documento_versao existente)
  conteudo_sha256 text not null,             -- FIN-01: hash do conteúdo comercial
  revisado_por uuid,                         -- FIN-02: revisão humana antes do envio
  revisado_em timestamptz,
  conexao_id uuid,
  id_externo text,                           -- id do documento no provedor de assinatura
  enviado_em timestamptz,
  assinado_em timestamptz,
  encerrado_em timestamptz,
  motivo_encerramento text,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint contrato_consultoria_id_id_key unique (consultoria_id, id),
  constraint contrato_id_externo_key unique (conexao_id, id_externo),
  constraint contrato_revisado_antes_de_enviar check (
    situacao = 'minuta' or (revisado_por is not null and revisado_em is not null)),
  constraint contrato_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint contrato_conexao_fk foreign key (consultoria_id, conexao_id)
    references public.conexao_provedor (consultoria_id, id) on delete restrict,
  constraint contrato_revisado_por_fk foreign key (consultoria_id, revisado_por)
    references public.membro (consultoria_id, id) on delete restrict
);
-- No máximo um contrato vivo por orçamento.
create unique index contrato_vivo_por_orcamento on public.contrato (consultoria_id, orcamento_id)
  where situacao in ('minuta', 'aguardando_assinatura', 'assinado');

create table public.contrato_signatario (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  contrato_id uuid not null,
  ordem integer not null,
  papel text not null check (papel in ('cliente', 'consultoria', 'testemunha')),
  nome text not null check (length(btrim(nome)) > 0),
  email text not null,
  telefone text,                    -- só para envio por WhatsApp (D11)
  id_externo text,
  assinado_em timestamptz,
  recusado_em timestamptz,
  constraint contrato_signatario_consultoria_id_id_key unique (consultoria_id, id),
  constraint contrato_signatario_contrato_fk foreign key (consultoria_id, contrato_id)
    references public.contrato (consultoria_id, id) on delete restrict
);

create table public.cobranca (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  parcela_id uuid not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  moeda text not null default 'BRL' check (moeda ~ '^[A-Z]{3}$'),
  vencimento date not null,                       -- data civil, calculada no domínio (marco + dias)
  forma public.forma_cobranca not null,
  taxa_repassada boolean not null default false,  -- copiado do orçamento (D5); não muda depois
  situacao public.situacao_cobranca not null default 'a_emitir',
  conexao_id uuid,                                -- nulo = cobrança manual
  id_externo text,                                -- id da cobrança no gateway
  link_pagamento text,
  emitida_em timestamptz,
  paga_em timestamptz,
  valor_pago_centavos bigint,
  valor_liquido_centavos bigint,
  tentativas_emissao integer not null default 0,
  ultimo_erro text,                               -- mensagem curta do provedor, sem dados do cliente
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint cobranca_consultoria_id_id_key unique (consultoria_id, id),
  constraint cobranca_id_externo_key unique (conexao_id, id_externo),
  constraint cobranca_parcela_fk foreign key (consultoria_id, parcela_id)
    references public.orcamento_parcela (consultoria_id, id) on delete restrict,
  constraint cobranca_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint cobranca_conexao_fk foreign key (consultoria_id, conexao_id)
    references public.conexao_provedor (consultoria_id, id) on delete restrict
);
create unique index cobranca_viva_por_parcela on public.cobranca (consultoria_id, parcela_id)
  where situacao <> 'cancelada';

-- Eventos recebidos dos provedores. Esquema private: o PostgREST não expõe.
create table private.evento_externo (
  id bigint generated always as identity primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  conexao_id uuid not null,
  provedor text not null,
  id_evento text not null,
  tipo text not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  resultado text,             -- 'ok' | 'ignorado' | 'desconhecido' | 'erro'
  constraint evento_externo_unico unique (provedor, id_evento)
);
-- Sem o payload bruto: ele tem dados pessoais do cliente. Guarde só o que é preciso para depurar.

create table public.demanda_servico (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  empreendimento_id uuid not null,
  titulo text not null check (length(btrim(titulo)) > 0),
  situacao public.situacao_demanda not null default 'aguardando_liberacao',
  liberada_em timestamptz,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint demanda_servico_consultoria_id_id_key unique (consultoria_id, id),
  constraint demanda_servico_uma_por_orcamento unique (consultoria_id, orcamento_id),  -- FIN-03: "uma vez"
  constraint demanda_servico_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint demanda_servico_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict
);

create table public.demanda_servico_etapa (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  demanda_id uuid not null,
  orcamento_item_id uuid not null,
  ordem integer not null,
  titulo text not null check (length(btrim(titulo)) > 0),
  minutos_estimados integer not null check (minutos_estimados >= 0),
  responsavel_id uuid,        -- membro_id, nunca nome
  prazo date,                 -- D10: definido pela gestão, nunca inventado
  situacao public.situacao_etapa not null default 'a_fazer',
  row_version integer not null default 1,
  constraint demanda_servico_etapa_consultoria_id_id_key unique (consultoria_id, id),
  constraint demanda_servico_etapa_item_unico unique (consultoria_id, orcamento_item_id),
  constraint demanda_servico_etapa_demanda_fk foreign key (consultoria_id, demanda_id)
    references public.demanda_servico (consultoria_id, id) on delete restrict,
  constraint demanda_servico_etapa_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict
);
```

**RLS (o mesmo padrão em todas):**

- Leitura de `contrato`, `contrato_signatario` e `cobranca`: só a Gestão, até existir a permissão do financeiro (FIN-05).
- Leitura de `demanda_servico` e `demanda_servico_etapa`: membro ativo.
- `conexao_provedor`: só a Gestão lê, e só as colunas não sensíveis, por uma view.
- Escrita: só por RPC.

```sql
alter table public.cobranca enable row level security;
alter table public.cobranca force row level security;
revoke all on table public.cobranca from anon, authenticated;
grant select on table public.cobranca to authenticated;
create policy cobranca_select_gestao on public.cobranca for select to authenticated
  using ((select private.is_gestao(consultoria_id)));
create trigger cobranca_auditar after insert or update or delete on public.cobranca
  for each row execute function private.auditar();
```

**Teste pgTAP negativo (um por tabela):** um membro da consultoria B lê `cobranca` filtrando pelo `id` de uma cobrança da consultoria A e recebe **zero linhas**. Um membro da Equipe de A também recebe zero linhas.

### RPC chamada pelo webhook de pagamento

```sql
-- Só a service role executa (Edge Function). Idempotente: o mesmo evento duas vezes não muda nada.
create function public.registrar_pagamento(
  p_conexao_id uuid,
  p_id_evento text,
  p_tipo_evento text,
  p_id_cobranca_externa text,
  p_situacao_no_provedor text,        -- lida na API do provedor, não no corpo do webhook
  p_valor_pago_centavos bigint,
  p_valor_liquido_centavos bigint,
  p_pago_em timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_conexao public.conexao_provedor;
  v_cobranca public.cobranca;
begin
  select * into v_conexao from public.conexao_provedor where id = p_conexao_id and ativa;
  if not found then
    return 'conexao_inativa';
  end if;

  insert into private.evento_externo (consultoria_id, conexao_id, provedor, id_evento, tipo)
  values (v_conexao.consultoria_id, p_conexao_id, v_conexao.provedor, p_id_evento, p_tipo_evento)
  on conflict (provedor, id_evento) do nothing;
  if not found then
    return 'repetido';
  end if;

  select * into v_cobranca from public.cobranca
   where conexao_id = p_conexao_id and id_externo = p_id_cobranca_externa
   for update;
  if not found then
    update private.evento_externo set processado_em = now(), resultado = 'desconhecido'
     where provedor = v_conexao.provedor and id_evento = p_id_evento;
    return 'desconhecido';
  end if;

  if p_situacao_no_provedor in ('RECEIVED', 'CONFIRMED') and v_cobranca.situacao = 'emitida' then  -- D7
    update public.cobranca
       set situacao = 'paga', paga_em = p_pago_em,
           valor_pago_centavos = p_valor_pago_centavos,
           valor_liquido_centavos = p_valor_liquido_centavos,
           row_version = row_version + 1
     where id = v_cobranca.id;
    perform private.liberar_execucao_se_couber(v_cobranca.consultoria_id, v_cobranca.orcamento_id);
  elsif p_situacao_no_provedor = 'REFUNDED' and v_cobranca.situacao = 'paga' then
    update public.cobranca set situacao = 'estornada', row_version = row_version + 1
     where id = v_cobranca.id;   -- não cancela a demanda (§7.2); o hub mostra o aviso
  end if;

  update private.evento_externo set processado_em = now(), resultado = 'ok'
   where provedor = v_conexao.provedor and id_evento = p_id_evento;
  return 'ok';
end;
$$;
revoke all on function public.registrar_pagamento from public, anon, authenticated;
grant execute on function public.registrar_pagamento to service_role;
```

`private.liberar_execucao_se_couber`:

1. Aplica a regra D3.
2. Se ela for satisfeita, insere `demanda_servico` com `on conflict (consultoria_id, orcamento_id) do nothing`.
3. Insere uma `demanda_servico_etapa` por `orcamento_item`, na ordem do orçamento, com as horas estimadas do item, sem responsável e sem prazo. A gestão atribui.

Pendência técnica: hoje `private.auditar()` registra como ator o membro do JWT. Com a service role não há JWT, então a auditoria precisa de um ator "sistema", com o provedor e o id do evento.

Outras RPCs:

- `registrar_assinatura` (webhook);
- `enviar_contrato_para_assinatura` (gestão, antes da chamada externa);
- `registrar_cobranca_emitida` (Edge Function);
- `registrar_pagamento_manual` e `registrar_assinatura_manual` (gestão, FIN-01 e FIN-04);
- `atribuir_etapa` (gestão, com `row_version`);
- `obter_acompanhamento_do_orcamento` (leitura agregada para o hub).

## 4. Edge Functions

| Função               | Quem chama                                                  | O que faz                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enviar-contrato`    | Front (JWT da gestão)                                       | Confere o vínculo pela RPC, lê o PDF já gravado e revisado no Storage, cria o documento no provedor de assinatura e registra o `id_externo`                                 |
| `webhook-assinatura` | Provedor (sem JWT, `verify_jwt = false`)                    | Token, evento, releitura na API e `registrar_assinatura`. Se a RPC devolve cobranças `a_emitir`, chama `emitir-cobrancas`                                                   |
| `emitir-cobrancas`   | `webhook-assinatura`, agendamento ou botão "Emitir de novo" | Para cada cobrança `a_emitir`: procura o cliente por CNPJ e cria se faltar (D6), procura por `externalReference` e cria se não existir, depois `registrar_cobranca_emitida` |
| `webhook-cobranca`   | Gateway (sem JWT)                                           | Abaixo                                                                                                                                                                      |

```ts
// supabase/functions/webhook-cobranca/index.ts (esboço)
import { clienteServico } from '../_shared/supabase.ts'
import { lerSegredo, sha256Hex, iguaisEmTempoConstante } from '../_shared/seguranca.ts'
import { gatewayDe } from '../_shared/provedores/cobranca.ts' // adaptador: asaas hoje, outro amanhã

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  // A conexão vem na URL cadastrada no provedor; o token, no cabeçalho que o provedor envia.
  const conexaoId = new URL(req.url).searchParams.get('conexao')
  const token = req.headers.get('asaas-access-token') // conferir o nome na documentação do provedor
  if (!conexaoId || !token) return new Response(null, { status: 401 })

  const admin = clienteServico() // service role: só aqui, nunca no front
  const { data: conexao } = await admin.rpc('conexao_para_webhook', { p_id: conexaoId })
  if (!conexao || !iguaisEmTempoConstante(await sha256Hex(token), conexao.token_webhook_hash)) {
    return new Response(null, { status: 401 })
  }

  const evento = (await req.json()) as { id: string; event: string; payment?: { id: string } }
  if (!evento.payment?.id) return new Response(null, { status: 200 }) // evento que não nos interessa

  // Não confia no corpo: relê a cobrança na API com a chave da consultoria.
  const gateway = gatewayDe(
    conexao.provedor,
    await lerSegredo(admin, conexao.segredo_vault_id),
    conexao.ambiente,
  )
  const atual = await gateway.obterCobranca(evento.payment.id)

  const { error } = await admin.rpc('registrar_pagamento', {
    p_conexao_id: conexaoId,
    p_id_evento: evento.id,
    p_tipo_evento: evento.event,
    p_id_cobranca_externa: atual.id,
    p_situacao_no_provedor: atual.situacao,
    p_valor_pago_centavos: atual.valorPagoCentavos,
    p_valor_liquido_centavos: atual.valorLiquidoCentavos,
    p_pago_em: atual.pagoEm,
  })
  if (error) {
    console.error('webhook-cobranca: falha ao registrar', {
      conexaoId,
      evento: evento.id,
      codigo: error.code,
    })
    return new Response(null, { status: 500 }) // o provedor reenvia
  }
  return new Response(null, { status: 200 })
})
```

Notas:

- **Responder rápido.** Gateways costumam pausar a fila de webhooks depois de falhas seguidas. Erro de negócio, como uma cobrança desconhecida, devolve 200 e fica em `evento_externo`; só falha técnica devolve 500.
- **Logs sem dados pessoais** e sem payload: apenas ids e códigos.
- **Testes:** o adaptador tem uma versão falsa para Vitest/Deno test, cobrindo token errado, evento repetido, evento fora de ordem, pagamento antes da emissão registrada e estorno depois da liberação.

## 5. Domínio (`packages/domain/src/automacao.ts`)

Funções puras com teste:

```ts
import type { DataCivil } from './data-civil'

export type SituacaoCobrancaGravada = 'a_emitir' | 'emitida' | 'paga' | 'cancelada' | 'estornada'
export type SituacaoCobranca = SituacaoCobrancaGravada | 'vencida'
export type RegraDeLiberacao = 'contrato_assinado' | 'primeira_parcela_paga' // D3

/** "Vencida" nunca é gravada: emitida e hoje (no fuso da consultoria) depois do vencimento. */
export function situacaoDaCobranca(
  c: { situacao: SituacaoCobrancaGravada; vencimento: DataCivil },
  hoje: DataCivil,
): SituacaoCobranca {
  return c.situacao === 'emitida' && hoje > c.vencimento ? 'vencida' : c.situacao
}

export function podeLiberarExecucao(
  regra: RegraDeLiberacao,
  contrato: { situacao: string } | null,
  cobrancas: readonly { ordemParcela: number; situacao: SituacaoCobrancaGravada }[],
): boolean {
  if (contrato?.situacao !== 'assinado') return false
  if (regra === 'contrato_assinado') return true
  const primeira = [...cobrancas].sort((a, b) => a.ordemParcela - b.ordemParcela)[0]
  return primeira?.situacao === 'paga' || primeira?.situacao === 'estornada' // estorno não desfaz (§7.2)
}

export type PassoDoFluxo = 'orcamento' | 'contrato' | 'pagamento' | 'execucao'
export type EstadoDoPasso = 'concluido' | 'atual' | 'pendente' | 'bloqueado'

/** Para a trilha do hub: qual passo está em andamento e por quê. Calculado, nunca gravado. */
export function passosDoFluxo(
  /* orçamento, contrato, cobranças, demanda, hoje */
): Record<PassoDoFluxo, EstadoDoPasso> {
  /* …com testes para cada combinação: recusado, cancelado, a_emitir com erro, vencida, estornada… */
  throw new Error('a implementar com testes')
}
```

O vencimento de cada parcela é calculado no domínio a partir da data do marco e dos dias, em `dias-uteis`/`data-civil`.

- Hoje o marco da parcela é **texto livre** (`orcamento_parcela.descricao`).
- Para automatizar, ele precisa virar uma lista fechada: contrato assinado, protocolo no órgão, emissão da licença, entrega aprovada.
- Só o marco "contrato assinado" acontece automaticamente. Os outros são marcados pela gestão (D8).

## 6. Tela: acompanhamento do orçamento (o hub)

- **Rota e nome:** `/orcamentos/:id/acompanhamento`. O componente se chama `AcompanhamentoDoOrcamento`, nome do domínio em vez de `ProjectAutomationHub`.
- **Acesso:** só a Gestão, até o FIN-05.
- **Visual:** Fluent 2 (ADR-0015). Cartões com raio de 8px e `shadow4`, trilha horizontal no desktop e vertical no celular, selos com o texto da situação.
- **Estados:** vazio (orçamento ainda em rascunho), carregando, erro e sem permissão.
- **Tabelas:** viram cartões até 480 px.

Esboço abaixo. Ele não compila até existirem as RPCs e o `Cartao`/`Trilha` da ADR-0015.

```tsx
// apps/web/src/app/paginas/orcamentos/AcompanhamentoDoOrcamento.tsx (esboço)
import { situacaoDaCobranca, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { Cartao } from '@/components/ui/cartao' // novo (ADR-0015)
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { SeletorPessoa } from '@/components/ui/seletor-pessoa'
import { Trilha, type PassoDaTrilha } from '@/components/ui/trilha' // novo (ADR-0015)
import {
  atribuirEtapa,
  emitirCobrancaDeNovo,
  obterAcompanhamento,
  type Acompanhamento,
  type CobrancaDoAcompanhamento,
  type EtapaDaDemanda,
} from '@/lib/api/acompanhamento'
import { mensagemDoErro } from '@/lib/erros'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const centavos = (v: number) => brl.format(v / 100)
const dataBr = (d: string) => d.split('-').reverse().join('/') // DATE 'aaaa-mm-dd' → dd/mm/aaaa, sem fuso

export function AcompanhamentoDoOrcamento() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const consulta = useQuery({
    queryKey: ['acompanhamento', cid, id],
    queryFn: () => obterAcompanhamento(cid, id),
    enabled: atual.papel === 'gestao',
  })

  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Acompanhamento">
        <SemPermissao descricao="Contrato e cobranças são dados do financeiro: só a gestão acessa." />
      </Pagina>
    )
  }
  if (consulta.isPending) return <Carregando rotulo="Carregando acompanhamento" linhas={8} />
  if (consulta.isError) {
    return (
      <Pagina titulo="Acompanhamento">
        <EstadoErro
          titulo="Não foi possível carregar o acompanhamento."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      </Pagina>
    )
  }

  const a = consulta.data
  if (a.orcamento.situacao === 'rascunho') {
    return (
      <Pagina titulo={`Acompanhamento ${a.orcamento.numero}`}>
        <EstadoVazio
          titulo="Este orçamento ainda é rascunho"
          descricao="O acompanhamento começa quando a proposta é marcada como pronta e enviada."
        />
      </Pagina>
    )
  }

  return (
    <Pagina titulo={`Acompanhamento ${a.orcamento.numero}`}>
      <div className="flex flex-col gap-(--space-200)">
        <Trilha rotulo="Andamento do orçamento" passos={passosDaTrilha(a)} />
        <div className="grid gap-(--space-200) min-[1100px]:grid-cols-2">
          <CartaoProposta a={a} />
          <CartaoContrato a={a} />
        </div>
        <PainelRecebimentos consultoriaId={cid} orcamentoId={id} a={a} />
        <ListaDeEtapas consultoriaId={cid} orcamentoId={id} a={a} />
      </div>
    </Pagina>
  )
}

/** A situação de cada passo vem calculada do servidor/domínio; o texto diz o estado, a cor só reforça. */
function passosDaTrilha(a: Acompanhamento): PassoDaTrilha[] {
  return [
    {
      id: 'orcamento',
      titulo: 'Orçamento',
      estado: a.passos.orcamento,
      detalhe: a.orcamento.rotuloSituacao,
    },
    {
      id: 'contrato',
      titulo: 'Contrato',
      estado: a.passos.contrato,
      detalhe: a.contrato?.rotuloSituacao ?? 'Não gerado',
    },
    {
      id: 'pagamento',
      titulo: 'Pagamento',
      estado: a.passos.pagamento,
      detalhe: a.resumoRecebimentos,
    },
    {
      id: 'execucao',
      titulo: 'Execução',
      estado: a.passos.execucao,
      detalhe: a.demanda?.rotuloSituacao ?? 'Aguardando liberação',
    },
  ]
}

function CartaoProposta({ a }: { a: Acompanhamento }) {
  return (
    <Cartao
      titulo="Proposta"
      acoes={
        <Link to={`/orcamentos/${a.orcamento.id}`} className="text-(--text-link) hover:underline">
          Abrir orçamento
        </Link>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-(--space-200) gap-y-(--space-050) text-sm">
        <dt className="text-(--text-subtle)">Cliente</dt>
        <dd>{a.orcamento.cliente}</dd>
        <dt className="text-(--text-subtle)">Objeto</dt>
        <dd>{a.orcamento.objeto}</dd>
        <dt className="text-(--text-subtle)">Total</dt>
        <dd className="font-semibold tabular-nums">{centavos(a.orcamento.totalCentavos)}</dd>
        <dt className="text-(--text-subtle)">Parcelas</dt>
        <dd>{a.cobrancas.length}</dd>
      </dl>
    </Cartao>
  )
}

function CartaoContrato({ a }: { a: Acompanhamento }) {
  const c = a.contrato
  if (!c) {
    return (
      <Cartao titulo="Contrato">
        <EstadoVazio
          titulo="Nenhum contrato gerado"
          descricao="Gere a minuta a partir da proposta e revise antes de enviar."
        />
      </Cartao>
    )
  }
  return (
    <Cartao
      titulo="Contrato"
      acoes={<Selo tom={TOM_CONTRATO[c.situacao]}>{c.rotuloSituacao}</Selo>}
    >
      {c.situacao === 'minuta' && (
        <MensagemSecao tom="atencao" titulo="Revisão obrigatória">
          A minuta precisa de revisão antes do envio. Ela não substitui a revisão jurídica.
        </MensagemSecao>
      )}
      <ul className="mt-(--space-150) divide-y divide-(--border)" aria-label="Signatários">
        {c.signatarios.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-(--space-100) py-(--space-100)"
          >
            <span>
              <span className="block">{s.nome}</span>
              <span className="text-xs text-(--text-subtle)">{s.papel}</span>
            </span>
            <Selo tom={s.assinadoEm ? 'sucesso' : 'atencao'}>
              {s.assinadoEm ? 'Assinou' : 'Pendente'}
            </Selo>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

const TOM_CONTRATO: Record<string, TomSelo> = {
  minuta: 'padrao',
  aguardando_assinatura: 'atencao',
  assinado: 'sucesso',
  recusado: 'perigo',
  cancelado: 'padrao',
}
const TOM_COBRANCA: Record<string, TomSelo> = {
  a_emitir: 'padrao',
  emitida: 'andamento',
  vencida: 'perigo',
  paga: 'sucesso',
  cancelada: 'padrao',
  estornada: 'perigo',
}
const ROTULO_COBRANCA: Record<string, string> = {
  a_emitir: 'A emitir',
  emitida: 'Aguardando pagamento',
  vencida: 'Vencida',
  paga: 'Paga',
  cancelada: 'Cancelada',
  estornada: 'Estornada',
}

function PainelRecebimentos({
  consultoriaId,
  orcamentoId,
  a,
}: {
  consultoriaId: string
  orcamentoId: string
  a: Acompanhamento
}) {
  const qc = useQueryClient()
  const reemitir = useMutation({
    mutationFn: (cobrancaId: string) => emitirCobrancaDeNovo(consultoriaId, cobrancaId),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ['acompanhamento', consultoriaId, orcamentoId] }),
  })
  const linhas = a.cobrancas.map((c) => ({
    ...c,
    exibida: situacaoDaCobranca(c, a.hoje as DataCivil),
  }))

  return (
    <Cartao
      titulo="Recebimentos"
      descricao={
        a.taxaRepassada
          ? 'Taxas do gateway repassadas ao cliente, conforme o contrato.'
          : 'Taxas do gateway por conta da consultoria.'
      }
    >
      {reemitir.isError && (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(reemitir.error)}
        </MensagemSecao>
      )}
      {/* Desktop: tabela que rola na própria região. Até 480 px: cartões. */}
      <div className="overflow-x-auto max-[480px]:hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Parcelas e cobranças</caption>
          <thead>
            <tr className="border-b border-(--border) text-left font-semibold">
              <th scope="col" className="py-(--space-100)">
                Parcela
              </th>
              <th scope="col">Vencimento</th>
              <th scope="col">Forma</th>
              <th scope="col" className="text-right">
                Valor
              </th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.id} className="border-b border-(--border) hover:bg-(--surface-hover)">
                <td className="py-(--space-100)">{c.rotuloParcela}</td>
                <td>{dataBr(c.vencimento)}</td>
                <td>{c.rotuloForma}</td>
                <td className="text-right tabular-nums">{centavos(c.valorCentavos)}</td>
                <td>
                  <Selo tom={TOM_COBRANCA[c.exibida]}>{ROTULO_COBRANCA[c.exibida]}</Selo>
                </td>
                <td className="text-right">
                  <AcoesDaCobranca
                    c={c}
                    aoReemitir={() => reemitir.mutate(c.id)}
                    ocupado={reemitir.isPending}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul
        className="hidden flex-col gap-(--space-100) max-[480px]:flex"
        aria-label="Parcelas e cobranças"
      >
        {linhas.map((c) => (
          <li
            key={c.id}
            className="rounded-(--radius-medium) border border-(--border) p-(--space-150)"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.rotuloParcela}</span>
              <Selo tom={TOM_COBRANCA[c.exibida]}>{ROTULO_COBRANCA[c.exibida]}</Selo>
            </div>
            <p className="mt-(--space-050) tabular-nums">
              {centavos(c.valorCentavos)} · vence em {dataBr(c.vencimento)}
            </p>
            <AcoesDaCobranca
              c={c}
              aoReemitir={() => reemitir.mutate(c.id)}
              ocupado={reemitir.isPending}
            />
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

function AcoesDaCobranca({
  c,
  aoReemitir,
  ocupado,
}: {
  c: CobrancaDoAcompanhamento & { exibida: string }
  aoReemitir: () => void
  ocupado: boolean
}) {
  if (c.situacao === 'a_emitir' && c.ultimoErro) {
    return (
      <Botao tamanho="compacto" onClick={aoReemitir} disabled={ocupado}>
        Emitir de novo
      </Botao>
    )
  }
  if (c.linkPagamento && (c.exibida === 'emitida' || c.exibida === 'vencida')) {
    return (
      <Botao
        tamanho="compacto"
        aparencia="sutil"
        onClick={() => void navigator.clipboard.writeText(c.linkPagamento!)}
      >
        Copiar link de pagamento
      </Botao>
    )
  }
  return null
}

function ListaDeEtapas({
  consultoriaId,
  orcamentoId,
  a,
}: {
  consultoriaId: string
  orcamentoId: string
  a: Acompanhamento
}) {
  const qc = useQueryClient()
  const salvar = useMutation({
    mutationFn: (e: Pick<EtapaDaDemanda, 'id' | 'rowVersion' | 'responsavelId' | 'prazo'>) =>
      atribuirEtapa(consultoriaId, e),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ['acompanhamento', consultoriaId, orcamentoId] }),
  })

  if (!a.demanda) {
    return (
      <Cartao titulo="Etapas da execução">
        <EstadoVazio titulo="Execução ainda não liberada" descricao={a.motivoSemLiberacao} />
      </Cartao>
    )
  }
  return (
    <Cartao
      titulo="Etapas da execução"
      descricao="Geradas uma vez a partir dos itens do orçamento. Atribua responsável e prazo."
    >
      {salvar.isError && (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      )}
      <ol className="divide-y divide-(--border)">
        {a.demanda.etapas.map((e) => (
          <li
            key={e.id}
            className="grid gap-(--space-100) py-(--space-150) min-[768px]:grid-cols-[1fr_16rem_12rem] min-[768px]:items-end"
          >
            <div>
              <span className="font-semibold">
                {e.ordem}. {e.titulo}
              </span>
              <span className="block text-xs text-(--text-subtle)">
                {e.rotuloHoras} estimadas · {e.rotuloSituacao}
              </span>
            </div>
            <SeletorPessoa
              rotulo={`Responsável por ${e.titulo}`}
              pessoas={a.membros}
              valor={e.responsavelId}
              aoMudar={(responsavelId) =>
                salvar.mutate({ id: e.id, rowVersion: e.rowVersion, responsavelId, prazo: e.prazo })
              }
              rotuloSemPessoa="Sem responsável"
              disabled={salvar.isPending}
            />
            <CampoData
              rotulo={`Prazo de ${e.titulo}`}
              valor={e.prazo as DataCivil | null}
              hoje={a.hoje as DataCivil}
              aoMudar={(prazo) =>
                salvar.mutate({
                  id: e.id,
                  rowVersion: e.rowVersion,
                  responsavelId: e.responsavelId,
                  prazo,
                })
              }
              disabled={salvar.isPending}
            />
          </li>
        ))}
      </ol>
    </Cartao>
  )
}
```

Notas da tela:

- **Fuso:** `a.hoje` vem do servidor no fuso da consultoria. O vencimento é `DATE` e é exibido sem conversão de fuso.
- **Teclado:** a trilha é uma `<ol>` com `aria-current="step"` no passo atual, e cada passo diz o estado por extenso ("Concluído", "Em andamento", "Bloqueado: assinatura recusada").
- **Conflito de edição:** `atribuirEtapa` manda `row_version`. Em conflito, a mensagem diz que outra pessoa alterou e recarrega.
- **Sem segredo no front:** o front nunca vê a chave do gateway nem a URL do webhook com token.

## 7. Fatias sugeridas

Primeiro o fluxo manual, que é exigido de qualquer jeito como caminho alternativo. A automação vem depois, por cima.

| #   | Fatia                                                                                    | Provedor? |
| --- | ---------------------------------------------------------------------------------------- | --------- |
| 0   | Fluent 2 (ADR-0015)                                                                      | Não       |
| 1   | Marco da parcela como lista fechada, mais o vencimento calculado no domínio              | Não       |
| 2   | Minuta de contrato com revisão e aceite manual (FIN-01, FIN-02); orçamento para aprovada | Não       |
| 3   | Recebíveis com baixa manual (FIN-04) e o hub só leitura                                  | Não       |
| 4   | Demandas de serviço e etapas geradas na liberação, com atribuição (FIN-03)               | Não       |
| 5   | Conexão com o provedor de assinatura e os webhooks                                       | Sim       |
| 6   | Conexão com o gateway, emissão, webhooks e retentativa                                   | Sim       |

## 8. Decisões em aberto (do Eduardo; o CLAUDE.md manda perguntar, não inventar)

1. **D1. Integrações entram no produto?** Assinatura eletrônica e gateway mudam o C4 de contexto e o FIN-02. Confirmar também os provedores (ZapSign e Asaas foram exemplos do pedido).
2. **D2. De quem é a conta do gateway?**
   - Recomendado: cada consultoria conecta a própria conta, e o dinheiro vai direto para ela.
   - Usar uma conta do Grama com repasse faz do Grama intermediário de pagamento, com implicações regulatórias e fiscais.
3. **D3. O que libera a execução?** Só a assinatura, ou a assinatura mais a 1ª parcela paga? E quando a 1ª parcela não é no marco "contrato assinado"?
4. **D4. Envio automático ou por clique?** Recomendado: a gestão revisa a minuta e clica em "Enviar para assinatura". O FIN-02 exige revisão.
5. **D5. Repasse de taxas.** Quem paga a tarifa do Pix ou do boleto? Se for repassada, entra na etapa 4 do orçamento e aparece no contrato. Não pode mudar depois da assinatura.
6. **D6. Cliente pessoa física.** Gateways e assinaturas costumam exigir CPF, e o CLAUDE.md proíbe CPF.
   - Opção 1: atender só clientes com CNPJ.
   - Opção 2: o CPF vai direto ao provedor, sem ser gravado no Grama.
   - Precisa de decisão e talvez de revisão jurídica (LGPD).
7. **D7. Quando o pagamento conta como pago?** No Pix, na confirmação. No boleto, na confirmação ou na compensação?
8. **D8. Marcos que não são automáticos** (protocolo no órgão, emissão da licença): a gestão marca a data e a cobrança é gerada? Com confirmação?
9. **D9. Assinatura recusada ou expirada:** o orçamento volta para negociação (nova revisão) ou é recusado?
10. **D10. Prazo das etapas:** a gestão define cada um, ou o sistema propõe a partir das horas e da capacidade (onda 4)? Inventar prazo não é permitido.
11. **D11. Canais de envio:** quem manda o e-mail e o WhatsApp, o provedor de assinatura ou o Grama? Os dois canais custam por envio.
12. **D12. As etapas entram na visão da equipe** ("Minhas demandas", ao lado das ocorrências) ou ficam só no hub? A visão da equipe hoje usa "demanda" para ocorrências.
