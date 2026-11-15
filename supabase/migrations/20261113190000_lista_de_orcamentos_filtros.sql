-- Lista de orçamentos: abas por situação, busca pelo número e indicadores (Protótipo 19, ORC-04).
-- 1. listar_orcamentos ganha p_situacao (nulo = todas). A busca também acha pelo número
--    ORC-AAAA-NNN, por AAAA-NNN ou só pelo NNN (trecho do número, sem diferença de maiúsculas).
-- 2. contar_orcamentos_por_situacao: quantos orçamentos de cada situação atendem à mesma busca
--    (a contagem de cada aba). Mesma RLS da lista: só a Gestão lê.
-- 3. resumo_dos_orcamentos: indicadores do topo, fora da lixeira. Em elaboração (rascunhos),
--    aguardando decisão (enviada + em negociação) e aprovados. O valor soma só orçamentos com preço
--    calculado; os sem preço são contados à parte (nunca viram zero).
--
-- O valor é o mesmo da lista: soma dos preços persistidos dos itens (orcamento_item.preco_centavos)
-- + preco_visitas_centavos, gravados por private.precificar_orcamento a cada salvamento; nulo
-- quando private.preco_pendente. A expressão sai da lista para private.total_do_orcamento, para a
-- lista e o resumo nunca divergirem.

-- ---------------------------------------------------------------------------
-- Peças comuns
-- ---------------------------------------------------------------------------

-- Total do orçamento como a lista sempre mostrou: nulo com preço pendente.
create function private.total_do_orcamento(o public.orcamento)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case when private.preco_pendente(o) then null
              else coalesce((select sum(i.preco_centavos) from public.orcamento_item as i
                             where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), 0)
                   + o.preco_visitas_centavos end::bigint
$$;

revoke all on function private.total_do_orcamento(public.orcamento) from public, anon, authenticated;
-- A lista roda com a RLS de quem lê (security invoker): liberar a execução, como preco_pendente.
grant execute on function private.total_do_orcamento(public.orcamento) to authenticated;

-- Número como na tela, em minúsculas: "orc-2026-014" (numeroDoOrcamento em packages/domain).
create function private.numero_do_orcamento(p_ano integer, p_sequencia integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'orc-' || p_ano::text || '-'
         || lpad(p_sequencia::text, greatest(3, length(p_sequencia::text)), '0')
$$;

revoke all on function private.numero_do_orcamento(integer, integer) from public, anon, authenticated;
grant execute on function private.numero_do_orcamento(integer, integer) to authenticated;

-- Busca da lista: empreendimento, prospecto, objeto ou trecho do número. Vazia = tudo.
create function private.orcamento_atende_busca(
  o public.orcamento,
  p_empreendimento_nome_normalizado text,
  p_busca text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select btrim(coalesce(p_busca, '')) = ''
      or p_empreendimento_nome_normalizado like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.prospecto_nome) like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.objeto) like private.padrao_de_busca(p_busca)
      or strpos(private.numero_do_orcamento(o.ano, o.sequencia), private.normalizar_nome(p_busca)) > 0
$$;

revoke all on function private.orcamento_atende_busca(public.orcamento, text, text)
  from public, anon, authenticated;
grant execute on function private.orcamento_atende_busca(public.orcamento, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Lista com filtro por situação
-- ---------------------------------------------------------------------------
drop function public.listar_orcamentos(uuid, text, integer, integer, boolean);

create function public.listar_orcamentos(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0,
  p_lixeira boolean default false,
  p_situacao public.situacao_orcamento default null
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
    private.total_do_orcamento(o),
    o.atualizado_em,
    o.excluido_em,
    o.row_version,
    count(*) over ()
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.consultoria_id = p_consultoria_id
    and (o.excluido_em is not null) = coalesce(p_lixeira, false)
    and (p_situacao is null or o.situacao = p_situacao)
    and private.orcamento_atende_busca(o, e.nome_normalizado, p_busca)
  order by o.atualizado_em desc, o.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

revoke all on function public.listar_orcamentos(uuid, text, integer, integer, boolean, public.situacao_orcamento)
  from public, anon;
grant execute on function public.listar_orcamentos(uuid, text, integer, integer, boolean, public.situacao_orcamento)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Contagem de cada aba (mesma busca, todas as situações). Situação sem orçamento não vem.
-- ---------------------------------------------------------------------------
create function public.contar_orcamentos_por_situacao(
  p_consultoria_id uuid,
  p_busca text default null,
  p_lixeira boolean default false
)
returns table (
  situacao public.situacao_orcamento,
  quantidade bigint
)
language sql
stable
set search_path = ''
as $$
  select o.situacao, count(*)
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.consultoria_id = p_consultoria_id
    and (o.excluido_em is not null) = coalesce(p_lixeira, false)
    and private.orcamento_atende_busca(o, e.nome_normalizado, p_busca)
  group by o.situacao
  order by o.situacao
$$;

revoke all on function public.contar_orcamentos_por_situacao(uuid, text, boolean) from public, anon;
grant execute on function public.contar_orcamentos_por_situacao(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Indicadores do topo. Só a Gestão; a lixeira não entra. Sempre uma linha.
-- ---------------------------------------------------------------------------
create function public.resumo_dos_orcamentos(p_consultoria_id uuid)
returns table (
  rascunhos bigint,
  aguardando bigint,
  aguardando_centavos bigint,
  aguardando_sem_preco bigint,
  aprovados bigint,
  aprovados_centavos bigint,
  aprovados_sem_preco bigint
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

  return query
  with valores as (
    select o.situacao, private.total_do_orcamento(o) as total_centavos
    from public.orcamento as o
    where o.consultoria_id = p_consultoria_id
      and o.excluido_em is null
  )
  select
    count(*) filter (where v.situacao = 'rascunho'),
    count(*) filter (where v.situacao in ('enviada', 'negociacao')),
    coalesce(sum(v.total_centavos) filter (where v.situacao in ('enviada', 'negociacao')), 0)::bigint,
    count(*) filter (where v.situacao in ('enviada', 'negociacao') and v.total_centavos is null),
    count(*) filter (where v.situacao = 'aprovada'),
    coalesce(sum(v.total_centavos) filter (where v.situacao = 'aprovada'), 0)::bigint,
    count(*) filter (where v.situacao = 'aprovada' and v.total_centavos is null)
  from valores as v;
end;
$$;

revoke all on function public.resumo_dos_orcamentos(uuid) from public, anon;
grant execute on function public.resumo_dos_orcamentos(uuid) to authenticated;
