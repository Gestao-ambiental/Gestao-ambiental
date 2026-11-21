-- Calendário conciliado (P0 + cores por pessoa). A 20261120183218 (base das oito funções) e a
-- 20261121012948 (relatorio-no-grama, já aplicada no beta) recriavam o listar_calendario de jeitos
-- diferentes: a primeira com as fontes novas de private.linhas_de_prazo e o "sem responsável" por
-- tipo (private.tipo_linha_tem_responsavel), a segunda com a coluna responsavel_id no fim.
-- Esta junta as duas. Mesmos argumentos e mesma ordem das colunas da 012948; roda depois de
-- qualquer uma das duas, em qualquer ordem entre elas.

drop function if exists public.listar_calendario(uuid, date, date, uuid, uuid, boolean);

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
    select * from private.linhas_de_prazo(p_consultoria_id) as l
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

revoke all on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) from public, anon;
grant execute on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) to authenticated;

comment on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) is
  'Calendário: prazos, metas internas e as fontes de private.linhas_de_prazo, com responsavel_id no fim (cores por pessoa e área).';
