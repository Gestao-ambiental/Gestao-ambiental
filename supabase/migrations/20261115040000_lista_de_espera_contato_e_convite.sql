-- Lista de espera, parte 2 (ADR-0034): o operador marca quem já foi contatado, convida para o beta
-- e recebe um e-mail a cada cadastro novo.
--
--   central_lista_de_espera(limite, desl., so_pendentes)  operador; agora com contatado e convidado
--   central_marcar_contatado(id, contatado)               operador; marca ou desmarca
--   central_registrar_convite(id)                         operador; registra o convite e devolve o
--                                                         contato (a Edge Function manda o e-mail)
--   lista_de_espera_pendente_de_aviso()                   service role; cadastros sem aviso e os
--                                                         e-mails dos operadores
--   lista_de_espera_marcar_avisados(ids)                  service role; depois do envio
--
-- O aviso parte do próprio banco: um gatilho chama a Edge Function avisar-lista-de-espera pelo
-- pg_net, com a URL e o token guardados no Vault (nomes lista_espera_aviso_url e
-- lista_espera_aviso_token, gravados por SQL no painel, nunca no repositório). Sem pg_net, sem
-- Vault ou sem os segredos (ex.: testes locais), o gatilho não faz nada; falhar no aviso nunca
-- impede o cadastro.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
alter table private.lista_de_espera
  add column contatado_em timestamptz,
  add column contatado_por uuid references auth.users (id) on delete set null,
  add column convidado_em timestamptz,
  add column convidado_por uuid references auth.users (id) on delete set null,
  add column avisado_em timestamptz;

-- Quem já estava na lista antes do aviso existir não gera e-mail atrasado.
update private.lista_de_espera set avisado_em = criada_em where avisado_em is null;

create index lista_de_espera_sem_aviso_idx on private.lista_de_espera (criada_em) where avisado_em is null;

-- ---------------------------------------------------------------------------
-- 2. Leitura da central, agora com contatado e convidado
-- ---------------------------------------------------------------------------
drop function public.central_lista_de_espera(integer, integer);

create function public.central_lista_de_espera(
  p_limite integer default 50,
  p_deslocamento integer default 0,
  p_so_pendentes boolean default false
)
returns table (
  id uuid,
  nome text,
  contato text,
  tipo_contato text,
  criada_em timestamptz,
  contatado_em timestamptz,
  convidado_em timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  select l.id, l.nome, l.contato, l.tipo_contato, l.criada_em, l.contatado_em, l.convidado_em,
         count(*) over ()
  from private.lista_de_espera as l
  where not coalesce(p_so_pendentes, false) or l.contatado_em is null
  order by l.criada_em desc, l.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Marcar contatado e registrar convite (operador com dois fatores)
-- ---------------------------------------------------------------------------
create function public.central_marcar_contatado(p_id uuid, p_contatado boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  update private.lista_de_espera as l
  set contatado_em = case when p_contatado then coalesce(l.contatado_em, now()) end,
      contatado_por = case when p_contatado then coalesce(l.contatado_por, auth.uid()) end
  where l.id = p_id;
  if not found then
    raise exception 'cadastro_inexistente' using errcode = 'P0001';
  end if;
end;
$$;

-- Registra o convite (e o contato, se ainda não havia) e devolve nome e contato. Repetir é
-- permitido: o convite pode ser reenviado, e o instante passa a ser o do último.
create function public.central_registrar_convite(p_id uuid)
returns table (nome text, contato text, tipo_contato text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  update private.lista_de_espera as l
  set convidado_em = now(),
      convidado_por = auth.uid(),
      contatado_em = coalesce(l.contatado_em, now()),
      contatado_por = coalesce(l.contatado_por, auth.uid())
  where l.id = p_id
  returning l.nome, l.contato, l.tipo_contato;
  if not found then
    raise exception 'cadastro_inexistente' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Aviso de cadastro novo (só a service role da Edge Function)
-- ---------------------------------------------------------------------------
create function public.lista_de_espera_pendente_de_aviso()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cadastros', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'contato', l.contato,
                                          'tipo_contato', l.tipo_contato, 'criada_em', l.criada_em)
                       order by l.criada_em, l.id)
      from (select * from private.lista_de_espera where avisado_em is null
            order by criada_em, id limit 50) as l), '[]'::jsonb),
    'destinatarios', coalesce((
      select jsonb_agg(u.email order by u.email)
      from private.operador_plataforma as o
      join auth.users as u on u.id = o.usuario_id
      where u.email is not null), '[]'::jsonb))
$$;

create function public.lista_de_espera_marcar_avisados(p_ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with marcados as (
    update private.lista_de_espera set avisado_em = now()
    where id = any (coalesce(p_ids, '{}')) and avisado_em is null
    returning 1
  )
  select count(*)::integer from marcados
$$;

-- Gatilho: chama a Edge Function pelo pg_net quando ele e os segredos do Vault existem.
create function private.chamar_aviso_da_lista_de_espera()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if to_regclass('vault.decrypted_secrets') is null or not exists (
    select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_url using 'lista_espera_aviso_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_token using 'lista_espera_aviso_token';
  if v_url is null or v_token is null then
    return null;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-aviso-token', v_token);
  return null;
exception when others then
  -- O aviso nunca impede o cadastro.
  return null;
end;
$$;

create trigger lista_de_espera_avisar
  after insert on private.lista_de_espera
  for each statement execute function private.chamar_aviso_da_lista_de_espera();

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.central_lista_de_espera(integer, integer, boolean) from public, anon;
revoke all on function public.central_marcar_contatado(uuid, boolean) from public, anon;
revoke all on function public.central_registrar_convite(uuid) from public, anon;
revoke all on function public.lista_de_espera_pendente_de_aviso() from public, anon, authenticated;
revoke all on function public.lista_de_espera_marcar_avisados(uuid[]) from public, anon, authenticated;
revoke all on function private.chamar_aviso_da_lista_de_espera() from public, anon, authenticated;
grant execute on function public.central_lista_de_espera(integer, integer, boolean) to authenticated;
grant execute on function public.central_marcar_contatado(uuid, boolean) to authenticated;
grant execute on function public.central_registrar_convite(uuid) to authenticated;
grant execute on function public.lista_de_espera_pendente_de_aviso() to service_role;
grant execute on function public.lista_de_espera_marcar_avisados(uuid[]) to service_role;
