-- Prazo em meses que nasce de uma referência no fim do mês não fica preso no dia 28 (vistoria de
-- 19/11/2026). Quando a primeira data é a sugerida (referência + um intervalo em meses), a série
-- conta da referência: referência + (i + 1) × intervalo. Referência 31/01 mensal: 28/02, 31/03,
-- 30/04 (antes: 28/02, 28/03, 28/04). Primeira data escolhida à mão e dias corridos não mudam.
-- Espelho de datasDoPrazo (packages/domain/src/prazo.ts), com os mesmos casos no pgTAP 680.
--
-- Só séries novas mudam: a ativação grava as ocorrências uma vez (ativar_plano), e as já
-- gravadas não são reescritas. confirmar_prazo segue chamando com cinco argumentos (só confere a
-- série); a ativação passa a data de referência da versão.

drop function private.datas_do_prazo(public.recorrencia_prazo, public.unidade_ciclo, integer, date, date);

create function private.datas_do_prazo(
  p_recorrencia public.recorrencia_prazo,
  p_unidade public.unidade_ciclo,
  p_intervalo integer,
  p_primeira date,
  p_validade date,
  p_referencia date default null
)
returns table (ciclo integer, prazo date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  unidade public.unidade_ciclo;
  intervalo integer;
  da_referencia boolean;
  data date;
begin
  if p_recorrencia = 'continua' then
    return;
  end if;
  if p_primeira is null then
    raise exception 'primeira_data_obrigatoria' using errcode = '22023';
  end if;
  if p_recorrencia in ('unica', 'na_renovacao') then
    ciclo := 1;
    prazo := p_primeira;
    return next;
    return;
  end if;

  if p_recorrencia = 'personalizada' then
    unidade := p_unidade;
    intervalo := p_intervalo;
  else
    unidade := 'mes';
    intervalo := private.meses_da_recorrencia(p_recorrencia);
  end if;
  if unidade is null or intervalo is null or intervalo < 1 then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;
  if p_validade is null then
    raise exception 'validade_obrigatoria' using errcode = '22023';
  end if;
  if p_primeira > p_validade then
    raise exception 'primeira_data_apos_validade' using errcode = '22023';
  end if;

  -- Primeira data sugerida (referência + um intervalo): a série conta da referência.
  da_referencia := unidade = 'mes' and p_referencia is not null
    and (p_referencia + make_interval(months => intervalo))::date = p_primeira;

  for i in 0 .. 1200 loop
    if unidade = 'mes' and da_referencia then
      data := (p_referencia + make_interval(months => (i + 1) * intervalo))::date;
    elsif unidade = 'mes' then
      data := (p_primeira + make_interval(months => i * intervalo))::date;
    else
      data := p_primeira + i * intervalo;
    end if;
    if data > p_validade then
      return;
    end if;
    if i = 1200 then
      raise exception 'ocorrencias_demais' using errcode = '22023';
    end if;
    ciclo := i + 1;
    prazo := data;
    return next;
  end loop;
end;
$$;

revoke all on function private.datas_do_prazo(public.recorrencia_prazo, public.unidade_ciclo, integer, date, date,
  date) from public, anon, authenticated;

-- Ativação: igual à de 20261017202216, só passando a data de referência da versão.
create or replace function public.ativar_plano(p_instrumento_id uuid, p_row_version integer, p_chave uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
  ator uuid;
  item record;
  total integer;
begin
  select * into alvo from public.instrumento as i where i.id = p_instrumento_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if alvo.situacao = 'ativo' then
    if alvo.chave_ativacao = p_chave then
      select count(*) into total from public.ocorrencia as o
      where o.consultoria_id = alvo.consultoria_id and o.instrumento_id = alvo.id;
      return total;
    end if;
    raise exception 'instrumento_ativo' using errcode = 'P0001';
  end if;
  if p_chave is null then
    raise exception 'chave_obrigatoria' using errcode = '22023';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.tipo_id is null or alvo.marco is null or alvo.validade is null then
    raise exception 'identificacao_incompleta' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.condicionante as c where c.instrumento_id = alvo.id and c.revisao <> 'descartada'
  ) then
    raise exception 'sem_condicionantes' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.condicionante as c where c.instrumento_id = alvo.id and c.revisao = 'pendente'
  ) then
    raise exception 'condicionante_pendente' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.condicionante as c
    join public.condicionante_versao as v on v.id = c.versao_vigente_id
    where c.instrumento_id = alvo.id and c.revisao = 'aceita' and v.natureza = 'obrigacao'
      and v.prazo_confirmado_em is null
  ) then
    raise exception 'prazo_pendente' using errcode = 'P0001';
  end if;

  ator := private.membro_atual(alvo.consultoria_id);

  for item in
    select c.responsavel_id, v.id as versao_id, d.ciclo, d.prazo
    from public.condicionante as c
    join public.condicionante_versao as v on v.id = c.versao_vigente_id
    cross join lateral private.datas_do_prazo(v.recorrencia, v.unidade_ciclo, v.intervalo_ciclo,
                                              v.primeira_data, alvo.validade, v.data_referencia) as d
    where c.instrumento_id = alvo.id and c.revisao = 'aceita' and v.natureza = 'obrigacao'
  loop
    insert into public.ocorrencia (consultoria_id, instrumento_id, condicionante_versao_id, ciclo,
                                   prazo_oficial_original, prazo_oficial_atual, responsavel_id,
                                   chave_idempotencia)
    values (alvo.consultoria_id, alvo.id, item.versao_id, item.ciclo, item.prazo, item.prazo,
            item.responsavel_id, alvo.id::text || ':' || item.versao_id::text || ':' || item.ciclo::text)
    on conflict (consultoria_id, chave_idempotencia) do nothing;
  end loop;

  update public.instrumento as i
  set situacao = 'ativo', ativado_em = now(), ativado_por = ator, chave_ativacao = p_chave,
      row_version = i.row_version + 1
  where i.id = alvo.id;

  select count(*) into total from public.ocorrencia as o
  where o.consultoria_id = alvo.consultoria_id and o.instrumento_id = alvo.id;
  return total;
end;
$$;

