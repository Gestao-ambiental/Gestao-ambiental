-- Autorização da Gestão para a conferência de relatórios por IA (ADR-0061).
--
-- A política de privacidade e o RNF 9 dizem que só o PDF da licença vai à IA, e só quando alguém
-- escolhe. A conferência por IA (ADR-0037, ADR-0040) mandava o texto do relatório sem ninguém
-- escolher. Sem decisão registrada, vale o lado conservador: a conferência por IA fica desligada até
-- a Gestão da consultoria ligar, com registro de quem ligou e quando. As regras fixas (sem IA)
-- continuam rodando sempre.
--
-- 1. autorizacao_ia: histórico só de acréscimo das decisões da Gestão (ligar e desligar), por
--    finalidade. A situação atual é a última linha.
-- 2. definir_autorizacao_ia: só a Gestão; repetir a mesma decisão não grava linha nova.
-- 3. autorizacao_ia_atual: leitura para a tela (todo membro ativo).
-- 4. reservar_conferencia_ia recusa com ia_nao_autorizada antes de qualquer chamada paga.

create table public.autorizacao_ia (
  id uuid primary key default gen_random_uuid(),
  -- Ordem das decisões: a última vale (now() se repete dentro de uma transação).
  ordem bigint generated always as identity,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  finalidade text not null,
  autorizada boolean not null,
  decidida_por uuid not null,
  decidida_em timestamptz not null default now(),
  constraint autorizacao_ia_finalidade_valida check (finalidade in ('conferencia_relatorio')),
  constraint autorizacao_ia_consultoria_id_id_key unique (consultoria_id, id),
  constraint autorizacao_ia_decidida_por_fk foreign key (consultoria_id, decidida_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index autorizacao_ia_atual_idx
  on public.autorizacao_ia (consultoria_id, finalidade, ordem desc);

comment on table public.autorizacao_ia is
  'Decisões da Gestão sobre enviar conteúdo da consultoria à IA (ADR-0061). Só acréscimo; vale a última.';

alter table public.autorizacao_ia enable row level security;
alter table public.autorizacao_ia force row level security;
revoke all on table public.autorizacao_ia from public, anon, authenticated;
grant select on table public.autorizacao_ia to authenticated;

create policy autorizacao_ia_select_membro_ativo
  on public.autorizacao_ia for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create trigger autorizacao_ia_auditar
  after insert or update or delete on public.autorizacao_ia
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.autorizacao_ia
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.autorizacao_ia
  for each row execute function private.bloquear_escrita_comercial();

create function private.bloquear_alteracao_autorizacao_ia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'autorizacao_ia é append-only: % não é permitido', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function private.bloquear_alteracao_autorizacao_ia() from public, anon, authenticated;

create trigger autorizacao_ia_bloquear_update_delete
  before update or delete on public.autorizacao_ia
  for each row execute function private.bloquear_alteracao_autorizacao_ia();
create trigger autorizacao_ia_bloquear_truncate
  before truncate on public.autorizacao_ia
  for each statement execute function private.bloquear_alteracao_autorizacao_ia();

-- Situação atual: a última decisão; sem decisão, desligada.
create function private.ia_autorizada(cid uuid, p_finalidade text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.autorizada from public.autorizacao_ia as a
    where a.consultoria_id = cid and a.finalidade = p_finalidade
    order by a.ordem desc
    limit 1), false)
$$;

revoke all on function private.ia_autorizada(uuid, text) from public, anon, authenticated;

-- Ligar ou desligar (só a Gestão). Trava a consultoria para duas decisões ao mesmo tempo não
-- gravarem fora de ordem. Devolve a situação depois da decisão.
create function public.definir_autorizacao_ia(p_consultoria_id uuid, p_finalidade text, p_autorizada boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid;
begin
  if p_consultoria_id is null or not coalesce(private.is_gestao(p_consultoria_id), false) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_finalidade is null or p_finalidade not in ('conferencia_relatorio') or p_autorizada is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;
  if private.ia_autorizada(p_consultoria_id, p_finalidade) = p_autorizada then
    return p_autorizada;
  end if;
  eu := private.membro_atual(p_consultoria_id);
  insert into public.autorizacao_ia (consultoria_id, finalidade, autorizada, decidida_por)
  values (p_consultoria_id, p_finalidade, p_autorizada, eu);
  return p_autorizada;
end;
$$;

revoke all on function public.definir_autorizacao_ia(uuid, text, boolean) from public, anon;
grant execute on function public.definir_autorizacao_ia(uuid, text, boolean) to authenticated;

-- Para a tela: situação de cada finalidade, com quem decidiu por último e quando. Security invoker:
-- a RLS de autorizacao_ia e de membro decide; quem não é membro recebe zero linhas.
create function public.autorizacao_ia_atual(p_consultoria_id uuid)
returns table (finalidade text, autorizada boolean, decidida_em timestamptz, decidida_por_nome text)
language sql
stable
set search_path = ''
as $$
  select f.finalidade, coalesce(u.autorizada, false), u.decidida_em, m.nome
  from (values ('conferencia_relatorio')) as f (finalidade)
  left join lateral (
    select a.autorizada, a.decidida_em, a.decidida_por, a.consultoria_id
    from public.autorizacao_ia as a
    where a.consultoria_id = p_consultoria_id and a.finalidade = f.finalidade
    order by a.ordem desc
    limit 1) as u on true
  left join public.membro as m on m.consultoria_id = u.consultoria_id and m.id = u.decidida_por
  where (select private.is_membro(p_consultoria_id))
$$;

revoke all on function public.autorizacao_ia_atual(uuid) from public, anon;
grant execute on function public.autorizacao_ia_atual(uuid) to authenticated;

-- Motivo novo da conferência que não chamou a IA.
alter table public.conferencia_ia drop constraint conferencia_ia_motivo;
alter table public.conferencia_ia add constraint conferencia_ia_motivo check (motivo is null or motivo in (
  'ia_fora_do_plano', 'ia_nao_autorizada', 'tipo_sem_texto', 'arquivo_sem_texto', 'arquivo_grande_demais',
  'texto_longo_demais', 'limite_atingido', 'provedor_indisponivel', 'provedor_recusou',
  'tempo_esgotado', 'resposta_invalida', 'configuracao_ausente', 'erro_interno'));

-- Reserva da cota: mesma regra de antes, mais a autorização da Gestão. Sem ela, nada vai à IA.
create or replace function public.reservar_conferencia_ia(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limites private.limite_extracao_ia;
  alvo_consultoria uuid;
  alvo_usuario uuid;
  uso record;
begin
  update private.limite_extracao_ia
  set ultima_verificacao = clock_timestamp()
  where unica
  returning * into limites;
  if not found then
    return false;
  end if;

  select c.consultoria_id, m.usuario_id into alvo_consultoria, alvo_usuario
  from public.conferencia_ia as c
  join public.membro as m on m.consultoria_id = c.consultoria_id and m.id = c.solicitada_por
  where c.id = p_id and c.situacao = 'em_andamento' and c.ia_liberada and m.situacao = 'ativo'
  for update of c;
  if not found or exists (select 1 from private.reserva_conferencia_ia as r where r.conferencia_id = p_id) then
    return false;
  end if;

  if not private.ia_autorizada(alvo_consultoria, 'conferencia_relatorio') then
    raise exception 'ia_nao_autorizada' using errcode = 'P0001';
  end if;

  select * into uso from private.uso_de_ia(limites.ultima_verificacao - interval '24 hours',
    limites.ultima_verificacao - interval '3 minutes', alvo_usuario, alvo_consultoria);
  if uso.conta >= limites.por_conta or uso.consultoria >= limites.por_consultoria
     or uso.projeto >= limites.por_projeto or uso.em_andamento >= limites.simultaneas then
    return false;
  end if;

  insert into private.reserva_conferencia_ia (conferencia_id, reservada_em)
  values (p_id, limites.ultima_verificacao);
  return true;
end;
$$;

revoke all on function public.reservar_conferencia_ia(uuid) from public, anon, authenticated;
grant execute on function public.reservar_conferencia_ia(uuid) to service_role;
