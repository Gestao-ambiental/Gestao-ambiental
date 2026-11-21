-- L7 · Mudança de norma no resumo diário (ADR-0050, decisão 23; ADR-0055).
--
-- 1. normas_do_resumo_diario: as mudanças de norma publicadas (revisadas na Central) que afetam a
--    pessoa, para a seção "Mudanças de norma" do resumo diário do P5. Recebem: a Gestão (todas as
--    da consultoria) e os responsáveis pelas condicionantes das licenças afetadas (as da licença
--    deles). Entram as publicadas desde o último resumo enviado à pessoa (no máximo 7 dias) e
--    ainda não vistas no Grama. Sem sino e sem e-mail por mudança.
-- 2. E-mail na hora só quando é revogada uma norma que afeta licença ativa:
--    revogacoes_para_avisar + reservar_aviso_de_revogacao + registrar_aviso_de_revogacao, com a
--    tabela aviso_revogacao_envio (um por pessoa e mudança, como o aviso_envio do P5).
-- Os dois respeitam as preferências e o descadastro do P5 (preferencia_aviso.resumo_diario) e só
-- valem para consultoria em teste ou ativa. Tudo pela service role da Edge Function
-- enviar-avisos-do-dia.

-- ---------------------------------------------------------------------------
-- Quem recebe o aviso de uma linha de aviso_norma: a Gestão sempre; com licença, também quem é
-- responsável por alguma condicionante (ocorrência aberta ou concluída) dela.
-- ---------------------------------------------------------------------------
create function private.recebe_aviso_de_norma(
  p_consultoria_id uuid,
  p_membro_id uuid,
  p_instrumento_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membro as m
    where m.consultoria_id = p_consultoria_id and m.id = p_membro_id and m.situacao = 'ativo'
      and (
        m.papel = 'gestao'
        or (p_instrumento_id is not null and exists (
          select 1 from public.ocorrencia as o
          where o.consultoria_id = p_consultoria_id and o.instrumento_id = p_instrumento_id
            and o.responsavel_id = p_membro_id
        ))
      )
  )
$$;

revoke all on function private.recebe_aviso_de_norma(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Mudanças de norma no resumo diário
-- ---------------------------------------------------------------------------
create function public.normas_do_resumo_diario(p_consultoria_id uuid, p_membro_id uuid, p_dia date)
returns table (
  mudanca_id uuid,
  tipo text,
  norma_titulo text,
  publicada_em date,
  empreendimento_nome text,
  licenca text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fuso text;
  desde date;
begin
  if p_dia is null then
    raise exception 'dia_obrigatorio' using errcode = '22023';
  end if;
  select c.fuso into fuso from public.consultoria as c where c.id = p_consultoria_id;
  if fuso is null then
    return;
  end if;
  -- Desde o último resumo que saiu para a pessoa (sem repetir), no máximo 7 dias.
  select greatest(coalesce(max(e.dia), p_dia - 7), p_dia - 7) into desde
  from public.aviso_envio as e
  where e.consultoria_id = p_consultoria_id and e.membro_id = p_membro_id
    and e.situacao = 'enviado' and e.dia < p_dia;

  return query
  select distinct on (mu.id, a.empreendimento_id, a.instrumento_id)
    mu.id, mu.tipo, n.titulo, (mu.publicada_em at time zone fuso)::date, e.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), '')
  from public.aviso_norma as a
  join private.norma_mudanca as mu on mu.id = a.mudanca_id
  join private.norma as n on n.id = mu.norma_id
  join public.empreendimento as e on e.consultoria_id = a.consultoria_id and e.id = a.empreendimento_id
  left join public.instrumento as i on i.consultoria_id = a.consultoria_id and i.id = a.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where a.consultoria_id = p_consultoria_id
    and a.visto_em is null
    and mu.situacao = 'publicada'
    and (mu.publicada_em at time zone fuso)::date > desde
    and (mu.publicada_em at time zone fuso)::date <= p_dia
    and private.recebe_aviso_de_norma(p_consultoria_id, p_membro_id, a.instrumento_id)
  order by mu.id, a.empreendimento_id, a.instrumento_id
  limit 200;
end;
$$;

comment on function public.normas_do_resumo_diario(uuid, uuid, date) is
  'Mudanças de norma publicadas que afetam a pessoa, para o resumo diário (L7). Só a service role.';

