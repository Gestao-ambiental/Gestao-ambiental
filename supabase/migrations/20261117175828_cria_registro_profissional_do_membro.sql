-- Registro profissional do membro (prepara CAP-09; decisões de 17/11/2026, sugeridas na proposta do
-- modelo de formação e aceitas pelo Eduardo). Em cima da profissão do membro (ADR-0021): a
-- profissão continua em membro.profissao e membro.outras_profissoes, sem catálogo novo.
--   * Cada profissão concluída da pessoa pode ter um registro no conselho: conselho, número, UF e
--     validade. Profissão em curso não tem registro.
--   * A própria pessoa informa; a Gestão confirma ou recusa. O que a Gestão informa já entra
--     confirmado. Mudar um registro confirmado desfaz a confirmação.
--   * Tirar a profissão do membro tira o registro dela (exclusão lógica, fica no histórico).
--   * Toda a equipe vê os registros dos colegas, como vê a profissão.
--   * Nada aqui presume habilitação nem atribui responsável: é informação para decisão.
-- Também o Cadastro Técnico Federal do Ibama, no vínculo. Sem CPF.

create domain public.conselho_profissional as text check (value in (
    'crea',
    'cau',
    'crbio',
    'crq',
    'crmv',
    'crt',
    'crta',
    'corecon',
    'oab',
    'outro'));

