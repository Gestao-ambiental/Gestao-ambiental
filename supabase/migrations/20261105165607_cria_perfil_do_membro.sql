-- Perfil do membro: cargo e foto, para o seletor de responsável mostrar quem é quem (foto e, embaixo
-- do nome, o cargo). Decisão de 05/11/2026.
-- Cargo e foto vivem no vínculo (membro), como o papel: quem está em duas consultorias tem um perfil
-- em cada, e nada atravessa consultorias.
-- Cargo: texto livre de até 80 caracteres; muda a própria pessoa ou a Gestão da consultoria.
-- Foto: só a própria pessoa. É documento versionado (entidade 'membro'), objeto imutável em
-- consultoria_id/membro/<uuid>.(png|jpg), PNG ou JPEG de até 2 MiB. Trocar = versão nova do mesmo
-- documento; tirar = exclusão lógica do documento (o objeto e as versões ficam).
-- As mudanças em membro já entram na auditoria pelo trigger membro_auditar.

alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida
  check (entidade in ('instrumento', 'evidencia', 'protocolo', 'membro'));

alter table public.membro
  add column cargo text,
  add column foto_documento_id uuid,
  add constraint membro_cargo_valido
    check (cargo is null or (cargo = btrim(cargo) and length(cargo) between 1 and 80)),
  add constraint membro_foto_fk foreign key (consultoria_id, foto_documento_id)
    references public.documento (consultoria_id, id) on delete restrict;

comment on column public.membro.cargo is 'Cargo exibido sob o nome (ex.: "Analista ambiental"). Exibição; papel continua em papel.';
comment on column public.membro.foto_documento_id is 'Foto de perfil: documento (entidade membro) cuja versão vigente é a imagem.';

-- ---------------------------------------------------------------------------
-- Cargo: a própria pessoa ou a Gestão. Vazio limpa. Repetir não muda nada.
-- ---------------------------------------------------------------------------
create function public.definir_cargo(p_membro_id uuid, p_cargo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
  novo text := nullif(btrim(coalesce(p_cargo, '')), '');
begin
  select * into alvo from public.membro as m where m.id = p_membro_id for update;
  if not found
     or not (private.is_gestao(alvo.consultoria_id)
             or (alvo.usuario_id = (select auth.uid()) and private.is_membro(alvo.consultoria_id))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'ativo' then
    raise exception 'membro_desligado' using errcode = 'P0001';
  end if;
  if length(novo) > 80 then
    raise exception 'cargo_longo_demais' using errcode = '22023';
  end if;

  update public.membro as m set cargo = novo where m.id = alvo.id and m.cargo is distinct from novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Foto: membro da própria pessoa, vínculo ativo.
-- ---------------------------------------------------------------------------
create function private.meu_membro_para_perfil(p_membro_id uuid)
returns public.membro
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
begin
  select * into alvo from public.membro as m where m.id = p_membro_id for update;
  if not found or alvo.usuario_id is distinct from (select auth.uid())
     or not private.is_membro(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return alvo;
end;
$$;

revoke all on function private.meu_membro_para_perfil(uuid) from public, anon, authenticated;

-- Registra a imagem já enviada ao Storage como foto. Repetir com a mesma versão devolve a mesma.
create function public.registrar_foto_membro(
  p_membro_id uuid,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
  objeto record;
  doc uuid;
  proximo integer;
begin
  alvo := private.meu_membro_para_perfil(p_membro_id);

  select v.documento_id into doc from public.documento_versao as v where v.id = p_versao_id;
  if found then
    if doc = alvo.foto_documento_id then
      return p_versao_id;
    end if;
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;

  if p_versao_id is null or p_caminho is null
     or split_part(p_caminho, '/', 1) <> alvo.consultoria_id::text
     or p_caminho !~ '^[0-9a-f-]{36}/membro/[0-9a-f-]{36}\.(png|jpg)$' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  if coalesce(p_sha256, '') !~* '^[0-9a-f]{64}$' then
    raise exception 'sha256_invalido' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or objeto.mime not in ('image/png', 'image/jpeg') then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 2097152 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  doc := alvo.foto_documento_id;
  if doc is null then
    insert into public.documento (consultoria_id, entidade) values (alvo.consultoria_id, 'membro')
    returning id into doc;
  end if;

  select coalesce(max(v.numero), 0) + 1 into proximo from public.documento_versao as v where v.documento_id = doc;

  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, doc, proximo, p_caminho,
          coalesce(nullif(btrim(p_nome_original), ''), 'foto'), objeto.mime, objeto.tamanho, lower(p_sha256),
          alvo.id);

  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  update public.membro as m set foto_documento_id = doc where m.id = alvo.id and m.foto_documento_id is distinct from doc;
  return p_versao_id;
end;
$$;

-- Tira a foto: o documento é excluído logicamente e o membro volta às iniciais. Repetir é inofensivo.
create function public.remover_foto_membro(p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
begin
  alvo := private.meu_membro_para_perfil(p_membro_id);
  if alvo.foto_documento_id is null then
    return;
  end if;
  update public.documento as d set excluido_em = now()
  where d.id = alvo.foto_documento_id and d.excluido_em is null;
  update public.membro as m set foto_documento_id = null where m.id = alvo.id;
end;
$$;

revoke all on function public.definir_cargo(uuid, text) from public, anon;
revoke all on function public.registrar_foto_membro(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.remover_foto_membro(uuid) from public, anon;

grant execute on function public.definir_cargo(uuid, text) to authenticated;
grant execute on function public.registrar_foto_membro(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.remover_foto_membro(uuid) to authenticated;
