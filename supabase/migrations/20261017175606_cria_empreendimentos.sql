-- Empreendimentos (épico 3; EMP-01, EMP-02; ERD v1: CLIENTE / EMPREENDIMENTO / UNIDADE).
-- Cliente contratante é opcional e separado do empreendimento; a interface só pede o nome.
-- Duplicidade de nome ou CNPJ é aviso (consulta), nunca UNIQUE. Unidade é endereço/filial.
-- Qualquer membro ativo cadastra e edita (decisão de 17/10/2026). Escrita só por RPC.

create extension if not exists unaccent with schema extensions;

-- Forma de comparação de nomes: sem acento, minúsculas, espaços colapsados.
-- unaccent com dicionário explícito para poder ser imutável (coluna gerada e índice).
create function private.normalizar_nome(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(
    btrim(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, ''))),
    '[[:space:]]+', ' ', 'g'))
$$;

-- CNPJ só com os 14 caracteres (aceita o CNPJ alfanumérico: 12 letras/dígitos + 2 dígitos).
-- Vazio vira nulo. Validação de formato, nunca consulta externa (fora de escopo).
create function private.normalizar_cnpj(texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(upper(coalesce(texto, '')), '[^0-9A-Z]', '', 'g'), '')
$$;

-- Texto de busca para LIKE, com curingas escapados.
create function private.padrao_de_busca(texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(private.normalizar_nome(texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

revoke all on function private.normalizar_nome(text) from public, anon;
revoke all on function private.normalizar_cnpj(text) from public, anon;
revoke all on function private.padrao_de_busca(text) from public, anon;
grant execute on function private.normalizar_nome(text) to authenticated;
grant execute on function private.normalizar_cnpj(text) to authenticated;
grant execute on function private.padrao_de_busca(text) to authenticated;

-- ---------------------------------------------------------------------------
-- cliente: contratante, opcional. Reaproveitado pelo nome normalizado na consultoria.
-- ---------------------------------------------------------------------------
create table public.cliente (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  nome text not null,
  nome_normalizado text generated always as (private.normalizar_nome(nome)) stored,
  criado_em timestamptz not null default now(),
  constraint cliente_nome_preenchido check (length(btrim(nome)) > 0),
  constraint cliente_consultoria_id_id_key unique (consultoria_id, id),
  constraint cliente_nome_por_consultoria_key unique (consultoria_id, nome_normalizado)
);

comment on table public.cliente is 'Cliente contratante (opcional). Separado do empreendimento desde a primeira migration (ERD v1).';

-- ---------------------------------------------------------------------------
-- empreendimento: dono das licenças e ponto de entrada das telas. Só o nome é obrigatório.
-- ---------------------------------------------------------------------------
create table public.empreendimento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  nome text not null,
  nome_normalizado text generated always as (private.normalizar_nome(nome)) stored,
  cliente_id uuid,
  cnpj text,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  constraint empreendimento_nome_preenchido check (length(btrim(nome)) > 0),
  constraint empreendimento_cnpj_formato check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint empreendimento_consultoria_id_id_key unique (consultoria_id, id),
  constraint empreendimento_cliente_fk foreign key (consultoria_id, cliente_id)
    references public.cliente (consultoria_id, id) on delete restrict,
  constraint empreendimento_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on column public.empreendimento.cnpj is 'Opcional, só os 14 caracteres (numérico ou alfanumérico). Repetido é aviso, não erro.';

create index empreendimento_consultoria_nome_idx on public.empreendimento (consultoria_id, nome_normalizado);
create index empreendimento_consultoria_cnpj_idx on public.empreendimento (consultoria_id, cnpj) where cnpj is not null;

-- ---------------------------------------------------------------------------
-- unidade: endereço/filial do empreendimento. Instrumento, alvará e processo pertencem a uma
-- unidade (épico 4 aponta para (consultoria_id, empreendimento_id, id)).
-- ---------------------------------------------------------------------------
create table public.unidade (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  nome text not null,
  endereco text,
  criado_em timestamptz not null default now(),
  constraint unidade_nome_preenchido check (length(btrim(nome)) > 0),
  constraint unidade_consultoria_id_id_key unique (consultoria_id, id),
  constraint unidade_consultoria_empreendimento_id_key unique (consultoria_id, empreendimento_id, id),
  constraint unidade_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict
);

create index unidade_empreendimento_idx on public.unidade (consultoria_id, empreendimento_id);

-- ---------------------------------------------------------------------------
-- RLS: membro ativo lê; ninguém escreve direto (só pelas RPCs abaixo).
-- ---------------------------------------------------------------------------
alter table public.cliente enable row level security;
alter table public.cliente force row level security;
alter table public.empreendimento enable row level security;
alter table public.empreendimento force row level security;
alter table public.unidade enable row level security;
alter table public.unidade force row level security;

revoke all on table public.cliente from anon, authenticated;
revoke all on table public.empreendimento from anon, authenticated;
revoke all on table public.unidade from anon, authenticated;
grant select on table public.cliente to authenticated;
grant select on table public.empreendimento to authenticated;
grant select on table public.unidade to authenticated;

create policy cliente_select_membro_ativo
  on public.cliente for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create policy empreendimento_select_membro_ativo
  on public.empreendimento for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create policy unidade_select_membro_ativo
  on public.unidade for select to authenticated
  using ((select private.is_membro(consultoria_id)));

-- ---------------------------------------------------------------------------
-- Helpers de escrita
-- ---------------------------------------------------------------------------
-- Cliente pelo nome (reaproveita o existente com o mesmo nome normalizado). Vazio: nulo.
create function private.cliente_pelo_nome(cid uuid, nome text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  nome_limpo text := btrim(coalesce(nome, ''));
  encontrado uuid;
begin
  if nome_limpo = '' then
    return null;
  end if;

  insert into public.cliente (consultoria_id, nome)
  values (cid, nome_limpo)
  on conflict (consultoria_id, nome_normalizado) do nothing;

  select c.id into encontrado
  from public.cliente as c
  where c.consultoria_id = cid and c.nome_normalizado = private.normalizar_nome(nome_limpo);

  return encontrado;
end;
$$;

create function private.cnpj_valido(cnpj text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalizado text := private.normalizar_cnpj(cnpj);
begin
  if normalizado is not null and normalizado !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    raise exception 'cnpj_invalido' using errcode = '22023';
  end if;
  return normalizado;
end;
$$;

revoke all on function private.cliente_pelo_nome(uuid, text) from public, anon, authenticated;
revoke all on function private.cnpj_valido(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: criar empreendimento (com cliente e primeira unidade opcionais), numa transação.
-- Idempotente pelo id gerado no cliente: repetir devolve o mesmo empreendimento.
-- ---------------------------------------------------------------------------
create function public.criar_empreendimento(
  p_id uuid,
  p_consultoria_id uuid,
  p_nome text,
  p_cliente text default null,
  p_cnpj text default null,
  p_primeira_unidade text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
  novo uuid := coalesce(p_id, gen_random_uuid());
  nome_limpo text := btrim(coalesce(p_nome, ''));
  unidade_limpa text := btrim(coalesce(p_primeira_unidade, ''));
  cnpj_limpo text;
  existente uuid;
begin
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select e.consultoria_id into existente from public.empreendimento as e where e.id = novo;
  if found then
    if existente = p_consultoria_id then
      return novo;
    end if;
    raise exception 'empreendimento_existente' using errcode = 'P0001';
  end if;

  if nome_limpo = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;
  cnpj_limpo := private.cnpj_valido(p_cnpj);

  insert into public.empreendimento (id, consultoria_id, nome, cliente_id, cnpj, criado_por)
  values (novo, p_consultoria_id, nome_limpo, private.cliente_pelo_nome(p_consultoria_id, p_cliente),
          cnpj_limpo, autor);

  if unidade_limpa <> '' then
    insert into public.unidade (consultoria_id, empreendimento_id, nome)
    values (p_consultoria_id, novo, unidade_limpa);
  end if;

  return novo;
end;
$$;

-- RPC: editar nome, cliente e CNPJ. Cliente vazio desfaz a ligação (o cliente fica).
create function public.editar_empreendimento(p_id uuid, p_nome text, p_cliente text, p_cnpj text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  nome_limpo text := btrim(coalesce(p_nome, ''));
  cnpj_limpo text;
begin
  select e.consultoria_id into cid from public.empreendimento as e where e.id = p_id;
  if cid is null or not private.is_membro(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if nome_limpo = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;
  cnpj_limpo := private.cnpj_valido(p_cnpj);

  update public.empreendimento as e
  set nome = nome_limpo,
      cliente_id = private.cliente_pelo_nome(cid, p_cliente),
      cnpj = cnpj_limpo
  where e.id = p_id;
end;
$$;

-- RPC: criar unidade. Idempotente pelo id gerado no cliente.
create function public.criar_unidade(
  p_id uuid,
  p_empreendimento_id uuid,
  p_nome text,
  p_endereco text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  nova uuid := coalesce(p_id, gen_random_uuid());
  nome_limpo text := btrim(coalesce(p_nome, ''));
  existente uuid;
begin
  select e.consultoria_id into cid from public.empreendimento as e where e.id = p_empreendimento_id;
  if cid is null or not private.is_membro(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select u.empreendimento_id into existente from public.unidade as u where u.id = nova;
  if found then
    if existente = p_empreendimento_id then
      return nova;
    end if;
    raise exception 'unidade_existente' using errcode = 'P0001';
  end if;

  if nome_limpo = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  insert into public.unidade (id, consultoria_id, empreendimento_id, nome, endereco)
  values (nova, cid, p_empreendimento_id, nome_limpo, nullif(btrim(coalesce(p_endereco, '')), ''));

  return nova;
end;
$$;

create function public.editar_unidade(p_id uuid, p_nome text, p_endereco text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  nome_limpo text := btrim(coalesce(p_nome, ''));
begin
  select u.consultoria_id into cid from public.unidade as u where u.id = p_id;
  if cid is null or not private.is_membro(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if nome_limpo = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  update public.unidade as u
  set nome = nome_limpo, endereco = nullif(btrim(coalesce(p_endereco, '')), '')
  where u.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura (security invoker: a RLS de quem chama decide o que aparece)
-- ---------------------------------------------------------------------------
-- Carteira paginada, com busca por empreendimento ou cliente, e total para o rodapé.
create function public.listar_empreendimentos(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  cliente_nome text,
  cnpj text,
  unidades bigint,
  criado_em timestamptz,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select
    e.id,
    e.nome,
    cl.nome,
    e.cnpj,
    (select count(*) from public.unidade as u
     where u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id),
    e.criado_em,
    count(*) over ()
  from public.empreendimento as e
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  where e.consultoria_id = p_consultoria_id
    and (
      btrim(coalesce(p_busca, '')) = ''
      or e.nome_normalizado like private.padrao_de_busca(p_busca)
      or cl.nome_normalizado like private.padrao_de_busca(p_busca)
    )
  order by e.nome_normalizado, e.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- Possíveis duplicados (aviso antes de criar ou salvar; nunca bloqueia).
create function public.empreendimentos_parecidos(
  p_consultoria_id uuid,
  p_nome text,
  p_cnpj text default null,
  p_ignorar uuid default null
)
returns table (id uuid, nome text, mesmo_nome boolean, mesmo_cnpj boolean)
language sql
stable
set search_path = ''
as $$
  select
    e.id,
    e.nome,
    e.nome_normalizado = private.normalizar_nome(p_nome),
    coalesce(e.cnpj = private.normalizar_cnpj(p_cnpj), false)
  from public.empreendimento as e
  where e.consultoria_id = p_consultoria_id
    and e.id is distinct from p_ignorar
    and (
      (btrim(coalesce(p_nome, '')) <> '' and e.nome_normalizado = private.normalizar_nome(p_nome))
      or (private.normalizar_cnpj(p_cnpj) is not null and e.cnpj = private.normalizar_cnpj(p_cnpj))
    )
  order by e.nome_normalizado
  limit 5
$$;

-- ---------------------------------------------------------------------------
-- Permissões das RPCs: só usuário logado.
-- ---------------------------------------------------------------------------
revoke all on function public.criar_empreendimento(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.editar_empreendimento(uuid, text, text, text) from public, anon;
revoke all on function public.criar_unidade(uuid, uuid, text, text) from public, anon;
revoke all on function public.editar_unidade(uuid, text, text) from public, anon;
revoke all on function public.listar_empreendimentos(uuid, text, integer, integer) from public, anon;
revoke all on function public.empreendimentos_parecidos(uuid, text, text, uuid) from public, anon;

grant execute on function public.criar_empreendimento(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.editar_empreendimento(uuid, text, text, text) to authenticated;
grant execute on function public.criar_unidade(uuid, uuid, text, text) to authenticated;
grant execute on function public.editar_unidade(uuid, text, text) to authenticated;
grant execute on function public.listar_empreendimentos(uuid, text, integer, integer) to authenticated;
grant execute on function public.empreendimentos_parecidos(uuid, text, text, uuid) to authenticated;
