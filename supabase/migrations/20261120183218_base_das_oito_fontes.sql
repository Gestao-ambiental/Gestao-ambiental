-- Base das oito funções (P0): fontes de prazo e grupos da busca em funções separadas, para que cada
-- pacote seguinte redefina só a sua fonte com create or replace, sem tocar na união.
-- 1. private.linhas_de_prazo vira a união de uma função por fonte (ocorrência, validade, limite de
--    protocolo, alvará, exigência e vencimento). Exigência e vencimento nascem vazias (P3 e P4).
-- 2. listar_prazos e contar_prazos ganham p_cliente_id (cliente do empreendimento).
-- 3. "Sem responsável" vale por tipo: só tipos que têm responsável (ocorrência e exigência).
--    Para os tipos de hoje o resultado é o mesmo (teste 710).
-- 4. buscar_no_grama vira a união de uma função por grupo, mais exigências e vencimentos vazios;
--    5 por grupo, até 30 no total.
-- 5. documento aceita as entidades das funções novas.
-- Segurança igual à de antes: tudo security invoker, a RLS de quem chama decide o que aparece.

-- ---------------------------------------------------------------------------
-- 1. Fontes de prazo
-- ---------------------------------------------------------------------------
-- Contrato de toda fonte (mesmo retorno de private.linhas_de_prazo, 20261117184545):
--   tipo_linha       'ocorrencia' | 'validade' | 'limite_protocolo' | 'exigencia' | 'vencimento'
--                    (o alvará usa 'validade' até o P4 passá-lo a vencimento);
--   dias             prazo − hoje no fuso da consultoria (private.hoje_da_consultoria);
--   empreendimento_id, empreendimento_nome, unidade_id, unidade_nome sempre preenchidos.
-- Decisão para as linhas novas (exigência e vencimento):
--   instrumento_id      licença ligada quando houver, senão null;
--   tipo_id             null (o filtro por tipo de licença não as traz, como o alvará);
--   situacao_ocorrencia null;
--   responsavel_id      preenchido só na exigência (o vencimento não tem responsável, então
--                       "sem responsável" e "Minhas ações" nunca o trazem);
--   meta_interna        null (o calendário só gera "meta" de ocorrência).

create function private.linhas_de_prazo_ocorrencia(cid uuid)
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
    'ocorrencia'::text, o.id, o.instrumento_id, o.prazo_oficial_atual, o.prazo_oficial_atual - h.d,
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
$$;

create function private.linhas_de_prazo_validade(cid uuid)
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
$$;

create function private.linhas_de_prazo_limite_protocolo(cid uuid)
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
    and pr.protocolado_em is null
$$;

-- Alvará vigente da série como linha de validade (camada planejamento). O P4 esvazia esta fonte
-- (where false) quando o alvará passar a ser um vencimento.
create function private.linhas_de_prazo_alvara(cid uuid)
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
    'validade'::text, a.id, null::uuid, a.validade, a.validade - h.d,
    null::text, 'Validade do alvará'::text, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', 'Alvará', a.numero), ''), null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, a.row_version
  from public.alvara as a
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = a.consultoria_id and u.id = a.unidade_id
  join public.empreendimento as e on e.consultoria_id = a.consultoria_id and e.id = a.empreendimento_id
  where a.consultoria_id = cid and a.excluido_em is null
    and not exists (
      select 1 from public.alvara as s
      where s.consultoria_id = a.consultoria_id and s.anterior_id = a.id and s.excluido_em is null
    )
$$;

-- Stub do P3: exigências do órgão (tipo_linha 'exigencia', com responsável).
create function private.linhas_de_prazo_exigencia(cid uuid)
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
  select
    'exigencia'::text, null::uuid, null::uuid, null::date, null::integer,
    null::text, null::text, null::uuid, null::text, null::uuid, null::text,
    null::text, null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, null::integer
  where false and cid is not null
$$;

-- Stub do P4: vencimentos (tipo_linha 'vencimento', sem responsável).
create function private.linhas_de_prazo_vencimento(cid uuid)
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
  select
    'vencimento'::text, null::uuid, null::uuid, null::date, null::integer,
    null::text, null::text, null::uuid, null::text, null::uuid, null::text,
    null::text, null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, null::integer
  where false and cid is not null
