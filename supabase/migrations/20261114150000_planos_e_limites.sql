-- Planos, limites, teste grátis e só leitura por atraso (ADR-0026; decisões do Eduardo de
-- 14/11/2026). A cobrança (simulada neste protótipo) está na migration seguinte,
-- 20261114160000_cobranca_simulada.sql.
--
-- Situação e atraso são CALCULADOS, nunca gravados (regra do projeto). A regra pura está em
-- packages/domain/src/planos.ts (situacaoComercial); aqui fica a função equivalente
-- (private.situacao_comercial_calculada), usada pela trigger de só leitura, pela regra de
-- orçamentos e pelas RPCs. O teste 410 confere os mesmos casos do domínio (paridade).
--
--   Planos       Essencial R$ 990/mês (3 pessoas, 10 empreendimentos, sem orçamentos),
--                Equipe R$ 1.290/mês (10 pessoas, 30 empreendimentos) e Escala R$ 2.990/mês
--                (25 pessoas, 100 empreendimentos). Anual = 10 mensalidades. Centavos + BRL.
--   Limite       passar do limite é permitido e custa R$ 20/mês por pessoa ou empreendimento a
--                mais; a ação da Gestão que passa do limite (convidar pessoa, ativar a primeira
--                licença de um empreendimento) exige a confirmação registrada antes
--                (confirmar_adicional). Sem confirmação: 'adicional_nao_confirmado'.
--   Teste        10 dias úteis (ajustável por consultoria na central), com tudo liberado.
--   Beta         consultoria criada até 31/01/2027 (configuração da plataforma) não é cobrada
--                nem bloqueada até lá; o teste dela começa em 01/02/2027.
--   Atraso       dia seguinte ao vencimento sem pagamento; depois de 2 dias úteis, SÓ LEITURA
--                para todos até pagar. Teste acabado sem plano e assinatura cancelada depois do
--                período pago: também só leitura.
--   Interna      conta de teste do Grama (marcada pela central, com motivo): grátis, sem limite,
--                nunca bloqueia. Esta migration não marca nenhuma consultoria.
--   Dias úteis   segunda a sexta, menos feriados nacionais (Sexta-feira Santa pela Páscoa);
--                Carnaval e Corpus Christi contam como dia útil.

-- ---------------------------------------------------------------------------
-- 1. Configuração da plataforma e catálogo de planos (schema private: fora da API).
-- ---------------------------------------------------------------------------
create table private.configuracao_comercial (
  id boolean primary key default true,
  fim_do_beta date not null,
  dias_de_teste_padrao integer not null,
  adicional_mensal_centavos integer not null,
  mensalidades_no_anual integer not null,
  dias_uteis_de_tolerancia integer not null,
  moeda text not null,
  constraint configuracao_comercial_uma_linha check (id),
  constraint configuracao_comercial_valores check (
    dias_de_teste_padrao between 0 and 365 and adicional_mensal_centavos > 0
    and mensalidades_no_anual between 1 and 12 and dias_uteis_de_tolerancia >= 0
    and moeda = 'BRL'
  )
);

comment on table private.configuracao_comercial is
  'Configuração comercial da plataforma (ADR-0026): fim do beta, teste padrão, adicional, anual e tolerância.';

insert into private.configuracao_comercial
  (id, fim_do_beta, dias_de_teste_padrao, adicional_mensal_centavos, mensalidades_no_anual,
   dias_uteis_de_tolerancia, moeda)
values (true, date '2027-01-31', 10, 2000, 10, 2, 'BRL');

alter table private.configuracao_comercial enable row level security;
alter table private.configuracao_comercial force row level security;
revoke all on table private.configuracao_comercial from public, anon, authenticated;

create table private.plano_catalogo (
  codigo text primary key,
  nome text not null,
  mensal_centavos integer not null,
  pessoas integer not null,
  empreendimentos integer not null,
  orcamentos boolean not null,
  ia boolean not null,
  ordem integer not null,
  constraint plano_catalogo_valores check (mensal_centavos > 0 and pessoas > 0 and empreendimentos > 0)
);

comment on table private.plano_catalogo is
  'Catálogo de planos (ADR-0026). O mesmo de PLANOS em packages/domain/src/planos.ts.';

insert into private.plano_catalogo (codigo, nome, mensal_centavos, pessoas, empreendimentos, orcamentos, ia, ordem)
values
  ('essencial', 'Essencial', 99000, 3, 10, false, false, 1),
  ('equipe', 'Equipe', 129000, 10, 30, true, true, 2),
  ('escala', 'Escala', 299000, 25, 100, true, true, 3);

alter table private.plano_catalogo enable row level security;
alter table private.plano_catalogo force row level security;
revoke all on table private.plano_catalogo from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dias úteis (o mesmo de feriadosNacionais, ehDiaUtilNacional e somarDiasUteis do domínio).
-- ---------------------------------------------------------------------------

-- Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
create function private.pascoa(ano integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a integer := ano % 19;
  b integer := ano / 100;
  c integer := ano % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

-- Feriados nacionais: 1/1, Sexta-feira Santa, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11 e 25/12.
create function private.eh_feriado_nacional(dia date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select to_char(dia, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
    or dia = private.pascoa(extract(year from dia)::integer) - 2
$$;

create function private.eh_dia_util_nacional(dia date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(isodow from dia) < 6 and not private.eh_feriado_nacional(dia)
$$;

-- O n-ésimo dia útil depois de `dia` (sem contar o próprio). Com n = 0, o próprio dia.
create function private.somar_dias_uteis(dia date, n integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  atual date := dia;
  contados integer := 0;
begin
  if n is null or n < 0 then
    raise exception 'dias_uteis_invalidos' using errcode = '22023';
  end if;
  while contados < n loop
    atual := atual + 1;
    if private.eh_dia_util_nacional(atual) then
      contados := contados + 1;
    end if;
  end loop;
  return atual;
end;
$$;

-- Último dia do teste: `dias` dias úteis a partir do início (o próprio início conta, se útil).
create function private.fim_do_teste(inicio date, dias integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select private.somar_dias_uteis(inicio - 1, dias)
$$;

-- Receita mensal equivalente (MRR): no anual, o ano (10 mensalidades) dividido por 12.
create function private.equivalente_mensal(p_plano text, p_ciclo text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_ciclo = 'anual' then round(p.mensal_centavos * cfg.mensalidades_no_anual / 12.0)::integer
    else p.mensal_centavos
  end
  from private.plano_catalogo as p
  cross join private.configuracao_comercial as cfg
  where p.codigo = p_plano
$$;

-- Valor de um ciclo: a mensalidade, ou 10 mensalidades no anual.
create function private.valor_do_ciclo(p_plano text, p_ciclo text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_ciclo = 'anual' then p.mensal_centavos * cfg.mensalidades_no_anual else p.mensal_centavos end
  from private.plano_catalogo as p
  cross join private.configuracao_comercial as cfg
  where p.codigo = p_plano
$$;

revoke all on function private.pascoa(integer) from public, anon, authenticated;
revoke all on function private.eh_feriado_nacional(date) from public, anon, authenticated;
revoke all on function private.eh_dia_util_nacional(date) from public, anon, authenticated;
revoke all on function private.somar_dias_uteis(date, integer) from public, anon, authenticated;
revoke all on function private.fim_do_teste(date, integer) from public, anon, authenticated;
revoke all on function private.equivalente_mensal(text, text) from public, anon, authenticated;
revoke all on function private.valor_do_ciclo(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Condição comercial da consultoria (dias de teste e conta interna), escrita só pela central.
-- Sem linha = padrão (10 dias úteis, não interna).
-- ---------------------------------------------------------------------------
create table public.consultoria_condicao_comercial (
  consultoria_id uuid primary key references public.consultoria (id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  dias_de_teste integer not null default 10,
  interna boolean not null default false,
  alterada_em timestamptz not null default now(),
  alterada_por uuid references auth.users (id) on delete restrict,
  row_version integer not null default 1,
  constraint consultoria_condicao_comercial_consultoria_id_id_key unique (consultoria_id, id),
  constraint consultoria_condicao_comercial_dias check (dias_de_teste between 0 and 365)
);

comment on table public.consultoria_condicao_comercial is
  'Condição comercial (ADR-0026): dias de teste e conta interna (grátis, sem limite). Só a central escreve.';
comment on column public.consultoria_condicao_comercial.alterada_por is 'Usuário operador (auth.users), não membro.';

-- Histórico das mudanças da central: append-only, leitura só pela RPC (operador).
create table public.condicao_comercial_historico (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  tipo text not null,
  valor_anterior text not null,
  valor_novo text not null,
  motivo text not null,
  alterada_por uuid not null references auth.users (id) on delete restrict,
  alterada_em timestamptz not null default now(),
  constraint condicao_comercial_historico_tipo check (tipo in ('dias_de_teste', 'interna')),
  constraint condicao_comercial_historico_motivo check (length(btrim(motivo)) between 1 and 500)
);

create index condicao_comercial_historico_consultoria_idx
  on public.condicao_comercial_historico (consultoria_id, alterada_em desc);

create trigger condicao_comercial_historico_bloquear_update_delete
  before update or delete on public.condicao_comercial_historico
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger condicao_comercial_historico_bloquear_truncate
  before truncate on public.condicao_comercial_historico
  for each statement execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- 4. Assinatura e cobranças. Nesta versão (protótipo) a cobrança é SIMULADA: as RPCs da migration
-- seguinte gravam a assinatura e as cobranças; os ids do Asaas existem e ficam nulos até a
-- integração real (ADR-0026). Uma assinatura por consultoria (a atual); trocar de plano agenda para
-- o próximo ciclo; cancelar marca o fim do período pago (valida_ate). Sem documento nem cartão.
-- ---------------------------------------------------------------------------
create table public.assinatura (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  plano text not null,
  ciclo text not null,
  forma text not null,
  plano_agendado text,
  ciclo_agendado text,
  mudanca_em date,
  asaas_cliente_id text,
  asaas_assinatura_id text,
  moeda text not null default 'BRL',
  situacao_asaas text not null default 'ACTIVE',
  proximo_vencimento date,
  cancelada_em timestamptz,
  valida_ate date,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint assinatura_consultoria_key unique (consultoria_id),
  constraint assinatura_consultoria_id_id_key unique (consultoria_id, id),
  constraint assinatura_asaas_assinatura_key unique (asaas_assinatura_id),
  constraint assinatura_plano check (plano in ('essencial', 'equipe', 'escala')),
  constraint assinatura_plano_agendado check (plano_agendado is null or plano_agendado in ('essencial', 'equipe', 'escala')),
  constraint assinatura_ciclo check (ciclo in ('mensal', 'anual')),
  constraint assinatura_ciclo_agendado check (ciclo_agendado is null or ciclo_agendado in ('mensal', 'anual')),
  constraint assinatura_forma check (forma in ('pix', 'cartao')),
  constraint assinatura_mudanca_coerente check (
    (mudanca_em is null) = (plano_agendado is null and ciclo_agendado is null)
  ),
  constraint assinatura_cancelamento_coerente check ((cancelada_em is null) = (valida_ate is null)),
  constraint assinatura_moeda check (moeda = 'BRL')
);

comment on table public.assinatura is
  'Assinatura do plano (ADR-0026): plano, ciclo, forma e agendamentos. Ids do Asaas nulos até a integração real. Sem CPF nem cartão.';
comment on column public.assinatura.valida_ate is 'Cancelada: vale até este dia (fim do período pago).';

create table public.cobranca (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  assinatura_id uuid not null,
  tipo text not null,
  asaas_cobranca_id text,
  asaas_assinatura_id text,
  valor_centavos integer not null,
  moeda text not null default 'BRL',
  vencimento date not null,
  pago_em date,
  situacao text not null,
  forma text,
  invoice_url text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint cobranca_consultoria_id_id_key unique (consultoria_id, id),
  constraint cobranca_asaas_cobranca_key unique (asaas_cobranca_id),
  constraint cobranca_assinatura_fk foreign key (consultoria_id, assinatura_id)
    references public.assinatura (consultoria_id, id) on delete restrict,
  constraint cobranca_tipo check (tipo in ('plano', 'adicionais')),
  constraint cobranca_valor check (valor_centavos >= 0),
  constraint cobranca_moeda check (moeda = 'BRL'),
  constraint cobranca_situacao check (situacao in ('pendente', 'vencida', 'paga', 'estornada', 'removida')),
  constraint cobranca_paga_com_data check (situacao <> 'paga' or pago_em is not null),
  constraint cobranca_forma check (forma is null or forma in ('pix', 'cartao', 'outra')),
  constraint cobranca_invoice_url check (invoice_url is null or invoice_url ~ '^https://')
);

comment on table public.cobranca is
  'Cobranças do plano (ADR-0026): valor em centavos, vencimento (DATE) e pagamento. Simuladas no protótipo.';
comment on column public.cobranca.situacao is 'pendente | vencida | paga | estornada | removida. Em aberto = pendente ou vencida.';

create index cobranca_consultoria_vencimento_idx on public.cobranca (consultoria_id, vencimento desc);
create index cobranca_em_aberto_idx on public.cobranca (consultoria_id, vencimento)
  where situacao in ('pendente', 'vencida');

-- ---------------------------------------------------------------------------
-- 5. Confirmações de adicional: a Gestão confirmou pagar por N pessoas ou empreendimentos neste
-- plano. Append-only. Escrita só por confirmar_adicional.
-- ---------------------------------------------------------------------------
create table public.adicional_confirmado (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  recurso text not null,
  quantidade integer not null,
  limite integer not null,
  plano text not null,
  adicionais_centavos integer not null,
  confirmado_por uuid not null,
  confirmado_em timestamptz not null default now(),
  constraint adicional_confirmado_consultoria_id_id_key unique (consultoria_id, id),
  constraint adicional_confirmado_recurso check (recurso in ('pessoas', 'empreendimentos')),
  constraint adicional_confirmado_quantidade check (quantidade > limite and limite > 0),
  constraint adicional_confirmado_plano check (plano in ('essencial', 'equipe', 'escala')),
  constraint adicional_confirmado_valor check (adicionais_centavos > 0),
  constraint adicional_confirmado_autor_fk foreign key (consultoria_id, confirmado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.adicional_confirmado is
  'Confirmação da Gestão de passar do limite do plano, com o valor mensal mostrado (ADR-0026). Append-only.';

create index adicional_confirmado_consultoria_idx
  on public.adicional_confirmado (consultoria_id, recurso, quantidade desc);

create trigger adicional_confirmado_bloquear_update_delete
  before update or delete on public.adicional_confirmado
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger adicional_confirmado_bloquear_truncate
  before truncate on public.adicional_confirmado
  for each statement execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- 6. RLS. Leitura: Gestão (assinatura, cobranças, confirmações); condição comercial, qualquer
-- membro. O histórico da central não tem grant (leitura só pela RPC do operador). Nenhuma escrita
-- direta: o cliente escreve por RPC; o Asaas, pela Edge Function com a service role.
-- ---------------------------------------------------------------------------
alter table public.consultoria_condicao_comercial enable row level security;
alter table public.consultoria_condicao_comercial force row level security;
alter table public.condicao_comercial_historico enable row level security;
alter table public.condicao_comercial_historico force row level security;
alter table public.assinatura enable row level security;
alter table public.assinatura force row level security;
alter table public.cobranca enable row level security;
alter table public.cobranca force row level security;
alter table public.adicional_confirmado enable row level security;
alter table public.adicional_confirmado force row level security;

revoke all on table public.consultoria_condicao_comercial from public, anon, authenticated;
revoke all on table public.condicao_comercial_historico from public, anon, authenticated;
revoke all on table public.assinatura from public, anon, authenticated;
revoke all on table public.cobranca from public, anon, authenticated;
revoke all on table public.adicional_confirmado from public, anon, authenticated;
grant select on table public.consultoria_condicao_comercial to authenticated;
grant select on table public.assinatura to authenticated;
grant select on table public.cobranca to authenticated;
grant select on table public.adicional_confirmado to authenticated;
-- As Edge Functions (service role) escrevem só por RPC; leitura explícita para conferências.
grant select on table public.consultoria_condicao_comercial, public.assinatura, public.cobranca,
  public.adicional_confirmado to service_role;

create policy consultoria_condicao_comercial_select_membro
  on public.consultoria_condicao_comercial
  for select
  to authenticated
  using ((select private.is_membro(consultoria_id)));

create policy condicao_comercial_historico_select_operador
  on public.condicao_comercial_historico
  for select
  to authenticated
  using ((select private.is_operador()));

create policy assinatura_select_gestao
  on public.assinatura
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy cobranca_select_gestao
  on public.cobranca
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy adicional_confirmado_select_gestao
  on public.adicional_confirmado
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

-- O suporte só lê (ADR-0025): as tabelas novas com consultoria_id recebem a barreira do suporte.
create trigger _suporte_somente_leitura
  before insert or update or delete on public.consultoria_condicao_comercial
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.assinatura
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.cobranca
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.adicional_confirmado
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.condicao_comercial_historico
  for each row execute function private.bloquear_escrita_do_suporte();

-- ---------------------------------------------------------------------------
-- 7. Situação comercial calculada. Função pura (as entradas de situacaoComercial do domínio) e a
-- que reúne as entradas de uma consultoria.
-- ---------------------------------------------------------------------------
create function private.situacao_comercial_calculada(
  p_hoje date,
  p_criada_em date,
  p_fim_do_beta date,
  p_dias_de_teste integer,
  p_interna boolean,
  p_plano text,
  p_ciclo text,
  p_plano_agendado text,
  p_ciclo_agendado text,
  p_mudanca_em date,
  p_valida_ate date,
  p_vencimentos_em_aberto date[]
)
returns table (
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  plano_vigente text,
  ciclo_vigente text,
  limite_pessoas integer,
  limite_empreendimentos integer,
  teste_ate date,
  beta_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  vence_hoje boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teste_ate date;
  v_beta_ate date;
  v_vence_hoje boolean := p_hoje = any (coalesce(p_vencimentos_em_aberto, '{}'::date[]));
  v_plano text;
  v_ciclo text;
  v_pessoas integer;
  v_empreendimentos integer;
  v_orcamentos boolean;
  v_mais_antigo date;
  v_ultimo_dia date;
  v_tolerancia integer;
begin
  select cfg.dias_uteis_de_tolerancia into v_tolerancia from private.configuracao_comercial as cfg;
  v_beta_ate := case when p_criada_em <= p_fim_do_beta then p_fim_do_beta end;
  v_teste_ate := private.fim_do_teste(
    case when p_criada_em <= p_fim_do_beta then p_fim_do_beta + 1 else p_criada_em end,
    p_dias_de_teste
  );

  if p_interna then
    return query select 'interna'::text, false, true, null::text, null::text, null::integer,
      null::integer, v_teste_ate, v_beta_ate, null::date, null::date, false;
    return;
  end if;

  if p_plano is not null then
    v_plano := case when p_plano_agendado is not null and p_mudanca_em is not null and p_hoje >= p_mudanca_em
                    then p_plano_agendado else p_plano end;
    v_ciclo := case when p_ciclo_agendado is not null and p_mudanca_em is not null and p_hoje >= p_mudanca_em
                    then p_ciclo_agendado else p_ciclo end;
  end if;

  if v_beta_ate is not null and p_hoje <= v_beta_ate then
    return query select 'beta'::text, false, true, v_plano, v_ciclo, null::integer, null::integer,
      v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
    return;
  end if;

  if p_plano is not null and (p_valida_ate is null or p_hoje <= p_valida_ate) then
    select pc.pessoas, pc.empreendimentos, pc.orcamentos
    into v_pessoas, v_empreendimentos, v_orcamentos
    from private.plano_catalogo as pc
    where pc.codigo = v_plano;

    select min(v) into v_mais_antigo
    from unnest(coalesce(p_vencimentos_em_aberto, '{}'::date[])) as v
    where v < p_hoje;

    if v_mais_antigo is not null then
      v_ultimo_dia := private.somar_dias_uteis(v_mais_antigo, v_tolerancia);
      if p_hoje > v_ultimo_dia then
        return query select 'bloqueada'::text, true, false, v_plano, v_ciclo, v_pessoas, v_empreendimentos,
          v_teste_ate, v_beta_ate, v_mais_antigo, v_ultimo_dia + 1, v_vence_hoje;
      else
        return query select 'em_atraso'::text, false, v_orcamentos, v_plano, v_ciclo, v_pessoas,
          v_empreendimentos, v_teste_ate, v_beta_ate, v_mais_antigo, v_ultimo_dia + 1, v_vence_hoje;
      end if;
      return;
    end if;

    if p_hoje <= v_teste_ate then
      return query select 'teste'::text, false, true, v_plano, v_ciclo, null::integer, null::integer,
        v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
      return;
    end if;

    return query select 'ativa'::text, false, v_orcamentos, v_plano, v_ciclo, v_pessoas, v_empreendimentos,
      v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
    return;
  end if;

  if p_hoje <= v_teste_ate then
    return query select 'teste'::text, false, true, null::text, null::text, null::integer, null::integer,
      v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
    return;
  end if;

  return query select case when p_plano is not null then 'cancelada' else 'teste_encerrado' end,
    true, false, null::text, null::text, null::integer, null::integer, v_teste_ate, v_beta_ate,
    null::date, null::date, false;
end;
$$;

-- "Hoje" no fuso da consultoria (nunca no fuso do aparelho): private.hoje_da_consultoria, da
-- migration 20261018105811.

-- Situação de uma consultoria num dia. Recebe o dia para os testes simularem datas (o app e as
-- triggers passam hoje no fuso da consultoria).
create function private.situacao_comercial_em(cid uuid, p_hoje date)
returns table (
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  plano_vigente text,
  ciclo_vigente text,
  limite_pessoas integer,
  limite_empreendimentos integer,
  teste_ate date,
  beta_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  vence_hoje boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_criada date;
  v_cfg private.configuracao_comercial;
  v_condicao public.consultoria_condicao_comercial;
  v_assinatura public.assinatura;
  v_vencimentos date[];
begin
  select (c.criada_em at time zone c.fuso)::date into v_criada from public.consultoria as c where c.id = cid;
  if not found then
    return;
  end if;
  select * into v_cfg from private.configuracao_comercial as cfg where cfg.id;
  select * into v_condicao from public.consultoria_condicao_comercial as cc where cc.consultoria_id = cid;
  select * into v_assinatura from public.assinatura as a where a.consultoria_id = cid;
  select coalesce(array_agg(cb.vencimento order by cb.vencimento), '{}'::date[]) into v_vencimentos
  from public.cobranca as cb
  where cb.consultoria_id = cid and cb.situacao in ('pendente', 'vencida');

  return query select * from private.situacao_comercial_calculada(
    p_hoje,
    v_criada,
    v_cfg.fim_do_beta,
    coalesce(v_condicao.dias_de_teste, v_cfg.dias_de_teste_padrao),
    coalesce(v_condicao.interna, false),
    v_assinatura.plano,
    v_assinatura.ciclo,
    v_assinatura.plano_agendado,
    v_assinatura.ciclo_agendado,
    v_assinatura.mudanca_em,
    v_assinatura.valida_ate,
    v_vencimentos
  );
end;
$$;

-- Está em só leitura hoje? (Storage e trigger.) Consultoria inexistente: não.
create function private.consultoria_somente_leitura(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.somente_leitura from private.situacao_comercial_em(cid, private.hoje_da_consultoria(cid)) as s
  ), false)
$$;

revoke all on function private.situacao_comercial_calculada(date, date, date, integer, boolean, text, text, text, text, date, date, date[])
  from public, anon, authenticated;
revoke all on function private.situacao_comercial_em(uuid, date) from public, anon, authenticated;
revoke all on function private.consultoria_somente_leitura(uuid) from public, anon;
-- A política de envio do Storage chama com o papel de quem envia.
grant execute on function private.consultoria_somente_leitura(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Barreira comercial de escrita: trigger BEFORE INSERT/UPDATE/DELETE "_comercial_somente_leitura"
-- em toda tabela de public com consultoria_id (e em consultoria), menos as exceções abaixo.
--   Só leitura (atraso de 2 dias úteis, teste acabado sem plano, cancelada depois do período
--   pago): recusa com 'consultoria_somente_leitura' (42501).
--   Tabelas de orçamento (2º argumento 'orcamentos'): fora do Equipe e do Escala (e fora do
--   teste, do beta e da conta interna), recusa com 'orcamentos_fora_do_plano' (42501).
-- Leitura nunca é barrada. Escrita sem usuário (service role das Edge Functions, migrations,
-- Auth) passa. Colunas liberadas: em consultoria, a situação mudada pela central (ADR-0022); em
-- membro, nome e e-mail copiados da conta (trigger de identidade).
-- Exceções (o que o pagamento e a central precisam, e a trilha da plataforma): assinatura,
-- cobranca, consultoria_condicao_comercial, condicao_comercial_historico,
-- consultoria_situacao_historico, acesso_suporte, acesso_suporte_evento, uso_diario e auditoria
-- (escrita só por triggers das tabelas já barradas). O teste 020 confere a lista.
-- ---------------------------------------------------------------------------
create function private.bloquear_escrita_comercial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coluna text := coalesce(tg_argv[0], 'consultoria_id');
  modulo text := coalesce(tg_argv[1], '');
  livres text[];
  cid uuid;
  s record;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    livres := case tg_table_name
      when 'consultoria' then array['situacao', 'situacao_motivo', 'situacao_alterada_em', 'situacao_alterada_por', 'row_version']
      when 'membro' then array['nome', 'email']
      else array[]::text[]
    end;
    if cardinality(livres) > 0 and (to_jsonb(new) - livres) = (to_jsonb(old) - livres) then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    cid := (to_jsonb(old) ->> coluna)::uuid;
  else
    cid := (to_jsonb(new) ->> coluna)::uuid;
  end if;

  if cid is not null then
    select * into s from private.situacao_comercial_em(cid, private.hoje_da_consultoria(cid));
    if found then
      if s.somente_leitura then
        raise exception 'consultoria_somente_leitura' using errcode = '42501', detail = s.situacao;
      end if;
      if modulo = 'orcamentos' and not s.orcamentos_liberados then
        raise exception 'orcamentos_fora_do_plano' using errcode = '42501',
          hint = 'Orçamentos fazem parte dos planos Equipe e Escala.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.bloquear_escrita_comercial() from public, anon, authenticated;

do $$
declare
  tabela record;
begin
  for tabela in
    select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and exists (
        select 1 from pg_catalog.pg_attribute as a
        where a.attrelid = c.oid and a.attname = 'consultoria_id' and not a.attisdropped
      )
      and c.relname not in (
        'assinatura', 'cobranca', 'consultoria_condicao_comercial',
        'condicao_comercial_historico', 'consultoria_situacao_historico', 'acesso_suporte',
        'acesso_suporte_evento', 'uso_diario', 'auditoria'
      )
    order by c.relname
  loop
    if tabela.relname like 'orcamento%' then
      execute format(
        'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
        'for each row execute function private.bloquear_escrita_comercial(''consultoria_id'', ''orcamentos'')',
        tabela.relname
      );
    else
      execute format(
        'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
        'for each row execute function private.bloquear_escrita_comercial()',
        tabela.relname
      );
    end if;
  end loop;
end;
$$;

create trigger _comercial_somente_leitura
  before insert or update or delete on public.consultoria
  for each row execute function private.bloquear_escrita_comercial('id');

-- Storage: enviar arquivo também respeita o só leitura (ler e baixar continuam liberados).
drop policy arquivos_insert_membro_ativo on storage.objects;

create policy arquivos_insert_membro_ativo
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'arquivos'
    and (select private.is_membro_vinculado(private.consultoria_do_caminho(name)))
    and not (select private.consultoria_somente_leitura(private.consultoria_do_caminho(name)))
  );

-- ---------------------------------------------------------------------------
-- 9. Uso contra o limite e adicionais.
-- Pessoas = membros ativos (o suporte não é membro e não conta). Para convidar, conta também os
-- convites pendentes (cada convite é uma vaga reservada).
-- Empreendimento ativo = empreendimento com ao menos uma licença ativa (instrumento com o plano
-- ativado). A ação que o torna ativo é ativar a primeira licença dele.
-- ---------------------------------------------------------------------------
create function private.pessoas_ativas(cid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.membro as m where m.consultoria_id = cid and m.situacao = 'ativo'
$$;

create function private.convites_pendentes(cid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.convite as c where c.consultoria_id = cid and c.situacao = 'pendente'
$$;

create function private.empreendimentos_ativos(cid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct i.empreendimento_id)::integer
  from public.instrumento as i
  where i.consultoria_id = cid and i.situacao = 'ativo'
$$;

-- Adicionais por mês (centavos) para um uso e um plano: R$ 20 por pessoa ou empreendimento além
-- do limite. Plano nulo (teste, beta, interna): zero.
create function private.adicionais_centavos(p_plano text, p_pessoas integer, p_empreendimentos integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (greatest(0, p_pessoas - pc.pessoas) + greatest(0, p_empreendimentos - pc.empreendimentos))
           * cfg.adicional_mensal_centavos
    from private.plano_catalogo as pc
    cross join private.configuracao_comercial as cfg
    where pc.codigo = p_plano
  ), 0)
$$;

-- A ação leva o recurso a `quantidade`: cabe no limite, ou a Gestão já confirmou pagar por essa
-- quantidade neste plano? Senão, recusa com 'adicional_nao_confirmado' (o front mostra o diálogo
-- do adicional e chama confirmar_adicional).
create function private.exigir_confirmacao_de_adicional(cid uuid, p_recurso text, p_quantidade integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  v_limite integer;
begin
  select * into s from private.situacao_comercial_em(cid, private.hoje_da_consultoria(cid));
  if not found then
    return;
  end if;
  v_limite := case p_recurso when 'pessoas' then s.limite_pessoas else s.limite_empreendimentos end;
  if v_limite is null or p_quantidade <= v_limite then
    return;
  end if;
  if exists (
    select 1 from public.adicional_confirmado as a
    where a.consultoria_id = cid and a.recurso = p_recurso and a.quantidade >= p_quantidade
      and a.plano = s.plano_vigente
  ) then
    return;
  end if;
  raise exception 'adicional_nao_confirmado' using errcode = 'P0001', detail = p_recurso;
end;
$$;

create function private.conferir_limite_do_convite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao = 'pendente' then
    perform private.exigir_confirmacao_de_adicional(
      new.consultoria_id, 'pessoas',
      private.pessoas_ativas(new.consultoria_id) + private.convites_pendentes(new.consultoria_id) + 1
    );
  end if;
  return new;
end;
$$;

create function private.conferir_limite_do_empreendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao <> 'ativo' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.situacao = 'ativo' then
      return new;
    end if;
  end if;
  if not exists (
       select 1 from public.instrumento as i
       where i.consultoria_id = new.consultoria_id and i.empreendimento_id = new.empreendimento_id
         and i.situacao = 'ativo' and i.id <> new.id
     ) then
    perform private.exigir_confirmacao_de_adicional(
      new.consultoria_id, 'empreendimentos', private.empreendimentos_ativos(new.consultoria_id) + 1
    );
  end if;
  return new;
end;
$$;

revoke all on function private.pessoas_ativas(uuid) from public, anon, authenticated;
revoke all on function private.convites_pendentes(uuid) from public, anon, authenticated;
revoke all on function private.empreendimentos_ativos(uuid) from public, anon, authenticated;
revoke all on function private.adicionais_centavos(text, integer, integer) from public, anon, authenticated;
revoke all on function private.exigir_confirmacao_de_adicional(uuid, text, integer) from public, anon, authenticated;
revoke all on function private.conferir_limite_do_convite() from public, anon, authenticated;
revoke all on function private.conferir_limite_do_empreendimento() from public, anon, authenticated;

-- Convidar: aceitar o convite nunca é barrado (a confirmação foi dada ao convidar).
create trigger limite_do_plano
  before insert on public.convite
  for each row execute function private.conferir_limite_do_convite();

create trigger limite_do_plano
  before insert or update of situacao on public.instrumento
  for each row execute function private.conferir_limite_do_empreendimento();

-- ---------------------------------------------------------------------------
-- 10. RPCs da consultoria
-- ---------------------------------------------------------------------------

-- Situação comercial para as faixas e a página "Plano e cobrança". Qualquer membro (e o suporte)
-- lê; o link e o valor da cobrança em aberto só para a Gestão. Devolve as entradas do domínio
-- (situacaoComercial) e o resultado do banco.
create function public.situacao_comercial(p_consultoria_id uuid)
returns table (
  hoje date,
  criada_em date,
  fim_do_beta date,
  dias_de_teste integer,
  interna boolean,
  plano text,
  ciclo text,
  forma text,
  plano_agendado text,
  ciclo_agendado text,
  mudanca_em date,
  valida_ate date,
  proximo_vencimento date,
  vencimentos_em_aberto jsonb,
  pessoas integer,
  convites_pendentes integer,
  empreendimentos integer,
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  teste_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  cobranca_aberta_id uuid,
  cobranca_aberta_valor_centavos integer,
  cobranca_aberta_vencimento date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
  v_gestao boolean;
begin
  if not private.is_membro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);
  v_gestao := private.is_gestao(p_consultoria_id);

  return query
  select
    v_hoje,
    (c.criada_em at time zone c.fuso)::date,
    cfg.fim_do_beta,
    coalesce(cc.dias_de_teste, cfg.dias_de_teste_padrao),
    coalesce(cc.interna, false),
    a.plano,
    a.ciclo,
    a.forma,
    a.plano_agendado,
    a.ciclo_agendado,
    a.mudanca_em,
    a.valida_ate,
    a.proximo_vencimento,
    coalesce((
      select jsonb_agg(cb.vencimento order by cb.vencimento) from public.cobranca as cb
      where cb.consultoria_id = c.id and cb.situacao in ('pendente', 'vencida')
    ), '[]'::jsonb),
    private.pessoas_ativas(c.id),
    private.convites_pendentes(c.id),
    private.empreendimentos_ativos(c.id),
    s.situacao,
    s.somente_leitura,
    s.orcamentos_liberados,
    s.teste_ate,
    s.em_atraso_desde,
    s.bloqueio_em,
    case when v_gestao then ab.id end,
    case when v_gestao then ab.valor_centavos end,
    case when v_gestao then ab.vencimento end
  from public.consultoria as c
  cross join private.configuracao_comercial as cfg
  cross join lateral private.situacao_comercial_em(c.id, v_hoje) as s
  left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = c.id
  left join public.assinatura as a on a.consultoria_id = c.id
  left join lateral (
    select cb.id, cb.valor_centavos, cb.vencimento
    from public.cobranca as cb
    where cb.consultoria_id = c.id and cb.situacao in ('pendente', 'vencida') and cb.vencimento <= v_hoje
    order by cb.vencimento, cb.id
    limit 1
  ) as ab on true
  where c.id = p_consultoria_id;
end;
$$;

-- A Gestão confirma passar do limite (pessoas: convidar; empreendimentos: ativar a primeira
-- licença de um empreendimento). Conta a quantidade depois da ação e grava a confirmação com o
-- valor mensal dos adicionais. Idempotente: confirmação que já cobre a quantidade não duplica.
-- Dentro do limite (ou sem limite), não grava nada e devolve zero.
create function public.confirmar_adicional(p_consultoria_id uuid, p_recurso text)
returns table (
  recurso text,
  quantidade integer,
  limite integer,
  adicionais_centavos integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_quantidade integer;
  v_limite integer;
  v_valor integer;
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_recurso is null or p_recurso not in ('pessoas', 'empreendimentos') then
    raise exception 'recurso_invalido' using errcode = '22023';
  end if;
  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;

  select * into s from private.situacao_comercial_em(p_consultoria_id, private.hoje_da_consultoria(p_consultoria_id));
  if p_recurso = 'pessoas' then
    v_quantidade := private.pessoas_ativas(p_consultoria_id) + private.convites_pendentes(p_consultoria_id) + 1;
    v_limite := s.limite_pessoas;
    v_valor := private.adicionais_centavos(s.plano_vigente, v_quantidade, private.empreendimentos_ativos(p_consultoria_id));
  else
    v_quantidade := private.empreendimentos_ativos(p_consultoria_id) + 1;
    v_limite := s.limite_empreendimentos;
    v_valor := private.adicionais_centavos(s.plano_vigente, private.pessoas_ativas(p_consultoria_id), v_quantidade);
  end if;

  if v_limite is null or v_quantidade <= v_limite then
    return query select p_recurso, v_quantidade, v_limite, 0;
    return;
  end if;

  if not exists (
    select 1 from public.adicional_confirmado as a
    where a.consultoria_id = p_consultoria_id and a.recurso = p_recurso and a.quantidade >= v_quantidade
      and a.plano = s.plano_vigente
  ) then
    insert into public.adicional_confirmado
      (consultoria_id, recurso, quantidade, limite, plano, adicionais_centavos, confirmado_por)
    values (p_consultoria_id, p_recurso, v_quantidade, v_limite, s.plano_vigente, v_valor,
            private.membro_atual(p_consultoria_id));
  end if;

  return query select p_recurso, v_quantidade, v_limite, v_valor;
end;
$$;

revoke all on function public.situacao_comercial(uuid) from public, anon;
revoke all on function public.confirmar_adicional(uuid, text) from public, anon;
grant execute on function public.situacao_comercial(uuid) to authenticated;
grant execute on function public.confirmar_adicional(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Central (operador com dois fatores): Financeiro, plano da consultoria, dias de teste e
-- conta interna.
-- ---------------------------------------------------------------------------

-- Resumo comercial de uma consultoria para a central: situação, plano, valor mensal equivalente
-- (plano + adicionais pelo uso de hoje) e "teste acabando" (hoje ou nos próximos 3 dias úteis).
create function private.resumo_comercial(cid uuid)
returns table (
  situacao text,
  plano text,
  ciclo text,
  teste_ate date,
  em_atraso_desde date,
  mensal_centavos integer,
  teste_acabando boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := private.hoje_da_consultoria(cid);
  s record;
  v_adicionais integer;
begin
  select * into s from private.situacao_comercial_em(cid, v_hoje);
  if not found then
    return;
  end if;
  v_adicionais := private.adicionais_centavos(s.plano_vigente, private.pessoas_ativas(cid),
                                              private.empreendimentos_ativos(cid));
  return query select
    s.situacao,
    s.plano_vigente,
    s.ciclo_vigente,
    s.teste_ate,
    s.em_atraso_desde,
    case when s.situacao in ('ativa', 'em_atraso', 'bloqueada')
      then private.equivalente_mensal(s.plano_vigente, s.ciclo_vigente) + coalesce(v_adicionais, 0)
      else 0 end,
    s.situacao = 'teste' and v_hoje <= s.teste_ate and s.teste_ate <= private.somar_dias_uteis(v_hoje, 3);
end;
$$;

revoke all on function private.resumo_comercial(uuid) from public, anon, authenticated;

-- Números do Financeiro. Pagantes = ativas; em atraso inclui as em só leitura por atraso. MRR =
-- soma do valor mensal equivalente (anual / 12) mais adicionais de ativas e em atraso.
create function public.central_resumo_financeiro()
returns table (
  pagantes integer,
  em_teste integer,
  beta integer,
  internas integer,
  em_atraso integer,
  bloqueadas integer,
  cancelados integer,
  teste_encerrado integer,
  teste_acabando integer,
  mrr_centavos bigint,
  ticket_medio_centavos bigint,
  mensais integer,
  anuais integer,
  receita_essencial_centavos bigint,
  receita_equipe_centavos bigint,
  receita_escala_centavos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  with r as (
    select x.* from public.consultoria as c cross join lateral private.resumo_comercial(c.id) as x
  ),
  pagas as (
    select * from r where r.situacao in ('ativa', 'em_atraso', 'bloqueada')
  )
  select
    (select count(*) from r where r.situacao = 'ativa')::integer,
    (select count(*) from r where r.situacao = 'teste')::integer,
    (select count(*) from r where r.situacao = 'beta')::integer,
    (select count(*) from r where r.situacao = 'interna')::integer,
    (select count(*) from r where r.situacao in ('em_atraso', 'bloqueada'))::integer,
    (select count(*) from r where r.situacao = 'bloqueada')::integer,
    (select count(*) from r where r.situacao = 'cancelada')::integer,
    (select count(*) from r where r.situacao = 'teste_encerrado')::integer,
    (select count(*) from r where r.teste_acabando)::integer,
    coalesce((select sum(p.mensal_centavos) from pagas as p), 0)::bigint,
    coalesce((select round(avg(p.mensal_centavos)) from pagas as p), 0)::bigint,
    (select count(*) from pagas as p where p.ciclo = 'mensal')::integer,
    (select count(*) from pagas as p where p.ciclo = 'anual')::integer,
    coalesce((select sum(p.mensal_centavos) from pagas as p where p.plano = 'essencial'), 0)::bigint,
    coalesce((select sum(p.mensal_centavos) from pagas as p where p.plano = 'equipe'), 0)::bigint,
    coalesce((select sum(p.mensal_centavos) from pagas as p where p.plano = 'escala'), 0)::bigint;
end;
$$;

-- Lista do Financeiro por grupo: pagantes, teste, teste_acabando, beta, internas, em_atraso,
-- cancelados, teste_encerrado (nulo: todas). Paginada.
create function public.central_financeiro_lista(
  p_grupo text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  situacao text,
  plano text,
  ciclo text,
  teste_ate date,
  em_atraso_desde date,
  mensal_centavos integer,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  if p_grupo is not null and p_grupo not in (
    'pagantes', 'teste', 'teste_acabando', 'beta', 'internas', 'em_atraso', 'cancelados', 'teste_encerrado'
  ) then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  return query
  select c.id, c.nome, r.situacao, r.plano, r.ciclo, r.teste_ate, r.em_atraso_desde, r.mensal_centavos,
         count(*) over ()
  from public.consultoria as c
  cross join lateral private.resumo_comercial(c.id) as r
  where p_grupo is null
     or (p_grupo = 'pagantes' and r.situacao = 'ativa')
     or (p_grupo = 'teste' and r.situacao = 'teste')
     or (p_grupo = 'teste_acabando' and r.teste_acabando)
     or (p_grupo = 'beta' and r.situacao = 'beta')
     or (p_grupo = 'internas' and r.situacao = 'interna')
     or (p_grupo = 'em_atraso' and r.situacao in ('em_atraso', 'bloqueada'))
     or (p_grupo = 'cancelados' and r.situacao = 'cancelada')
     or (p_grupo = 'teste_encerrado' and r.situacao = 'teste_encerrado')
  order by private.normalizar_nome(c.nome), c.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- Plano e cobrança no detalhe da consultoria, na central.
create function public.central_plano_da_consultoria(p_consultoria_id uuid)
returns table (
  hoje date,
  criada_em date,
  fim_do_beta date,
  dias_de_teste integer,
  interna boolean,
  condicao_row_version integer,
  plano text,
  ciclo text,
  forma text,
  plano_agendado text,
  ciclo_agendado text,
  mudanca_em date,
  valida_ate date,
  proximo_vencimento date,
  situacao_asaas text,
  vencimentos_em_aberto jsonb,
  pessoas integer,
  convites_pendentes integer,
  empreendimentos integer,
  situacao text,
  somente_leitura boolean,
  teste_ate date,
  em_atraso_desde date,
  bloqueio_em date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
begin
  perform private.exigir_operador();
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);
  return query
  select
    v_hoje,
    (c.criada_em at time zone c.fuso)::date,
    cfg.fim_do_beta,
    coalesce(cc.dias_de_teste, cfg.dias_de_teste_padrao),
    coalesce(cc.interna, false),
    coalesce(cc.row_version, 0),
    a.plano,
    a.ciclo,
    a.forma,
    a.plano_agendado,
    a.ciclo_agendado,
    a.mudanca_em,
    a.valida_ate,
    a.proximo_vencimento,
    a.situacao_asaas,
    coalesce((
      select jsonb_agg(cb.vencimento order by cb.vencimento) from public.cobranca as cb
      where cb.consultoria_id = c.id and cb.situacao in ('pendente', 'vencida')
    ), '[]'::jsonb),
    private.pessoas_ativas(c.id),
    private.convites_pendentes(c.id),
    private.empreendimentos_ativos(c.id),
    s.situacao,
    s.somente_leitura,
    s.teste_ate,
    s.em_atraso_desde,
    s.bloqueio_em
  from public.consultoria as c
  cross join private.configuracao_comercial as cfg
  cross join lateral private.situacao_comercial_em(c.id, v_hoje) as s
  left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = c.id
  left join public.assinatura as a on a.consultoria_id = c.id
  where c.id = p_consultoria_id;
end;
$$;

-- Cobranças da consultoria, na central (mais recente primeiro), com o link do Asaas.
create function public.central_cobrancas(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  tipo text,
  valor_centavos integer,
  vencimento date,
  pago_em date,
  situacao text,
  forma text,
  invoice_url text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  select cb.id, cb.tipo, cb.valor_centavos, cb.vencimento, cb.pago_em, cb.situacao, cb.forma, cb.invoice_url,
         count(*) over ()
  from public.cobranca as cb
  where cb.consultoria_id = p_consultoria_id
  order by cb.vencimento desc, cb.criada_em desc, cb.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- Histórico das mudanças comerciais feitas pela central (dias de teste e conta interna).
create function public.central_historico_comercial(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  tipo text,
  valor_anterior text,
  valor_novo text,
  motivo text,
  alterada_em timestamptz,
  alterada_por_nome text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  select h.id, h.tipo, h.valor_anterior, h.valor_novo, h.motivo, h.alterada_em,
         private.nome_do_usuario(u.raw_user_meta_data, u.email), count(*) over ()
  from public.condicao_comercial_historico as h
  join auth.users as u on u.id = h.alterada_por
  where h.consultoria_id = p_consultoria_id
  order by h.alterada_em desc, h.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- Grava a condição (cria a linha na primeira vez) e o histórico. Confere row_version (0 quando a
-- consultoria ainda não tem linha). Repetir o mesmo valor não muda nada nem grava histórico.
create function private.mudar_condicao_comercial(
  cid uuid,
  p_tipo text,
  p_dias integer,
  p_interna boolean,
  p_motivo text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual public.consultoria_condicao_comercial;
  cfg private.configuracao_comercial;
  motivo_limpo text := nullif(btrim(coalesce(p_motivo, '')), '');
  anterior text;
  novo text;
begin
  if motivo_limpo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  if length(motivo_limpo) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  perform 1 from public.consultoria as c where c.id = cid for update;
  if not found then
    raise exception 'consultoria_inexistente' using errcode = 'P0001';
  end if;
  select * into cfg from private.configuracao_comercial as x where x.id;
  select * into atual from public.consultoria_condicao_comercial as cc where cc.consultoria_id = cid;
  if coalesce(atual.row_version, 0) <> coalesce(p_row_version, -1) then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  if p_tipo = 'dias_de_teste' then
    anterior := coalesce(atual.dias_de_teste, cfg.dias_de_teste_padrao)::text;
    novo := p_dias::text;
  else
    anterior := coalesce(atual.interna, false)::text;
    novo := p_interna::text;
  end if;
  if anterior = novo then
    return coalesce(atual.row_version, 0);
  end if;

  insert into public.consultoria_condicao_comercial as cc
    (consultoria_id, dias_de_teste, interna, alterada_em, alterada_por)
  values (cid,
          case when p_tipo = 'dias_de_teste' then p_dias else cfg.dias_de_teste_padrao end,
          case when p_tipo = 'interna' then p_interna else false end,
          now(), (select auth.uid()))
  on conflict (consultoria_id) do update
    set dias_de_teste = case when p_tipo = 'dias_de_teste' then p_dias else cc.dias_de_teste end,
        interna = case when p_tipo = 'interna' then p_interna else cc.interna end,
        alterada_em = now(),
        alterada_por = (select auth.uid()),
        row_version = cc.row_version + 1;

  insert into public.condicao_comercial_historico
    (consultoria_id, tipo, valor_anterior, valor_novo, motivo, alterada_por)
  values (cid, p_tipo, anterior, novo, motivo_limpo, (select auth.uid()));

  return (select cc.row_version from public.consultoria_condicao_comercial as cc where cc.consultoria_id = cid);
end;
$$;

revoke all on function private.mudar_condicao_comercial(uuid, text, integer, boolean, text, integer)
  from public, anon, authenticated;

-- Ajustar os dias úteis de teste da consultoria (0 a 365), com motivo.
create function public.central_ajustar_dias_de_teste(
  p_consultoria_id uuid,
  p_dias integer,
  p_motivo text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  if p_dias is null or p_dias < 0 or p_dias > 365 then
    raise exception 'dias_de_teste_invalidos' using errcode = '22023';
  end if;
  return private.mudar_condicao_comercial(p_consultoria_id, 'dias_de_teste', p_dias, null, p_motivo, p_row_version);
end;
$$;

-- Marcar ou desmarcar conta interna (grátis para sempre, sem limite e sem cobrança), com motivo.
create function public.central_marcar_conta_interna(
  p_consultoria_id uuid,
  p_interna boolean,
  p_motivo text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  if p_interna is null then
    raise exception 'valor_obrigatorio' using errcode = '22023';
  end if;
  return private.mudar_condicao_comercial(p_consultoria_id, 'interna', null, p_interna, p_motivo, p_row_version);
end;
$$;

revoke all on function public.central_resumo_financeiro() from public, anon;
revoke all on function public.central_financeiro_lista(text, integer, integer) from public, anon;
revoke all on function public.central_plano_da_consultoria(uuid) from public, anon;
revoke all on function public.central_cobrancas(uuid, integer, integer) from public, anon;
revoke all on function public.central_historico_comercial(uuid, integer, integer) from public, anon;
revoke all on function public.central_ajustar_dias_de_teste(uuid, integer, text, integer) from public, anon;
revoke all on function public.central_marcar_conta_interna(uuid, boolean, text, integer) from public, anon;
grant execute on function public.central_resumo_financeiro() to authenticated;
grant execute on function public.central_financeiro_lista(text, integer, integer) to authenticated;
grant execute on function public.central_plano_da_consultoria(uuid) to authenticated;
grant execute on function public.central_cobrancas(uuid, integer, integer) to authenticated;
grant execute on function public.central_historico_comercial(uuid, integer, integer) to authenticated;
grant execute on function public.central_ajustar_dias_de_teste(uuid, integer, text, integer) to authenticated;
grant execute on function public.central_marcar_conta_interna(uuid, boolean, text, integer) to authenticated;
