-- Lista de espera (ADR-0032 e ADR-0034): limites contra abuso e aviso agrupado.
--
-- 1. Teto por origem. entrar_lista_de_espera é aberta para anon. O único limite era um teto
--    global de 200 cadastros por hora, e um robô sozinho o enchia e travava os visitantes de
--    verdade. Agora cada origem (o IP de quem chama, lido dos headers da requisição que o
--    PostgREST expõe em request.headers) tem até 10 tentativas por hora. O teto global sobe para
--    1000 cadastros por hora e só fica como proteção final. Contato repetido continua sem gravar
--    de novo (unique no contato normalizado).
--    O IP nunca é gravado: só um hash, e as tentativas com mais de 1 hora são apagadas.
--    Sem header de IP (ex.: chamada interna), vale só o teto global.
-- 2. Aviso agrupado. O gatilho chamava a Edge Function avisar-lista-de-espera a cada cadastro, e
--    dois cadastros ao mesmo tempo geravam dois e-mails. Agora o gatilho só chama se não chamou
--    nos últimos 10 minutos (no máximo 6 e-mails por hora). A reserva é uma atualização atômica
--    de uma linha só: dois cadastros simultâneos não disparam juntos. Os cadastros desse intervalo
--    continuam pendentes e vão juntos no próximo aviso; a central sempre mostra a lista inteira.

-- ---------------------------------------------------------------------------
-- 1. Teto por origem
-- ---------------------------------------------------------------------------
create table private.lista_de_espera_tentativa (
  origem text not null,
  criada_em timestamptz not null default now(),
  constraint lista_de_espera_tentativa_origem check (length(origem) = 32)
);

comment on table private.lista_de_espera_tentativa is
  'Tentativas de entrar na lista de espera na última hora, por hash da origem (IP). Só para o teto por origem; apagadas depois de 1 hora. Ver ADR-0032.';

create index lista_de_espera_tentativa_origem_idx
  on private.lista_de_espera_tentativa (origem, criada_em);

alter table private.lista_de_espera_tentativa enable row level security;
alter table private.lista_de_espera_tentativa force row level security;
revoke all on table private.lista_de_espera_tentativa from public, anon, authenticated;

-- Hash da origem da requisição, ou nulo sem header de IP. cf-connecting-ip e x-real-ip vêm do
-- proxy; x-forwarded-for fica por último (o primeiro item pode vir do próprio cliente).
create function private.origem_da_requisicao()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cabecalhos jsonb;
  v_ip text;
begin
  begin
    v_cabecalhos := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_cabecalhos is null then
    return null;
  end if;
  v_ip := btrim(coalesce(
    nullif(btrim(v_cabecalhos ->> 'cf-connecting-ip'), ''),
    nullif(btrim(v_cabecalhos ->> 'x-real-ip'), ''),
    split_part(coalesce(v_cabecalhos ->> 'x-forwarded-for', ''), ',', 1)
  ));
  if v_ip = '' then
    return null;
  end if;
  return md5('lista_de_espera:' || v_ip);
end;
$$;

revoke all on function private.origem_da_requisicao() from public, anon, authenticated;

-- Mesma validação e normalização de 20261115010000_lista_de_espera.sql; mudam só os tetos.
create or replace function public.entrar_lista_de_espera(p_nome text, p_contato text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_bruto text := btrim(coalesce(p_contato, ''));
  v_digitos text;
  v_contato text;
  v_tipo text;
  v_origem text;
begin
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;

  if position('@' in v_bruto) > 0 then
    v_contato := lower(v_bruto);
    if length(v_contato) > 254 or v_contato !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'contato_invalido' using errcode = '22023';
    end if;
    v_tipo := 'email';
  else
    v_digitos := regexp_replace(v_bruto, '\D', '', 'g');
    if length(v_digitos) in (10, 11) then
      v_digitos := '55' || v_digitos;
    end if;
    if v_digitos !~ '^55[1-9][0-9][0-9]{8,9}$' then
      raise exception 'contato_invalido' using errcode = '22023';
    end if;
    v_contato := v_digitos;
    v_tipo := 'whatsapp';
  end if;

  -- Teto por origem: 10 tentativas por hora (contato repetido conta). Serializado por origem.
  v_origem := private.origem_da_requisicao();
  if v_origem is not null then
    perform pg_advisory_xact_lock(hashtext(v_origem));
    delete from private.lista_de_espera_tentativa where criada_em < now() - interval '1 hour';
    if (select count(*) from private.lista_de_espera_tentativa as t
        where t.origem = v_origem and t.criada_em > now() - interval '1 hour') >= 10 then
      raise exception 'muitas_tentativas' using errcode = 'P0001';
    end if;
    insert into private.lista_de_espera_tentativa (origem) values (v_origem);
  end if;

  -- Teto global, só como proteção final.
  if (select count(*) from private.lista_de_espera where criada_em > now() - interval '1 hour') >= 1000 then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;

  insert into private.lista_de_espera (nome, contato, tipo_contato)
  values (v_nome, v_contato, v_tipo)
  on conflict (contato) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Aviso agrupado: no máximo um disparo a cada 10 minutos
-- ---------------------------------------------------------------------------
create table private.lista_de_espera_aviso (
  id boolean primary key default true,
  disparado_em timestamptz not null default '-infinity',
  constraint lista_de_espera_aviso_uma_linha check (id)
);

comment on table private.lista_de_espera_aviso is
  'Último disparo do aviso de cadastro novo da lista de espera (uma linha). O gatilho só chama a Edge Function de novo depois de 10 minutos. Ver ADR-0034.';

insert into private.lista_de_espera_aviso (id) values (true);

alter table private.lista_de_espera_aviso enable row level security;
alter table private.lista_de_espera_aviso force row level security;
revoke all on table private.lista_de_espera_aviso from public, anon, authenticated;

-- Verdadeiro para quem pode disparar agora. Atualização atômica: o segundo cadastro simultâneo
-- espera o primeiro e, já com o instante novo, não atualiza.
create function private.reservar_aviso_da_lista_de_espera()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.lista_de_espera_aviso
  set disparado_em = now()
  where id and disparado_em < now() - interval '10 minutes';
  return found;
end;
$$;

revoke all on function private.reservar_aviso_da_lista_de_espera() from public, anon, authenticated;

-- Mesmo gatilho de 20261115040000_lista_de_espera_contato_e_convite.sql, com a reserva antes do
-- pg_net.
create or replace function private.chamar_aviso_da_lista_de_espera()
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
  -- Avisou há menos de 10 minutos: os cadastros novos ficam pendentes para o próximo aviso.
  if not private.reservar_aviso_da_lista_de_espera() then
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

revoke all on function private.chamar_aviso_da_lista_de_espera() from public, anon, authenticated;
