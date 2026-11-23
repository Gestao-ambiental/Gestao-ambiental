-- Desempenho das fontes de prazo (20261122030000): o caminho novo devolve exatamente o que o
-- antigo devolvia. O "antigo" é reproduzido aqui com os corpos de antes da migration, sobre a
-- mesma massa: ocorrências mensais de três pessoas e sem responsável, com metas internas, uma em
-- conferência e outras concluídas, mais validade e limite de protocolo das licenças.
begin;

select plan(14);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('e0000000-0000-4000-8000-0000000795e1', 'c0000000-0000-4000-8000-00000000000a',
   'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1'),
  ('e0000000-0000-4000-8000-0000000795e2', 'c0000000-0000-4000-8000-00000000000a',
   'Cerâmica Vale do Itajaí', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('f0000000-0000-4000-8000-0000000795f1', 'c0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-0000000795e1', 'Matriz'),
  ('f0000000-0000-4000-8000-0000000795f2', 'c0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-0000000795e2', 'Fábrica');

-- Duas LAO com quatro condicionantes mensais cada: Ana, Bruno, Camila e sem responsável.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento(('10000000-0000-4000-8000-00000000079' || n::text)::uuid,
  ('f0000000-0000-4000-8000-0000000795f' || n::text)::uuid)
from generate_series(1, 2) as n;
select public.salvar_identificacao(('10000000-0000-4000-8000-00000000079' || n::text)::uuid, 1,
  ('f0000000-0000-4000-8000-0000000795f' || n::text)::uuid,
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '795' || n::text || '/2025', 'IMA', null, current_setting('testes.hoje')::date - 90, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 100 + 30 * n)
from generate_series(1, 2) as n;
select public.salvar_condicionante(('30000000-0000-4000-8000-0000000795' || n::text || c::text)::uuid,
  ('10000000-0000-4000-8000-00000000079' || n::text)::uuid, null, '1.' || c::text,
  'Relatório ' || n::text || '.' || c::text, '', 'obrigacao')
from generate_series(1, 2) as n cross join generate_series(1, 4) as c;
select public.confirmar_prazo(('30000000-0000-4000-8000-0000000795' || n::text || c::text)::uuid, 'mensal', null,
  null, 'corridos', current_setting('testes.hoje')::date - 90,
  current_setting('testes.hoje')::date - 75 + 3 * c + n, 'Documento')
from generate_series(1, 2) as n cross join generate_series(1, 4) as c;
select public.definir_responsavel(('30000000-0000-4000-8000-0000000795' || n::text || c::text)::uuid,
  case c when 1 then 'd0000000-0000-4000-8000-0000000000a2'::uuid when 2 then 'd0000000-0000-4000-8000-0000000000a3'::uuid
         when 3 then 'd0000000-0000-4000-8000-0000000000a4'::uuid end)
from generate_series(1, 2) as n cross join generate_series(1, 4) as c;
select public.ativar_plano(('10000000-0000-4000-8000-00000000079' || n::text)::uuid,
  (select row_version from public.instrumento where id = ('10000000-0000-4000-8000-00000000079' || n::text)::uuid),
  gen_random_uuid())
from generate_series(1, 2) as n;

-- Metas internas (algumas fora do período do próprio prazo), uma em conferência e concluídas.
reset role;
select set_config('request.jwt.claims', '', true);
update public.ocorrencia set meta_interna = prazo_oficial_atual - 9
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and ciclo % 3 = 0;
update public.ocorrencia set situacao = 'em_conferencia'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and ciclo = 4;
update public.ocorrencia set situacao = 'concluida', concluida_em = now(),
  concluida_por = 'd0000000-0000-4000-8000-0000000000a1'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and ciclo in (1, 5);

-- ---------------------------------------------------------------------------
-- O caminho antigo, com os corpos de antes da 20261122030000
-- ---------------------------------------------------------------------------
create function pg_temp.ocorrencia_antiga(cid uuid)
returns setof record
language sql
stable
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

-- União antiga: a mesma de private.linhas_de_prazo, com a ocorrência de antes.
create function pg_temp.linhas_antigas(cid uuid)
returns table (
  tipo_linha text, id uuid, instrumento_id uuid, prazo date, dias integer, codigo text, titulo text,
  empreendimento_id uuid, empreendimento_nome text, unidade_id uuid, unidade_nome text, licenca text,
  tipo_id uuid, responsavel_id uuid, responsavel_nome text, situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date, row_version integer
)
language sql
stable
as $$
  select * from pg_temp.ocorrencia_antiga(cid) as x (
    tipo_linha text, id uuid, instrumento_id uuid, prazo date, dias integer, codigo text, titulo text,
    empreendimento_id uuid, empreendimento_nome text, unidade_id uuid, unidade_nome text, licenca text,
    tipo_id uuid, responsavel_id uuid, responsavel_nome text, situacao_ocorrencia public.situacao_ocorrencia,
    meta_interna date, row_version integer)
  union all select * from private.linhas_de_prazo_validade(cid)
  union all select * from private.linhas_de_prazo_limite_protocolo(cid)
  union all select * from private.linhas_de_prazo_alvara(cid)
  union all select * from private.linhas_de_prazo_exigencia(cid)
  union all select * from private.linhas_de_prazo_vencimento(cid)
  union all select * from private.linhas_de_prazo_acao_legal(cid)
$$;

create function pg_temp.listar_prazos_antigo(
  p_consultoria_id uuid, p_aba text, p_responsavel_id uuid, p_faixa text, p_ordem text
)
returns table (id uuid, tipo_linha text, dias integer, total bigint)
language sql
stable
as $$
  select l.id, l.tipo_linha, l.dias, count(*) over ()
  from pg_temp.linhas_antigas(p_consultoria_id) as l
  where private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, false, null, null)
    and private.linha_na_visao(p_consultoria_id, l.tipo_linha, l.id, l.dias)
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
    case when p_ordem = 'responsavel' then l.responsavel_nome end asc nulls first,
    case when p_ordem = '-prazo' then l.prazo end desc,
    l.prazo asc, l.titulo asc, l.id asc
  limit 100
