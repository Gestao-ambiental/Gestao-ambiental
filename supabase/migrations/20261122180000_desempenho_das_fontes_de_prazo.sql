-- Desempenho das fontes de prazo, sobre as guardas de data da 20261122010500.
-- Refaz a 20261122030000 (PR #51, nunca aplicada), que saiu de uma base anterior às correções de
-- segurança e desfaria as guardas contra datas não finitas ou fora da faixa. Cada fonte aqui mantém
-- o filtro private.data_civil_valida da 010500: a leitura ignora só o item inválido.
--
-- Carga de 20 consultorias e 26 mil ocorrências: o perfil mostrou dois custos que se repetem por
-- linha:
--   a) `with hoje as (select private.hoje_da_consultoria(cid))` é um CTE usado uma vez, que o
--      planejador embute na consulta. Como hoje_da_consultoria fixa o search_path (não é embutida),
--      ela rodava uma vez por linha, lendo a consultoria com RLS a cada vez. Agora a data civil é
--      calculada uma vez por chamada (CTE materializado ou variável).
--   b) período, responsável e consultoria eram filtrados depois de expandir a carteira inteira
--      (todas as ocorrências abertas, com sete junções e a RLS de cada tabela). Agora a fonte de
--      ocorrência tem uma versão filtrada, e private.linhas_de_prazo_filtradas aplica os filtros
--      dentro de cada fonte, antes de expandir. listar_prazos, contar_prazos, listar_calendario e
--      minha_semana mandam o período e o responsável, e calculam o membro atual uma vez.
-- O resultado não muda (teste 795 compara o caminho antigo e o novo; 798 confere as guardas nos
-- caminhos filtrados) e nenhuma assinatura pública muda. As fontes de um argumento continuam
-- sendo a definição de cada tipo; a de ocorrência passa a embrulhar a filtrada. Exigência e alvará
-- ficam como estão: a união filtrada as chama pela versão de um argumento e filtra logo.
-- Tudo security invoker, como antes: a RLS de quem chama decide o que aparece.

-- ---------------------------------------------------------------------------
-- 1. Ocorrência: versão filtrada; a de um argumento a embrulha
-- ---------------------------------------------------------------------------
-- Período: entra a ocorrência cujo prazo oficial ou meta interna cai em [p_de, p_ate] (nulo = sem
-- limite). É um superconjunto do que cada chamador pede; o chamador filtra exatamente depois.
create function private.linhas_de_prazo_ocorrencia(
  cid uuid,
  p_de date,
  p_ate date,
  p_responsavel_id uuid
)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hoje date := private.hoje_da_consultoria(cid);
  v_de date := coalesce(p_de, '-infinity'::date);
  v_ate date := coalesce(p_ate, 'infinity'::date);
begin
  -- Licenças, condicionantes e membros da consultoria são lidos uma vez cada (conjuntos pequenos,
  -- materializados) e não uma vez por ocorrência: a RLS de cada tabela roda por linha lida.
  return query
  with licenca as materialized (
    select i.id, i.tipo_id, nullif(concat_ws(' ', t.sigla, i.numero), '') as nome,
           e.id as empreendimento_id, e.nome as empreendimento_nome, u.id as unidade_id, u.nome as unidade_nome
    from public.instrumento as i
    join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
    join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
    left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
    where i.consultoria_id = cid
  ),
  versao as materialized (
    select v.id, c.codigo, v.titulo
    from public.condicionante_versao as v
    join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
    where v.consultoria_id = cid
  ),
  pessoa as materialized (
    select m.id, m.nome from public.membro as m where m.consultoria_id = cid
  )
  select
    'ocorrencia'::text, o.id, o.instrumento_id, o.prazo_oficial_atual, o.prazo_oficial_atual - v_hoje,
    v.codigo, v.titulo, i.empreendimento_id, i.empreendimento_nome, i.unidade_id, i.unidade_nome,
    i.nome, i.tipo_id,
    o.responsavel_id, m.nome, o.situacao, o.meta_interna, o.row_version
  from public.ocorrencia as o
  join versao as v on v.id = o.condicionante_versao_id
  join licenca as i on i.id = o.instrumento_id
  left join pessoa as m on m.id = o.responsavel_id
  where o.consultoria_id = cid and o.situacao <> 'concluida'
    and private.data_civil_valida(o.prazo_oficial_atual)
    and (p_responsavel_id is null or o.responsavel_id = p_responsavel_id)
    and ((p_de is null and p_ate is null)
         or o.prazo_oficial_atual between v_de and v_ate
         or o.meta_interna between v_de and v_ate);
