-- Acesso pago (ADR-0058): ninguém cria conta, abre consultoria e usa sem pagar.
--
-- 1. Durante o beta, abrir consultoria exige convite do beta: de uso único, para o e-mail
--    convidado (verificado). O convite nasce quando a Central convida da lista de espera
--    (central_registrar_convite) ou quando o operador emite um (central_emitir_convite_do_beta).
--    Operador da plataforma não precisa de convite.
-- 2. O beta grátis vale só para a consultoria aberta com convite do beta. As consultorias que já
--    existem ficam como 'anterior' e continuam em beta. Sem linha = anterior (seed e dados antigos).
-- 3. Um teste por pessoa e por CNPJ: quem já foi Gestão de outra consultoria não interna, o e-mail
--    que já ganhou teste e o CNPJ que já ganhou teste abrem consultoria sem teste (precisa de plano).
--    O CNPJ é pedido, validado e guardado só como HMAC com segredo do banco; nunca em claro.
--    E-mail também só em HMAC no registro de testes. Nada de CPF.
--
-- public.abrir_consultoria(p_id, p_nome, p_cnpj) substitui public.criar_consultoria(p_id, p_nome),
-- que continua existindo (mesma assinatura) mas recusa consultoria nova sem CNPJ.
-- Regra pura espelhada em packages/domain/src/acesso-pago.ts.

-- ---------------------------------------------------------------------------
-- 1. Tabelas (todas privadas: só as funções abaixo leem e escrevem)
-- ---------------------------------------------------------------------------
create table private.segredo_do_acesso (
  id boolean primary key default true check (id),
  chave bytea not null default extensions.gen_random_bytes(32)
);
insert into private.segredo_do_acesso default values;
alter table private.segredo_do_acesso enable row level security;
alter table private.segredo_do_acesso force row level security;
revoke all on table private.segredo_do_acesso from public, anon, authenticated;

