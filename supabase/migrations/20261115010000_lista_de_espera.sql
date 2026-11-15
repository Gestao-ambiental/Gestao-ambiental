-- Lista de espera do site (gramaapp.com.br/lista-de-espera; ADR-0032).
--
-- O site trocou o "Acessar beta" por um cadastro de espera com nome e um contato (e-mail ou
-- WhatsApp). Quem se cadastra ainda não tem conta, então a gravação é uma RPC aberta para anon,
-- security definer, que valida, normaliza e grava numa tabela do schema private (fora da API).
-- Só o operador da plataforma, com dois fatores, lê a lista pela central.
--
--   entrar_lista_de_espera(nome, contato)   anon e logado; idempotente pelo contato normalizado
--   central_lista_de_espera(limite, desl.)  operador; paginada, mais recentes primeiro
--
-- Contato repetido não grava de novo nem avisa (não revela quem já está na lista). Um teto de
-- cadastros por hora segura robô sem precisar de captcha no protótipo.

-- ---------------------------------------------------------------------------
-- 1. Tabela (schema private: sem acesso direto de anon ou authenticated).
-- ---------------------------------------------------------------------------
create table private.lista_de_espera (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text not null,
  tipo_contato text not null,
  criada_em timestamptz not null default now(),
  constraint lista_de_espera_nome check (length(btrim(nome)) between 2 and 120),
  constraint lista_de_espera_tipo check (tipo_contato in ('email', 'whatsapp')),
  constraint lista_de_espera_contato check (length(contato) between 6 and 254),
  constraint lista_de_espera_contato_unico unique (contato)
);

comment on table private.lista_de_espera is
  'Cadastros da lista de espera do site (ADR-0032). Contato normalizado: e-mail em minúsculas ou WhatsApp só com dígitos e DDI.';

create index lista_de_espera_criada_em_idx on private.lista_de_espera (criada_em desc, id);

alter table private.lista_de_espera enable row level security;
alter table private.lista_de_espera force row level security;
revoke all on table private.lista_de_espera from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC pública: entrar na lista. Mesma regra de contato do domínio (lista-de-espera.ts).
-- ---------------------------------------------------------------------------
create function public.entrar_lista_de_espera(p_nome text, p_contato text)
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

  if (select count(*) from private.lista_de_espera where criada_em > now() - interval '1 hour') >= 200 then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;

  insert into private.lista_de_espera (nome, contato, tipo_contato)
  values (v_nome, v_contato, v_tipo)
  on conflict (contato) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Central: só o operador com dois fatores lê.
-- ---------------------------------------------------------------------------
create function public.central_lista_de_espera(
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  contato text,
  tipo_contato text,
  criada_em timestamptz,
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
  select l.id, l.nome, l.contato, l.tipo_contato, l.criada_em, count(*) over ()
  from private.lista_de_espera as l
  order by l.criada_em desc, l.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

revoke all on function public.entrar_lista_de_espera(text, text) from public;
revoke all on function public.central_lista_de_espera(integer, integer) from public, anon;
grant execute on function public.entrar_lista_de_espera(text, text) to anon, authenticated;
grant execute on function public.central_lista_de_espera(integer, integer) to authenticated;