$$;

-- A união. Fonte nova entra aqui; fonte existente muda só na própria função.
create or replace function private.linhas_de_prazo(cid uuid)
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
  select * from private.linhas_de_prazo_ocorrencia(cid)
  union all
  select * from private.linhas_de_prazo_validade(cid)
  union all
  select * from private.linhas_de_prazo_limite_protocolo(cid)
  union all
  select * from private.linhas_de_prazo_alvara(cid)
  union all
  select * from private.linhas_de_prazo_exigencia(cid)
  union all
  select * from private.linhas_de_prazo_vencimento(cid)
$$;

comment on function private.linhas_de_prazo(uuid) is
  'União das fontes de prazo (private.linhas_de_prazo_*). Cada fonte se redefine sozinha.';
comment on function private.linhas_de_prazo_alvara(uuid) is
  'Alvará vigente da série como validade. O P4 esvazia quando o alvará virar vencimento.';
comment on function private.linhas_de_prazo_exigencia(uuid) is
  'Exigências do órgão (P3). Vazia até o P3: tipo_linha exigencia, com responsável.';
comment on function private.linhas_de_prazo_vencimento(uuid) is
  'Vencimentos (P4). Vazia até o P4: tipo_linha vencimento, sem responsável.';

revoke all on function private.linhas_de_prazo_ocorrencia(uuid) from public, anon;
revoke all on function private.linhas_de_prazo_validade(uuid) from public, anon;
revoke all on function private.linhas_de_prazo_limite_protocolo(uuid) from public, anon;
revoke all on function private.linhas_de_prazo_alvara(uuid) from public, anon;
revoke all on function private.linhas_de_prazo_exigencia(uuid) from public, anon;
revoke all on function private.linhas_de_prazo_vencimento(uuid) from public, anon;
grant execute on function private.linhas_de_prazo_ocorrencia(uuid) to authenticated;
grant execute on function private.linhas_de_prazo_validade(uuid) to authenticated;
grant execute on function private.linhas_de_prazo_limite_protocolo(uuid) to authenticated;
grant execute on function private.linhas_de_prazo_alvara(uuid) to authenticated;
grant execute on function private.linhas_de_prazo_exigencia(uuid) to authenticated;
grant execute on function private.linhas_de_prazo_vencimento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 e 3. Filtros: cliente e "sem responsável" por tipo
-- ---------------------------------------------------------------------------
-- Tipos de linha que têm responsável. Só eles entram em "sem responsável".
create function private.tipo_linha_tem_responsavel(linha_tipo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select linha_tipo in ('ocorrencia', 'exigencia')
$$;

revoke all on function private.tipo_linha_tem_responsavel(text) from public, anon;
grant execute on function private.tipo_linha_tem_responsavel(text) to authenticated;

create or replace function private.linha_passa_filtros(
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
     and (not coalesce(p_sem_responsavel, false)
          or (private.tipo_linha_tem_responsavel(linha_tipo) and linha_responsavel is null))
     and (p_tipo_id is null or linha_tipo_id = p_tipo_id)
     and (p_empreendimento_id is null or linha_empreendimento = p_empreendimento_id)
$$;

-- Empreendimento do cliente (filtro p_cliente_id). Security invoker: a RLS do empreendimento vale.
create function private.empreendimento_do_cliente(cid uuid, p_empreendimento_id uuid, p_cliente_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_cliente_id is null or exists (
    select 1 from public.empreendimento as e
    where e.consultoria_id = cid and e.id = p_empreendimento_id and e.cliente_id = p_cliente_id
  )
$$;

revoke all on function private.empreendimento_do_cliente(uuid, uuid, uuid) from public, anon;
grant execute on function private.empreendimento_do_cliente(uuid, uuid, uuid) to authenticated;

-- Assinatura muda (p_cliente_id no fim): recriar com os mesmos grants.
drop function public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer);
drop function public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid);

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
  select
    l.tipo_linha, l.id, l.instrumento_id, l.prazo, l.dias, l.codigo, l.titulo, l.empreendimento_id,
    l.empreendimento_nome, l.unidade_nome, l.licenca, l.responsavel_id, l.responsavel_nome,
    l.situacao_ocorrencia, l.row_version, count(*) over ()
  from private.linhas_de_prazo(p_consultoria_id) as l
  where private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id,
          p_empreendimento_id)
    and private.empreendimento_do_cliente(p_consultoria_id, l.empreendimento_id, p_cliente_id)
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