create table private.convite_do_beta (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  lista_de_espera_id uuid,
  emitido_em timestamptz not null default now(),
  emitido_por uuid references auth.users (id) on delete set null,
  usado_em timestamptz,
  usado_por uuid references auth.users (id) on delete set null,
  usado_na_consultoria uuid references public.consultoria (id) on delete set null,
  constraint convite_do_beta_email check (
    email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint convite_do_beta_uso check ((usado_em is null) = (usado_por is null))
);
create unique index convite_do_beta_aberto_idx on private.convite_do_beta (email) where usado_em is null;
comment on table private.convite_do_beta is
  'Convite do beta (ADR-0058): de uso único, para o e-mail convidado. Sem ele, ninguém abre consultoria durante o beta.';
alter table private.convite_do_beta enable row level security;
alter table private.convite_do_beta force row level security;
revoke all on table private.convite_do_beta from public, anon, authenticated;

create table private.consultoria_acesso (
  consultoria_id uuid primary key references public.consultoria (id) on delete cascade,
  origem text not null,
  cnpj_hash text,
  convite_id uuid references private.convite_do_beta (id) on delete set null,
  aberta_por uuid references auth.users (id) on delete set null,
  aberta_em timestamptz not null default now(),
  constraint consultoria_acesso_origem check (origem in ('anterior', 'beta', 'teste', 'sem_teste')),
  constraint consultoria_acesso_hash check (cnpj_hash is null or cnpj_hash ~ '^[0-9a-f]{64}$')
);
create index consultoria_acesso_cnpj_idx on private.consultoria_acesso (cnpj_hash) where cnpj_hash is not null;
comment on table private.consultoria_acesso is
  'Como a consultoria nasceu (ADR-0058): anterior (já existia) e beta têm beta grátis; teste tem o teste normal; sem_teste precisa de plano.';
alter table private.consultoria_acesso enable row level security;
alter table private.consultoria_acesso force row level security;
revoke all on table private.consultoria_acesso from public, anon, authenticated;

create table private.teste_usado (
  chave text primary key,
  tipo text not null,
  consultoria_id uuid references public.consultoria (id) on delete set null,
  registrado_em timestamptz not null default now(),
  constraint teste_usado_tipo check (tipo in ('email', 'cnpj')),
  constraint teste_usado_chave check (chave ~ '^[0-9a-f]{64}$')
);
comment on table private.teste_usado is
  'E-mails e CNPJs (só HMAC) que já ganharam teste ou beta (ADR-0058): não ganham outro.';
alter table private.teste_usado enable row level security;
alter table private.teste_usado force row level security;
revoke all on table private.teste_usado from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Auxiliares puras
-- ---------------------------------------------------------------------------
create function private.hmac_do_acesso(p_tipo text, p_valor text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.hmac(convert_to(p_tipo || ':' || p_valor, 'UTF8'), s.chave, 'sha256'), 'hex')
  from private.segredo_do_acesso as s
$$;

-- Os dois verificadores certos (igual a cnpjValido do domínio).
create function private.cnpj_com_verificadores(p_texto text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := coalesce(private.normalizar_cnpj(p_texto), '');
  v_tamanho integer;
  v_soma integer;
  v_peso integer;
  v_resto integer;
begin
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v ~ '^(\d)\1{13}$' then
    return false;
  end if;
  foreach v_tamanho in array array[12, 13] loop
    v_soma := 0;
    v_peso := v_tamanho - 7;
    for i in 1..v_tamanho loop
      v_soma := v_soma + (ascii(substr(v, i, 1)) - 48) * v_peso;
      v_peso := case when v_peso = 2 then 9 else v_peso - 1 end;
    end loop;
    v_resto := v_soma % 11;
    if (case when v_resto < 2 then 0 else 11 - v_resto end) <> ascii(substr(v, v_tamanho + 1, 1)) - 48 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.hmac_do_acesso(text, text) from public, anon, authenticated;
revoke all on function private.cnpj_com_verificadores(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Convite do beta: da lista de espera e do operador
-- ---------------------------------------------------------------------------
create function private.convite_do_beta_da_lista()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.convidado_em is not null
     and new.convidado_em is distinct from old.convidado_em
     and new.tipo_contato = 'email' then
    insert into private.convite_do_beta (email, lista_de_espera_id, emitido_por)
    values (lower(new.contato), new.id, new.convidado_por)
    on conflict (email) where usado_em is null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.convite_do_beta_da_lista() from public, anon, authenticated;

create trigger lista_de_espera_convite_do_beta
  after update of convidado_em on private.lista_de_espera
  for each row execute function private.convite_do_beta_da_lista();

-- Operador (com dois fatores) emite convite para um e-mail. Repetir devolve o convite aberto.
create function public.central_emitir_convite_do_beta(p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  perform private.exigir_operador();
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido' using errcode = '22023';
  end if;
  select c.id into v_id from private.convite_do_beta as c where c.email = v_email and c.usado_em is null;
  if v_id is null then
    insert into private.convite_do_beta (email, emitido_por) values (v_email, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.central_emitir_convite_do_beta(text) from public, anon;
grant execute on function public.central_emitir_convite_do_beta(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Abrir consultoria
-- ---------------------------------------------------------------------------
create function public.abrir_consultoria(p_id uuid, p_nome text, p_cnpj text)
returns table (consultoria_id uuid, acesso text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_nova uuid := coalesce(p_id, gen_random_uuid());
  v_cnpj text := coalesce(private.normalizar_cnpj(p_cnpj), '');
  v_cnpj_hash text;
  v_email text;
  v_email_confirmado boolean;
  v_email_hash text;
  v_operador boolean;
  v_em_beta boolean;
  v_convite uuid;
  v_sem_teste boolean;
  v_origem text;
begin
  if v_usuario is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  -- Repetir (clique duplo, rede instável) devolve a mesma consultoria.
  if exists (select 1 from public.consultoria as c where c.id = v_nova) then
    if exists (
      select 1 from public.membro as m
      where m.consultoria_id = v_nova and m.usuario_id = v_usuario and m.papel = 'gestao'
        and m.situacao = 'ativo'
    ) then
      return query select v_nova, coalesce(
        (select a.origem from private.consultoria_acesso as a where a.consultoria_id = v_nova), 'anterior');
      return;
    end if;
    raise exception 'consultoria_existente' using errcode = 'P0001';
  end if;

  if v_cnpj = '' then
    raise exception 'cnpj_obrigatorio' using errcode = '22023';
  end if;
  if not private.cnpj_com_verificadores(v_cnpj) then
    raise exception 'cnpj_invalido' using errcode = '22023';
  end if;
  v_cnpj_hash := private.hmac_do_acesso('cnpj', v_cnpj);
  -- Duas aberturas com o mesmo CNPJ ao mesmo tempo não ganham dois testes.
  perform pg_advisory_xact_lock(hashtext('acesso:' || v_cnpj_hash));

  select lower(u.email), u.email_confirmed_at is not null into v_email, v_email_confirmado
  from auth.users as u where u.id = v_usuario;
  v_email_hash := case when v_email is not null then private.hmac_do_acesso('email', v_email) end;
  v_operador := exists (select 1 from private.operador_plataforma as o where o.usuario_id = v_usuario);
  v_em_beta := (now() at time zone 'America/Sao_Paulo')::date
               <= (select cfg.fim_do_beta from private.configuracao_comercial as cfg where cfg.id);

  if v_em_beta and not v_operador then
    if v_email is null or not v_email_confirmado then
      raise exception 'convite_do_beta_obrigatorio' using errcode = 'P0001';
    end if;
    select c.id into v_convite from private.convite_do_beta as c
    where c.email = v_email and c.usado_em is null
    for update;
    if v_convite is null then
      raise exception 'convite_do_beta_obrigatorio' using errcode = 'P0001';
    end if;
  end if;

  v_sem_teste := not v_operador and (
    exists (
      select 1 from public.membro as m
      left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = m.consultoria_id
      where m.usuario_id = v_usuario and m.papel = 'gestao' and not coalesce(cc.interna, false)
    )
    or exists (select 1 from private.teste_usado as t where t.chave = v_email_hash)
    or exists (select 1 from private.teste_usado as t where t.chave = v_cnpj_hash)
    or exists (select 1 from private.consultoria_acesso as a where a.cnpj_hash = v_cnpj_hash)
  );
  v_origem := case when v_sem_teste then 'sem_teste' when v_em_beta then 'beta' else 'teste' end;

  -- A Gestão entra antes da linha de acesso: sem teste, a consultoria já nasce somente leitura.
  insert into public.consultoria (id, nome) values (v_nova, v_nome);
  insert into public.membro (consultoria_id, usuario_id, papel) values (v_nova, v_usuario, 'gestao');
  insert into private.consultoria_acesso (consultoria_id, origem, cnpj_hash, convite_id, aberta_por)
  values (v_nova, v_origem, v_cnpj_hash, v_convite, v_usuario);

  if v_convite is not null then
    update private.convite_do_beta as c
    set usado_em = now(), usado_por = v_usuario, usado_na_consultoria = v_nova
    where c.id = v_convite;
  end if;
  if not v_operador then
    insert into private.teste_usado (chave, tipo, consultoria_id) values (v_cnpj_hash, 'cnpj', v_nova)
    on conflict (chave) do nothing;
    if v_email_hash is not null then
      insert into private.teste_usado (chave, tipo, consultoria_id) values (v_email_hash, 'email', v_nova)
      on conflict (chave) do nothing;
    end if;
  end if;

  return query select v_nova, v_origem;
end;
$$;

comment on function public.abrir_consultoria(uuid, text, text) is
  'Abre consultoria (ADR-0058): CNPJ obrigatório; no beta, só com convite do beta; um teste por pessoa e por CNPJ.';
revoke all on function public.abrir_consultoria(uuid, text, text) from public, anon;
grant execute on function public.abrir_consultoria(uuid, text, text) to authenticated;

-- A função antiga fica (mesma assinatura): repetir devolve a consultoria; nova, sem CNPJ, é recusada.
create or replace function public.criar_consultoria(p_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return (select a.consultoria_id from public.abrir_consultoria(p_id, p_nome, null) as a);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Situação comercial: beta só para anterior/beta; sem_teste nasce sem dias de teste
--    (a Central ainda pode dar dias pela condição comercial).
-- ---------------------------------------------------------------------------
create or replace function private.situacao_comercial_em(cid uuid, p_hoje date)
returns table (
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  plano_vigente text,
  ciclo_vigente text,
  limite_pessoas integer,
  limite_empreendimentos integer,
  teste_ate date,
  beta_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  vence_hoje boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_criada date;
  v_cfg private.configuracao_comercial;
  v_condicao public.consultoria_condicao_comercial;
  v_assinatura public.assinatura;
  v_vencimentos date[];
  v_origem text;
begin
  select (c.criada_em at time zone c.fuso)::date into v_criada from public.consultoria as c where c.id = cid;
  if not found then
    return;
  end if;
  select * into v_cfg from private.configuracao_comercial as cfg where cfg.id;
  select * into v_condicao from public.consultoria_condicao_comercial as cc where cc.consultoria_id = cid;
  select * into v_assinatura from public.assinatura as a where a.consultoria_id = cid;
  select coalesce(array_agg(cb.vencimento order by cb.vencimento), '{}'::date[]) into v_vencimentos
  from public.cobranca as cb
  where cb.consultoria_id = cid and cb.situacao in ('pendente', 'vencida');
  select coalesce((select a.origem from private.consultoria_acesso as a where a.consultoria_id = cid),
                  'anterior')
  into v_origem;

  return query select * from private.situacao_comercial_calculada(
    p_hoje,
    v_criada,
    case when v_origem in ('anterior', 'beta') then v_cfg.fim_do_beta end,
    case when v_origem = 'sem_teste' and v_condicao.consultoria_id is null then 0
         else coalesce(v_condicao.dias_de_teste, v_cfg.dias_de_teste_padrao) end,
    coalesce(v_condicao.interna, false),
    v_assinatura.plano,
    v_assinatura.ciclo,
    v_assinatura.plano_agendado,
    v_assinatura.ciclo_agendado,
    v_assinatura.mudanca_em,
    v_assinatura.valida_ate,
    v_vencimentos,
    v_condicao.plano_contrato,
    v_condicao.contrato_ate
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Dados que já existem: nada muda para eles
-- ---------------------------------------------------------------------------
-- As consultorias do beta (Envora, Filtroville e as demais) ficam como anteriores: continuam em beta.
insert into private.consultoria_acesso (consultoria_id, origem)
select c.id, 'anterior' from public.consultoria as c
on conflict (consultoria_id) do nothing;

-- Quem já é Gestão de consultoria não interna já usou o teste (o e-mail fica registrado em HMAC).
insert into private.teste_usado (chave, tipo, consultoria_id)
select distinct on (lower(u.email)) private.hmac_do_acesso('email', lower(u.email)), 'email', m.consultoria_id
from public.membro as m
join auth.users as u on u.id = m.usuario_id
left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = m.consultoria_id
where m.papel = 'gestao' and not coalesce(cc.interna, false) and u.email is not null
order by lower(u.email), m.consultoria_id
on conflict (chave) do nothing;

-- Quem a Central já convidou da lista de espera e ainda não abriu consultoria ganha o convite.
insert into private.convite_do_beta (email, lista_de_espera_id, emitido_em, emitido_por)
select distinct on (lower(l.contato)) lower(l.contato), l.id, l.convidado_em, l.convidado_por
from private.lista_de_espera as l
where l.convidado_em is not null and l.tipo_contato = 'email'
  and not exists (
    select 1 from auth.users as u join public.membro as m on m.usuario_id = u.id
    where lower(u.email) = lower(l.contato) and m.papel = 'gestao')
order by lower(l.contato), l.convidado_em desc
on conflict (email) where usado_em is null do nothing;