$$;

create function pg_temp.contar_prazos_antigo(p_consultoria_id uuid, p_aba text, p_responsavel_id uuid)
returns table (atrasadas bigint, hoje bigint, proximos_7 bigint, sem_responsavel bigint, total bigint)
language sql
stable
as $$
  select
    count(*) filter (where l.dias < 0),
    count(*) filter (where l.dias = 0),
    count(*) filter (where l.dias between 1 and 7),
    count(*) filter (where private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null),
    count(*)
  from pg_temp.linhas_antigas(p_consultoria_id) as l
  where private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, false, null, null)
    and private.linha_na_visao(p_consultoria_id, l.tipo_linha, l.id, l.dias)
$$;

create function pg_temp.calendario_antigo(p_consultoria_id uuid, p_de date, p_ate date, p_responsavel_id uuid)
returns table (tipo_evento text, data date, id uuid, sem_responsavel boolean, dias integer)
language sql
stable
as $$
  with linhas as (
    select * from pg_temp.linhas_antigas(p_consultoria_id) as l
    where (p_responsavel_id is null or l.responsavel_id = p_responsavel_id)
  )
  select case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end, l.prazo, l.id,
         private.tipo_linha_tem_responsavel(l.tipo_linha) and l.responsavel_id is null, l.dias
  from linhas as l where l.prazo between p_de and p_ate
  union all
  select 'meta', l.meta_interna, l.id, l.responsavel_id is null, l.dias
  from linhas as l where l.tipo_linha = 'ocorrencia' and l.meta_interna between p_de and p_ate
  order by 2, 1, 3
$$;

