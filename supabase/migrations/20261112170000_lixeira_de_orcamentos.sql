-- Lixeira de orçamentos (decisões do Eduardo, 12/11/2026):
-- 1. Exclusão lógica: o orçamento sai da lista e vai para a lixeira, com quem excluiu e quando
--    (auditoria pelo trigger de orcamento). Dá para restaurar. O número não é reaproveitado.
-- 2. Qualquer situação pode ir para a lixeira, menos "aprovada" (vira contrato, cobrança e tarefas).
--    Excluir nunca apaga cobranças nem tarefas (regras de negócio, §7.2).
-- 3. Na lixeira, o orçamento não muda (salvar, cadastrar prospecto…): só restaurar.

alter table public.orcamento
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add constraint orcamento_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict,
  add constraint orcamento_exclusao_coerente check ((excluido_em is null) = (excluido_por is null)),
  add constraint orcamento_aprovado_fora_da_lixeira check (excluido_em is null or situacao <> 'aprovada');

comment on column public.orcamento.excluido_em is
  'Na lixeira desde (exclusão lógica). Nulo = na lista. Aprovado nunca vai para a lixeira.';

create index orcamento_lixeira_idx on public.orcamento (consultoria_id, atualizado_em desc)
  where excluido_em is not null;

-- Na lixeira, nada muda além de restaurar (excluido_em volta a nulo).
create function private.orcamento_na_lixeira_nao_muda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.excluido_em is not null and new.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.orcamento_na_lixeira_nao_muda() from public, anon, authenticated;

create trigger orcamento_na_lixeira_nao_muda
  before update on public.orcamento
  for each row execute function private.orcamento_na_lixeira_nao_muda();

