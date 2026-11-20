-- Aviso do acesso de emergência parte do banco (ADR-0025, atualização de 19/11/2026).
--
-- Antes, o e-mail à Gestão só saía se o front da central chamasse a Edge Function
-- avisar-acesso-de-suporte depois de abrir_acesso_de_emergencia: uma chamada direta à RPC (sem o
-- front) abria o acesso sem aviso por e-mail. Agora:
--   gatilho acesso_suporte_avisar_emergencia  depois de inserir um acesso de emergência, chama a
--                                             Edge Function pelo pg_net (mesmo padrão da lista
--                                             de espera, ADR-0034), com a URL e o token no Vault
--                                             (suporte_aviso_url, suporte_aviso_token; gravados
--                                             por SQL no painel, nunca no repositório). Sem
--                                             pg_net, Vault ou segredos, não faz nada; falhar no
--                                             aviso nunca impede o acesso.
--   private.aviso_de_emergencia               uma linha por aviso reservado: quem reserva envia.
--   reservar_aviso_de_emergencia(id)          service role; reserva o aviso (uma vez só) e
--                                             devolve os dados do e-mail. Repetir não devolve
--                                             nada: o gatilho e o front podem chamar a função
--                                             sem e-mail em dobro.
--   liberar_aviso_de_emergencia(id)           service role; desfaz a reserva quando o envio
--                                             falha, para uma nova tentativa.

-- Sem chave estrangeira para acesso_suporte: o registro de acesso nunca é apagado nem truncado
-- (trigger de só-inclusão), e uma FK faria o TRUNCATE falhar antes desse trigger (teste 400).
create table private.aviso_de_emergencia (
  id uuid primary key,
  reservado_em timestamptz not null default now()
);

comment on table private.aviso_de_emergencia is
  'Aviso por e-mail do acesso de emergência já reservado (ADR-0025): garante um e-mail só por acesso.';

alter table private.aviso_de_emergencia enable row level security;
alter table private.aviso_de_emergencia force row level security;
revoke all on table private.aviso_de_emergencia from public, anon, authenticated;

create function public.reservar_aviso_de_emergencia(p_acesso_id uuid)
returns table (
  acesso_id uuid,
  consultoria_id uuid,
  consultoria_nome text,
  consultoria_fuso text,
  categoria text,
  motivo text,
  inicio timestamptz,
  fim_previsto timestamptz,
  operador_nome text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alvo public.acesso_suporte;
begin
  select * into alvo from public.acesso_suporte as a where a.id = p_acesso_id;
  if not found or alvo.modo <> 'emergencia' then
    return;
  end if;
  insert into private.aviso_de_emergencia (id) values (alvo.id) on conflict (id) do nothing;
  if not found then
    return;
  end if;

  return query
  select alvo.id, c.id, c.nome, c.fuso, alvo.categoria, alvo.motivo, alvo.inicio, alvo.fim_previsto,
         private.nome_do_usuario(u.raw_user_meta_data, u.email)
  from public.consultoria as c
  join auth.users as u on u.id = alvo.aberto_por
  where c.id = alvo.consultoria_id;
end;
$$;

create function public.liberar_aviso_de_emergencia(p_acesso_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.aviso_de_emergencia where id = p_acesso_id
$$;

-- Gatilho: chama a Edge Function pelo pg_net quando ele e os segredos do Vault existem.
create function private.chamar_aviso_de_emergencia()
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
    into v_url using 'suporte_aviso_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_token using 'suporte_aviso_token';
  if v_url is null or v_token is null then
    return null;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, jsonb_build_object('acessoId', new.id),
          jsonb_build_object('Content-Type', 'application/json', 'x-aviso-token', v_token);
  return null;
exception when others then
  -- O aviso nunca impede o acesso (a faixa na tela da Gestão aparece do mesmo jeito).
  return null;
end;
$$;

create trigger acesso_suporte_avisar_emergencia
  after insert on public.acesso_suporte
  for each row
  when (new.modo = 'emergencia')
  execute function private.chamar_aviso_de_emergencia();

revoke all on function public.reservar_aviso_de_emergencia(uuid) from public, anon, authenticated;
revoke all on function public.liberar_aviso_de_emergencia(uuid) from public, anon, authenticated;
revoke all on function private.chamar_aviso_de_emergencia() from public, anon, authenticated;
grant execute on function public.reservar_aviso_de_emergencia(uuid) to service_role;
grant execute on function public.liberar_aviso_de_emergencia(uuid) to service_role;
