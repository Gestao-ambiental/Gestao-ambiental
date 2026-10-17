-- Acesso e equipe (épico 2; ACC-01 a ACC-04; ADR-0004, ADR-0005, ADR-0010).
-- membro ganha nome e e-mail (copiados de auth.users) para a tela Equipe.
-- convite: guarda só o hash do token; vale 7 dias (Protótipo 07).
-- Criar consultoria, convidar, aceitar, mudar papel e desligar são RPCs em transação;
-- o cliente continua sem grant de escrita em consultoria, membro e convite.
-- Erros de regra saem com mensagem estável (ex.: 'ultima_gestao') para o front traduzir.

-- ---------------------------------------------------------------------------
-- Nome e e-mail no vínculo. O que uma consultoria enxerga da pessoa é o que está no vínculo
-- com ela (mesma RLS de membro, com consultoria_id). Fonte: auth.users, copiada por trigger
-- ao criar o vínculo e a cada mudança de nome ou e-mail da conta.
-- ---------------------------------------------------------------------------
-- Nome exibido: o informado no cadastro; sem ele, a parte local do e-mail (nunca vazio).
create function private.nome_do_usuario(metadados jsonb, email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(metadados ->> 'nome'), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Sem nome'
  )
$$;

alter table public.membro
  add column nome text,
  add column email text;

update public.membro as m
set nome = private.nome_do_usuario(u.raw_user_meta_data, u.email),
    email = lower(coalesce(u.email, ''))
from auth.users as u
where u.id = m.usuario_id;

alter table public.membro
  alter column nome set not null,
  alter column email set not null;

comment on column public.membro.nome is 'Cópia do nome da conta (auth.users), mantida por trigger. Exibição; autoria é sempre membro.id.';
comment on column public.membro.email is 'Cópia do e-mail da conta (auth.users), em minúsculas, mantida por trigger.';

create function private.preencher_identidade_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select private.nome_do_usuario(u.raw_user_meta_data, u.email), lower(coalesce(u.email, ''))
  into new.nome, new.email
  from auth.users as u
  where u.id = new.usuario_id;
  return new;
end;
$$;

create trigger membro_preencher_identidade
  before insert or update of usuario_id on public.membro
  for each row execute function private.preencher_identidade_membro();

create function private.sincronizar_identidade_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.membro as m
  set nome = private.nome_do_usuario(new.raw_user_meta_data, new.email),
      email = lower(coalesce(new.email, ''))
  where m.usuario_id = new.id
    and (m.nome, m.email) is distinct from
        (private.nome_do_usuario(new.raw_user_meta_data, new.email), lower(coalesce(new.email, '')));
  return null;
end;
$$;

revoke all on function private.nome_do_usuario(jsonb, text) from public, anon, authenticated;
revoke all on function private.preencher_identidade_membro() from public, anon, authenticated;
revoke all on function private.sincronizar_identidade_membro() from public, anon, authenticated;

create trigger membro_sincronizar_identidade
  after update of email, raw_user_meta_data on auth.users
  for each row execute function private.sincronizar_identidade_membro();

