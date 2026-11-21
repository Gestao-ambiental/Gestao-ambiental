-- P7 · Dinheiro do trabalho (ADR-0053): horas lançadas no orçamento aprovado e recebimentos
-- registrados à mão sobre as parcelas. Nada de cobrança automática (o nome `cobranca` já é a
-- assinatura do Grama). Dinheiro em centavos inteiros com o código da moeda.
--
-- 1. Permissão financeira no vínculo (membro.financeiro): vale para a Gestão; a Equipe nunca vê
--    dinheiro. Sempre fica ao menos uma pessoa da Gestão com ela.
-- 2. apontamento_horas: autor, item ou tarefa do orçamento, data, minutos (1 a 1440) e nota. Só o
--    autor e a Gestão leem. Exclusão lógica.
-- 3. orcamento_recebimento: recebido numa parcela (valor, data, nota). Estorno não apaga.
-- 4. Travas: o orçamento aprovado com recebimento não volta a rascunho; a parcela com recebimento
--    não é apagada (salvar_orcamento apaga as parcelas que saem do rascunho).
-- 5. Leituras: execucao_do_orcamento(orcamento) e a_receber_dos_orcamentos(consultoria).

-- ---------------------------------------------------------------------------
-- 1. Permissão financeira
-- ---------------------------------------------------------------------------
alter table public.membro add column financeiro boolean not null default true;

comment on column public.membro.financeiro is
  'Vê e registra dinheiro (recebimentos, a receber). Só vale para a Gestão; a Equipe nunca vê.';

create function private.is_financeiro(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro as m
    where m.consultoria_id = cid
      and m.usuario_id = (select auth.uid())
      and m.situacao = 'ativo'
      and m.papel = 'gestao'
      and m.financeiro
  )
$$;

revoke all on function private.is_financeiro(uuid) from public, anon;
grant execute on function private.is_financeiro(uuid) to authenticated;

