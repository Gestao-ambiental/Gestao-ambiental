-- CAMPO-01: os arquivos sobem antes, mas checklist, referências de fotos e entrega são
-- confirmados juntos. A mesma chave recupera o recibo se a resposta se perder.
alter table public.vistoria add column envio_offline_id uuid;

create function public.sincronizar_vistoria_offline(
  p_id uuid,
  p_envio_id uuid,
  p_row_version integer,
  p_observacao jsonb,
  p_itens jsonb,
  p_fotos jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_registrar(p_id);
  versao integer;
  item record;
  foto record;
begin
  if p_envio_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if alvo.envio_offline_id = p_envio_id and alvo.enviada_por = private.membro_atual(alvo.consultoria_id) then
    return alvo.row_version;
  end if;

  if coalesce(jsonb_typeof(p_itens), '') <> 'array'
     or coalesce(jsonb_typeof(p_fotos), '') <> 'array'
     or coalesce(jsonb_typeof(p_observacao), '') <> 'object'
     or not (p_observacao ?& array['original', 'atual'])
     or jsonb_typeof(p_observacao -> 'original') not in ('null', 'string')
     or jsonb_typeof(p_observacao -> 'atual') not in ('null', 'string')
     or pg_column_size(p_itens) > 450000 or pg_column_size(p_fotos) > 70000
     or pg_column_size(p_observacao) > 18000 then
    raise exception 'vistoria_offline_invalida' using errcode = '22023';
  end if;
  if alvo.row_version is distinct from p_row_version
     or alvo.observacao is distinct from p_observacao ->> 'original' then
    raise exception 'conflito_vistoria_offline' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) not between 1 and 50 or jsonb_array_length(p_fotos) > 50 then
    raise exception 'vistoria_offline_invalida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) <> (select count(*) from public.vistoria_item i where i.vistoria_id = alvo.id)
     or jsonb_array_length(p_itens) <> (select count(distinct i.id) from jsonb_to_recordset(p_itens) as i(id uuid)) then
    raise exception 'conflito_vistoria_offline' using errcode = 'P0001';
  end if;

  versao := public.iniciar_vistoria(alvo.id);
  for item in
    select * from jsonb_to_recordset(p_itens) as r(
      id uuid, resultado_original public.resultado_item_vistoria, comentario_original text,
      resultado public.resultado_item_vistoria, comentario text
    )
  loop
    if not exists (
      select 1 from public.vistoria_item i
      where i.id = item.id and i.vistoria_id = alvo.id
        and i.resultado = item.resultado_original
        and i.comentario is not distinct from item.comentario_original
    ) then
      raise exception 'conflito_vistoria_offline' using errcode = 'P0001';
    end if;
    perform public.registrar_item_da_vistoria(item.id, item.resultado, item.comentario);
  end loop;

  perform public.salvar_observacao_da_vistoria(alvo.id, p_observacao ->> 'atual');
  for foto in
    select * from jsonb_to_recordset(p_fotos) as r(
      id uuid, item_id uuid, caminho text, nome_original text, sha256 text, legenda text,
      capturada_em timestamptz, latitude numeric, longitude numeric, precisao_m numeric,
      local_origem text, local_manual text
    )
  loop
    if not exists (select 1 from public.vistoria_item i where i.id = foto.item_id and i.vistoria_id = alvo.id)
       or foto.caminho is null or foto.id is null or foto.caminho not in (
         alvo.consultoria_id::text || '/vistoria/' || foto.id::text || '.jpg',
         alvo.consultoria_id::text || '/vistoria/' || foto.id::text || '.png'
       ) or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'arquivos' and o.name = foto.caminho and o.owner_id = (select auth.uid()::text)
       ) then
      raise exception 'foto_offline_indisponivel' using errcode = '22023';
    end if;
    perform public.adicionar_foto_da_vistoria(
      foto.id, foto.item_id, foto.caminho, foto.nome_original, foto.sha256, foto.legenda,
      foto.capturada_em, foto.latitude, foto.longitude, foto.precisao_m, foto.local_origem, foto.local_manual
    );
  end loop;
  versao := public.enviar_vistoria(alvo.id, versao);
  update public.vistoria set envio_offline_id = p_envio_id where id = alvo.id;
  return versao;
end;
$$;

revoke all on function public.sincronizar_vistoria_offline(uuid, uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.sincronizar_vistoria_offline(uuid, uuid, integer, jsonb, jsonb, jsonb) to authenticated;