create function pg_temp.minha_semana_antiga(p_de date, p_ate date)
returns table (tipo_evento text, data date, id uuid, dias integer)
language sql
stable
as $$
  with meus as (
    select m.consultoria_id, m.id as membro_id from public.membro as m
    where m.usuario_id = (select auth.uid()) and m.situacao = 'ativo'
  ),
  linhas as (
    select l.* from meus as me
    cross join lateral pg_temp.linhas_antigas(me.consultoria_id) as l
    where l.responsavel_id = me.membro_id
  )
  select case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end, l.prazo, l.id, l.dias
  from linhas as l where l.prazo <= p_ate and (p_de is null or l.prazo >= p_de)
  union all
  select 'meta', l.meta_interna, l.id, l.dias
  from linhas as l
  where l.tipo_linha = 'ocorrencia' and l.meta_interna is not null
    and l.meta_interna <= p_ate and (p_de is null or l.meta_interna >= p_de)
  order by 2, 1, 3
$$;

-- Grade de filtros comparada: períodos (com e sem início) e responsáveis.
create temporary table grade on commit drop as
select h.de, h.ate, r.resp
from (values
  (null::date, null::date),
  (null, current_setting('testes.hoje')::date + 6),
  (current_setting('testes.hoje')::date - 40, current_setting('testes.hoje')::date + 20),
  (current_setting('testes.hoje')::date, current_setting('testes.hoje')::date),
  (current_setting('testes.hoje')::date + 30, current_setting('testes.hoje')::date + 90)
) as h (de, ate)
cross join (values
  (null::uuid), ('d0000000-0000-4000-8000-0000000000a2'), ('d0000000-0000-4000-8000-0000000000a3'),
  ('d0000000-0000-4000-8000-0000000000a6')
) as r (resp);
grant select on grade to authenticated;

select testes.autenticar_como('eduardo@filtroville.test');

-- ---------------------------------------------------------------------------
-- Fontes
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
   where tipo_linha = 'ocorrencia') >= 40
  and exists (select 1 from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
              where meta_interna is not null)
  and exists (select 1 from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
              where situacao_ocorrencia = 'em_conferencia'),
  'a massa tem ocorrências de várias pessoas, metas e uma em conferência'
);

select is(
  (select count(*) from (
    (select * from private.linhas_de_prazo_ocorrencia('c0000000-0000-4000-8000-00000000000a')
     except all
     select * from pg_temp.ocorrencia_antiga('c0000000-0000-4000-8000-00000000000a') as x (
       tipo_linha text, id uuid, instrumento_id uuid, prazo date, dias integer, codigo text, titulo text,
       empreendimento_id uuid, empreendimento_nome text, unidade_id uuid, unidade_nome text, licenca text,
       tipo_id uuid, responsavel_id uuid, responsavel_nome text, situacao_ocorrencia public.situacao_ocorrencia,
       meta_interna date, row_version integer))
    union all
    (select * from pg_temp.ocorrencia_antiga('c0000000-0000-4000-8000-00000000000a') as x (
       tipo_linha text, id uuid, instrumento_id uuid, prazo date, dias integer, codigo text, titulo text,
       empreendimento_id uuid, empreendimento_nome text, unidade_id uuid, unidade_nome text, licenca text,
       tipo_id uuid, responsavel_id uuid, responsavel_nome text, situacao_ocorrencia public.situacao_ocorrencia,
       meta_interna date, row_version integer)
     except all
     select * from private.linhas_de_prazo_ocorrencia('c0000000-0000-4000-8000-00000000000a'))
  ) as d),
  0::bigint,
  'ocorrência: a fonte nova devolve as mesmas linhas da antiga'
);