create function public.contar_prazos(
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
  select
    count(*) filter (where l.dias < 0),
    count(*) filter (where l.dias = 0),
    count(*) filter (where l.dias between 1 and 7),
    count(*) filter (where private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null),
    count(*)
  from private.linhas_de_prazo(p_consultoria_id) as l
  where private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id,
          p_empreendimento_id)
    and private.empreendimento_do_cliente(p_consultoria_id, l.empreendimento_id, p_cliente_id)
$$;

revoke all on function public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer, uuid)
  from public, anon;
revoke all on function public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid, uuid) from public, anon;
grant execute on function public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer, uuid)
  to authenticated;
grant execute on function public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid, uuid) to authenticated;

-- Calendário: mesma assinatura; "sem responsável" por tipo.
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
      and (not coalesce(p_sem_responsavel, false)
           or (private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null))
  )
  select
    case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end,
    l.prazo, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome, l.licenca,
    l.responsavel_nome, private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null, l.dias
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
-- 4. Busca global por grupos
-- ---------------------------------------------------------------------------
-- Contrato de todo grupo: private.busca_<grupo>(p_consultoria_id, p_termo) devolve
-- (id, titulo, detalhe, referencia_id, posicao), posicao = ordem dentro do grupo a partir de 1.
-- Security invoker: a RLS de cada tabela decide o que volta. Termo com menos de 2 caracteres não
-- busca (private.termo_de_busca devolve zero linhas). A união corta em 5 por grupo.

create function private.termo_de_busca(p_termo text)
returns table (termo text, padrao text, documento text)
language sql
stable
set search_path = ''
as $$
  select
    private.normalizar_nome(left(p_termo, 100)),
    private.padrao_de_busca(left(p_termo, 100)),
    private.normalizar_cnpj(left(p_termo, 100))
  where length(private.normalizar_nome(left(p_termo, 100))) >= 2
$$;

