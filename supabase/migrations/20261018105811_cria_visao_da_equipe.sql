-- Visão da equipe e calendário (épico 5; EQ-01 a EQ-04).
-- Leitura por funções security invoker: a RLS de quem chama decide o que aparece.
-- Situação e atraso são calculados a partir da data de hoje no fuso da consultoria, nunca
-- gravados (o rótulo é feito no packages/domain a partir de `dias`). Além das ocorrências abertas,
-- a lista traz a validade de cada licença ativa e, na LAO, o limite de protocolo (validade − 120
-- dias, a mesma regra de datasRenovacaoLao), rotulados separadamente (EQ-03).

-- Hoje, em data civil, no fuso da consultoria (ADR-0009). Nulo se quem chama não é membro.
create function private.hoje_da_consultoria(cid uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone c.fuso)::date from public.consultoria as c where c.id = cid
$$;

-- Todas as linhas de prazo da consultoria, com `dias` = prazo − hoje.
create function private.linhas_de_prazo(cid uuid)
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
  with hoje as (select private.hoje_da_consultoria(cid) as d)
  select
    'ocorrencia', o.id, o.instrumento_id, o.prazo_oficial_atual, o.prazo_oficial_atual - h.d,
    c.codigo, v.titulo, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    o.responsavel_id, m.nome, o.situacao, o.meta_interna, o.row_version
  from public.ocorrencia as o
  cross join hoje as h
  join public.condicionante_versao as v on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = o.consultoria_id and m.id = o.responsavel_id
  where o.consultoria_id = cid and o.situacao <> 'concluida'

  union all

  select
    'validade', i.id, i.id, i.validade, i.validade - h.d,
    null, 'Validade', e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null, null, null, null, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where i.consultoria_id = cid and i.situacao = 'ativo'

  union all

  select
    'limite_protocolo', i.id, i.id, i.validade - 120, i.validade - 120 - h.d,
    null, 'Limite de protocolo', e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null, null, null, null, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where i.consultoria_id = cid and i.situacao = 'ativo' and upper(btrim(t.sigla)) = 'LAO'
$$;