create function public.definir_permissao_financeira(p_membro_id uuid, p_financeiro boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro%rowtype;
begin
  select * into alvo from public.membro as m where m.id = p_membro_id for update;
  if not found or not private.is_financeiro(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_financeiro is null then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if alvo.papel <> 'gestao' and p_financeiro then
    raise exception 'financeiro_so_na_gestao' using errcode = 'P0001';
  end if;
  update public.membro as m set financeiro = p_financeiro where m.id = alvo.id;
  if not exists (
    select 1 from public.membro as m
    where m.consultoria_id = alvo.consultoria_id and m.situacao = 'ativo' and m.papel = 'gestao'
      and m.financeiro
  ) then
    raise exception 'ultimo_financeiro' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.definir_permissao_financeira(uuid, boolean) from public, anon;
grant execute on function public.definir_permissao_financeira(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Apontamento de horas
-- ---------------------------------------------------------------------------
create table public.apontamento_horas (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  orcamento_item_id uuid,
  tarefa_servico_id uuid,
  membro_id uuid not null,
  data date not null,
  minutos integer not null,
  nota text,
  registrado_em timestamptz not null default now(),
  excluido_em timestamptz,
  constraint apontamento_horas_consultoria_id_id_key unique (consultoria_id, id),
  constraint apontamento_horas_minutos check (minutos between 1 and 1440),
  constraint apontamento_horas_nota check (nota is null or length(nota) <= 500),
  constraint apontamento_horas_item_ou_tarefa check (num_nonnulls(orcamento_item_id, tarefa_servico_id) = 1),
  constraint apontamento_horas_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint apontamento_horas_item_fk foreign key (consultoria_id, orcamento_item_id)
    references public.orcamento_item (consultoria_id, id) on delete restrict,
  constraint apontamento_horas_tarefa_fk foreign key (consultoria_id, tarefa_servico_id)
    references public.tarefa_servico (consultoria_id, id) on delete restrict,
  constraint apontamento_horas_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.apontamento_horas is
  'Horas lançadas por uma pessoa num item ou tarefa do orçamento aprovado (P7). Só o autor e a Gestão leem.';

create index apontamento_horas_orcamento_idx
  on public.apontamento_horas (consultoria_id, orcamento_id) where excluido_em is null;
create index apontamento_horas_membro_idx
  on public.apontamento_horas (consultoria_id, membro_id, data);

alter table public.apontamento_horas enable row level security;
alter table public.apontamento_horas force row level security;
revoke all on table public.apontamento_horas from anon, authenticated;
grant select on table public.apontamento_horas to authenticated;

create policy apontamento_horas_select_autor_ou_gestao
  on public.apontamento_horas for select to authenticated
  using (
    (select private.is_gestao(consultoria_id))
    or membro_id = (select private.membro_atual(consultoria_id))
  );

create trigger apontamento_horas_auditar
  after insert or update or delete on public.apontamento_horas
  for each row execute function private.auditar();

create trigger _suporte_somente_leitura
  before insert or update or delete on public.apontamento_horas
  for each row execute function private.bloquear_escrita_do_suporte();

create trigger _comercial_somente_leitura
  before insert or update or delete on public.apontamento_horas
  for each row execute function private.bloquear_escrita_comercial('consultoria_id', 'orcamentos');

-- Lança horas (idempotente pelo id: repetir com o mesmo id não duplica). Qualquer pessoa ativa
-- lança as próprias horas num orçamento aprovado; tarefa cancelada não recebe horas.
create function public.lancar_horas(
  p_id uuid,
  p_orcamento_id uuid,
  p_orcamento_item_id uuid,
  p_tarefa_servico_id uuid,
  p_data date,
  p_minutos integer,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  orc public.orcamento%rowtype;
  autor uuid;
  nota_limpa text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  select * into orc from public.orcamento as o where o.id = p_orcamento_id;
  if not found or not private.is_membro(orc.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(orc.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if exists (select 1 from public.apontamento_horas as a where a.id = p_id) then
    if exists (select 1 from public.apontamento_horas as a where a.id = p_id and a.membro_id = autor
               and a.consultoria_id = orc.consultoria_id) then
      return;
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if orc.situacao <> 'aprovada' or orc.excluido_em is not null then
    raise exception 'orcamento_nao_aprovado' using errcode = 'P0001';
  end if;
  if p_data is null or p_minutos is null or p_minutos not between 1 and 1440 then
    raise exception 'horas_invalidas' using errcode = '22023';
  end if;
  if length(coalesce(nota_limpa, '')) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if num_nonnulls(p_orcamento_item_id, p_tarefa_servico_id) <> 1 then
    raise exception 'item_ou_tarefa' using errcode = '22023';
  end if;
  if p_orcamento_item_id is not null and not exists (
    select 1 from public.orcamento_item as i
    where i.consultoria_id = orc.consultoria_id and i.orcamento_id = orc.id and i.id = p_orcamento_item_id
  ) then
    raise exception 'item_ou_tarefa' using errcode = '22023';
  end if;
  if p_tarefa_servico_id is not null then
    if not exists (
      select 1 from public.tarefa_servico as t
      where t.consultoria_id = orc.consultoria_id and t.orcamento_id = orc.id and t.id = p_tarefa_servico_id
    ) then
      raise exception 'item_ou_tarefa' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.tarefa_servico as t
      where t.id = p_tarefa_servico_id and t.situacao = 'cancelada'
    ) then
      raise exception 'tarefa_cancelada' using errcode = 'P0001';
    end if;
  end if;

  insert into public.apontamento_horas (
    id, consultoria_id, orcamento_id, orcamento_item_id, tarefa_servico_id, membro_id, data, minutos, nota)
  values (p_id, orc.consultoria_id, orc.id, p_orcamento_item_id, p_tarefa_servico_id, autor, p_data,
          p_minutos, nota_limpa);
end;
$$;

revoke all on function public.lancar_horas(uuid, uuid, uuid, uuid, date, integer, text) from public, anon;
grant execute on function public.lancar_horas(uuid, uuid, uuid, uuid, date, integer, text) to authenticated;

-- Remove (exclusão lógica). O autor remove o seu; a Gestão remove qualquer um.
create function public.remover_apontamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.apontamento_horas%rowtype;
begin
  select * into alvo from public.apontamento_horas as a where a.id = p_id for update;
  if not found or not (
    private.is_gestao(alvo.consultoria_id)
    or alvo.membro_id = private.membro_atual(alvo.consultoria_id)
  ) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.apontamento_horas as a set excluido_em = coalesce(a.excluido_em, now()) where a.id = p_id;
end;
$$;

revoke all on function public.remover_apontamento(uuid) from public, anon;
grant execute on function public.remover_apontamento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recebimentos
-- ---------------------------------------------------------------------------
alter table public.orcamento_parcela add column vence_em date;

comment on column public.orcamento_parcela.vence_em is
  'Vencimento combinado da parcela (orçamento aprovado). Nulo: data do aceite + dias.';

create table public.orcamento_recebimento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  parcela_id uuid not null,
  valor_centavos bigint not null,
  moeda char(3) not null default 'BRL',
  recebido_em date not null,
  nota text,
  registrado_por uuid not null,
  registrado_em timestamptz not null default now(),
  estornado_em timestamptz,
  estornado_por uuid,
  row_version integer not null default 1,
  constraint orcamento_recebimento_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_recebimento_valor check (valor_centavos between 1 and 99999999999),
  constraint orcamento_recebimento_moeda check (moeda = 'BRL'),
  constraint orcamento_recebimento_nota check (nota is null or length(nota) <= 500),
  constraint orcamento_recebimento_estorno_coerente check ((estornado_em is null) = (estornado_por is null)),
  constraint orcamento_recebimento_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint orcamento_recebimento_parcela_fk foreign key (consultoria_id, parcela_id)
    references public.orcamento_parcela (consultoria_id, id) on delete restrict,
  constraint orcamento_recebimento_registrado_por_fk foreign key (consultoria_id, registrado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint orcamento_recebimento_estornado_por_fk foreign key (consultoria_id, estornado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.orcamento_recebimento is
  'Recebido numa parcela do orçamento aprovado, registrado à mão (P7). Estorno não apaga.';

create index orcamento_recebimento_orcamento_idx on public.orcamento_recebimento (consultoria_id, orcamento_id);
create index orcamento_recebimento_parcela_idx on public.orcamento_recebimento (consultoria_id, parcela_id);

alter table public.orcamento_recebimento enable row level security;
alter table public.orcamento_recebimento force row level security;
revoke all on table public.orcamento_recebimento from anon, authenticated;
grant select on table public.orcamento_recebimento to authenticated;

create policy orcamento_recebimento_select_financeiro
  on public.orcamento_recebimento for select to authenticated
  using ((select private.is_financeiro(consultoria_id)));

create trigger orcamento_recebimento_auditar
  after insert or update or delete on public.orcamento_recebimento
  for each row execute function private.auditar();

create trigger _suporte_somente_leitura
  before insert or update or delete on public.orcamento_recebimento
  for each row execute function private.bloquear_escrita_do_suporte();

create trigger _comercial_somente_leitura
  before insert or update or delete on public.orcamento_recebimento
  for each row execute function private.bloquear_escrita_comercial('consultoria_id', 'orcamentos');

-- Registra (idempotente pelo id). Só quem tem a permissão financeira, em orçamento aprovado.
create function public.registrar_recebimento(
  p_id uuid,
  p_parcela_id uuid,
  p_valor_centavos bigint,
  p_recebido_em date,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  parcela public.orcamento_parcela%rowtype;
  orc public.orcamento%rowtype;
  nota_limpa text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  select * into parcela from public.orcamento_parcela as p where p.id = p_parcela_id;
  if not found or not private.is_financeiro(parcela.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if exists (select 1 from public.orcamento_recebimento as r where r.id = p_id) then
    if exists (select 1 from public.orcamento_recebimento as r
               where r.id = p_id and r.consultoria_id = parcela.consultoria_id) then
      return;
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into orc from public.orcamento as o where o.id = parcela.orcamento_id for update;
  if orc.situacao <> 'aprovada' or orc.excluido_em is not null then
    raise exception 'orcamento_nao_aprovado' using errcode = 'P0001';
  end if;
  if p_valor_centavos is null or p_valor_centavos not between 1 and 99999999999 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if p_recebido_em is null or p_recebido_em > private.hoje_da_consultoria(orc.consultoria_id) then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if length(coalesce(nota_limpa, '')) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;

  insert into public.orcamento_recebimento (
    id, consultoria_id, orcamento_id, parcela_id, valor_centavos, recebido_em, nota, registrado_por)
  values (p_id, orc.consultoria_id, orc.id, parcela.id, p_valor_centavos, p_recebido_em, nota_limpa,
          private.membro_atual(orc.consultoria_id));
end;
$$;

revoke all on function public.registrar_recebimento(uuid, uuid, bigint, date, text) from public, anon;
grant execute on function public.registrar_recebimento(uuid, uuid, bigint, date, text) to authenticated;

-- Estorna: marca, nunca apaga.
create function public.estornar_recebimento(p_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento_recebimento%rowtype;
begin
  select * into alvo from public.orcamento_recebimento as r where r.id = p_id for update;
  if not found or not private.is_financeiro(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.estornado_em is not null then
    return alvo.row_version;
  end if;
  update public.orcamento_recebimento as r
  set estornado_em = now(), estornado_por = private.membro_atual(alvo.consultoria_id),
      row_version = r.row_version + 1
  where r.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

revoke all on function public.estornar_recebimento(uuid, integer) from public, anon;
grant execute on function public.estornar_recebimento(uuid, integer) to authenticated;

-- Vencimento combinado da parcela.
create function public.definir_vencimento_da_parcela(p_parcela_id uuid, p_vence_em date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  parcela public.orcamento_parcela%rowtype;
begin
  select * into parcela from public.orcamento_parcela as p where p.id = p_parcela_id for update;
  if not found or not private.is_financeiro(parcela.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.orcamento_parcela as p set vence_em = p_vence_em where p.id = parcela.id;
end;
$$;

revoke all on function public.definir_vencimento_da_parcela(uuid, date) from public, anon;
grant execute on function public.definir_vencimento_da_parcela(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Travas
-- ---------------------------------------------------------------------------
create function private.travar_orcamento_com_recebimento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.situacao = 'aprovada' and new.situacao is distinct from 'aprovada' and exists (
    select 1 from public.orcamento_recebimento as r
    where r.consultoria_id = old.consultoria_id and r.orcamento_id = old.id and r.estornado_em is null
  ) then
    raise exception 'orcamento_com_recebimento' using errcode = 'P0001',
      hint = 'Estorne os recebimentos antes de reabrir o orçamento.';
  end if;
  return new;
end;
$$;

create trigger orcamento_travar_com_recebimento
  before update of situacao on public.orcamento
  for each row execute function private.travar_orcamento_com_recebimento();

create function private.travar_parcela_com_recebimento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orcamento_recebimento as r
    where r.consultoria_id = old.consultoria_id and r.parcela_id = old.id
  ) then
    raise exception 'parcela_com_recebimento' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger orcamento_parcela_travar_com_recebimento
  before delete on public.orcamento_parcela
  for each row execute function private.travar_parcela_com_recebimento();

revoke all on function private.travar_orcamento_com_recebimento() from public, anon, authenticated;
revoke all on function private.travar_parcela_com_recebimento() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Leituras
-- ---------------------------------------------------------------------------
-- Valor de cada parcela pelo maior resto (o mesmo de distribuirPorMaiorResto em packages/domain),
-- o recebido (sem estornos) e o vencimento (combinado ou aceite + dias). Só para quem tem a
-- permissão financeira: para os outros volta vazia.
create function private.parcelas_com_valor(cid uuid)
returns table (
  orcamento_id uuid,
  parcela_id uuid,
  ordem integer,
  descricao text,
  valor_centavos bigint,
  recebido_centavos bigint,
  vence_em date
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.orcamento_id, p.id, p.ordem, p.descricao, p.percentual_pb, p.dias, p.vence_em,
           private.total_do_orcamento(o) as total,
           sum(p.percentual_pb) over (partition by p.orcamento_id) as soma
    from public.orcamento_parcela as p
    join public.orcamento as o on o.consultoria_id = p.consultoria_id and o.id = p.orcamento_id
    where p.consultoria_id = cid and o.situacao = 'aprovada' and o.excluido_em is null
      and private.is_financeiro(cid)
  ),
  partes as (
    select b.*,
           case when b.soma > 0 then (b.total * b.percentual_pb) / b.soma else 0 end as piso,
           case when b.soma > 0 then (b.total * b.percentual_pb) % b.soma else 0 end as resto
    from base as b
    where b.total is not null
  ),
  com_falta as (
    select pt.*,
           pt.total - sum(pt.piso) over (partition by pt.orcamento_id) as faltam,
           row_number() over (partition by pt.orcamento_id order by pt.resto desc, pt.ordem) as posicao
    from partes as pt
  )
  select c.orcamento_id, c.id, c.ordem, c.descricao,
         (c.piso + case when c.posicao <= c.faltam then 1 else 0 end)::bigint,
         coalesce((select sum(r.valor_centavos) from public.orcamento_recebimento as r
                   where r.consultoria_id = cid and r.parcela_id = c.id and r.estornado_em is null), 0)::bigint,
         coalesce(c.vence_em, (
           select a.data_aceite + c.dias from public.orcamento_aceite as a
           where a.consultoria_id = cid and a.orcamento_id = c.orcamento_id
           order by a.revisao desc limit 1))
  from com_falta as c
$$;

revoke all on function private.parcelas_com_valor(uuid) from public, anon;
grant execute on function private.parcelas_com_valor(uuid) to authenticated;

-- Dinheiro por orçamento aprovado: aprovado, recebido, a receber e vencido sem receber.
-- O painel do dono (P8) agrupa por cliente.
create function private.dinheiro_dos_orcamentos(cid uuid)
returns table (
  orcamento_id uuid,
  empreendimento_id uuid,
  aprovado_centavos bigint,
  recebido_centavos bigint,
  a_receber_centavos bigint,
  vencido_centavos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.empreendimento_id,
         coalesce(sum(p.valor_centavos), 0)::bigint,
         coalesce(sum(p.recebido_centavos), 0)::bigint,
         coalesce(sum(greatest(p.valor_centavos - p.recebido_centavos, 0)), 0)::bigint,
         coalesce(sum(greatest(p.valor_centavos - p.recebido_centavos, 0))
                    filter (where p.vence_em < private.hoje_da_consultoria(cid)), 0)::bigint
  from public.orcamento as o
  join private.parcelas_com_valor(cid) as p on p.orcamento_id = o.id
  where o.consultoria_id = cid
  group by o.id, o.empreendimento_id
$$;

revoke all on function private.dinheiro_dos_orcamentos(uuid) from public, anon;
grant execute on function private.dinheiro_dos_orcamentos(uuid) to authenticated;

-- Execução do orçamento aprovado: horas orçadas e lançadas por item, parcelas com o recebido.
-- A Gestão vê tudo; o dinheiro só vai para quem tem a permissão financeira.
create function public.execucao_do_orcamento(p_orcamento_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  orc public.orcamento%rowtype;
  financeiro boolean;
begin
  select * into orc from public.orcamento as o where o.id = p_orcamento_id;
  if not found or not private.is_gestao(orc.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  financeiro := private.is_financeiro(orc.consultoria_id);

  return jsonb_build_object(
    'financeiro', financeiro,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'descricao', i.descricao, 'orcado_minutos', i.minutos,
               'lancado_minutos', coalesce((
                 select sum(a.minutos) from public.apontamento_horas as a
                 left join public.tarefa_servico as t
                   on t.consultoria_id = a.consultoria_id and t.id = a.tarefa_servico_id
                 where a.consultoria_id = orc.consultoria_id and a.excluido_em is null
                   and coalesce(a.orcamento_item_id, t.orcamento_item_id) = i.id), 0))
             order by i.ordem)
      from public.orcamento_item as i
      where i.consultoria_id = orc.consultoria_id and i.orcamento_id = orc.id), '[]'::jsonb),
    'apontamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'data', a.data, 'minutos', a.minutos, 'nota', a.nota,
               'membro_id', a.membro_id, 'membro_nome', m.nome,
               'item_id', coalesce(a.orcamento_item_id, t.orcamento_item_id),
               'tarefa_id', a.tarefa_servico_id)
             order by a.data desc, a.registrado_em desc)
      from public.apontamento_horas as a
      join public.membro as m on m.consultoria_id = a.consultoria_id and m.id = a.membro_id
      left join public.tarefa_servico as t on t.consultoria_id = a.consultoria_id and t.id = a.tarefa_servico_id
      where a.consultoria_id = orc.consultoria_id and a.orcamento_id = orc.id and a.excluido_em is null),
      '[]'::jsonb),
    'parcelas', case when financeiro then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.parcela_id, 'descricao', p.descricao, 'valor_centavos', p.valor_centavos,
               'recebido_centavos', p.recebido_centavos, 'vence_em', p.vence_em,
               'recebimentos', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', r.id, 'valor_centavos', r.valor_centavos, 'recebido_em', r.recebido_em,
                          'nota', r.nota, 'estornado', r.estornado_em is not null,
                          'row_version', r.row_version)
                        order by r.recebido_em, r.registrado_em)
                 from public.orcamento_recebimento as r
                 where r.consultoria_id = orc.consultoria_id and r.parcela_id = p.parcela_id), '[]'::jsonb))
             order by p.ordem)
      from private.parcelas_com_valor(orc.consultoria_id) as p
      where p.orcamento_id = orc.id), '[]'::jsonb) else null end
  );
end;
$$;

revoke all on function public.execucao_do_orcamento(uuid) from public, anon;
grant execute on function public.execucao_do_orcamento(uuid) to authenticated;

-- "A receber" do placar de Orçamentos (função nova: resumo_dos_orcamentos fica como está).
create function public.a_receber_dos_orcamentos(p_consultoria_id uuid)
returns table (a_receber_centavos bigint, vencido_centavos bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_financeiro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
  select coalesce(sum(d.a_receber_centavos), 0)::bigint, coalesce(sum(d.vencido_centavos), 0)::bigint
  from private.dinheiro_dos_orcamentos(p_consultoria_id) as d;
end;
$$;

revoke all on function public.a_receber_dos_orcamentos(uuid) from public, anon;
grant execute on function public.a_receber_dos_orcamentos(uuid) to authenticated;