select is(
  (select count(*) from (
    (select * from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
     except all select * from pg_temp.linhas_antigas('c0000000-0000-4000-8000-00000000000a'))
    union all
    (select * from pg_temp.linhas_antigas('c0000000-0000-4000-8000-00000000000a')
     except all select * from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a'))
  ) as d),
  0::bigint,
  'a união de sempre devolve as mesmas linhas da antiga'
);

-- Filtrada = antiga com o mesmo filtro exato, em toda a grade.
select is(
  (select count(*) from grade as g cross join lateral (
    (select l.* from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a', g.de, g.ate, g.resp) as l
     where (g.resp is null or l.responsavel_id = g.resp)
       and ((l.prazo between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity'))
            or (l.meta_interna between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity')))
     except all
     select l.* from pg_temp.linhas_antigas('c0000000-0000-4000-8000-00000000000a') as l
     where (g.resp is null or l.responsavel_id = g.resp)
       and ((l.prazo between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity'))
            or (l.meta_interna between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity'))))
    union all
    (select l.* from pg_temp.linhas_antigas('c0000000-0000-4000-8000-00000000000a') as l
     where (g.resp is null or l.responsavel_id = g.resp)
       and ((l.prazo between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity'))
            or (l.meta_interna between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity')))
     except all
     select l.* from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a', g.de, g.ate, g.resp) as l
     where (g.resp is null or l.responsavel_id = g.resp)
       and ((l.prazo between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity'))
            or (l.meta_interna between coalesce(g.de, '-infinity') and coalesce(g.ate, 'infinity'))))
  ) as d),
  0::bigint,
  'união filtrada: mesmas linhas da antiga em toda a grade de período e responsável'
);

select is(
  (select array_agg(f order by f) from (
     select (regexp_matches(pg_catalog.pg_get_functiondef('private.linhas_de_prazo(uuid)'::regprocedure),
                            'private\.(linhas_de_prazo_[a-z_]+)\(cid[,)]', 'g'))[1] as f
   ) as x),
  (select array_agg(f order by f) from (
     select distinct (regexp_matches(
       pg_catalog.pg_get_functiondef('private.linhas_de_prazo_filtradas(uuid, date, date, uuid)'::regprocedure),
       'private\.(linhas_de_prazo_[a-z_]+)\(cid[,)]', 'g'))[1] as f
   ) as x),
  'a união filtrada chama as mesmas fontes de private.linhas_de_prazo'
);

-- ---------------------------------------------------------------------------
-- Chamadores: mesmo resultado do caminho antigo
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from (values (null::text), ('atrasadas'), ('hoje'), ('proximos_7'), ('sem_responsavel')) as f (faixa)
   cross join (values ('todos'), ('minhas')) as a (aba)
   cross join (values ('prazo'), ('-prazo'), ('responsavel')) as o (ordem)
   cross join lateral (
     select coalesce(
       (select array_agg(row(x.id, x.tipo_linha, x.dias, x.total)::text)
        from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', a.aba, null, false, null, null,
                                   f.faixa, o.ordem, 100, 0) as x), '{}')
       is distinct from coalesce(
       (select array_agg(row(y.id, y.tipo_linha, y.dias, y.total)::text)
        from pg_temp.listar_prazos_antigo('c0000000-0000-4000-8000-00000000000a', a.aba, null, f.faixa, o.ordem) as y),
       '{}') as diferente
   ) as c
   where c.diferente),
  0::bigint,
  'listar_prazos: mesma lista e mesma ordem em cada faixa, aba e ordem (Gestão)'
);

select is(
  (select count(*) from (values (null::uuid), ('d0000000-0000-4000-8000-0000000000a3'::uuid)) as r (resp)
   cross join (values ('todos'), ('minhas')) as a (aba)
   where (select row(x.*)::text from public.contar_prazos('c0000000-0000-4000-8000-00000000000a', a.aba, r.resp) as x)
         is distinct from
         (select row(y.*)::text from pg_temp.contar_prazos_antigo('c0000000-0000-4000-8000-00000000000a', a.aba, r.resp) as y)),
  0::bigint,
  'contar_prazos: mesmos contadores por aba e responsável'
);

select is(
  (select count(*) from grade as g
   cross join lateral (
     select coalesce(
       (select array_agg(row(x.tipo_evento, x.data, x.id, x.sem_responsavel, x.dias)::text order by row(x.tipo_evento, x.data, x.id, x.sem_responsavel, x.dias)::text)
        from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
          coalesce(g.de, current_setting('testes.hoje')::date - 30), coalesce(g.ate, current_setting('testes.hoje')::date + 30),
          g.resp) as x), '{}')
       is distinct from coalesce(
       (select array_agg(row(y.tipo_evento, y.data, y.id, y.sem_responsavel, y.dias)::text order by row(y.tipo_evento, y.data, y.id, y.sem_responsavel, y.dias)::text)
        from pg_temp.calendario_antigo('c0000000-0000-4000-8000-00000000000a',
          coalesce(g.de, current_setting('testes.hoje')::date - 30), coalesce(g.ate, current_setting('testes.hoje')::date + 30),
          g.resp) as y), '{}') as diferente
   ) as c
   where c.diferente),
  0::bigint,
  'listar_calendario: mesmos eventos (prazos e metas) em toda a grade'
);

-- Pessoas da Equipe: aba "minhas", contadores e Minha semana.
select testes.autenticar_como('bruno@filtroville.test');

select is(
  (select count(*) from (values (null::text), ('atrasadas'), ('proximos_7')) as f (faixa)
   where (select coalesce(array_agg(x.id), '{}') from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
            'minhas', null, false, null, null, f.faixa, 'prazo', 100, 0) as x)
         is distinct from
         (select coalesce(array_agg(y.id), '{}') from pg_temp.listar_prazos_antigo('c0000000-0000-4000-8000-00000000000a',
            'minhas', null, f.faixa, 'prazo') as y)),
  0::bigint,
  'listar_prazos "minhas" do Bruno: igual ao antigo'
);

select ok(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', 'minhas')) > 0,
  'o Bruno tem prazos na aba "minhas" (a comparação não é vazia)'
);

select is(
  (select row(x.*)::text from public.contar_prazos('c0000000-0000-4000-8000-00000000000a', 'minhas') as x),
  (select row(y.*)::text from pg_temp.contar_prazos_antigo('c0000000-0000-4000-8000-00000000000a', 'minhas', null) as y),
  'contar_prazos "minhas" do Bruno: igual ao antigo'
);

select is(
  (select count(*) from (values
     (null::date, current_setting('testes.hoje')::date + 6),
     (current_setting('testes.hoje')::date - 40, current_setting('testes.hoje')::date + 20),
     (current_setting('testes.hoje')::date + 30, current_setting('testes.hoje')::date + 90)) as g (de, ate)
   where (select coalesce(array_agg(row(x.tipo_evento, x.data, x.id, x.dias)::text order by row(x.tipo_evento, x.data, x.id, x.dias)::text), '{}')
          from public.minha_semana(g.de, g.ate, 100, 0) as x)
         is distinct from
         (select coalesce(array_agg(row(y.tipo_evento, y.data, y.id, y.dias)::text order by row(y.tipo_evento, y.data, y.id, y.dias)::text), '{}')
          from pg_temp.minha_semana_antiga(g.de, g.ate) as y)),
  0::bigint,
  'minha_semana do Bruno: mesmos itens'
);

select ok(
  (select count(*) from public.minha_semana(current_setting('testes.hoje')::date - 40,
     current_setting('testes.hoje')::date + 20, 100, 0) where tipo_evento = 'meta') > 0,
  'a Minha semana do Bruno inclui metas (a comparação cobre o caso)'
);

-- Outra consultoria continua sem ver nada pelo caminho novo.
select testes.autenticar_como('helena@verdesul.test');
select is(
  (select count(*) from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a', null, null, null)),
  0::bigint,
  'Helena (outra consultoria) não vê nada pela união filtrada'
);

select * from finish();

rollback;