create function private.busca_empreendimentos(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select
    e.id,
    e.nome,
    cl.nome,
    e.id,
    row_number() over (
      order by starts_with(e.nome_normalizado, b.termo) desc, e.nome_normalizado, e.id
    )
  from private.termo_de_busca(p_termo) as b
  join public.empreendimento as e on e.consultoria_id = p_consultoria_id
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  where e.nome_normalizado like b.padrao
     or cl.nome_normalizado like b.padrao
     or (b.termo ~ '[0-9]' and strpos(coalesce(e.cnpj, ''), b.documento) > 0)
$$;

create function private.busca_licencas(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select
    i.id,
    coalesce(t.sigla, 'Licença') || ' ' || coalesce(nullif(btrim(i.numero), ''), 'sem número'),
    e.nome,
    i.empreendimento_id,
    row_number() over (
      order by starts_with(private.normalizar_nome(i.numero), b.termo) desc, i.criado_em desc, i.id
    )
  from private.termo_de_busca(p_termo) as b
  join public.instrumento as i on i.consultoria_id = p_consultoria_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where private.normalizar_nome(concat_ws(' ', t.sigla, i.numero, t.nome)) like b.padrao
$$;

create function private.busca_condicionantes(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    v.titulo,
    concat_ws(' · ',
      'Condicionante ' || c.codigo,
      coalesce(t.sigla, 'Licença') || ' ' || coalesce(nullif(btrim(i.numero), ''), 'sem número'),
      e.nome),
    i.empreendimento_id,
    row_number() over (
      order by starts_with(private.normalizar_nome(v.titulo), b.termo) desc, i.criado_em desc,
               c.posicao, c.id
    )
  from private.termo_de_busca(p_termo) as b
  join public.condicionante as c on c.consultoria_id = p_consultoria_id and c.revisao = 'aceita'
  join public.condicionante_versao as v
    on v.consultoria_id = c.consultoria_id and v.id = c.versao_vigente_id
  join public.instrumento as i on i.consultoria_id = c.consultoria_id and i.id = c.instrumento_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where private.normalizar_nome(c.codigo || ' ' || v.titulo) like b.padrao
$$;

-- Só a Gestão lê orçamento (RLS da tabela): para a Equipe este grupo volta vazio.
create function private.busca_orcamentos(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select
    o.id,
    o.objeto,
    concat_ws(' · ',
      upper(private.numero_do_orcamento(o.ano, o.sequencia)),
      coalesce(e.nome, o.prospecto_nome)),
    o.id,
    row_number() over (order by o.atualizado_em desc, o.id)
  from private.termo_de_busca(p_termo) as b
  join public.orcamento as o on o.consultoria_id = p_consultoria_id and o.excluido_em is null
  left join public.empreendimento as e
    on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where private.orcamento_atende_busca(o, e.nome_normalizado, p_termo)
$$;

-- Stub do P3 (tipo 'exigencia').
create function private.busca_exigencias(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select null::uuid, null::text, null::text, null::uuid, null::bigint
  where false and p_consultoria_id is not null and p_termo is not null
$$;

-- Stub do P4 (tipo 'vencimento').
create function private.busca_vencimentos(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select null::uuid, null::text, null::text, null::uuid, null::bigint
  where false and p_consultoria_id is not null and p_termo is not null
$$;

comment on function private.busca_exigencias(uuid, text) is
  'Grupo exigencia da busca global (P3). Vazio até o P3.';
comment on function private.busca_vencimentos(uuid, text) is
  'Grupo vencimento da busca global (P4). Vazio até o P4.';

revoke all on function private.termo_de_busca(text) from public, anon;
revoke all on function private.busca_empreendimentos(uuid, text) from public, anon;
revoke all on function private.busca_licencas(uuid, text) from public, anon;
revoke all on function private.busca_condicionantes(uuid, text) from public, anon;
revoke all on function private.busca_orcamentos(uuid, text) from public, anon;
revoke all on function private.busca_exigencias(uuid, text) from public, anon;
revoke all on function private.busca_vencimentos(uuid, text) from public, anon;
grant execute on function private.termo_de_busca(text) to authenticated;
grant execute on function private.busca_empreendimentos(uuid, text) to authenticated;
grant execute on function private.busca_licencas(uuid, text) to authenticated;
grant execute on function private.busca_condicionantes(uuid, text) to authenticated;
grant execute on function private.busca_orcamentos(uuid, text) to authenticated;
grant execute on function private.busca_exigencias(uuid, text) to authenticated;
grant execute on function private.busca_vencimentos(uuid, text) to authenticated;

-- Mesmo retorno e mesma assinatura: create or replace mantém os grants.
create or replace function public.buscar_no_grama(p_consultoria_id uuid, p_termo text)
returns table (tipo text, id uuid, titulo text, detalhe text, referencia_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.tipo, r.id, r.titulo, r.detalhe, r.referencia_id
  from (
    select 1 as grupo, 'empreendimento'::text as tipo, x.*
    from private.busca_empreendimentos(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 2, 'licenca', x.* from private.busca_licencas(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 3, 'condicionante', x.*
    from private.busca_condicionantes(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 4, 'orcamento', x.* from private.busca_orcamentos(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 5, 'exigencia', x.* from private.busca_exigencias(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 6, 'vencimento', x.*
    from private.busca_vencimentos(p_consultoria_id, p_termo) as x where x.posicao <= 5
  ) as r
  order by r.grupo, r.posicao
  limit 30
$$;

comment on function public.buscar_no_grama(uuid, text) is
  'Busca global (Ctrl+K): até 5 por grupo (30 no total), sem acento e sem caixa. Termo com menos de 2 caracteres não busca. A RLS decide o que volta.';

-- ---------------------------------------------------------------------------
-- 5. Documentos das funções novas
-- ---------------------------------------------------------------------------
alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida
  check (entidade in ('instrumento', 'evidencia', 'protocolo', 'membro', 'consultoria', 'mtr', 'cdf',
                      'alvara', 'exigencia', 'exigencia_resposta', 'vencimento', 'importacao'));
