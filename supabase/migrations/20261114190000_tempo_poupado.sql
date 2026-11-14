-- Indicadores de valor, etapa 2: horas devolvidas à equipe (ADR-0027; protótipo para revisão).
--
-- A. public.tarefa_cronometrada: um evento por tarefa terminada, com o tempo ATIVO medido no front
--    (aba visível e interação nos últimos 2 minutos). Tipos: cadastro_licenca_ia (quantidade =
--    condicionantes confirmadas), cadastro_condicionante_manual (1 por condicionante digitada),
--    acompanhamento (blocos de até 30 minutos na área de licenças e prazos) e orcamento. Só de
--    inserção; ninguém lê direto (nem a Gestão: ninguém vê tempo por pessoa). Escrita só por
--    registrar_tarefa (membro ativo de verdade; o suporte e o só leitura comercial não gravam).
-- B. public.linha_de_base: as 4 respostas da Gestão (licenças ativas, horas por semana conferindo
--    prazos, minutos por condicionante à mão, surpresas por mês). Só de inserção; escrita só por
--    responder_linha_de_base (Gestão de verdade); a Gestão lê só a data da última resposta.
-- C. Cálculo (o mesmo de packages/domain/src/horas-poupadas.ts):
--    minutos à mão  = medido (média das manuais até o fim do mês) com 5 ou mais condicionantes
--                     manuais; senão o declarado na linha de base
--    cadastro       = max(0, min à mão − min com IA) × condicionantes com IA no mês ÷ 60
--    acompanhamento = max(0, horas declaradas por semana × semanas do mês − horas ativas medidas)
--                     (semanas = dias do mês ÷ 7; no mês atual, só os dias até hoje);
--                     zero quando o mês não teve nenhum acompanhamento medido (sem uso, sem economia)
--    total          = cadastro + acompanhamento; em R$ = total × hora técnica da base de custos
--    estimado       = há linha de base (o acompanhamento sempre parte do declarado)
--    juntando dados = menos de 30 dias desde a primeira tarefa e menos de 10 condicionantes
-- D. central_horas_poupadas: operador com dois fatores; agregados por consultoria (nunca por
--    pessoa). Linha de base vigente = a última resposta até o instante do cálculo.

-- ---------------------------------------------------------------------------
-- A. Tarefas cronometradas
-- ---------------------------------------------------------------------------
create table public.tarefa_cronometrada (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  tipo text not null,
  quantidade integer not null,
  segundos_ativos integer not null,
  instante timestamptz not null default now(),
  constraint tarefa_cronometrada_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint tarefa_cronometrada_tipo check (
    tipo in ('cadastro_licenca_ia', 'cadastro_condicionante_manual', 'acompanhamento', 'orcamento')
  ),
  constraint tarefa_cronometrada_quantidade check (quantidade between 1 and 1000),
  constraint tarefa_cronometrada_segundos check (segundos_ativos between 1 and 28800)
);

comment on table public.tarefa_cronometrada is
  'Tempo ativo por tarefa (um evento por tarefa terminada). Só de inserção, escrita só por registrar_tarefa; ninguém lê direto, só os cálculos agregados por consultoria. Ver ADR-0027.';

create index tarefa_cronometrada_consultoria_idx
  on public.tarefa_cronometrada (consultoria_id, instante);

alter table public.tarefa_cronometrada enable row level security;
alter table public.tarefa_cronometrada force row level security;
revoke all on table public.tarefa_cronometrada from public, anon, authenticated;
grant select on table public.tarefa_cronometrada to authenticated;

-- Ninguém lê direto (como uso_diario): a única política nunca é verdadeira.
create policy tarefa_cronometrada_select_ninguem
  on public.tarefa_cronometrada
  for select
  to authenticated
  using (false);

create trigger tarefa_cronometrada_bloquear_update_delete
  before update or delete on public.tarefa_cronometrada
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger tarefa_cronometrada_bloquear_truncate
  before truncate on public.tarefa_cronometrada
  for each statement execute function private.bloquear_alteracao_auditoria();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.tarefa_cronometrada
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.tarefa_cronometrada
  for each row execute function private.bloquear_escrita_comercial();