-- ---------------------------------------------------------------------------
-- Excluir e restaurar: só a Gestão, com controle otimista. Repetir não muda nada.
-- ---------------------------------------------------------------------------
create function public.excluir_orcamento(p_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
begin
  select * into alvo from public.orcamento as o where o.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    return alvo.row_version;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'aprovada' then
    raise exception 'orcamento_aprovado_nao_exclui' using errcode = 'P0001';
  end if;

  update public.orcamento as o
  set excluido_em = now(),
      excluido_por = private.membro_atual(alvo.consultoria_id),
      row_version = o.row_version + 1
  where o.id = p_id;
  return alvo.row_version + 1;
end;
$$;

revoke all on function public.excluir_orcamento(uuid, integer) from public, anon;
grant execute on function public.excluir_orcamento(uuid, integer) to authenticated;

create function public.restaurar_orcamento(p_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
begin
  select * into alvo from public.orcamento as o where o.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is null then
    return alvo.row_version;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  update public.orcamento as o
  set excluido_em = null,
      excluido_por = null,
      row_version = o.row_version + 1
  where o.id = p_id;
  return alvo.row_version + 1;
end;
$$;

revoke all on function public.restaurar_orcamento(uuid, integer) from public, anon;
grant execute on function public.restaurar_orcamento(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Lista: p_lixeira escolhe a lista ou a lixeira. Traz row_version para excluir e restaurar.
-- ---------------------------------------------------------------------------
drop function public.listar_orcamentos(uuid, text, integer, integer);

create function public.listar_orcamentos(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0,
  p_lixeira boolean default false
)
returns table (
  id uuid,
  ano integer,
  sequencia integer,
  revisao integer,
  situacao public.situacao_orcamento,
  empreendimento_id uuid,
  empreendimento_nome text,
  objeto text,
  total_centavos bigint,
  atualizado_em timestamptz,
  excluido_em timestamptz,
  row_version integer,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select
    o.id,
    o.ano,
    o.sequencia,
    o.revisao,
    o.situacao,
    o.empreendimento_id,
    coalesce(e.nome, o.prospecto_nome),
    o.objeto,
    case when private.preco_pendente(o) then null
         else coalesce((select sum(i.preco_centavos) from public.orcamento_item as i
                        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), 0)
              + o.preco_visitas_centavos end::bigint,
    o.atualizado_em,
    o.excluido_em,
    o.row_version,
    count(*) over ()
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.consultoria_id = p_consultoria_id
    and (o.excluido_em is not null) = coalesce(p_lixeira, false)
    and (
      btrim(coalesce(p_busca, '')) = ''
      or e.nome_normalizado like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.prospecto_nome) like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.objeto) like private.padrao_de_busca(p_busca)
    )
  order by o.atualizado_em desc, o.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

revoke all on function public.listar_orcamentos(uuid, text, integer, integer, boolean) from public, anon;
grant execute on function public.listar_orcamentos(uuid, text, integer, integer, boolean) to authenticated;

-- Detalhe: diz se o orçamento está na lixeira.
create or replace function public.obter_orcamento(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'consultoria_id', o.consultoria_id,
    'ano', o.ano,
    'sequencia', o.sequencia,
    'revisao', o.revisao,
    'situacao', o.situacao,
    'empreendimento_id', o.empreendimento_id,
    'empreendimento_nome', coalesce(e.nome, o.prospecto_nome),
    'prospecto', case when o.prospecto_nome is null then null else jsonb_build_object(
      'nome', o.prospecto_nome,
      'cnpj', o.prospecto_cnpj,
      'contato', o.prospecto_contato,
      'email', o.prospecto_email,
      'telefone', o.prospecto_telefone) end,
    'objeto', o.objeto,
    'destinatario', o.destinatario,
    'prazos', o.prazos,
    'validade_dias', o.validade_dias,
    'premissas', to_jsonb(o.premissas),
    'exclusoes', to_jsonb(o.exclusoes),
    'moeda', o.moeda,
    'margem_pb', o.margem_pb,
    'forma_preco', o.forma_preco,
    'visitas', jsonb_build_object(
      'quantidade', o.visitas,
      'km_por_visita', o.km_por_visita,
      'outros_por_visita_centavos', o.outros_por_visita_centavos),
    'preco_visitas_centavos', o.preco_visitas_centavos,
    'base', case when o.base_registrada_em is null then null else jsonb_build_object(
      'hora_tecnica_centavos', o.base_hora_tecnica_centavos,
      'custo_fixo_hora_centavos', o.base_custo_fixo_hora_centavos,
      'margem_desejada_pb', o.base_margem_desejada_pb,
      'margem_minima_pb', o.base_margem_minima_pb,
      'tributos_pb', o.base_tributos_pb,
      'taxas_pb', o.base_taxas_pb,
      'taxa_por_cobranca_centavos', o.base_taxa_por_cobranca_centavos,
      'taxa_por_assinatura_centavos', o.base_taxa_por_assinatura_centavos,
      'valor_visita_centavos', coalesce(o.base_valor_visita_centavos, 0),
      'custo_km_centavos', coalesce(o.base_custo_km_centavos, 0),
      'custos_fixos_mensais_centavos', coalesce(o.base_custos_fixos_mensais_centavos, 0),
      'custos_fixos_equipe_centavos', coalesce(o.base_custos_fixos_equipe_centavos, 0),
      'custos_fixos_detalhe', coalesce(o.base_custos_fixos_detalhe, '[]'::jsonb),
      'horas_venda', coalesce(o.base_horas_venda, '[]'::jsonb),
      'custo_hora_profissao', coalesce(o.base_custo_hora_profissao, '[]'::jsonb),
      'custo_hora_membro', coalesce(o.base_custo_hora_membro, '[]'::jsonb),
      'registrada_em', o.base_registrada_em) end,
    'atualizado_em', o.atualizado_em,
    'excluido_em', o.excluido_em,
    'row_version', o.row_version,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos,
        'hora_venda_id', i.hora_venda_id, 'responsavel_id', i.responsavel_id,
        'mes_previsto', i.mes_previsto) order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'descricao', d.descricao, 'estimativa_centavos', d.estimativa_centavos,
        'tratamento', d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = o.consultoria_id and d.orcamento_id = o.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'descricao', p.descricao, 'dias', p.dias, 'percentual_pb', p.percentual_pb)
        order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = o.consultoria_id and p.orcamento_id = o.id), '[]'::jsonb)
  )
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.id = p_id
$$;
