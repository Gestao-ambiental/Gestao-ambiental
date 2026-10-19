-- Decisões do Eduardo de 19/10/2026 sobre prazos e renovação (épicos 5 e 7).
-- 1. Validade e limite de protocolo contam em Atrasadas, Hoje e Próximos 7 da Visão da equipe,
--    com rótulos próprios na tabela; "Sem responsável" continua só de ocorrências. O total passa a
--    contar todas as linhas filtradas (bate com a tabela).
-- 2. Depois do protocolo, o limite sai da Visão e do calendário (não é mais pendência); o limite
--    usa os dias do plano (snapshot de 120). O rótulo "Prazo de protocolo vencido" e "Sem retorno
--    do órgão" são do packages/domain.
-- 3. Acompanhamento do órgão depois do protocolo: intervalo por plano, a partir de 1 dia
--    (diário, semanal, quinzenal, mensal ou outro), só pela Gestão. Nada é gerado na Visão nem
--    no calendário por ora: o plano e o radar mostram o próximo acompanhamento.

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
    'limite_protocolo', i.id, i.id, i.validade - coalesce(pr.dias_limite_protocolo, 120),
    i.validade - coalesce(pr.dias_limite_protocolo, 120) - h.d,
    null, 'Limite de protocolo', e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null, null, null, null, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.plano_renovacao as pr on pr.consultoria_id = i.consultoria_id and pr.instrumento_id = i.id
  where i.consultoria_id = cid and i.situacao = 'ativo' and upper(btrim(t.sigla)) = 'LAO'
    and pr.protocolado_em is null
$$;

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
      or case p_faixa
           when 'atrasadas' then l.dias < 0
           when 'hoje' then l.dias = 0
           when 'proximos_7' then l.dias between 1 and 7
           when 'sem_responsavel' then l.tipo_linha = 'ocorrencia' and l.responsavel_id is null
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
    count(*) filter (where l.tipo_linha = 'ocorrencia' and l.responsavel_id is null),
    count(*)
  from private.linhas_de_prazo(p_consultoria_id) as l
  where private.linha_passa_filtros(l.tipo_linha, l.responsavel_id, l.tipo_id, l.empreendimento_id,
          private.membro_atual(p_consultoria_id), p_aba, p_responsavel_id, p_sem_responsavel, p_tipo_id,
          p_empreendimento_id)
$$;

-- ---------------------------------------------------------------------------
-- Intervalo de acompanhamento do órgão
-- ---------------------------------------------------------------------------
alter table public.plano_renovacao
  add column acompanhamento_dias integer,
  add constraint plano_renovacao_acompanhamento_valido check (
    acompanhamento_dias is null or acompanhamento_dias between 1 and 365
  );

comment on column public.plano_renovacao.acompanhamento_dias is
  'De quantos em quantos dias acompanhar o órgão depois do protocolo (1 = diário). Nulo = não definido.';

create function public.definir_acompanhamento(p_plano_id uuid, p_dias integer, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.plano_renovacao;
begin
  alvo := private.plano_para_gestao(p_plano_id, p_row_version);
  if alvo.protocolado_em is null then
    raise exception 'plano_nao_protocolado' using errcode = 'P0001';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 365 then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;
  if p_dias = alvo.acompanhamento_dias then
    return alvo.row_version;
  end if;

  update public.plano_renovacao as p
  set acompanhamento_dias = p_dias, row_version = p.row_version + 1
  where p.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- As leituras ganham a coluna nova (mudar o retorno exige recriar).
drop function public.listar_renovacoes(uuid, integer, integer);
drop function public.obter_plano_renovacao(uuid);

create function public.listar_renovacoes(p_consultoria_id uuid, p_limite integer default 50, p_deslocamento integer default 0)
returns table (
  id uuid,
  instrumento_id uuid,
  licenca text,
  orgao text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_nome text,
  validade date,
  dias_limite_protocolo integer,
  antecedencia_dias integer,
  protocolado_em date,
  protocolo_numero text,
  hoje date,
  total bigint,
  acompanhamento_dias integer
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, i.id, nullif(concat_ws(' ', t.sigla, i.numero), ''), i.orgao, e.id, e.nome, u.nome, i.validade,
    p.dias_limite_protocolo, p.antecedencia_dias, p.protocolado_em, p.protocolo_numero,
    private.hoje_da_consultoria(p.consultoria_id),
    count(*) over (),
    p.acompanhamento_dias
  from public.plano_renovacao as p
  join public.instrumento as i on i.consultoria_id = p.consultoria_id and i.id = p.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where p.consultoria_id = p_consultoria_id and i.situacao = 'ativo'
  order by p.protocolado_em is not null, i.validade - p.dias_limite_protocolo, p.id
  limit greatest(least(coalesce(p_limite, 50), 200), 1)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

create function public.obter_plano_renovacao(p_instrumento_id uuid)
returns table (
  id uuid,
  consultoria_id uuid,
  instrumento_id uuid,
  licenca text,
  orgao text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_nome text,
  validade date,
  dias_limite_protocolo integer,
  antecedencia_dias integer,
  protocolado_em date,
  protocolo_numero text,
  comprovante_caminho text,
  comprovante_nome text,
  comprovante_tamanho bigint,
  registrado_por_nome text,
  registrado_em timestamptz,
  hoje date,
  row_version integer,
  acompanhamento_dias integer
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.consultoria_id, i.id, nullif(concat_ws(' ', t.sigla, i.numero), ''), i.orgao, e.id, e.nome, u.nome,
    i.validade, p.dias_limite_protocolo, p.antecedencia_dias, p.protocolado_em, p.protocolo_numero,
    v.caminho, v.nome_original, v.tamanho_bytes, m.nome, p.protocolo_registrado_em,
    private.hoje_da_consultoria(p.consultoria_id), p.row_version, p.acompanhamento_dias
  from public.plano_renovacao as p
  join public.instrumento as i on i.consultoria_id = p.consultoria_id and i.id = p.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.documento_versao as v on v.consultoria_id = p.consultoria_id and v.id = p.protocolo_versao_id
  left join public.membro as m on m.consultoria_id = p.consultoria_id and m.id = p.protocolo_registrado_por
  where p.instrumento_id = p_instrumento_id
$$;

revoke all on function public.definir_acompanhamento(uuid, integer, integer) from public, anon;
revoke all on function public.listar_renovacoes(uuid, integer, integer) from public, anon;
revoke all on function public.obter_plano_renovacao(uuid) from public, anon;
grant execute on function public.definir_acompanhamento(uuid, integer, integer) to authenticated;
grant execute on function public.listar_renovacoes(uuid, integer, integer) to authenticated;
grant execute on function public.obter_plano_renovacao(uuid) to authenticated;