-- RPC do front: grava uma tarefa terminada de quem chama. Só membro ativo de verdade (o suporte
-- não tem membro). Acompanhamento vem em blocos de até 30 minutos; as outras, até 8 horas.
create function public.registrar_tarefa(
  p_consultoria_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_segundos integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid;
begin
  if p_tipo is null or p_tipo not in (
    'cadastro_licenca_ia', 'cadastro_condicionante_manual', 'acompanhamento', 'orcamento'
  ) then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_segundos is null or p_segundos < 1 then
    raise exception 'tarefa_invalida' using errcode = '22023';
  end if;

  select m.id into eu
  from public.membro as m
  where m.consultoria_id = p_consultoria_id
    and m.usuario_id = (select auth.uid())
    and m.situacao = 'ativo';
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  insert into public.tarefa_cronometrada (consultoria_id, membro_id, tipo, quantidade, segundos_ativos)
  values (
    p_consultoria_id, eu, p_tipo, least(p_quantidade, 1000),
    least(p_segundos, case when p_tipo = 'acompanhamento' then 1800 else 28800 end)
  );
end;
$$;

revoke all on function public.registrar_tarefa(uuid, text, integer, integer) from public, anon;
grant execute on function public.registrar_tarefa(uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- B. Linha de base
-- ---------------------------------------------------------------------------
create table public.linha_de_base (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  respondido_por uuid not null,
  licencas_ativas integer not null,
  horas_semana_conferindo numeric(5, 1) not null,
  minutos_por_condicionante integer not null,
  surpresas_por_mes integer not null,
  respondido_em timestamptz not null default now(),
  constraint linha_de_base_respondido_por_fk foreign key (consultoria_id, respondido_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint linha_de_base_valores check (
    licencas_ativas between 0 and 100000
    and horas_semana_conferindo between 0 and 168
    and minutos_por_condicionante between 0 and 1440
    and surpresas_por_mes between 0 and 1000
  )
);

comment on table public.linha_de_base is
  'Respostas da Gestão às 4 perguntas da linha de base (antes do Grama). Só de inserção; escrita só por responder_linha_de_base. Ver ADR-0027.';

create index linha_de_base_consultoria_idx on public.linha_de_base (consultoria_id, respondido_em desc);

alter table public.linha_de_base enable row level security;
alter table public.linha_de_base force row level security;
revoke all on table public.linha_de_base from public, anon, authenticated;
grant select on table public.linha_de_base to authenticated;

create policy linha_de_base_select_ninguem
  on public.linha_de_base
  for select
  to authenticated
  using (false);

create trigger linha_de_base_bloquear_update_delete
  before update or delete on public.linha_de_base
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger linha_de_base_bloquear_truncate
  before truncate on public.linha_de_base
  for each statement execute function private.bloquear_alteracao_auditoria();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.linha_de_base
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.linha_de_base
  for each row execute function private.bloquear_escrita_comercial();

-- Só a Gestão de verdade responde (o suporte lê como Gestão, mas não tem membro).
create function public.responder_linha_de_base(
  p_consultoria_id uuid,
  p_licencas_ativas integer,
  p_horas_semana_conferindo numeric,
  p_minutos_por_condicionante integer,
  p_surpresas_por_mes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid;
  novo uuid;
begin
  select m.id into eu
  from public.membro as m
  where m.consultoria_id = p_consultoria_id
    and m.usuario_id = (select auth.uid())
    and m.situacao = 'ativo'
    and m.papel = 'gestao';
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  insert into public.linha_de_base (consultoria_id, respondido_por, licencas_ativas,
                                    horas_semana_conferindo, minutos_por_condicionante,
                                    surpresas_por_mes)
  values (p_consultoria_id, eu, p_licencas_ativas, round(p_horas_semana_conferindo, 1),
          p_minutos_por_condicionante, p_surpresas_por_mes)
  returning id into novo;
  return novo;
end;
$$;

revoke all on function public.responder_linha_de_base(uuid, integer, numeric, integer, integer)
  from public, anon;
grant execute on function public.responder_linha_de_base(uuid, integer, numeric, integer, integer)
  to authenticated;

-- Data da última resposta (zero ou uma linha), para o front decidir se mostra o diálogo. Só Gestão.
create function public.ultima_linha_de_base(p_consultoria_id uuid)
returns table (respondido_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  return query
  select l.respondido_em from public.linha_de_base as l
  where l.consultoria_id = p_consultoria_id
  order by l.respondido_em desc
  limit 1;
end;
$$;

revoke all on function public.ultima_linha_de_base(uuid) from public, anon;
grant execute on function public.ultima_linha_de_base(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- C. Cálculo num instante (interno), de uma consultoria. Mês atual primeiro.
-- ---------------------------------------------------------------------------
create function private.horas_poupadas_em(
  p_consultoria_id uuid,
  p_meses integer,
  p_agora timestamptz
)
returns table (
  mes date,
  condicionantes_ia bigint,
  segundos_ia bigint,
  condicionantes_manuais bigint,
  segundos_manuais bigint,
  segundos_acompanhamento bigint,
  semanas numeric,
  minutos_manual numeric,
  manual_medido boolean,
  horas_cadastro numeric,
  horas_acompanhamento numeric,
  horas_total numeric,
  hora_centavos bigint,
  reais_centavos bigint,
  estimado boolean,
  juntando_dados boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  meses integer := least(greatest(coalesce(p_meses, 6), 0), 24);
  fuso text;
  hoje date;
  mes_atual date;
  lb_horas numeric;
  lb_minutos numeric;
  hora bigint;
  primeira timestamptz;
  cadastradas bigint;
  juntando boolean;
begin
  select c.fuso into fuso from public.consultoria as c where c.id = p_consultoria_id;
  if not found then
    return;
  end if;
  hoje := (p_agora at time zone fuso)::date;
  mes_atual := date_trunc('month', hoje)::date;

  select l.horas_semana_conferindo, l.minutos_por_condicionante into lb_horas, lb_minutos
  from public.linha_de_base as l
  where l.consultoria_id = p_consultoria_id and l.respondido_em <= p_agora
  order by l.respondido_em desc
  limit 1;

  select b.hora_tecnica_centavos into hora
  from public.orcamento_base_custos as b
  where b.consultoria_id = p_consultoria_id and b.hora_tecnica_centavos > 0;

  select min(t.instante),
         coalesce(sum(t.quantidade) filter (
           where t.tipo in ('cadastro_licenca_ia', 'cadastro_condicionante_manual')), 0)
    into primeira, cadastradas
  from public.tarefa_cronometrada as t
  where t.consultoria_id = p_consultoria_id and t.instante <= p_agora;
  juntando := not (cadastradas >= 10 or (primeira is not null and p_agora - primeira >= interval '30 days'));

  return query
  with
  lista as (
    select (mes_atual - make_interval(months => n))::date as mes
    from generate_series(0, meses) as n
  ),
  t as (
    select x.tipo, x.quantidade::bigint as quantidade, x.segundos_ativos::bigint as segundos,
           date_trunc('month', (x.instante at time zone fuso))::date as mes
    from public.tarefa_cronometrada as x
    where x.consultoria_id = p_consultoria_id and x.instante <= p_agora
  ),
  contagens as (
    select
      l.mes,
      coalesce(sum(t.quantidade) filter (where t.tipo = 'cadastro_licenca_ia' and t.mes = l.mes), 0)::bigint as cond_ia,
      coalesce(sum(t.segundos) filter (where t.tipo = 'cadastro_licenca_ia' and t.mes = l.mes), 0)::bigint as seg_ia,
      coalesce(sum(t.quantidade) filter (where t.tipo = 'cadastro_condicionante_manual' and t.mes <= l.mes), 0)::bigint as cond_manual,
      coalesce(sum(t.segundos) filter (where t.tipo = 'cadastro_condicionante_manual' and t.mes <= l.mes), 0)::bigint as seg_manual,
      coalesce(sum(t.segundos) filter (where t.tipo = 'acompanhamento' and t.mes = l.mes), 0)::bigint as seg_acomp,
      (greatest(least((l.mes + interval '1 month')::date, hoje + 1) - l.mes, 0))::numeric / 7 as semanas
    from lista as l
    left join t on true
    group by l.mes
  ),
  minutos as (
    select c.*,
           c.cond_manual >= 5 as medido,
           case when c.cond_manual >= 5 then c.seg_manual::numeric / c.cond_manual / 60
                else lb_minutos end as min_manual,
           case when c.cond_ia > 0 then c.seg_ia::numeric / c.cond_ia / 60 else 0 end as min_ia
    from contagens as c
  ),
  horas as (
    select m.*,
           case when m.min_manual is null then 0
                else greatest(0, m.min_manual - m.min_ia) * m.cond_ia / 60 end as h_cadastro,
           case when lb_horas is null or m.seg_acomp <= 0 then 0
                else greatest(0, lb_horas * m.semanas - m.seg_acomp::numeric / 3600) end as h_acomp
    from minutos as m
  )
  select
    h.mes,
    h.cond_ia,
    h.seg_ia,
    h.cond_manual,
    h.seg_manual,
    h.seg_acomp,
    round(h.semanas, 4),
    round(h.min_manual, 2),
    h.medido,
    round(h.h_cadastro, 2),
    round(h.h_acomp, 2),
    round(h.h_cadastro + h.h_acomp, 2),
    hora,
    case when hora is null then null else round((h.h_cadastro + h.h_acomp) * hora)::bigint end,
    lb_horas is not null,
    juntando
  from horas as h
  order by h.mes desc;
end;
$$;

revoke all on function private.horas_poupadas_em(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- Agregado de várias consultorias (nula = todas, menos as arquivadas). Quem ainda junta dados não
-- entra na soma; conta à parte.
create function private.central_horas_poupadas_em(
  p_consultoria_id uuid,
  p_meses integer,
  p_agora timestamptz
)
returns table (
  mes date,
  consultorias_com_dados bigint,
  consultorias_juntando bigint,
  horas_cadastro numeric,
  horas_acompanhamento numeric,
  horas_total numeric,
  reais_centavos bigint,
  estimado boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    h.mes,
    count(*) filter (where not h.juntando_dados),
    count(*) filter (where h.juntando_dados),
    coalesce(sum(h.horas_cadastro) filter (where not h.juntando_dados), 0),
    coalesce(sum(h.horas_acompanhamento) filter (where not h.juntando_dados), 0),
    coalesce(sum(h.horas_total) filter (where not h.juntando_dados), 0),
    (sum(h.reais_centavos) filter (where not h.juntando_dados))::bigint,
    coalesce(bool_or(h.estimado) filter (where not h.juntando_dados), false)
  from public.consultoria as c
  cross join lateral private.horas_poupadas_em(c.id, p_meses, p_agora) as h
  where (p_consultoria_id is not null and c.id = p_consultoria_id)
     or (p_consultoria_id is null and c.situacao <> 'arquivada')
  group by h.mes
  order by h.mes desc
$$;

revoke all on function private.central_horas_poupadas_em(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D. RPC da central: operador com dois fatores.
-- ---------------------------------------------------------------------------
create function public.central_horas_poupadas(
  p_consultoria_id uuid default null,
  p_meses integer default 6
)
returns table (
  mes date,
  consultorias_com_dados bigint,
  consultorias_juntando bigint,
  horas_cadastro numeric,
  horas_acompanhamento numeric,
  horas_total numeric,
  reais_centavos bigint,
  estimado boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query select * from private.central_horas_poupadas_em(p_consultoria_id, p_meses, now());
end;
$$;

revoke all on function public.central_horas_poupadas(uuid, integer) from public, anon;
grant execute on function public.central_horas_poupadas(uuid, integer) to authenticated;