-- ---------------------------------------------------------------------------
-- Auditoria: a trigger genérica passa a aceitar colunas omitidas (a partir do 2º argumento),
-- para nunca registrar hash de token. Uso: private.auditar('consultoria_id', 'token_hash').
-- ---------------------------------------------------------------------------
create or replace function private.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coluna_consultoria text := coalesce(tg_argv[0], 'consultoria_id');
  antes jsonb;
  depois jsonb;
  registro jsonb;
  cid uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    antes := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    depois := to_jsonb(new);
  end if;

  registro := coalesce(depois, antes);
  cid := (registro ->> coluna_consultoria)::uuid;

  for i in 1 .. tg_nargs - 1 loop
    antes := antes - tg_argv[i];
    depois := depois - tg_argv[i];
  end loop;

  if tg_op = 'UPDATE' and antes = depois then
    return null;
  end if;

  insert into public.auditoria (consultoria_id, entidade, entidade_id, acao, ator_membro_id, antes, depois, motivo)
  values (
    cid,
    tg_table_name,
    (registro ->> 'id')::uuid,
    lower(tg_op)::public.acao_auditoria,
    private.membro_atual(cid),
    antes,
    depois,
    nullif(current_setting('gestao_ambiental.motivo', true), '')
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- convite: uso único, validade de 7 dias. "Expirado" é calculado (expira_em), nunca gravado.
-- Reenviar troca o token (hash novo) e renova a validade.
-- ---------------------------------------------------------------------------
create type public.situacao_convite as enum ('pendente', 'aceito', 'cancelado');

create table public.convite (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  email text not null,
  papel public.papel_membro not null,
  token_hash text not null,
  situacao public.situacao_convite not null default 'pendente',
  convidado_por uuid not null,
  enviado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  aceito_por uuid,
  cancelado_em timestamptz,
  constraint convite_consultoria_id_id_key unique (consultoria_id, id),
  constraint convite_token_hash_key unique (token_hash),
  constraint convite_email_normalizado check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint convite_convidado_por_fk foreign key (consultoria_id, convidado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint convite_aceito_por_fk foreign key (consultoria_id, aceito_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint convite_aceite_coerente check ((situacao = 'aceito') = (aceito_em is not null and aceito_por is not null)),
  constraint convite_cancelamento_coerente check ((situacao = 'cancelado') = (cancelado_em is not null)),
  constraint convite_validade_posterior check (expira_em > enviado_em)
);

-- Um convite pendente por e-mail em cada consultoria.
create unique index convite_pendente_por_email_key on public.convite (consultoria_id, email) where situacao = 'pendente';
create index convite_consultoria_situacao_idx on public.convite (consultoria_id, situacao, enviado_em desc);

comment on table public.convite is 'Convite por e-mail com papel. Guarda só o SHA-256 do token; o token sai uma vez, na RPC que o cria ou reenvia.';
comment on column public.convite.expira_em is 'Instante de expiração. Expirado = pendente com expira_em <= now() (calculado).';

alter table public.convite enable row level security;
alter table public.convite force row level security;

revoke all on table public.convite from anon, authenticated;
grant select on table public.convite to authenticated;

-- Só a Gestão vê os convites da consultoria (a tela Equipe é dela).
create policy convite_select_gestao
  on public.convite
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

create trigger convite_auditar
  after insert or update or delete on public.convite
  for each row execute function private.auditar('consultoria_id', 'token_hash');

-- ---------------------------------------------------------------------------
-- Helpers de convite
-- ---------------------------------------------------------------------------
create function private.validade_do_convite()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '7 days'
$$;

create function private.hash_do_token(token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex')
$$;

create function private.novo_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(32), 'hex')
$$;

create function private.email_valido(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$', false)
$$;

revoke all on function private.validade_do_convite() from public, anon, authenticated;
revoke all on function private.hash_do_token(text) from public, anon, authenticated;
revoke all on function private.novo_token() from public, anon, authenticated;
revoke all on function private.email_valido(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: criar consultoria. Quem cria vira a Gestão. Idempotente pelo id gerado no cliente:
-- repetir a chamada devolve a mesma consultoria em vez de criar outra.
-- ---------------------------------------------------------------------------
create function public.criar_consultoria(p_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := auth.uid();
  nome_limpo text := btrim(coalesce(p_nome, ''));
  nova uuid := coalesce(p_id, gen_random_uuid());
begin
  if usuario is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if nome_limpo = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  if exists (select 1 from public.consultoria as c where c.id = nova) then
    if exists (
      select 1 from public.membro as m
      where m.consultoria_id = nova and m.usuario_id = usuario and m.papel = 'gestao' and m.situacao = 'ativo'
    ) then
      return nova;
    end if;
    raise exception 'consultoria_existente' using errcode = 'P0001';
  end if;

  insert into public.consultoria (id, nome) values (nova, nome_limpo);
  insert into public.membro (consultoria_id, usuario_id, papel) values (nova, usuario, 'gestao');

  return nova;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: criar convite (Gestão). Devolve o token em claro uma única vez, para o link do e-mail.
-- ---------------------------------------------------------------------------
create function public.criar_convite(p_consultoria_id uuid, p_email text, p_papel public.papel_membro)
returns table (convite_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
  email_limpo text := lower(btrim(coalesce(p_email, '')));
  token_novo text := private.novo_token();
  novo uuid;
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not private.email_valido(email_limpo) then
    raise exception 'email_invalido' using errcode = '22023';
  end if;
  if p_papel is null then
    raise exception 'papel_obrigatorio' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.membro as m
    where m.consultoria_id = p_consultoria_id and m.situacao = 'ativo' and m.email = email_limpo
  ) then
    raise exception 'ja_e_membro' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.convite as c
    where c.consultoria_id = p_consultoria_id and c.email = email_limpo and c.situacao = 'pendente'
  ) then
    raise exception 'convite_pendente_existe' using errcode = 'P0001';
  end if;

  insert into public.convite (consultoria_id, email, papel, token_hash, convidado_por, expira_em)
  values (p_consultoria_id, email_limpo, p_papel, private.hash_do_token(token_novo), autor,
          now() + private.validade_do_convite())
  returning id into novo;

  return query select novo, token_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reenviar convite pendente (mesmo expirado). Gera token novo e renova a validade;
-- o link anterior deixa de valer. Convite inexistente ou de outra consultoria: sem_permissao.
-- ---------------------------------------------------------------------------
create function public.reenviar_convite(p_convite_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.convite;
  token_novo text := private.novo_token();
begin
  select * into alvo from public.convite as c where c.id = p_convite_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'pendente' then
    raise exception 'convite_indisponivel' using errcode = 'P0001';
  end if;

  update public.convite as c
  set token_hash = private.hash_do_token(token_novo),
      enviado_em = now(),
      expira_em = now() + private.validade_do_convite()
  where c.id = alvo.id;

  return token_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar convite pendente. Repetir é inofensivo.
-- ---------------------------------------------------------------------------
create function public.cancelar_convite(p_convite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.convite;
begin
  select * into alvo from public.convite as c where c.id = p_convite_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao = 'cancelado' then
    return;
  end if;
  if alvo.situacao = 'aceito' then
    raise exception 'convite_indisponivel' using errcode = 'P0001';
  end if;

  update public.convite as c
  set situacao = 'cancelado', cancelado_em = now()
  where c.id = alvo.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: consultar convite pelo token (também sem login: a pessoa pode ainda não ter conta).
-- Devolve só o necessário para a tela do convite. Token desconhecido: zero linhas.
-- ---------------------------------------------------------------------------
create function public.consultar_convite(p_token text)
returns table (
  consultoria_nome text,
  consultoria_fuso text,
  convidado_por_nome text,
  email text,
  papel public.papel_membro,
  situacao text,
  expira_em timestamptz,
  conta_com_senha boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    co.nome,
    co.fuso,
    m.nome,
    c.email,
    c.papel,
    case
      when c.situacao = 'pendente' and c.expira_em <= now() then 'expirado'
      else c.situacao::text
    end,
    c.expira_em,
    exists (
      select 1 from auth.users as au
      where lower(au.email) = c.email and coalesce(au.encrypted_password, '') <> ''
    )
  from public.convite as c
  join public.consultoria as co on co.id = c.consultoria_id
  join public.membro as m on m.consultoria_id = c.consultoria_id and m.id = c.convidado_por
  where c.token_hash = private.hash_do_token(p_token)
$$;

-- ---------------------------------------------------------------------------
-- RPC: aceitar convite. Exige login com o mesmo e-mail do convite, já confirmado.
-- Cria o vínculo ou reativa o de quem foi desligado (mesmo membro_id: a autoria antiga
-- continua ligada à pessoa). Repetir o aceite devolve a mesma consultoria.
-- ---------------------------------------------------------------------------
create function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := auth.uid();
  email_usuario text;
  confirmado_em timestamptz;
  alvo public.convite;
  vinculo public.membro;
  vinculo_id uuid;
begin
  if usuario is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select lower(u.email), u.email_confirmed_at into email_usuario, confirmado_em
  from auth.users as u where u.id = usuario;

  select * into alvo from public.convite as c
  where c.token_hash = private.hash_do_token(p_token)
  for update;
  if not found then
    raise exception 'convite_invalido' using errcode = 'P0001';
  end if;

  if alvo.email is distinct from email_usuario then
    raise exception 'convite_de_outra_conta' using errcode = 'P0001';
  end if;
  if confirmado_em is null then
    raise exception 'email_nao_confirmado' using errcode = 'P0001';
  end if;

  if alvo.situacao = 'aceito' then
    if exists (select 1 from public.membro as m where m.id = alvo.aceito_por and m.usuario_id = usuario) then
      return alvo.consultoria_id;
    end if;
    raise exception 'convite_indisponivel' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'cancelado' then
    raise exception 'convite_indisponivel' using errcode = 'P0001';
  end if;
  if alvo.expira_em <= now() then
    raise exception 'convite_expirado' using errcode = 'P0001';
  end if;

  select * into vinculo from public.membro as m
  where m.consultoria_id = alvo.consultoria_id and m.usuario_id = usuario
  for update;

  if found then
    vinculo_id := vinculo.id;
    if vinculo.situacao = 'desligado' then
      update public.membro as m
      set situacao = 'ativo', desligado_em = null, papel = alvo.papel
      where m.id = vinculo_id;
    end if;
  else
    insert into public.membro (consultoria_id, usuario_id, papel)
    values (alvo.consultoria_id, usuario, alvo.papel)
    returning id into vinculo_id;
  end if;

  update public.convite as c
  set situacao = 'aceito', aceito_em = now(), aceito_por = vinculo_id
  where c.id = alvo.id;

  return alvo.consultoria_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gestão de vínculos. As duas RPCs travam as linhas de Gestão ativas da consultoria antes de
-- contar, para que duas Gestões não se rebaixem ao mesmo tempo e deixem a consultoria sem nenhuma.
-- ---------------------------------------------------------------------------
create function private.travar_gestao(cid uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  total integer;
begin
  perform 1 from public.membro as m
  where m.consultoria_id = cid and m.situacao = 'ativo' and m.papel = 'gestao'
  for update;

  select count(*) into total from public.membro as m
  where m.consultoria_id = cid and m.situacao = 'ativo' and m.papel = 'gestao';

  return total;
end;
$$;

revoke all on function private.travar_gestao(uuid) from public, anon, authenticated;

create function public.alterar_papel(p_membro_id uuid, p_papel public.papel_membro)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  alvo public.membro;
  gestoes integer;
begin
  select m.consultoria_id into cid from public.membro as m where m.id = p_membro_id;
  if cid is null or not private.is_gestao(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_papel is null then
    raise exception 'papel_obrigatorio' using errcode = '22023';
  end if;

  gestoes := private.travar_gestao(cid);
  select * into alvo from public.membro as m where m.id = p_membro_id for update;

  if alvo.situacao <> 'ativo' then
    raise exception 'membro_desligado' using errcode = 'P0001';
  end if;
  if alvo.papel = p_papel then
    return;
  end if;
  if alvo.papel = 'gestao' and gestoes <= 1 then
    raise exception 'ultima_gestao' using errcode = 'P0001';
  end if;

  update public.membro as m set papel = p_papel where m.id = alvo.id;
end;
$$;

-- Desligar muda a situação, nunca apaga: a autoria fica, o acesso acaba na próxima requisição
-- (as políticas só aceitam vínculo ativo). Repetir é inofensivo.
create function public.desligar_membro(p_membro_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  alvo public.membro;
  gestoes integer;
begin
  select m.consultoria_id into cid from public.membro as m where m.id = p_membro_id;
  if cid is null or not private.is_gestao(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  gestoes := private.travar_gestao(cid);
  select * into alvo from public.membro as m where m.id = p_membro_id for update;

  if alvo.situacao = 'desligado' then
    return;
  end if;
  if alvo.papel = 'gestao' and gestoes <= 1 then
    raise exception 'ultima_gestao' using errcode = 'P0001';
  end if;

  perform set_config('gestao_ambiental.motivo', coalesce(nullif(btrim(p_motivo), ''), ''), true);

  update public.membro as m
  set situacao = 'desligado', desligado_em = now()
  where m.id = alvo.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: meus vínculos, ativos e encerrados, para escolher consultoria (ACC-04).
-- security definer porque o vínculo encerrado não passa mais na RLS de consultoria;
-- devolve só o nome dela, o papel e quando o acesso terminou.
-- ---------------------------------------------------------------------------
create function public.meus_vinculos()
returns table (
  membro_id uuid,
  consultoria_id uuid,
  consultoria_nome text,
  consultoria_fuso text,
  papel public.papel_membro,
  situacao public.situacao_membro,
  desligado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, c.id, c.nome, c.fuso, m.papel, m.situacao, m.desligado_em
  from public.membro as m
  join public.consultoria as c on c.id = m.consultoria_id
  where m.usuario_id = (select auth.uid())
  order by (m.situacao = 'ativo') desc, c.nome
$$;

-- ---------------------------------------------------------------------------
-- Permissões das RPCs: só usuário logado; consultar_convite também sem login.
-- ---------------------------------------------------------------------------
revoke all on function public.criar_consultoria(uuid, text) from public, anon;
revoke all on function public.criar_convite(uuid, text, public.papel_membro) from public, anon;
revoke all on function public.reenviar_convite(uuid) from public, anon;
revoke all on function public.cancelar_convite(uuid) from public, anon;
revoke all on function public.consultar_convite(text) from public;
revoke all on function public.aceitar_convite(text) from public, anon;
revoke all on function public.alterar_papel(uuid, public.papel_membro) from public, anon;
revoke all on function public.desligar_membro(uuid, text) from public, anon;
revoke all on function public.meus_vinculos() from public, anon;

grant execute on function public.criar_consultoria(uuid, text) to authenticated;
grant execute on function public.criar_convite(uuid, text, public.papel_membro) to authenticated;
grant execute on function public.reenviar_convite(uuid) to authenticated;
grant execute on function public.cancelar_convite(uuid) to authenticated;
grant execute on function public.consultar_convite(text) to anon, authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.alterar_papel(uuid, public.papel_membro) to authenticated;
grant execute on function public.desligar_membro(uuid, text) to authenticated;
grant execute on function public.meus_vinculos() to authenticated;