revoke all on function public.normas_do_resumo_diario(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.normas_do_resumo_diario(uuid, uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 2. E-mail na hora: revogação de norma que afeta licença ativa
-- ---------------------------------------------------------------------------
create table public.aviso_revogacao_envio (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  mudanca_id uuid not null references private.norma_mudanca (id) on delete restrict,
  situacao text not null default 'reservado',
  tentativas integer not null default 1,
  provedor_id text,
  reservado_em timestamptz not null default now(),
  enviado_em timestamptz,
  constraint aviso_revogacao_envio_consultoria_id_id_key unique (consultoria_id, id),
  constraint aviso_revogacao_envio_unico unique (consultoria_id, membro_id, mudanca_id),
  constraint aviso_revogacao_envio_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint aviso_revogacao_envio_situacao check (situacao in ('reservado', 'enviado', 'falhou')),
  constraint aviso_revogacao_envio_tentativas check (tentativas between 1 and 3),
  constraint aviso_revogacao_envio_enviado_coerente check ((situacao = 'enviado') = (enviado_em is not null)),
  constraint aviso_revogacao_envio_provedor_id check (provedor_id is null or length(provedor_id) between 1 and 200)
);

comment on table public.aviso_revogacao_envio is
  'E-mail imediato de revogação de norma que afeta licença ativa (L7): um por pessoa e mudança. Sem conteúdo do e-mail.';

alter table public.aviso_revogacao_envio enable row level security;
alter table public.aviso_revogacao_envio force row level security;
revoke all on table public.aviso_revogacao_envio from public, anon, authenticated;
grant select on table public.aviso_revogacao_envio to authenticated;

create policy aviso_revogacao_envio_select_proprio
  on public.aviso_revogacao_envio
  for select
  to authenticated
  using (membro_id = (select private.membro_atual(consultoria_id)));

create trigger _suporte_somente_leitura
  before insert or update or delete on public.aviso_revogacao_envio
  for each row execute function private.bloquear_escrita_do_suporte();

-- Como no aviso_envio: só a service role escreve; fica para não abrir exceção no pgTAP 020.
create trigger _comercial_somente_leitura
  before insert or update or delete on public.aviso_revogacao_envio
  for each row execute function private.bloquear_escrita_comercial();

-- Quem deve receber agora o e-mail de revogação: uma linha por pessoa e mudança, com os
-- empreendimentos e licenças ativas afetados. Revogações publicadas nos últimos 7 dias.
create function public.revogacoes_para_avisar(p_agora timestamptz default now())
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  membro_id uuid,
  membro_nome text,
  email text,
  mudanca_id uuid,
  norma_titulo text,
  afetados text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nome, m.id, m.nome, m.email, mu.id, n.titulo,
         array_agg(distinct concat_ws(' · ', e.nome, nullif(concat_ws(' ', t.sigla, i.numero), ''))
                   order by concat_ws(' · ', e.nome, nullif(concat_ws(' ', t.sigla, i.numero), '')))
  from private.norma_mudanca as mu
  join private.norma as n on n.id = mu.norma_id
  join public.aviso_norma as a on a.mudanca_id = mu.id
  join public.instrumento as i
    on i.consultoria_id = a.consultoria_id and i.id = a.instrumento_id and i.situacao = 'ativo'
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  join public.empreendimento as e on e.consultoria_id = a.consultoria_id and e.id = a.empreendimento_id
  join public.consultoria as c on c.id = a.consultoria_id and c.situacao in ('teste', 'ativa')
  join public.membro as m
    on m.consultoria_id = a.consultoria_id and m.situacao = 'ativo' and position('@' in m.email) > 0
  left join public.preferencia_aviso as p on p.consultoria_id = m.consultoria_id and p.membro_id = m.id
  where mu.tipo = 'revogada'
    and mu.situacao = 'publicada'
    and mu.publicada_em >= coalesce(p_agora, now()) - interval '7 days'
    and coalesce(p.resumo_diario, true)
    and private.recebe_aviso_de_norma(a.consultoria_id, m.id, a.instrumento_id)
    and not exists (
      select 1 from public.aviso_revogacao_envio as x
      where x.consultoria_id = m.consultoria_id and x.membro_id = m.id and x.mudanca_id = mu.id
        and (x.situacao = 'enviado'
             or x.tentativas >= 3
             or (x.situacao = 'reservado'
                 and x.reservado_em >= coalesce(p_agora, now()) - interval '30 minutes'))
    )
  group by c.id, c.nome, m.id, m.nome, m.email, mu.id, n.titulo
  order by c.id, mu.id, m.id
  limit 200
$$;

revoke all on function public.revogacoes_para_avisar(timestamptz) from public, anon, authenticated;
grant execute on function public.revogacoes_para_avisar(timestamptz) to service_role;

-- Reserva o envio (uma execução por pessoa e mudança). Nulo: já saiu, está reservado há menos de
-- 30 minutos ou esgotou as 3 tentativas.
create function public.reservar_aviso_de_revogacao(
  p_consultoria_id uuid,
  p_membro_id uuid,
  p_mudanca_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserva uuid;
begin
  insert into public.aviso_revogacao_envio (consultoria_id, membro_id, mudanca_id)
  values (p_consultoria_id, p_membro_id, p_mudanca_id)
  on conflict (consultoria_id, membro_id, mudanca_id) do update
  set situacao = 'reservado',
      tentativas = public.aviso_revogacao_envio.tentativas + 1,
      reservado_em = now()
  where public.aviso_revogacao_envio.situacao <> 'enviado'
    and public.aviso_revogacao_envio.tentativas < 3
    and (public.aviso_revogacao_envio.situacao = 'falhou'
         or public.aviso_revogacao_envio.reservado_em < now() - interval '30 minutes')
  returning id into reserva;
  return reserva;
end;
$$;

revoke all on function public.reservar_aviso_de_revogacao(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reservar_aviso_de_revogacao(uuid, uuid, uuid) to service_role;

create function public.registrar_aviso_de_revogacao(
  p_id uuid,
  p_situacao text,
  p_provedor_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_situacao not in ('enviado', 'falhou') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  update public.aviso_revogacao_envio as x
  set situacao = p_situacao,
      provedor_id = case when p_situacao = 'enviado' then nullif(left(p_provedor_id, 200), '') else x.provedor_id end,
      enviado_em = case when p_situacao = 'enviado' then now() else null end
  where x.id = p_id and x.situacao = 'reservado';
  return found;
end;
$$;

revoke all on function public.registrar_aviso_de_revogacao(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_aviso_de_revogacao(uuid, text, text) to service_role;