-- ---------------------------------------------------------------------------
-- registro_profissional: registro no conselho de uma profissão do membro.
-- ---------------------------------------------------------------------------
create table public.registro_profissional (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  profissao public.profissao_do_membro not null,
  conselho public.conselho_profissional not null,
  numero text not null,
  uf text,
  valido_ate date,
  declarado_por uuid not null,
  declarado_em timestamptz not null default now(),
  confirmado_por uuid,
  confirmado_em timestamptz,
  removido_por uuid,
  removido_em timestamptz,
  row_version integer not null default 1,
  constraint registro_profissional_numero_valido
    check (numero = btrim(numero) and length(numero) between 1 and 30),
  constraint registro_profissional_uf_valida check (
    uf is null or uf in (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
      'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    )
  ),
  constraint registro_profissional_confirmacao_coerente
    check ((confirmado_por is null) = (confirmado_em is null)),
  constraint registro_profissional_remocao_coerente
    check (removido_por is null or removido_em is not null),
  constraint registro_profissional_consultoria_id_id_key unique (consultoria_id, id),
  constraint registro_profissional_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint registro_profissional_declarado_por_fk foreign key (consultoria_id, declarado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint registro_profissional_confirmado_por_fk foreign key (consultoria_id, confirmado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint registro_profissional_removido_por_fk foreign key (consultoria_id, removido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

-- Um registro em vigor por pessoa e profissão; os removidos ficam no histórico.
create unique index registro_profissional_em_vigor_key
  on public.registro_profissional (consultoria_id, membro_id, profissao)
  where removido_em is null;

comment on table public.registro_profissional is
  'Registro no conselho de uma profissão do membro (ADR-0021). Confirmação é da Gestão; não presume habilitação.';
comment on column public.registro_profissional.valido_ate is
  'Data civil. Vencido continua registrado; a situação é calculada no domínio.';
comment on column public.registro_profissional.removido_em is
  'Exclusão lógica: pela pessoa, pela Gestão ou ao tirar a profissão do membro.';

-- ---------------------------------------------------------------------------
-- Cadastro Técnico Federal do Ibama, no vínculo.
-- ---------------------------------------------------------------------------
alter table public.membro
  add column ctf_numero text,
  add column ctf_valido_ate date,
  add constraint membro_ctf_numero_valido check (ctf_numero is null or ctf_numero ~ '^[0-9]{1,20}$'),
  add constraint membro_ctf_coerente check (ctf_numero is not null or ctf_valido_ate is null);

comment on column public.membro.ctf_numero is 'Número no Cadastro Técnico Federal do Ibama (só dígitos).';
comment on column public.membro.ctf_valido_ate is 'Validade do certificado de regularidade do CTF (data civil).';

-- ---------------------------------------------------------------------------
-- RLS: membro ativo lê; escrita só pelas RPCs.
-- ---------------------------------------------------------------------------
alter table public.registro_profissional enable row level security;
alter table public.registro_profissional force row level security;

revoke all on table public.registro_profissional from anon, authenticated;
grant select on table public.registro_profissional to authenticated;

create policy registro_profissional_select_membro_ativo on public.registro_profissional
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger registro_profissional_auditar
  after insert or update or delete on public.registro_profissional
  for each row execute function private.auditar();

-- Barreiras de escrita (teste 020): o acesso de suporte só lê; consultoria em somente leitura
-- (situação comercial) não escreve.
create trigger _suporte_somente_leitura
  before insert or update or delete on public.registro_profissional
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.registro_profissional
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- Tirar a profissão do membro (ou marcar a principal como em curso) tira o registro dela.
-- ---------------------------------------------------------------------------
create function private.ajustar_registros_do_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.registro_profissional as r
  set removido_em = now(),
      removido_por = private.membro_atual(new.consultoria_id),
      row_version = r.row_version + 1
  where r.consultoria_id = new.consultoria_id
    and r.membro_id = new.id
    and r.removido_em is null
    and not (coalesce(r.profissao = new.profissao and not new.profissao_em_curso, false)
             or r.profissao = any (new.outras_profissoes));
  return null;
end;
$$;

revoke all on function private.ajustar_registros_do_membro() from public, anon, authenticated;

create trigger membro_ajustar_registros
  after update of profissao, outras_profissoes, profissao_em_curso on public.membro
  for each row execute function private.ajustar_registros_do_membro();

-- ---------------------------------------------------------------------------
-- Quem pode mexer no registro de um membro: a própria pessoa (vínculo ativo) ou a Gestão.
-- Devolve o membro alvo, travado.
-- ---------------------------------------------------------------------------
create function private.alvo_de_registro(p_membro_id uuid)
returns public.membro
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
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
  return alvo;
end;
$$;

revoke all on function private.alvo_de_registro(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: informar (ou atualizar) o registro de uma profissão do membro. Repetir com os mesmos dados
-- não muda nada. Pela Gestão: já confirmado. Pela pessoa: aguarda a Gestão; mudar um registro
-- confirmado desfaz a confirmação.
-- ---------------------------------------------------------------------------
create function public.declarar_registro_profissional(
  p_membro_id uuid,
  p_profissao text,
  p_conselho text,
  p_numero text,
  p_uf text default null,
  p_valido_ate date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
  gestao boolean;
  ator uuid;
  novo uuid;
  atual public.registro_profissional;
  codigo_profissao text := nullif(btrim(coalesce(p_profissao, '')), '');
  codigo_conselho text := nullif(btrim(coalesce(p_conselho, '')), '');
  numero_registro text := nullif(btrim(coalesce(p_numero, '')), '');
  sigla_uf text := nullif(upper(btrim(coalesce(p_uf, ''))), '');
begin
  alvo := private.alvo_de_registro(p_membro_id);
  gestao := private.is_gestao(alvo.consultoria_id);
  ator := private.membro_atual(alvo.consultoria_id);

  -- Só profissão concluída da própria pessoa: a principal (fora de curso) ou uma das outras.
  if codigo_profissao is null
     or not (coalesce(alvo.profissao = codigo_profissao and not alvo.profissao_em_curso, false)
             or codigo_profissao = any (alvo.outras_profissoes::text[])) then
    raise exception 'profissao_fora_do_perfil' using errcode = '22023';
  end if;
  if codigo_conselho is null then
    raise exception 'conselho_invalido' using errcode = '22023';
  end if;
  begin
    perform codigo_conselho::public.conselho_profissional;
  exception when check_violation then
    raise exception 'conselho_invalido' using errcode = '22023';
  end;
  if numero_registro is null then
    raise exception 'numero_do_registro_obrigatorio' using errcode = '22023';
  end if;
  if length(numero_registro) > 30 then
    raise exception 'registro_longo_demais' using errcode = '22023';
  end if;
  if sigla_uf is not null and sigla_uf not in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ) then
    raise exception 'uf_invalida' using errcode = '22023';
  end if;

  select * into atual from public.registro_profissional as r
  where r.consultoria_id = alvo.consultoria_id and r.membro_id = alvo.id
    and r.profissao = codigo_profissao and r.removido_em is null
  for update;

  if not found then
    insert into public.registro_profissional (consultoria_id, membro_id, profissao, conselho, numero, uf,
                                              valido_ate, declarado_por, confirmado_por, confirmado_em)
    values (alvo.consultoria_id, alvo.id, codigo_profissao::public.profissao_do_membro,
            codigo_conselho::public.conselho_profissional, numero_registro, sigla_uf, p_valido_ate, ator,
            case when gestao then ator end, case when gestao then now() end)
    returning id into novo;
    return novo;
  end if;

  if atual.conselho = codigo_conselho
     and atual.numero = numero_registro
     and atual.uf is not distinct from sigla_uf
     and atual.valido_ate is not distinct from p_valido_ate
     and (atual.confirmado_em is not null or not gestao) then
    return atual.id;
  end if;

  update public.registro_profissional as r
  set conselho = codigo_conselho::public.conselho_profissional,
      numero = numero_registro,
      uf = sigla_uf,
      valido_ate = p_valido_ate,
      confirmado_por = case when gestao then ator end,
      confirmado_em = case when gestao then now() end,
      row_version = r.row_version + 1
  where r.id = atual.id;
  return atual.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: confirmar o registro (Gestão). Controle otimista; repetir é inofensivo.
-- ---------------------------------------------------------------------------
create function public.confirmar_registro_profissional(p_registro_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.registro_profissional;
begin
  select * into alvo from public.registro_profissional as r where r.id = p_registro_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.removido_em is not null then
    raise exception 'registro_removido' using errcode = 'P0001';
  end if;
  if alvo.confirmado_em is not null then
    return alvo.row_version;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  update public.registro_profissional as r
  set confirmado_por = private.membro_atual(alvo.consultoria_id),
      confirmado_em = now(),
      row_version = r.row_version + 1
  where r.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: remover o registro (a própria pessoa ou a Gestão; recusar = remover). Exclusão lógica.
-- ---------------------------------------------------------------------------
create function public.remover_registro_profissional(p_registro_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.registro_profissional;
  dono public.membro;
begin
  select * into alvo from public.registro_profissional as r where r.id = p_registro_id for update;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  dono := private.alvo_de_registro(alvo.membro_id);
  if alvo.removido_em is not null then
    return;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  update public.registro_profissional as r
  set removido_por = private.membro_atual(dono.consultoria_id),
      removido_em = now(),
      row_version = r.row_version + 1
  where r.id = alvo.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Cadastro Técnico Federal (a própria pessoa ou a Gestão). Número vazio limpa os dois.
-- ---------------------------------------------------------------------------
create function public.definir_cadastro_federal(
  p_membro_id uuid,
  p_numero text default null,
  p_valido_ate date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
  numero text := nullif(btrim(coalesce(p_numero, '')), '');
  validade date := case when numero is null then null else p_valido_ate end;
begin
  alvo := private.alvo_de_registro(p_membro_id);
  if numero is not null and numero !~ '^[0-9]{1,20}$' then
    raise exception 'ctf_invalido' using errcode = '22023';
  end if;

  update public.membro as m
  set ctf_numero = numero, ctf_valido_ate = validade
  where m.id = alvo.id
    and (m.ctf_numero is distinct from numero or m.ctf_valido_ate is distinct from validade);
end;
$$;

revoke all on function public.declarar_registro_profissional(uuid, text, text, text, text, date) from public, anon;
revoke all on function public.confirmar_registro_profissional(uuid, integer) from public, anon;
revoke all on function public.remover_registro_profissional(uuid, integer) from public, anon;
revoke all on function public.definir_cadastro_federal(uuid, text, date) from public, anon;

grant execute on function public.declarar_registro_profissional(uuid, text, text, text, text, date) to authenticated;
grant execute on function public.confirmar_registro_profissional(uuid, integer) to authenticated;
grant execute on function public.remover_registro_profissional(uuid, integer) to authenticated;
grant execute on function public.definir_cadastro_federal(uuid, text, date) to authenticated;