end;
$$;

create or replace function private.linhas_de_prazo_ocorrencia(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  select * from private.linhas_de_prazo_ocorrencia(cid, null::date, null::date, null::uuid)
$$;

comment on function private.linhas_de_prazo_ocorrencia(uuid, date, date, uuid) is
  'Ocorrências abertas com prazo válido (private.data_civil_valida), filtradas antes de expandir: prazo ou meta em [p_de, p_ate] (nulo = sem limite) e responsável. É a definição; a versão de um argumento a embrulha.';
comment on function private.linhas_de_prazo_ocorrencia(uuid) is
  'Ocorrências abertas com prazo válido (todas): embrulha a versão filtrada, sem filtro.';

revoke all on function private.linhas_de_prazo_ocorrencia(uuid, date, date, uuid) from public, anon;
grant execute on function private.linhas_de_prazo_ocorrencia(uuid, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. As outras fontes: corpo e guarda da 010500, com a data civil calculada uma vez (CTE
-- materializado)
-- ---------------------------------------------------------------------------
create or replace function private.linhas_de_prazo_validade(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as materialized (select private.hoje_da_consultoria(cid) as d)
  select
    'validade'::text, i.id, i.id, i.validade, i.validade - h.d,
    null::text, 'Validade'::text, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where i.consultoria_id = cid and i.situacao = 'ativo'
    and private.data_civil_valida(i.validade)
$$;

create or replace function private.linhas_de_prazo_limite_protocolo(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as materialized (select private.hoje_da_consultoria(cid) as d)
  select
    'limite_protocolo'::text, i.id, i.id, i.validade - coalesce(pr.dias_limite_protocolo, 120),
    i.validade - coalesce(pr.dias_limite_protocolo, 120) - h.d,
    null::text, 'Limite de protocolo'::text, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.plano_renovacao as pr on pr.consultoria_id = i.consultoria_id and pr.instrumento_id = i.id
  where i.consultoria_id = cid and i.situacao = 'ativo' and upper(btrim(t.sigla)) = 'LAO'
    and private.data_civil_valida(i.validade)
    and pr.protocolado_em is null
$$;

create or replace function private.linhas_de_prazo_vencimento(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as materialized (select private.hoje_da_consultoria(cid) as d)
  select
    'vencimento'::text, v.id, v.instrumento_id, v.valido_ate, v.valido_ate - h.d,
    null::text, concat_ws(' ', t.nome, v.numero), e.id, e.nome, u.id, coalesce(u.nome, ''),
    nullif(concat_ws(' ', ti.sigla, i.numero), ''), null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, v.row_version
  from public.vencimento as v
  cross join hoje as h
  join public.tipo_vencimento as t on t.consultoria_id = v.consultoria_id and t.id = v.tipo_vencimento_id
  join public.empreendimento as e on e.consultoria_id = v.consultoria_id and e.id = v.empreendimento_id
  left join public.unidade as u on u.consultoria_id = v.consultoria_id and u.id = v.unidade_id
  left join public.instrumento as i on i.consultoria_id = v.consultoria_id and i.id = v.instrumento_id
  left join public.tipo_instrumento as ti on ti.consultoria_id = i.consultoria_id and ti.id = i.tipo_id
  where v.consultoria_id = cid and v.excluido_em is null
    and private.data_civil_valida(v.valido_ate)
    and not exists (
      select 1 from public.vencimento as s
      where s.consultoria_id = v.consultoria_id and s.anterior_id = v.id and s.excluido_em is null
    )
$$;

create or replace function private.linhas_de_prazo_acao_legal(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as materialized (select private.hoje_da_consultoria(cid) as d)
  select
    'acao_legal'::text, a.id, null::uuid, a.prazo, a.prazo - h.d,
    r.dispositivo, a.descricao, e.id, e.nome, u.id, u.nome,
    null::text, null::uuid,
    a.responsavel_id, m.nome, null::public.situacao_ocorrencia, null::date, a.row_version
  from public.acao_legal as a
  cross join hoje as h
  join public.requisito_legal as r on r.consultoria_id = a.consultoria_id and r.id = a.requisito_id
  join public.empreendimento as e on e.consultoria_id = r.consultoria_id and e.id = r.empreendimento_id
  join lateral (
    select u.id, u.nome from public.unidade as u
    where u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id
    order by u.criado_em, u.id
    limit 1
  ) as u on true
  left join public.membro as m on m.consultoria_id = a.consultoria_id and m.id = a.responsavel_id
  where a.consultoria_id = cid and a.concluida_em is null
    and private.data_civil_valida(a.prazo)
$$;

-- ---------------------------------------------------------------------------
-- 3. União filtrada: as mesmas fontes de private.linhas_de_prazo, com período e responsável
-- aplicados dentro de cada uma (a ocorrência pela versão filtrada; as outras logo na saída, e as
-- sem responsável nem rodam quando o filtro é por responsável). Superconjunto do que o chamador
-- pede: ele filtra exatamente depois. Fonte nova em private.linhas_de_prazo entra aqui também (o
-- teste 795 confere).
-- ---------------------------------------------------------------------------
create function private.linhas_de_prazo_filtradas(
  cid uuid,
  p_de date,
  p_ate date,
  p_responsavel_id uuid
)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_de date := coalesce(p_de, '-infinity'::date);
  v_ate date := coalesce(p_ate, 'infinity'::date);
begin
  return query
  select * from private.linhas_de_prazo_ocorrencia(cid, p_de, p_ate, p_responsavel_id);

  return query
  select * from private.linhas_de_prazo_exigencia(cid) as l
  where (p_responsavel_id is null or l.responsavel_id = p_responsavel_id)
    and l.prazo between v_de and v_ate;

  return query
  select * from private.linhas_de_prazo_acao_legal(cid) as l
  where (p_responsavel_id is null or l.responsavel_id = p_responsavel_id)
    and l.prazo between v_de and v_ate;

  -- Fontes sem responsável: com filtro por responsável, nada delas entra.
  if p_responsavel_id is not null then
    return;
  end if;

  return query
  select * from private.linhas_de_prazo_validade(cid) as l where l.prazo between v_de and v_ate;
  return query
  select * from private.linhas_de_prazo_limite_protocolo(cid) as l where l.prazo between v_de and v_ate;
  return query
  select * from private.linhas_de_prazo_alvara(cid) as l where l.prazo between v_de and v_ate;
  return query
  select * from private.linhas_de_prazo_vencimento(cid) as l where l.prazo between v_de and v_ate;
end;
$$;

comment on function private.linhas_de_prazo_filtradas(uuid, date, date, uuid) is
  'private.linhas_de_prazo com período (prazo, ou meta da ocorrência, em [p_de, p_ate]) e responsável aplicados dentro das fontes. Superconjunto: o chamador filtra exatamente depois.';

revoke all on function private.linhas_de_prazo_filtradas(uuid, date, date, uuid) from public, anon;
grant execute on function private.linhas_de_prazo_filtradas(uuid, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Chamadores: mesmas assinaturas e mesmos resultados. Membro atual e data civil uma vez;
-- período e responsável vão para as fontes.
-- ---------------------------------------------------------------------------

-- Faixa da Visão vira período: atrasadas = antes de hoje; hoje; próximos 7 = de amanhã a +7.
-- Aba "minhas" e filtro por pessoa viram responsável.
create or replace function public.listar_prazos(
  p_consultoria_id uuid,
  p_aba text default 'todos',
  p_responsavel_id uuid default null,
  p_sem_responsavel boolean default false,
  p_tipo_id uuid default null,
  p_empreendimento_id uuid default null,
  p_faixa text default null,
  p_ordem text default 'prazo',
  p_limite integer default 25,
  p_deslocamento integer default 0,
  p_cliente_id uuid default null
)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_nome text,
  licenca text,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  row_version integer,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  with base as materialized (
    select private.membro_atual(p_consultoria_id) as eu,
           private.hoje_da_consultoria(p_consultoria_id) as hoje
  ),
  filtro as materialized (
    select
      b.eu,
      coalesce(p_aba, 'todos') <> 'minhas' and p_responsavel_id is null
             and not coalesce(p_sem_responsavel, false) and p_tipo_id is null
             and p_empreendimento_id is null as sem_filtro,
      case p_faixa when 'hoje' then b.hoje when 'proximos_7' then b.hoje + 1 end as de,
      case p_faixa when 'atrasadas' then b.hoje - 1 when 'hoje' then b.hoje
                   when 'proximos_7' then b.hoje + 7 end as ate,
      coalesce(p_responsavel_id, case when coalesce(p_aba, 'todos') = 'minhas' then b.eu end) as resp
    from base as b
  )
  select
    l.tipo_linha, l.id, l.instrumento_id, l.prazo, l.dias, l.codigo, l.titulo, l.empreendimento_id,
    l.empreendimento_nome, l.unidade_nome, l.licenca, l.responsavel_id, l.responsavel_nome,
    l.situacao_ocorrencia, l.row_version, count(*) over ()
  from filtro as f
  cross join lateral private.linhas_de_prazo_filtradas(p_consultoria_id, f.de, f.ate, f.resp) as l
  -- Os auxiliares só rodam quando decidem algo: com filtro neutro todos dão verdadeiro, e
  -- linha_na_visao só olha o vencimento.
  where (f.sem_filtro
         or private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
              f.eu, p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id, p_empreendimento_id))
    and (p_cliente_id is null
         or private.empreendimento_do_cliente(p_consultoria_id, l.empreendimento_id, p_cliente_id))
    and (l.tipo_linha <> 'vencimento'
         or private.linha_na_visao(p_consultoria_id, l.tipo_linha, l.id, l.dias))
    and (
      p_faixa is null
      or case p_faixa
           when 'atrasadas' then l.dias < 0
           when 'hoje' then l.dias = 0
           when 'proximos_7' then l.dias between 1 and 7
           when 'sem_responsavel' then private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null
           else true
         end
    )
  order by
    case when p_ordem = 'demanda' then l.titulo end asc,
    case when p_ordem = '-demanda' then l.titulo end desc,
    case when p_ordem = 'empreendimento' then l.empreendimento_nome end asc,
    case when p_ordem = '-empreendimento' then l.empreendimento_nome end desc,
    case when p_ordem = 'licenca' then l.licenca end asc,
    case when p_ordem = '-licenca' then l.licenca end desc,
    case when p_ordem = 'responsavel' then l.responsavel_nome end asc nulls first,
    case when p_ordem = '-responsavel' then l.responsavel_nome end desc nulls last,
    case when p_ordem = '-prazo' then l.prazo end desc,
    l.prazo asc,
    l.titulo asc,
    l.id asc
  limit least(greatest(coalesce(p_limite, 25), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

create or replace function public.contar_prazos(
  p_consultoria_id uuid,
  p_aba text default 'todos',
  p_responsavel_id uuid default null,
  p_sem_responsavel boolean default false,
  p_tipo_id uuid default null,
  p_empreendimento_id uuid default null,
  p_cliente_id uuid default null
)
returns table (atrasadas bigint, hoje bigint, proximos_7 bigint, sem_responsavel bigint, total bigint)
language sql
stable
set search_path = ''
as $$
  with base as materialized (
    select private.membro_atual(p_consultoria_id) as eu
  ),
  filtro as materialized (
    select b.eu,
           coalesce(p_aba, 'todos') <> 'minhas' and p_responsavel_id is null
                  and not coalesce(p_sem_responsavel, false) and p_tipo_id is null
                  and p_empreendimento_id is null as sem_filtro,
           coalesce(p_responsavel_id, case when coalesce(p_aba, 'todos') = 'minhas' then b.eu end) as resp
    from base as b
  )
  select
    count(*) filter (where l.dias < 0),
    count(*) filter (where l.dias = 0),
    count(*) filter (where l.dias between 1 and 7),
    count(*) filter (where l.responsavel_id is null and private.tipo_linha_tem_responsavel(l.tipo_linha)),
    count(*)
  from filtro as f
  cross join lateral private.linhas_de_prazo_filtradas(p_consultoria_id, null, null, f.resp) as l
  -- Os auxiliares só rodam quando decidem algo: com filtro neutro todos dão verdadeiro, e
  -- linha_na_visao só olha o vencimento.
  where (f.sem_filtro
         or private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
              f.eu, p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id, p_empreendimento_id))
    and (p_cliente_id is null
         or private.empreendimento_do_cliente(p_consultoria_id, l.empreendimento_id, p_cliente_id))
    and (l.tipo_linha <> 'vencimento'
         or private.linha_na_visao(p_consultoria_id, l.tipo_linha, l.id, l.dias))
$$;

create or replace function public.listar_calendario(
  p_consultoria_id uuid,
  p_de date,
  p_ate date,
  p_responsavel_id uuid default null,
  p_unidade_id uuid default null,
  p_sem_responsavel boolean default false
)
returns table (
  tipo_evento text,
  data date,
  id uuid,
  instrumento_id uuid,
  codigo text,
  titulo text,
  empreendimento_nome text,
  unidade_nome text,
  licenca text,
  responsavel_nome text,
  sem_responsavel boolean,
  dias integer,
  responsavel_id uuid
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;

  return query
  with linhas as (
    select * from private.linhas_de_prazo_filtradas(p_consultoria_id, p_de, p_ate, p_responsavel_id) as l
    where (p_responsavel_id is null or l.responsavel_id = p_responsavel_id)
      and (p_unidade_id is null or l.unidade_id = p_unidade_id)
      and (not coalesce(p_sem_responsavel, false)
           or (private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null))
  )
  select
    case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end,
    l.prazo, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome, l.licenca,
    l.responsavel_nome, private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null, l.dias,
    l.responsavel_id
  from linhas as l
  where l.prazo between p_de and p_ate
  union all
  select
    'meta', l.meta_interna, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome,
    l.licenca, l.responsavel_nome, l.responsavel_id is null, l.dias, l.responsavel_id
  from linhas as l
  where l.tipo_linha = 'ocorrencia' and l.meta_interna between p_de and p_ate
  order by 2, 1, 5, 3;
end;
$$;

create or replace function public.minha_semana(
  p_de date default null,
  p_ate date default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  somente_leitura boolean,
  situacao_consultoria text,
  tipo_evento text,
  tipo_linha text,
  data date,
  id uuid,
  instrumento_id uuid,
  empreendimento_id uuid,
  codigo text,
  titulo text,
  empreendimento_nome text,
  unidade_nome text,
  licenca text,
  dias integer,
  em_conferencia boolean,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_ate is null or (p_de is not null and (p_ate < p_de or p_ate - p_de > 62)) then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 100
     or p_deslocamento is null or p_deslocamento < 0 then
    raise exception 'paginacao_invalida' using errcode = '22023';
  end if;

  return query
  with meus as materialized (
    select m.consultoria_id, m.id as membro_id, c.nome, c.situacao::text as situacao
    from public.membro as m
    join public.consultoria as c on c.id = m.consultoria_id
    where m.usuario_id = (select auth.uid()) and m.situacao = 'ativo'
  ),
  linhas as (
    select me.consultoria_id, me.nome, me.situacao, l.*
    from meus as me
    cross join lateral private.linhas_de_prazo_filtradas(me.consultoria_id, p_de, p_ate, me.membro_id) as l
    where l.responsavel_id = me.membro_id
  ),
  eventos as (
    select
      l.consultoria_id, l.nome, l.situacao,
      case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end as tipo_evento,
      l.tipo_linha, l.prazo as data, l.id, l.instrumento_id, l.empreendimento_id, l.codigo, l.titulo,
      l.empreendimento_nome, l.unidade_nome, l.licenca, l.dias,
      coalesce(l.situacao_ocorrencia = 'em_conferencia', false) as em_conferencia
    from linhas as l
    where l.prazo <= p_ate and (p_de is null or l.prazo >= p_de)
    union all
    select
      l.consultoria_id, l.nome, l.situacao, 'meta', l.tipo_linha, l.meta_interna, l.id,
      l.instrumento_id, l.empreendimento_id, l.codigo, l.titulo, l.empreendimento_nome,
      l.unidade_nome, l.licenca, l.dias,
      coalesce(l.situacao_ocorrencia = 'em_conferencia', false)
    from linhas as l
    where l.tipo_linha = 'ocorrencia' and l.meta_interna is not null
      and l.meta_interna <= p_ate and (p_de is null or l.meta_interna >= p_de)
  ),
  leitura as materialized (
    select e.consultoria_id, private.consultoria_somente_leitura(e.consultoria_id) as somente_leitura
    from (select distinct ev.consultoria_id from eventos as ev) as e
  )
  select
    e.consultoria_id, e.nome, r.somente_leitura, e.situacao,
    e.tipo_evento, e.tipo_linha, e.data, e.id, e.instrumento_id, e.empreendimento_id, e.codigo,
    e.titulo, e.empreendimento_nome, e.unidade_nome, e.licenca, e.dias, e.em_conferencia,
    count(*) over ()
  from eventos as e
  join leitura as r on r.consultoria_id = e.consultoria_id
  -- Mesma ordem de ordenarItensDaSemana (packages/domain/src/minha-semana.ts).
  order by e.data, e.nome, e.consultoria_id,
    case e.tipo_evento when 'prazo' then 1 when 'exigencia' then 2 when 'acao_legal' then 3
      when 'meta' then 4 else 5 end,
    e.titulo, e.id
  limit p_limite offset p_deslocamento;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Índices que acompanham os filtros empurrados (ocorrência aberta por responsável e prazo, e
-- por meta interna; ação legal aberta por responsável).
-- ---------------------------------------------------------------------------
create index if not exists ocorrencia_aberta_responsavel_prazo_idx
  on public.ocorrencia (consultoria_id, responsavel_id, prazo_oficial_atual)
  where situacao <> 'concluida';
create index if not exists ocorrencia_aberta_prazo_idx
  on public.ocorrencia (consultoria_id, prazo_oficial_atual)
  where situacao <> 'concluida';
create index if not exists ocorrencia_aberta_meta_idx
  on public.ocorrencia (consultoria_id, meta_interna)
  where situacao <> 'concluida' and meta_interna is not null;
create index if not exists acao_legal_aberta_responsavel_idx
  on public.acao_legal (consultoria_id, responsavel_id, prazo)
  where concluida_em is null;
