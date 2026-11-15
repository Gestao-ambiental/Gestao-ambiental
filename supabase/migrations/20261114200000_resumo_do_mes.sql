-- Indicadores de valor, etapa 3: resumo do mês para a Gestão (ADR-0027; protótipo para revisão).
--
-- Só totais da consultoria, num mês e no anterior (para a comparação): horas devolvidas à equipe
-- (com R$ quando há custo da hora), entregas no prazo e renovações protegidas pelos 120 dias.
-- Reaproveita private.metricas_de_valor_em (etapa 1) e private.horas_poupadas_em (etapa 2).
--
--   resumo_do_mes              tela da Gestão (is_gestao da própria consultoria)
--   central_resumo_do_mes      operador com dois fatores: o "Enviar resumo de teste para mim"
--   resumos_do_mes_pendentes   só service role (Edge Function enviar-resumo-do-mes): o mês
--                              anterior de cada consultoria não arquivada que ainda não recebeu
--   registrar_envio_do_resumo  só service role: grava o envio (idempotente por consultoria e mês)
--
-- public.resumo_do_mes_envio: um registro por consultoria e mês enviado. Só de inserção; ninguém
-- lê direto.

-- ---------------------------------------------------------------------------
-- Cálculo (interno): o mês pedido e o anterior, mês pedido primeiro.
-- ---------------------------------------------------------------------------
create function private.resumo_do_mes_em(
  p_consultoria_id uuid,
  p_mes date,
  p_agora timestamptz
)
returns table (
  mes date,
  horas_total numeric,
  reais_centavos bigint,
  horas_estimadas boolean,
  juntando_dados boolean,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  alvo date := date_trunc('month', p_mes)::date;
  fuso text;
  mes_atual date;
  meses integer;
begin
  select c.fuso into fuso from public.consultoria as c where c.id = p_consultoria_id;
  if not found then
    return;
  end if;
  mes_atual := date_trunc('month', (p_agora at time zone fuso))::date;
  meses := ((extract(year from mes_atual) - extract(year from alvo)) * 12
            + extract(month from mes_atual) - extract(month from alvo))::integer + 1;
  if alvo is null or alvo > mes_atual or meses > 24 then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;

  return query
  select m.mes, h.horas_total, h.reais_centavos, h.estimado, h.juntando_dados,
         m.prazo_previstas, m.prazo_cumpridas, m.renovacoes_vencendo, m.renovacoes_protegidas
  from private.metricas_de_valor_em(p_consultoria_id, meses, p_agora) as m
  join private.horas_poupadas_em(p_consultoria_id, meses, p_agora) as h on h.mes = m.mes
  where m.mes in (alvo, (alvo - interval '1 month')::date)
  order by m.mes desc;
end;
$$;

revoke all on function private.resumo_do_mes_em(uuid, date, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tela "Resumo do mês": só a Gestão da própria consultoria.
-- ---------------------------------------------------------------------------
create function public.resumo_do_mes(p_consultoria_id uuid, p_mes date)
returns table (
  mes date,
  horas_total numeric,
  reais_centavos bigint,
  horas_estimadas boolean,
  juntando_dados boolean,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  return query select * from private.resumo_do_mes_em(p_consultoria_id, p_mes, now());
end;
$$;

revoke all on function public.resumo_do_mes(uuid, date) from public, anon;
grant execute on function public.resumo_do_mes(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Envio por e-mail
-- ---------------------------------------------------------------------------
create table public.resumo_do_mes_envio (
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  mes date not null,
  destinatarios integer not null,
  enviado_em timestamptz not null default now(),
  constraint resumo_do_mes_envio_pkey primary key (consultoria_id, mes),
  constraint resumo_do_mes_envio_mes check (mes = date_trunc('month', mes)::date),
  constraint resumo_do_mes_envio_destinatarios check (destinatarios between 1 and 100)
);

comment on table public.resumo_do_mes_envio is
  'Resumo do mês enviado por e-mail à Gestão: um registro por consultoria e mês (idempotência do envio). Escrita só pela Edge Function enviar-resumo-do-mes (service role). Ver ADR-0027.';

alter table public.resumo_do_mes_envio enable row level security;
alter table public.resumo_do_mes_envio force row level security;
revoke all on table public.resumo_do_mes_envio from public, anon, authenticated;
grant select on table public.resumo_do_mes_envio to authenticated;

create policy resumo_do_mes_envio_select_ninguem
  on public.resumo_do_mes_envio
  for select
  to authenticated
  using (false);

create trigger resumo_do_mes_envio_bloquear_update_delete
  before update or delete on public.resumo_do_mes_envio
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger resumo_do_mes_envio_bloquear_truncate
  before truncate on public.resumo_do_mes_envio
  for each statement execute function private.bloquear_alteracao_auditoria();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.resumo_do_mes_envio
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.resumo_do_mes_envio
  for each row execute function private.bloquear_escrita_comercial();

-- Resumo de uma consultoria para o envio: nome e as duas linhas (mês do resumo e o anterior).
-- p_mes nulo = mês anterior no fuso da consultoria.
create function private.resumo_para_envio(p_consultoria_id uuid, p_mes date, p_agora timestamptz)
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  mes_do_resumo date,
  mes date,
  horas_total numeric,
  reais_centavos bigint,
  horas_estimadas boolean,
  juntando_dados boolean,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nome, alvo.mes, r.mes, r.horas_total, r.reais_centavos, r.horas_estimadas,
         r.juntando_dados, r.prazo_previstas, r.prazo_cumpridas, r.renovacoes_vencendo,
         r.renovacoes_protegidas
  from public.consultoria as c
  cross join lateral (
    select coalesce(date_trunc('month', p_mes)::date,
                    (date_trunc('month', (p_agora at time zone c.fuso)) - interval '1 month')::date)
      as mes
  ) as alvo
  cross join lateral private.resumo_do_mes_em(c.id, alvo.mes, p_agora) as r
  where c.id = p_consultoria_id
  order by r.mes desc
$$;

revoke all on function private.resumo_para_envio(uuid, date, timestamptz)
  from public, anon, authenticated;

-- Operador com dois fatores: o resumo de uma consultoria, para o e-mail de teste.
create function public.central_resumo_do_mes(p_consultoria_id uuid, p_mes date default null)
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  mes_do_resumo date,
  mes date,
  horas_total numeric,
  reais_centavos bigint,
  horas_estimadas boolean,
  juntando_dados boolean,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query select * from private.resumo_para_envio(p_consultoria_id, p_mes, now());
end;
$$;

revoke all on function public.central_resumo_do_mes(uuid, date) from public, anon;
grant execute on function public.central_resumo_do_mes(uuid, date) to authenticated;

-- Só service role: o resumo de cada consultoria não arquivada que ainda não recebeu o do mês.
create function public.resumos_do_mes_pendentes(p_mes date default null)
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  mes_do_resumo date,
  mes date,
  horas_total numeric,
  reais_centavos bigint,
  horas_estimadas boolean,
  juntando_dados boolean,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.consultoria as c
  cross join lateral private.resumo_para_envio(c.id, p_mes, now()) as r
  where c.situacao <> 'arquivada'
    and not exists (
      select 1 from public.resumo_do_mes_envio as e
      where e.consultoria_id = c.id and e.mes = r.mes_do_resumo
    )
  order by c.id, r.mes desc
$$;

revoke all on function public.resumos_do_mes_pendentes(date) from public, anon, authenticated;
grant execute on function public.resumos_do_mes_pendentes(date) to service_role;

-- Só service role: grava o envio. Repetir não cria linha (devolve falso).
create function public.registrar_envio_do_resumo(
  p_consultoria_id uuid,
  p_mes date,
  p_destinatarios integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  gravadas integer;
begin
  insert into public.resumo_do_mes_envio (consultoria_id, mes, destinatarios)
  values (p_consultoria_id, date_trunc('month', p_mes)::date, p_destinatarios)
  on conflict (consultoria_id, mes) do nothing;
  get diagnostics gravadas = row_count;
  return gravadas > 0;
end;
$$;

revoke all on function public.registrar_envio_do_resumo(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_envio_do_resumo(uuid, date, integer) to service_role;
