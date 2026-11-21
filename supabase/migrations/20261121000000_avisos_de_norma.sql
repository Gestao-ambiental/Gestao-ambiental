-- Avisos de mudança de norma (pacote L5, ADR-0050, LEG-05 e LEG-06).
--
-- 1. public.aviso_norma: uma linha por mudança publicada × empreendimento (× licença, quando o motivo
--    é a licença). Gerada só pelo banco, na publicação. Sem barreira comercial: aviso de lei não pode
--    parar por inadimplência (mesmo motivo de preferencia_aviso no ADR-0041).
-- 2. private.empreendimentos_afetados: quem a mudança alcança, pelos critérios da norma. É a mesma
--    regra de packages/domain/src/aplicabilidade.ts.
-- 3. private.gerar_avisos_da_mudanca e central_publicar_mudanca_de_norma (mesma assinatura e corpo do
--    L4) gerando os avisos na mesma transação da publicação.
-- 4. Leitura para a consultoria (aba Normas, selo na licença) e marcar como vista.
-- 5. private.busca_normas real (grupo 'norma' do Ctrl+K).
-- Só aditiva: nenhuma tabela existente muda.

-- ---------------------------------------------------------------------------
-- 1. aviso_norma
-- ---------------------------------------------------------------------------
create table public.aviso_norma (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  mudanca_id uuid not null references private.norma_mudanca (id) on delete restrict,
  empreendimento_id uuid not null,
  instrumento_id uuid,
  motivo jsonb not null,
  criado_em timestamptz not null default now(),
  visto_em timestamptz,
  visto_por uuid,
  constraint aviso_norma_consultoria_id_id_key unique (consultoria_id, id),
  -- Gerar de novo os avisos da mesma mudança não duplica (licença nula conta como valor).
  constraint aviso_norma_unico unique nulls not distinct (consultoria_id, mudanca_id, empreendimento_id, instrumento_id),
  constraint aviso_norma_motivo_formato check (
    jsonb_typeof(motivo) = 'object'
    and jsonb_typeof(motivo -> 'criterio') = 'string'
    and jsonb_typeof(motivo -> 'valor') = 'string'
  ),
  constraint aviso_norma_visto_coerente check ((visto_em is null) = (visto_por is null)),
  constraint aviso_norma_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint aviso_norma_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint aviso_norma_visto_por_fk foreign key (consultoria_id, visto_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.aviso_norma is
  'Mudança de norma publicada que alcança um empreendimento (e a licença, quando o motivo é ela). Gerada só na publicação (ADR-0050).';
comment on column public.aviso_norma.motivo is
  'Critério da norma que alcançou: {criterio, valor}, como em private.norma_criterio.';
comment on column public.aviso_norma.visto_em is
  'Instante em que um membro marcou a mudança como vista. Vale para a consultoria inteira.';

create index aviso_norma_mudanca_idx on public.aviso_norma (consultoria_id, mudanca_id);
create index aviso_norma_nao_visto_idx on public.aviso_norma (consultoria_id, empreendimento_id, instrumento_id)
  where visto_em is null;

alter table public.aviso_norma enable row level security;
alter table public.aviso_norma force row level security;

revoke all on table public.aviso_norma from anon, authenticated;
grant select on table public.aviso_norma to authenticated;

create policy aviso_norma_select_membro_ativo on public.aviso_norma
  for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create trigger _suporte_somente_leitura
  before insert or update or delete on public.aviso_norma
  for each row execute function private.bloquear_escrita_do_suporte();

-- ---------------------------------------------------------------------------
-- 2. Quem a mudança alcança
-- ---------------------------------------------------------------------------
-- (a) Norma municipal: só empreendimentos com unidade no município da norma.
-- (b) Com critério de atividade ou prefixo_atividade: atividades das licenças ativas (com licença) e
--     as gravadas no empreendimento (sem licença).
-- (c) Senão, com critério de município: empreendimentos com unidade naquele município.
-- (d) Senão, com critério de competência: 'estadual' casa licenças ativas do IMA (ou FATMA);
--     'municipal' casa licenças ativas com órgão preenchido que não é o IMA.
-- (e) Critérios tipo_licenca, se houver, restringem as licenças pela sigla do tipo.
-- Sem critério de atividade, município ou competência: ninguém. Uma linha por empreendimento e
-- licença; com mais de um motivo, vale o primeiro (atividade, prefixo, município, competência).
create function private.empreendimentos_afetados(p_mudanca_id uuid)
returns table (consultoria_id uuid, empreendimento_id uuid, instrumento_id uuid, motivo jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with alvo as (
    select n.id as norma_id, n.esfera, n.municipio_ibge
    from private.norma_mudanca as m
    join private.norma as n on n.id = m.norma_id
    where m.id = p_mudanca_id
  ),
  criterio as (
    select c.tipo, c.valor
    from private.norma_criterio as c
    join alvo as a on a.norma_id = c.norma_id
  ),
  tem as (
    select
      exists (select 1 from criterio as c where c.tipo in ('atividade', 'prefixo_atividade')) as atividade,
      exists (select 1 from criterio as c where c.tipo = 'municipio') as municipio,
      exists (select 1 from criterio as c where c.tipo = 'tipo_licenca') as tipo_licenca
  ),
  -- (a)
  emp as (
    select e.consultoria_id as cid, e.id as eid
    from public.empreendimento as e
    cross join alvo as a
    where a.esfera <> 'municipal'
       or exists (
         select 1 from public.unidade as u
         where u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id
           and u.municipio_ibge = a.municipio_ibge)
  ),
  -- (e)
  licenca as (
    select i.consultoria_id as cid, i.empreendimento_id as eid, i.id as iid, i.orgao
    from public.instrumento as i
    join emp as e on e.cid = i.consultoria_id and e.eid = i.empreendimento_id
    left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
    cross join tem
    where i.situacao = 'ativo'
      and (not tem.tipo_licenca or exists (
        select 1 from criterio as c
        where c.tipo = 'tipo_licenca' and lower(c.valor) = lower(t.sigla)))
  ),
  atividade as (
    select l.cid, l.eid, l.iid, a.codigo
    from licenca as l
    join public.atividade_licenciada as a on a.consultoria_id = l.cid and a.instrumento_id = l.iid
    union all
    select e.cid, e.eid, null::uuid, a.codigo
    from emp as e
    join public.atividade_do_empreendimento as a on a.consultoria_id = e.cid and a.empreendimento_id = e.eid
  ),
  candidato as (
    -- (b)
    select a.cid, a.eid, a.iid, c.tipo, c.valor
    from atividade as a
    join criterio as c
      on (c.tipo = 'atividade' and a.codigo = c.valor)
      or (c.tipo = 'prefixo_atividade' and starts_with(a.codigo, c.valor || '.'))
    where (select tem.atividade from tem)
    union all
    -- (c)
    select e.cid, e.eid, null::uuid, c.tipo, c.valor
    from emp as e
    join criterio as c on c.tipo = 'municipio'
    where not (select tem.atividade from tem)
      and exists (
        select 1 from public.unidade as u
        where u.consultoria_id = e.cid and u.empreendimento_id = e.eid and u.municipio_ibge = c.valor)
    union all
    -- (d)
    select l.cid, l.eid, l.iid, c.tipo, c.valor
    from licenca as l
    join criterio as c on c.tipo = 'competencia'
    where not (select tem.atividade from tem)
      and not (select tem.municipio from tem)
      and (
        (c.valor = 'estadual' and coalesce(l.orgao, '') ~* '\m(IMA|FATMA)\M')
        or (c.valor = 'municipal' and btrim(coalesce(l.orgao, '')) <> ''
            and l.orgao !~* '\m(IMA|FATMA)\M')
      )
  )
  select distinct on (x.cid, x.eid, x.iid)
    x.cid, x.eid, x.iid, jsonb_build_object('criterio', x.tipo, 'valor', x.valor)
  from candidato as x
  order by x.cid, x.eid, x.iid,
           case x.tipo when 'atividade' then 1 when 'prefixo_atividade' then 2 when 'municipio' then 3 else 4 end,
           x.valor
$$;

comment on function private.empreendimentos_afetados(uuid) is
  'Empreendimentos (e licenças) que a mudança de norma alcança, com o motivo. Mesma regra de packages/domain/src/aplicabilidade.ts.';

revoke all on function private.empreendimentos_afetados(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Gerar avisos na publicação
-- ---------------------------------------------------------------------------
-- Idempotente: repetir não duplica. Mudança que não está publicada não gera nada.
create function private.gerar_avisos_da_mudanca(p_mudanca_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inseridos integer;
begin
  if not exists (
    select 1 from private.norma_mudanca as m where m.id = p_mudanca_id and m.situacao = 'publicada'
  ) then
    return 0;
  end if;

  insert into public.aviso_norma (consultoria_id, mudanca_id, empreendimento_id, instrumento_id, motivo)
  select a.consultoria_id, p_mudanca_id, a.empreendimento_id, a.instrumento_id, a.motivo
  from private.empreendimentos_afetados(p_mudanca_id) as a
  on conflict on constraint aviso_norma_unico do nothing;
  get diagnostics inseridos = row_count;
  return inseridos;
end;
$$;

comment on function private.gerar_avisos_da_mudanca(uuid) is
  'Cria os aviso_norma de uma mudança publicada (on conflict do nothing). Devolve quantos criou.';

revoke all on function private.gerar_avisos_da_mudanca(uuid) from public, anon, authenticated;

-- Mesmo corpo do L4; ao final, gera os avisos (já com os critérios confirmados nesta publicação).
create or replace function public.central_publicar_mudanca_de_norma(p_id uuid, p_resumo jsonb, p_criterios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo private.norma_mudanca;
  criterio jsonb;
begin
  perform private.exigir_operador();

  select * into alvo from private.norma_mudanca as m where m.id = p_id for update;
  if not found then
    raise exception 'mudanca_inexistente' using errcode = 'P0001';
  end if;
  if alvo.situacao in ('publicada', 'descartada') then
    raise exception 'mudanca_ja_revisada' using errcode = 'P0001';
  end if;

  if p_resumo is null or jsonb_typeof(p_resumo) <> 'object'
     or jsonb_typeof(coalesce(p_resumo -> 'resumo', '""'::jsonb)) <> 'string' then
    raise exception 'resumo_invalido' using errcode = '22023';
  end if;
  if btrim(coalesce(p_resumo ->> 'resumo', '')) = '' then
    raise exception 'resumo_obrigatorio' using errcode = '22023';
  end if;
  if not private.resumo_de_norma_valido(p_resumo) then
    raise exception 'resumo_invalido' using errcode = '22023';
  end if;
  if not private.criterios_de_norma_validos(coalesce(p_criterios, '[]'::jsonb)) then
    raise exception 'criterio_invalido' using errcode = '22023';
  end if;

  update private.norma_mudanca as m
  set resumo = p_resumo || jsonb_build_object('resumo', btrim(p_resumo ->> 'resumo')),
      situacao = 'publicada',
      revisada_por = auth.uid(),
      publicada_em = now()
  where m.id = alvo.id;

  for criterio in select c.item from jsonb_array_elements(coalesce(p_criterios, '[]'::jsonb)) as c (item)
  loop
    begin
      insert into private.norma_criterio (norma_id, tipo, valor, origem)
      values (alvo.norma_id, criterio ->> 'tipo', btrim(criterio ->> 'valor'), 'ia_confirmada')
      on conflict (norma_id, tipo, valor) do nothing;
    exception when check_violation then
      raise exception 'criterio_invalido' using errcode = '22023';
    end;
  end loop;

  perform private.gerar_avisos_da_mudanca(alvo.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Leitura para a consultoria
-- ---------------------------------------------------------------------------
-- Aba Normas: mudanças publicadas que alcançam a consultoria, mais recentes primeiro.
create function public.listar_mudancas_de_norma_da_consultoria(
  p_consultoria_id uuid,
  p_so_nao_vistas boolean default false,
  p_limite integer default 25,
  p_deslocamento integer default 0
)
returns table (
  mudanca_id uuid,
  norma_id uuid,
  norma_titulo text,
  tipo_mudanca text,
  publicada_em timestamptz,
  resumo text,
  empreendimentos integer,
  licencas integer,
  clientes integer,
  nao_vista boolean,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with por_mudanca as (
    select a.mudanca_id as mid,
           count(distinct a.empreendimento_id)::integer as empreendimentos,
           count(distinct a.instrumento_id)::integer as licencas,
           count(distinct e.cliente_id)::integer as clientes,
           bool_or(a.visto_em is null) as nao_vista
    from public.aviso_norma as a
    join public.empreendimento as e on e.consultoria_id = a.consultoria_id and e.id = a.empreendimento_id
    where a.consultoria_id = p_consultoria_id
      and private.is_membro(p_consultoria_id)
    group by a.mudanca_id
    having not coalesce(p_so_nao_vistas, false) or bool_or(a.visto_em is null)
  )
  select m.id, n.id, n.titulo, m.tipo, m.publicada_em, m.resumo ->> 'resumo',
         p.empreendimentos, p.licencas, p.clientes, p.nao_vista, count(*) over ()
  from por_mudanca as p
  join private.norma_mudanca as m on m.id = p.mid and m.situacao = 'publicada'
  join private.norma as n on n.id = m.norma_id
  order by m.publicada_em desc, m.id
  limit least(greatest(coalesce(p_limite, 25), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

comment on function public.listar_mudancas_de_norma_da_consultoria(uuid, boolean, integer, integer) is
  'Mudanças de norma publicadas que alcançam a consultoria (ADR-0050). Zero linhas para quem não é membro ativo.';

create function public.contar_mudancas_de_norma_nao_vistas(p_consultoria_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct a.mudanca_id)::integer
  from public.aviso_norma as a
  where a.consultoria_id = p_consultoria_id and a.visto_em is null
    and private.is_membro(p_consultoria_id)
$$;

comment on function public.contar_mudancas_de_norma_nao_vistas(uuid) is
  'Quantas mudanças de norma a consultoria ainda não marcou como vistas. Zero para quem não é membro.';

-- Empreendimentos e licenças que a mudança alcança na consultoria. A RLS das tabelas decide.
create function public.afetados_pela_mudanca(p_consultoria_id uuid, p_mudanca_id uuid)
returns table (
  empreendimento_id uuid,
  empreendimento_nome text,
  cliente_nome text,
  instrumento_id uuid,
  licenca text,
  motivo jsonb,
  visto_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.empreendimento_id, e.nome, cl.nome, a.instrumento_id,
         case when i.id is not null then
           coalesce(t.sigla, 'Licença') || ' ' || coalesce(nullif(btrim(i.numero), ''), 'sem número')
         end,
         a.motivo, a.visto_em
  from public.aviso_norma as a
  join public.empreendimento as e on e.consultoria_id = a.consultoria_id and e.id = a.empreendimento_id
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  left join public.instrumento as i on i.consultoria_id = a.consultoria_id and i.id = a.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where a.consultoria_id = p_consultoria_id and a.mudanca_id = p_mudanca_id
    and private.is_membro(p_consultoria_id)
  order by e.nome_normalizado, e.id, a.instrumento_id nulls first
$$;

comment on function public.afetados_pela_mudanca(uuid, uuid) is
  'Empreendimentos e licenças da consultoria que a mudança de norma alcança, com o motivo.';

-- Qualquer membro ativo marca a mudança como vista para a consultoria. Repetir não muda nada.
create function public.marcar_mudanca_de_norma_vista(p_consultoria_id uuid, p_mudanca_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := private.membro_atual(p_consultoria_id);
  marcados integer;
begin
  -- O suporte não tem membro: só lê.
  if quem is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  update public.aviso_norma as a
  set visto_em = now(), visto_por = quem
  where a.consultoria_id = p_consultoria_id and a.mudanca_id = p_mudanca_id and a.visto_em is null;
  get diagnostics marcados = row_count;
  return marcados;
end;
$$;

comment on function public.marcar_mudanca_de_norma_vista(uuid, uuid) is
  'Marca como vistos os avisos da mudança na consultoria (qualquer membro ativo). Devolve quantos marcou.';

-- Selo "norma mudou" na tabela de licenças: avisos ainda não vistos, por licença.
create function public.licencas_com_mudanca_de_norma(p_consultoria_id uuid, p_empreendimento_id uuid)
returns table (instrumento_id uuid, mudancas integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.instrumento_id, count(distinct a.mudanca_id)::integer
  from public.aviso_norma as a
  where a.consultoria_id = p_consultoria_id and a.empreendimento_id = p_empreendimento_id
    and a.instrumento_id is not null and a.visto_em is null
    and private.is_membro(p_consultoria_id)
  group by a.instrumento_id
  order by a.instrumento_id
$$;

comment on function public.licencas_com_mudanca_de_norma(uuid, uuid) is
  'Licenças do empreendimento com mudança de norma ainda não vista, e quantas.';

revoke all on function public.listar_mudancas_de_norma_da_consultoria(uuid, boolean, integer, integer) from public, anon;
revoke all on function public.contar_mudancas_de_norma_nao_vistas(uuid) from public, anon;
revoke all on function public.afetados_pela_mudanca(uuid, uuid) from public, anon;
revoke all on function public.marcar_mudanca_de_norma_vista(uuid, uuid) from public, anon;
revoke all on function public.licencas_com_mudanca_de_norma(uuid, uuid) from public, anon;
grant execute on function public.listar_mudancas_de_norma_da_consultoria(uuid, boolean, integer, integer) to authenticated;
grant execute on function public.contar_mudancas_de_norma_nao_vistas(uuid) to authenticated;
grant execute on function public.afetados_pela_mudanca(uuid, uuid) to authenticated;
grant execute on function public.marcar_mudanca_de_norma_vista(uuid, uuid) to authenticated;
grant execute on function public.licencas_com_mudanca_de_norma(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Grupo 'norma' da busca global
-- ---------------------------------------------------------------------------
-- Catálogo global, mas só para membro ativo da consultoria passada. Só busca quando o termo parece
-- referência de norma: tem número ou começa por tipo ou órgão de norma ("IN", "portaria", "lei",
-- "CONSEMA"...). Sem isso, um termo comum como "efluentes" encheria o Ctrl+K de normas no meio de
-- empreendimentos e condicionantes (o 710 fixa que "efluentes" traz só a condicionante).
-- Casa o número (mesma regra de buscar_normas: "IN 2", "250/2024", "14.675") ou o título
-- normalizado, pelo termo inteiro ou pelo que vem depois do tipo ("IN coleta" → "coleta").
-- Número exato primeiro, depois título.
create or replace function private.busca_normas(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with termo as (
    select b.termo, b.padrao,
           regexp_replace(left(p_termo, 100), '[^0-9/]', '', 'g') as digitos,
           nullif(btrim(regexp_replace(b.termo, '^(instrucao normativa|instrucoes normativas|instrucao|instrucoes|in|ins|portarias?|leis?'
             || '|decretos?|resolucao|resolucoes|deliberacao|deliberacoes|normas?|consema|conama|ima|fatma)( |$)',
             '')), '') as resto
    from private.termo_de_busca(p_termo) as b
    where private.is_membro(p_consultoria_id)
  ),
  referencia as (
    select t.*, t.digitos ~ '[0-9]' as tem_numero,
           case when length(t.resto) >= 2 and t.resto <> t.termo then private.padrao_de_busca(t.resto) end
             as padrao_do_resto
    from termo as t
    where t.digitos ~ '[0-9]' or t.resto is distinct from t.termo
  ),
  achadas as (
    select n.id, n.titulo, n.titulo_normalizado,
           n.orgao || ' · ' || case n.tipo
             when 'lei' then 'Lei'
             when 'lei_complementar' then 'Lei complementar'
             when 'decreto' then 'Decreto'
             when 'resolucao' then 'Resolução'
             when 'instrucao_normativa' then 'Instrução normativa'
             when 'portaria' then 'Portaria'
             when 'deliberacao' then 'Deliberação'
             when 'medida_provisoria' then 'Medida provisória'
             else n.tipo
           end || case when n.situacao_na_fonte = 'revogada' then ' · revogada' else '' end as detalhe,
           coalesce(
             r.tem_numero
             and ltrim(replace(n.numero, '.', ''), '0') = ltrim(replace(split_part(r.digitos, '/', 1), '.', ''), '0')
             and (split_part(r.digitos, '/', 2) = '' or n.ano::text = split_part(r.digitos, '/', 2)),
             false) as numero_exato,
           n.titulo_normalizado like r.padrao
             or coalesce(n.titulo_normalizado like r.padrao_do_resto, false) as titulo_casa
    from referencia as r
    cross join private.norma as n
  )
  select a.id, a.titulo, a.detalhe, a.id,
         row_number() over (order by a.numero_exato desc, a.titulo_normalizado, a.id)
  from achadas as a
  where a.numero_exato or a.titulo_casa
$$;

comment on function private.busca_normas(uuid, text) is
  'Grupo norma da busca global (L5): número ou título, só com termo que parece referência de norma, para membro ativo da consultoria passada.';
