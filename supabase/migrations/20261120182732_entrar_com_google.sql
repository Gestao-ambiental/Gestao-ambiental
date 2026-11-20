-- Entrar com Google (ADR-0040). Duas mudanças pequenas para quem entra pelo Google:
-- 1. O nome da pessoa: o Google manda "full_name" e "name" nos metadados (o cadastro por senha
--    manda "nome"). Sem isso, o membro ficaria com o pedaço do e-mail antes do @.
-- 2. O convite: "conta_com_senha" passa a valer também para quem já entra pelo Google (tem uma
--    identidade de outro provedor). Assim o convite não pede para criar senha a quem não precisa;
--    a pessoa só aceita. O nome da coluna fica (o front já lê); o sentido é "conta pronta para entrar".

create or replace function private.nome_do_usuario(metadados jsonb, email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(metadados ->> 'nome'), ''),
    nullif(btrim(metadados ->> 'full_name'), ''),
    nullif(btrim(metadados ->> 'name'), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Sem nome'
  )
$$;

create or replace function public.consultar_convite(p_token text)
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
      where lower(au.email) = c.email
        and (
          coalesce(au.encrypted_password, '') <> ''
          or exists (
            select 1 from auth.identities as i
            where i.user_id = au.id and i.provider <> 'email'
          )
        )
    )
  from public.convite as c
  join public.consultoria as co on co.id = c.consultoria_id
  join public.membro as m on m.consultoria_id = c.consultoria_id and m.id = c.convidado_por
  where c.token_hash = private.hash_do_token(p_token)
$$;

revoke all on function private.nome_do_usuario(jsonb, text) from public, anon, authenticated;
revoke all on function public.consultar_convite(text) from public;
grant execute on function public.consultar_convite(text) to anon, authenticated;
