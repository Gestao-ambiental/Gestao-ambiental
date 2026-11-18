-- CAMPO-01: a vistoria é uma versão de evidência e segue a conferência já existente.
alter table public.evidencia add column vistoria jsonb;
comment on column public.evidencia.vistoria is
  'Registro declarado pelo dispositivo. Envio e autoria oficiais são os campos da evidência.';

create function public.enviar_vistoria(
  p_ocorrencia_id uuid, p_evidencia_id uuid, p_versao_id uuid,
  p_caminho text, p_nome_original text, p_sha256 text, p_data_execucao date, p_vistoria jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  eu uuid;
  anterior public.evidencia;
  numero integer;
  localizacao jsonb;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  eu := private.membro_atual(alvo.consultoria_id);
  select * into anterior from public.evidencia as e where e.id = p_evidencia_id;
  if found then
    if anterior.ocorrencia_id = alvo.id and anterior.enviada_por = eu
       and anterior.documento_versao_id = p_versao_id
       and anterior.data_execucao = p_data_execucao and anterior.vistoria = p_vistoria then
      return anterior.numero;
    end if;
    raise exception 'evidencia_existente' using errcode = 'P0001';
  end if;

  if alvo.responsavel_id is distinct from eu then
    raise exception 'vistoria_nao_atribuida' using errcode = '42501';
  end if;

  if p_vistoria is null or jsonb_typeof(p_vistoria) <> 'object'
     or pg_column_size(p_vistoria) > 16000
     or not (p_vistoria ?& array['resultado','area','acompanhante','observacao','registradoEm','fotoEm','origemFoto','localizacao'])
     or (p_vistoria - array['resultado','area','acompanhante','observacao','registradoEm','fotoEm','origemFoto','localizacao']) <> '{}'::jsonb
     or coalesce(p_vistoria ->> 'resultado', '') not in ('conforme','nao_conforme','nao_aplicavel','requer_avaliacao')
     or jsonb_typeof(p_vistoria -> 'area') <> 'string'
     or length(btrim(p_vistoria ->> 'area')) not between 1 and 200
     or jsonb_typeof(p_vistoria -> 'acompanhante') <> 'string'
     or length(p_vistoria ->> 'acompanhante') > 160
     or jsonb_typeof(p_vistoria -> 'observacao') <> 'string'
     or length(p_vistoria ->> 'observacao') > 2000
     or (p_vistoria ->> 'resultado' <> 'conforme' and btrim(p_vistoria ->> 'observacao') = '')
     or coalesce(p_vistoria ->> 'origemFoto', '') not in ('camera','galeria')
     or coalesce(p_vistoria ->> 'registradoEm', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
     or coalesce(p_vistoria ->> 'fotoEm', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception 'vistoria_invalida' using errcode = '22023';
  end if;
  perform (p_vistoria ->> 'registradoEm')::timestamptz, (p_vistoria ->> 'fotoEm')::timestamptz;

  localizacao := p_vistoria -> 'localizacao';
  if localizacao <> 'null'::jsonb then
    if jsonb_typeof(localizacao) <> 'object'
       or not (localizacao ?& array['latitude','longitude','precisao','obtidaEm'])
       or (localizacao - array['latitude','longitude','precisao','obtidaEm']) <> '{}'::jsonb
       or jsonb_typeof(localizacao -> 'latitude') <> 'number'
       or jsonb_typeof(localizacao -> 'longitude') <> 'number'
       or jsonb_typeof(localizacao -> 'precisao') <> 'number'
       or coalesce(localizacao ->> 'obtidaEm','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
      raise exception 'localizacao_invalida' using errcode = '22023';
    end if;
    if (localizacao ->> 'latitude')::numeric not between -90 and 90
       or (localizacao ->> 'longitude')::numeric not between -180 and 180
       or (localizacao ->> 'precisao')::numeric not between 0 and 20000000 then
      raise exception 'localizacao_invalida' using errcode = '22023';
    end if;
    perform (localizacao ->> 'obtidaEm')::timestamptz;
  end if;

  if p_caminho is null or p_versao_id is null or p_evidencia_id is null or
     p_caminho not in (
       alvo.consultoria_id::text || '/evidencia/' || p_versao_id::text || '.jpg',
       alvo.consultoria_id::text || '/evidencia/' || p_versao_id::text || '.png'
     ) then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects as o where o.bucket_id = 'arquivos' and o.name = p_caminho
      and o.owner_id = (select auth.uid())::text
      and o.metadata ->> 'mimetype' = case when right(p_caminho, 4) = '.jpg' then 'image/jpeg' else 'image/png' end
  ) then
    raise exception 'foto_da_vistoria_indisponivel' using errcode = '22023';
  end if;

  numero := public.enviar_evidencia(p_ocorrencia_id, p_evidencia_id, p_versao_id,
    p_caminho, p_nome_original, p_sha256, p_data_execucao);
  update public.evidencia as e set vistoria = p_vistoria
  where e.id = p_evidencia_id and e.consultoria_id = alvo.consultoria_id;
  return numero;
end;
$$;

revoke all on function public.enviar_vistoria(uuid, uuid, uuid, text, text, text, date, jsonb) from public, anon;
grant execute on function public.enviar_vistoria(uuid, uuid, uuid, text, text, text, date, jsonb) to authenticated;