-- Filtros comuns da tabela e dos contadores (EQ-02). "Minhas ações" = sou o responsável.
create function private.linha_passa_filtros(
  linha_tipo text,
  linha_responsavel uuid,
  linha_tipo_id uuid,
  linha_empreendimento uuid,
  eu uuid,
  p_aba text,
  p_responsavel_id uuid,
  p_sem_responsavel boolean,
  p_tipo_id uuid,
  p_empreendimento_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (coalesce(p_aba, 'todos') <> 'minhas' or (linha_responsavel is not null and linha_responsavel = eu))
     and (p_responsavel_id is null or linha_responsavel = p_responsavel_id)
     and (not coalesce(p_sem_responsavel, false) or (linha_tipo = 'ocorrencia' and linha_responsavel is null))
     and (p_tipo_id is null or linha_tipo_id = p_tipo_id)
     and (p_empreendimento_id is null or linha_empreendimento = p_empreendimento_id)
$$;

revoke all on function private.hoje_da_consultoria(uuid) from public, anon;
revoke all on function private.linhas_de_prazo(uuid) from public, anon;
revoke all on function private.linha_passa_filtros(text, uuid, uuid, uuid, uuid, text, uuid, boolean, uuid, uuid)
  from public, anon;
grant execute on function private.hoje_da_consultoria(uuid) to authenticated;
grant execute on function private.linhas_de_prazo(uuid) to authenticated;
grant execute on function private.linha_passa_filtros(text, uuid, uuid, uuid, uuid, text, uuid, boolean, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: tabela da equipe (EQ-01, EQ-02), paginada e ordenável no servidor.
-- p_faixa: atrasadas | hoje | proximos_7 | sem_responsavel (os contadores, só ocorrências).
-- p_ordem: prazo | demanda | empreendimento | licenca | responsavel, com "-" para decrescente.
-- ---------------------------------------------------------------------------
create function public.listar_prazos(
  p_consultoria_id uuid,
  p_aba text default 'todos',
  p_responsavel_id uuid default null,
  p_sem_responsavel boolean default false,
  p_tipo_id uuid default null,
  p_empreendimento_id uuid default null,
  p_faixa text default null,
  p_ordem text default 'prazo',
  p_limite integer default 25,
  p_deslocamento integer default 0
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
  select
    l.tipo_linha, l.id, l.instrumento_id, l.prazo, l.dias, l.codigo, l.titulo, l.empreendimento_id,
    l.empreendimento_nome, l.unidade_nome, l.licenca, l.responsavel_id, l.responsavel_nome,
    l.situacao_ocorrencia, l.row_version, count(*) over ()
  from private.linhas_de_prazo(p_consultoria_id) as l
  where private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id,
          p_empreendimento_id)
    and (
      p_faixa is null
      or (l.tipo_linha = 'ocorrencia' and case p_faixa
            when 'atrasadas' then l.dias < 0
            when 'hoje' then l.dias = 0
            when 'proximos_7' then l.dias between 1 and 7
            when 'sem_responsavel' then l.responsavel_id is null
            else true
          end)
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

-- RPC: contadores do topo (só ocorrências), com os mesmos filtros da tabela, menos a faixa.
create function public.contar_prazos(
  p_consultoria_id uuid,
  p_aba text default 'todos',
  p_responsavel_id uuid default null,
  p_sem_responsavel boolean default false,
  p_tipo_id uuid default null,
  p_empreendimento_id uuid default null
)
returns table (atrasadas bigint, hoje bigint, proximos_7 bigint, sem_responsavel bigint, total bigint)
language sql
stable
set search_path = ''
as $$
  select
    count(*) filter (where l.dias < 0),
    count(*) filter (where l.dias = 0),
    count(*) filter (where l.dias between 1 and 7),
    count(*) filter (where l.responsavel_id is null),
    count(*)
  from private.linhas_de_prazo(p_consultoria_id) as l
  where l.tipo_linha = 'ocorrencia'
    and private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id,
          p_empreendimento_id)
$$;

-- RPC: eventos do calendário (EQ-04) num intervalo de até 62 dias: prazo oficial, meta interna,
-- validade e limite de protocolo, distinguidos por `tipo_evento`.
create function public.listar_calendario(
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
  dias integer
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
    select * from private.linhas_de_prazo(p_consultoria_id) as l
    where (p_responsavel_id is null or l.responsavel_id = p_responsavel_id)
      and (p_unidade_id is null or l.unidade_id = p_unidade_id)
      and (not coalesce(p_sem_responsavel, false) or (l.tipo_linha = 'ocorrencia' and l.responsavel_id is null))
  )
  select
    case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end,
    l.prazo, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome, l.licenca,
    l.responsavel_nome, l.tipo_linha = 'ocorrencia' and l.responsavel_id is null, l.dias
  from linhas as l
  where l.prazo between p_de and p_ate
  union all
  select
    'meta', l.meta_interna, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome,
    l.licenca, l.responsavel_nome, l.responsavel_id is null, l.dias
  from linhas as l
  where l.tipo_linha = 'ocorrencia' and l.meta_interna between p_de and p_ate
  order by 2, 1, 5, 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: atribuir responsável a uma ocorrência ("Atribuir", EQ-03). Só a Gestão; controle otimista;
-- concluída não muda de responsável. Auditada pela trigger da ocorrência.
-- ---------------------------------------------------------------------------
create function public.atribuir_ocorrencia(p_ocorrencia_id uuid, p_membro_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  select * into alvo from public.ocorrencia as o where o.id = p_ocorrencia_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  perform private.conferir_responsavel(alvo.consultoria_id, p_membro_id);

  update public.ocorrencia as o
  set responsavel_id = p_membro_id, row_version = o.row_version + 1
  where o.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

revoke all on function public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer)
  from public, anon;
revoke all on function public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid) from public, anon;
revoke all on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) from public, anon;
revoke all on function public.atribuir_ocorrencia(uuid, uuid, integer) from public, anon;

grant execute on function public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer)
  to authenticated;
grant execute on function public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid) to authenticated;
grant execute on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) to authenticated;
grant execute on function public.atribuir_ocorrencia(uuid, uuid, integer) to authenticated;
