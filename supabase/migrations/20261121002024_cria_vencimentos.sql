-- Outros vencimentos (P4 do estudo "Oito funções no Grama"; ADR-0046). Aditiva.
-- 1. tipo_vencimento por consultoria (nome, antecedência padrão em dias, exige_pdf, ativo), semeado
--    como o tipo_instrumento: Alvará (exige PDF, ALV-01), ART, CTF IBAMA, Outorga, AVCB e Certidão.
--    A Gestão cria, renomeia, muda a antecedência e o exige_pdf e desativa. Não há exclusão de tipo.
-- 2. vencimento: documento do empreendimento que só tem validade. Unidade, licença e responsável
--    técnico opcionais; emitido_em e valido_ate são DATE com o texto original; PDF opcional
--    (obrigatório quando o tipo exige), imutável, em <cid>/vencimento/<uuid>.pdf; renovar = novo
--    vencimento ligado ao anterior (anterior_id, no máximo um sucessor vivo); exclusão lógica;
--    row_version; auditoria. Situação (vigente, a vencer, vencido, renovado) é calculada no
--    packages/domain, nunca gravada.
-- 3. Escrita só por RPC da Gestão, numa transação; cadastrar e renovar são idempotentes por p_id.
-- 4. Fontes da base (ADR-0041): só private.linhas_de_prazo_vencimento e private.busca_vencimentos
--    são redefinidas. A união e as leituras públicas não mudam.

-- ---------------------------------------------------------------------------
-- 1. Tipos de vencimento
-- ---------------------------------------------------------------------------
create table public.tipo_vencimento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  nome text not null,
  nome_normalizado text generated always as (private.normalizar_nome(nome)) stored,
  antecedencia_dias integer not null default 60,
  exige_pdf boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint tipo_vencimento_nome_valido check (nome = btrim(nome) and length(nome) between 1 and 60),
  constraint tipo_vencimento_antecedencia_valida check (antecedencia_dias between 0 and 730),
  constraint tipo_vencimento_consultoria_id_id_key unique (consultoria_id, id),
  constraint tipo_vencimento_nome_key unique (consultoria_id, nome_normalizado)
);

comment on table public.tipo_vencimento is
  'Tipo de vencimento da consultoria (Alvará, ART, CTF IBAMA, Outorga, AVCB, Certidão e os próprios). ADR-0046.';
comment on column public.tipo_vencimento.antecedencia_dias is
  'Antecedência padrão, em dias, copiada para o vencimento novo. Mudar aqui não muda os já cadastrados.';
comment on column public.tipo_vencimento.exige_pdf is 'O vencimento deste tipo só é cadastrado com PDF.';

alter table public.tipo_vencimento enable row level security;
alter table public.tipo_vencimento force row level security;
revoke all on table public.tipo_vencimento from public, anon, authenticated;
grant select on table public.tipo_vencimento to authenticated;

create policy tipo_vencimento_select_membro_ativo on public.tipo_vencimento
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger tipo_vencimento_auditar after insert or update or delete on public.tipo_vencimento
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura before insert or update or delete on public.tipo_vencimento
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura before insert or update or delete on public.tipo_vencimento
  for each row execute function private.bloquear_escrita_comercial();

-- Semeadura (mesmo padrão do tipo_instrumento, 20261017202216).
create function private.semear_tipos_vencimento(cid uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.tipo_vencimento (consultoria_id, nome, antecedencia_dias, exige_pdf)
  values
    (cid, 'Alvará', 60, true),
    (cid, 'ART', 60, false),
    (cid, 'CTF IBAMA', 60, false),
    (cid, 'Outorga', 60, false),
    (cid, 'AVCB', 60, false),
    (cid, 'Certidão', 60, false)
  on conflict (consultoria_id, nome_normalizado) do nothing
$$;

create function private.semear_tipos_vencimento_da_consultoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.semear_tipos_vencimento(new.id);
  return null;
end;
$$;

revoke all on function private.semear_tipos_vencimento(uuid) from public, anon, authenticated;
revoke all on function private.semear_tipos_vencimento_da_consultoria() from public, anon, authenticated;

create trigger consultoria_semear_tipos_vencimento
  after insert on public.consultoria
  for each row execute function private.semear_tipos_vencimento_da_consultoria();

select private.semear_tipos_vencimento(c.id) from public.consultoria as c;

-- ---------------------------------------------------------------------------
-- 2. Vencimentos
-- ---------------------------------------------------------------------------
create table public.vencimento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  unidade_id uuid,
  instrumento_id uuid,
  tipo_vencimento_id uuid not null,
  numero text,
  orgao text,
  notas text,
  emitido_em date,
  emitido_texto text,
  valido_ate date not null,
  validade_texto text,
  antecedencia_dias integer not null,
  responsavel_tecnico_id uuid,
  documento_id uuid,
  anterior_id uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  excluido_por uuid,
  excluido_em timestamptz,
  row_version integer not null default 1,
  constraint vencimento_numero_valido
    check (numero is null or (numero = btrim(numero) and length(numero) between 1 and 60)),
  constraint vencimento_orgao_valido
    check (orgao is null or (orgao = btrim(orgao) and length(orgao) between 1 and 120)),
  constraint vencimento_notas_validas check (notas is null or length(notas) between 1 and 2000),
  constraint vencimento_emitido_texto_valido
    check (emitido_texto is null or length(emitido_texto) between 1 and 100),
  constraint vencimento_validade_texto_valido
    check (validade_texto is null or length(validade_texto) between 1 and 100),
  constraint vencimento_datas_coerentes check (emitido_em is null or emitido_em <= valido_ate),
  constraint vencimento_antecedencia_valida check (antecedencia_dias between 0 and 730),
  constraint vencimento_anterior_outro check (anterior_id is null or anterior_id <> id),
  constraint vencimento_exclusao_coerente check ((excluido_por is null) = (excluido_em is null)),
  constraint vencimento_consultoria_id_id_key unique (consultoria_id, id),
  constraint vencimento_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint vencimento_unidade_fk foreign key (consultoria_id, empreendimento_id, unidade_id)
    references public.unidade (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint vencimento_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint vencimento_tipo_fk foreign key (consultoria_id, tipo_vencimento_id)
    references public.tipo_vencimento (consultoria_id, id) on delete restrict,
  constraint vencimento_responsavel_tecnico_fk foreign key (consultoria_id, responsavel_tecnico_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint vencimento_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint vencimento_anterior_fk foreign key (consultoria_id, anterior_id)
    references public.vencimento (consultoria_id, id) on delete restrict,
  constraint vencimento_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint vencimento_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

-- Um sucessor vivo por vencimento.
create unique index vencimento_um_sucessor_key
  on public.vencimento (consultoria_id, anterior_id)
  where anterior_id is not null and excluido_em is null;
create index vencimento_empreendimento_idx on public.vencimento (consultoria_id, empreendimento_id);
create index vencimento_validade_idx on public.vencimento (consultoria_id, valido_ate) where excluido_em is null;

comment on table public.vencimento is
  'Documento do empreendimento que só tem validade (alvará, ART, CTF, outorga, AVCB, certidão). Renovar = novo registro ligado ao anterior; nada é apagado. Situação calculada, nunca gravada (ADR-0046).';
comment on column public.vencimento.valido_ate is
  'Data civil da validade. Gera a linha de prazo enquanto o vencimento for o vigente da série.';
comment on column public.vencimento.anterior_id is
  'Vencimento que este renova. O anterior fica guardado e deixa de gerar prazo.';

alter table public.vencimento enable row level security;
alter table public.vencimento force row level security;
revoke all on table public.vencimento from public, anon, authenticated;
grant select on table public.vencimento to authenticated;

create policy vencimento_select_membro_ativo on public.vencimento
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger vencimento_auditar after insert or update or delete on public.vencimento
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura before insert or update or delete on public.vencimento
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura before insert or update or delete on public.vencimento
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- 3. Helpers privados
-- ---------------------------------------------------------------------------
-- Datas, antecedência e textos (o tamanho vale depois do btrim; vazio vira nulo no chamador).
create function private.conferir_dados_do_vencimento(
  p_numero text,
  p_orgao text,
  p_notas text,
  p_emitido_texto text,
  p_validade_texto text,
  p_valido_ate date,
  p_emitido_em date,
  p_antecedencia_dias integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valido_ate is null then
    raise exception 'validade_obrigatoria' using errcode = '22023';
  end if;
  if p_emitido_em is not null and p_emitido_em > p_valido_ate then
    raise exception 'datas_incoerentes' using errcode = '22023';
  end if;
  if p_antecedencia_dias is null or p_antecedencia_dias not between 0 and 730 then
    raise exception 'antecedencia_invalida' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_numero, ''))) > 60 or length(btrim(coalesce(p_orgao, ''))) > 120
     or length(btrim(coalesce(p_notas, ''))) > 2000 or length(btrim(coalesce(p_emitido_texto, ''))) > 100
     or length(btrim(coalesce(p_validade_texto, ''))) > 100 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.conferir_dados_do_vencimento(text, text, text, text, text, date, date, integer)
  from public, anon, authenticated;

-- Unidade e licença do mesmo empreendimento; responsável técnico membro ativo da consultoria.
create function private.conferir_vinculos_do_vencimento(
  cid uuid,
  p_empreendimento_id uuid,
  p_unidade_id uuid,
  p_instrumento_id uuid,
  p_responsavel_tecnico_id uuid,
  p_conferir_responsavel boolean default true
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_unidade_id is not null and not exists (
    select 1 from public.unidade as u
    where u.id = p_unidade_id and u.consultoria_id = cid and u.empreendimento_id = p_empreendimento_id
  ) then
    raise exception 'unidade_invalida' using errcode = '22023';
  end if;
  if p_instrumento_id is not null and not exists (
    select 1 from public.instrumento as i
    where i.id = p_instrumento_id and i.consultoria_id = cid and i.empreendimento_id = p_empreendimento_id
  ) then
    raise exception 'instrumento_invalido' using errcode = '22023';
  end if;
  if p_conferir_responsavel and p_responsavel_tecnico_id is not null and not exists (
    select 1 from public.membro as m
    where m.id = p_responsavel_tecnico_id and m.consultoria_id = cid and m.situacao = 'ativo'
  ) then
    raise exception 'responsavel_tecnico_invalido' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.conferir_vinculos_do_vencimento(uuid, uuid, uuid, uuid, uuid, boolean)
  from public, anon, authenticated;

-- PDF do cadastro e da renovação: os quatro dados juntos ou nenhum. Devolve o documento criado
-- (entidade 'vencimento', versão 1 vigente) ou nulo sem PDF.
create function private.criar_pdf_do_vencimento(
  cid uuid,
  ator uuid,
  p_exige_pdf boolean,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  tamanho bigint;
  doc uuid;
begin
  if num_nulls(p_versao_id, p_caminho, p_nome_original, p_sha256) not in (0, 4) then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  if p_versao_id is null then
    if p_exige_pdf then
      raise exception 'pdf_obrigatorio' using errcode = '22023';
    end if;
    return null;
  end if;
  if exists (select 1 from public.documento_versao as v where v.id = p_versao_id) then
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;
  tamanho := private.conferir_pdf_enviado(cid, 'vencimento', p_caminho, p_nome_original, p_sha256);
  insert into public.documento (consultoria_id, entidade, versao_vigente_id)
  values (cid, 'vencimento', null)
  returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, cid, doc, 1, p_caminho, btrim(p_nome_original), 'application/pdf', tamanho,
          lower(p_sha256), ator);
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  return doc;
end;
$$;

revoke all on function private.criar_pdf_do_vencimento(uuid, uuid, boolean, uuid, text, text, text)
  from public, anon, authenticated;

-- Vencimento para a Gestão mexer: travado, da Gestão, não excluído, na versão lida.
create function private.vencimento_para_gestao(p_vencimento_id uuid, p_row_version integer)
returns public.vencimento
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vencimento;
begin
  select * into alvo from public.vencimento as v where v.id = p_vencimento_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'vencimento_excluido' using errcode = 'P0001';
  end if;
  if p_row_version is not null and alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.vencimento_para_gestao(uuid, integer) from public, anon, authenticated;

-- Nome do tipo: obrigatório, até 60 caracteres depois de aparado. Devolve o nome aparado.
create function private.conferir_dados_do_tipo_vencimento(p_nome text, p_antecedencia_dias integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  nome text := btrim(coalesce(p_nome, ''));
begin
  if nome = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;
  if length(nome) > 60 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if p_antecedencia_dias is null or p_antecedencia_dias not between 0 and 730 then
    raise exception 'antecedencia_invalida' using errcode = '22023';
  end if;
  return nome;
end;
$$;

revoke all on function private.conferir_dados_do_tipo_vencimento(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs dos tipos (Gestão)
-- ---------------------------------------------------------------------------
-- Criar: nome repetido (sem acento e sem caixa) devolve o tipo ativo existente sem mudar nada;
-- se o existente estiver desativado, tipo_vencimento_existente (reativa-se pelo editar).
create function public.criar_tipo_vencimento(
  p_consultoria_id uuid,
  p_nome text,
  p_antecedencia_dias integer default 60,
  p_exige_pdf boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_novo text;
  existente public.tipo_vencimento;
  novo uuid;
begin
  if p_consultoria_id is null or not private.is_gestao(p_consultoria_id)
     or private.membro_atual(p_consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  nome_novo := private.conferir_dados_do_tipo_vencimento(p_nome, p_antecedencia_dias);

  select * into existente from public.tipo_vencimento as t
  where t.consultoria_id = p_consultoria_id and t.nome_normalizado = private.normalizar_nome(nome_novo);
  if found then
    if not existente.ativo then
      raise exception 'tipo_vencimento_existente' using errcode = 'P0001';
    end if;
    return existente.id;
  end if;

  insert into public.tipo_vencimento (consultoria_id, nome, antecedencia_dias, exige_pdf)
  values (p_consultoria_id, nome_novo, p_antecedencia_dias, coalesce(p_exige_pdf, false))
  returning id into novo;
  return novo;
end;
$$;

-- Editar: substitui nome, antecedência, exige_pdf e ativo (nulo nos dois últimos mantém o atual).
-- Não mexe nos vencimentos já cadastrados.
create function public.editar_tipo_vencimento(
  p_tipo_id uuid,
  p_nome text,
  p_antecedencia_dias integer,
  p_exige_pdf boolean,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.tipo_vencimento;
  nome_novo text;
begin
  select * into alvo from public.tipo_vencimento as t where t.id = p_tipo_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id)
     or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  nome_novo := private.conferir_dados_do_tipo_vencimento(p_nome, p_antecedencia_dias);
  if exists (
    select 1 from public.tipo_vencimento as t
    where t.consultoria_id = alvo.consultoria_id and t.id <> alvo.id
      and t.nome_normalizado = private.normalizar_nome(nome_novo)
  ) then
    raise exception 'tipo_vencimento_existente' using errcode = 'P0001';
  end if;
  if alvo.nome = nome_novo and alvo.antecedencia_dias = p_antecedencia_dias
     and alvo.exige_pdf = coalesce(p_exige_pdf, alvo.exige_pdf) and alvo.ativo = coalesce(p_ativo, alvo.ativo) then
    return;
  end if;
  update public.tipo_vencimento as t
  set nome = nome_novo, antecedencia_dias = p_antecedencia_dias,
      exige_pdf = coalesce(p_exige_pdf, t.exige_pdf), ativo = coalesce(p_ativo, t.ativo)
  where t.id = alvo.id;
end;
$$;

revoke all on function public.criar_tipo_vencimento(uuid, text, integer, boolean) from public, anon;
revoke all on function public.editar_tipo_vencimento(uuid, text, integer, boolean, boolean) from public, anon;
grant execute on function public.criar_tipo_vencimento(uuid, text, integer, boolean) to authenticated;
grant execute on function public.editar_tipo_vencimento(uuid, text, integer, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs dos vencimentos (Gestão)
-- ---------------------------------------------------------------------------
-- Cadastrar, já com o PDF quando houver, numa transação. Repetir com o mesmo p_id devolve o mesmo
-- vencimento sem mudar nada.
create function public.cadastrar_vencimento(
  p_id uuid,
  p_empreendimento_id uuid,
  p_tipo_vencimento_id uuid,
  p_valido_ate date,
  p_unidade_id uuid default null,
  p_instrumento_id uuid default null,
  p_numero text default null,
  p_orgao text default null,
  p_notas text default null,
  p_emitido_em date default null,
  p_emitido_texto text default null,
  p_validade_texto text default null,
  p_antecedencia_dias integer default null,
  p_responsavel_tecnico_id uuid default null,
  p_versao_id uuid default null,
  p_caminho text default null,
  p_nome_original text default null,
  p_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  emp public.empreendimento;
  tipo public.tipo_vencimento;
  ator uuid;
  cid_existente uuid;
  antecedencia integer;
  doc uuid;
begin
  select * into emp from public.empreendimento as e where e.id = p_empreendimento_id;
  if not found or not private.is_gestao(emp.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(emp.consultoria_id);
  if ator is null or p_id is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Retry: o mesmo p_id devolve o vencimento já cadastrado.
  select v.consultoria_id into cid_existente from public.vencimento as v where v.id = p_id;
  if found then
    if cid_existente = emp.consultoria_id then
      return p_id;
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select * into tipo from public.tipo_vencimento as t
  where t.id = p_tipo_vencimento_id and t.consultoria_id = emp.consultoria_id;
  if not found then
    raise exception 'tipo_vencimento_invalido' using errcode = '22023';
  end if;
  if not tipo.ativo then
    raise exception 'tipo_vencimento_inativo' using errcode = 'P0001';
  end if;

  antecedencia := coalesce(p_antecedencia_dias, tipo.antecedencia_dias);
  perform private.conferir_dados_do_vencimento(p_numero, p_orgao, p_notas, p_emitido_texto, p_validade_texto,
                                               p_valido_ate, p_emitido_em, antecedencia);
  perform private.conferir_vinculos_do_vencimento(emp.consultoria_id, emp.id, p_unidade_id, p_instrumento_id,
                                                  p_responsavel_tecnico_id);
  doc := private.criar_pdf_do_vencimento(emp.consultoria_id, ator, tipo.exige_pdf, p_versao_id, p_caminho,
                                         p_nome_original, p_sha256);

  insert into public.vencimento (id, consultoria_id, empreendimento_id, unidade_id, instrumento_id,
                                 tipo_vencimento_id, numero, orgao, notas, emitido_em, emitido_texto, valido_ate,
                                 validade_texto, antecedencia_dias, responsavel_tecnico_id, documento_id,
                                 criado_por)
  values (p_id, emp.consultoria_id, emp.id, p_unidade_id, p_instrumento_id, tipo.id,
          nullif(btrim(coalesce(p_numero, '')), ''), nullif(btrim(coalesce(p_orgao, '')), ''),
          nullif(btrim(coalesce(p_notas, '')), ''), p_emitido_em,
          nullif(btrim(coalesce(p_emitido_texto, '')), ''), p_valido_ate,
          nullif(btrim(coalesce(p_validade_texto, '')), ''), antecedencia, p_responsavel_tecnico_id, doc, ator);
  return p_id;
end;
$$;

-- Renovar: vencimento novo ligado ao anterior, do mesmo empreendimento, unidade e tipo. O anterior
-- não muda (nem o row_version, que só é conferido) e deixa de gerar prazo. Idempotente por p_id.
create function public.renovar_vencimento(
  p_id uuid,
  p_anterior_id uuid,
  p_row_version_anterior integer,
  p_valido_ate date,
  p_instrumento_id uuid default null,
  p_numero text default null,
  p_orgao text default null,
  p_notas text default null,
  p_emitido_em date default null,
  p_emitido_texto text default null,
  p_validade_texto text default null,
  p_antecedencia_dias integer default null,
  p_responsavel_tecnico_id uuid default null,
  p_versao_id uuid default null,
  p_caminho text default null,
  p_nome_original text default null,
  p_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ant public.vencimento;
  tipo public.tipo_vencimento;
  ator uuid;
  cid_existente uuid;
  antecedencia integer;
  doc uuid;
begin
  select * into ant from public.vencimento as v where v.id = p_anterior_id for update;
  if not found or not private.is_gestao(ant.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(ant.consultoria_id);
  if ator is null or p_id is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Retry: o mesmo p_id devolve a renovação já feita.
  select v.consultoria_id into cid_existente from public.vencimento as v where v.id = p_id;
  if found then
    if cid_existente = ant.consultoria_id then
      return p_id;
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if ant.excluido_em is not null then
    raise exception 'vencimento_anterior_invalido' using errcode = '22023';
  end if;
  if p_row_version_anterior is null or ant.row_version <> p_row_version_anterior then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.vencimento as s
    where s.consultoria_id = ant.consultoria_id and s.anterior_id = ant.id and s.excluido_em is null
  ) then
    raise exception 'vencimento_ja_renovado' using errcode = 'P0001';
  end if;

  -- Tipo desativado pode ser renovado; só não serve para vencimento novo.
  select * into tipo from public.tipo_vencimento as t
  where t.consultoria_id = ant.consultoria_id and t.id = ant.tipo_vencimento_id;

  antecedencia := coalesce(p_antecedencia_dias, ant.antecedencia_dias);
  perform private.conferir_dados_do_vencimento(p_numero, p_orgao, p_notas, p_emitido_texto, p_validade_texto,
                                               p_valido_ate, p_emitido_em, antecedencia);
  perform private.conferir_vinculos_do_vencimento(ant.consultoria_id, ant.empreendimento_id, null,
                                                  p_instrumento_id, p_responsavel_tecnico_id);
  doc := private.criar_pdf_do_vencimento(ant.consultoria_id, ator, tipo.exige_pdf, p_versao_id, p_caminho,
                                         p_nome_original, p_sha256);

  insert into public.vencimento (id, consultoria_id, empreendimento_id, unidade_id, instrumento_id,
                                 tipo_vencimento_id, numero, orgao, notas, emitido_em, emitido_texto, valido_ate,
                                 validade_texto, antecedencia_dias, responsavel_tecnico_id, documento_id,
                                 anterior_id, criado_por)
  values (p_id, ant.consultoria_id, ant.empreendimento_id, ant.unidade_id, p_instrumento_id,
          ant.tipo_vencimento_id, nullif(btrim(coalesce(p_numero, '')), ''),
          nullif(btrim(coalesce(p_orgao, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), p_emitido_em,
          nullif(btrim(coalesce(p_emitido_texto, '')), ''), p_valido_ate,
          nullif(btrim(coalesce(p_validade_texto, '')), ''), antecedencia, p_responsavel_tecnico_id, doc,
          ant.id, ator);
  return p_id;
end;
$$;

-- Editar: substitui todos os campos (nulo apaga), menos a antecedência, que é obrigatória. Nada
-- mudou: devolve o row_version atual.
create function public.editar_vencimento(
  p_vencimento_id uuid,
  p_row_version integer,
  p_tipo_vencimento_id uuid,
  p_valido_ate date,
  p_antecedencia_dias integer,
  p_unidade_id uuid default null,
  p_instrumento_id uuid default null,
  p_numero text default null,
  p_orgao text default null,
  p_notas text default null,
  p_emitido_em date default null,
  p_emitido_texto text default null,
  p_validade_texto text default null,
  p_responsavel_tecnico_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vencimento;
  tipo public.tipo_vencimento;
  numero_novo text := nullif(btrim(coalesce(p_numero, '')), '');
  orgao_novo text := nullif(btrim(coalesce(p_orgao, '')), '');
  notas_novas text := nullif(btrim(coalesce(p_notas, '')), '');
  emitido_texto_novo text := nullif(btrim(coalesce(p_emitido_texto, '')), '');
  validade_texto_nova text := nullif(btrim(coalesce(p_validade_texto, '')), '');
begin
  alvo := private.vencimento_para_gestao(p_vencimento_id, coalesce(p_row_version, -1));

  if p_tipo_vencimento_id is distinct from alvo.tipo_vencimento_id then
    select * into tipo from public.tipo_vencimento as t
    where t.id = p_tipo_vencimento_id and t.consultoria_id = alvo.consultoria_id;
    if not found then
      raise exception 'tipo_vencimento_invalido' using errcode = '22023';
    end if;
    if not tipo.ativo then
      raise exception 'tipo_vencimento_inativo' using errcode = 'P0001';
    end if;
    if tipo.exige_pdf and alvo.documento_id is null then
      raise exception 'pdf_obrigatorio' using errcode = '22023';
    end if;
  end if;

  perform private.conferir_dados_do_vencimento(p_numero, p_orgao, p_notas, p_emitido_texto, p_validade_texto,
                                               p_valido_ate, p_emitido_em, p_antecedencia_dias);
  perform private.conferir_vinculos_do_vencimento(
    alvo.consultoria_id, alvo.empreendimento_id, p_unidade_id, p_instrumento_id, p_responsavel_tecnico_id,
    p_responsavel_tecnico_id is distinct from alvo.responsavel_tecnico_id);

  if alvo.tipo_vencimento_id = p_tipo_vencimento_id and alvo.unidade_id is not distinct from p_unidade_id
     and alvo.instrumento_id is not distinct from p_instrumento_id
     and alvo.numero is not distinct from numero_novo and alvo.orgao is not distinct from orgao_novo
     and alvo.notas is not distinct from notas_novas and alvo.emitido_em is not distinct from p_emitido_em
     and alvo.emitido_texto is not distinct from emitido_texto_novo and alvo.valido_ate = p_valido_ate
     and alvo.validade_texto is not distinct from validade_texto_nova
     and alvo.antecedencia_dias = p_antecedencia_dias
     and alvo.responsavel_tecnico_id is not distinct from p_responsavel_tecnico_id then
    return alvo.row_version;
  end if;

  update public.vencimento as v
  set tipo_vencimento_id = p_tipo_vencimento_id, unidade_id = p_unidade_id, instrumento_id = p_instrumento_id,
      numero = numero_novo, orgao = orgao_novo, notas = notas_novas, emitido_em = p_emitido_em,
      emitido_texto = emitido_texto_novo, valido_ate = p_valido_ate, validade_texto = validade_texto_nova,
      antecedencia_dias = p_antecedencia_dias, responsavel_tecnico_id = p_responsavel_tecnico_id,
      row_version = v.row_version + 1
  where v.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Trocar o PDF: versão nova e imutável; a anterior continua no histórico. Sem documento, cria um
-- (entidade 'vencimento'). Repetir com a mesma versão devolve a versão.
create function public.trocar_pdf_vencimento(
  p_vencimento_id uuid,
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
  alvo public.vencimento;
  ator uuid;
  doc uuid;
  doc_da_versao uuid;
  tamanho bigint;
  proximo integer;
begin
  alvo := private.vencimento_para_gestao(p_vencimento_id, null);
  ator := private.membro_atual(alvo.consultoria_id);
  if p_versao_id is null then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  select v.documento_id into doc_da_versao from public.documento_versao as v where v.id = p_versao_id;
  if found then
    if doc_da_versao = alvo.documento_id then
      return p_versao_id;
    end if;
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;
  tamanho := private.conferir_pdf_enviado(alvo.consultoria_id, 'vencimento', p_caminho, p_nome_original, p_sha256);

  doc := alvo.documento_id;
  if doc is null then
    insert into public.documento (consultoria_id, entidade, versao_vigente_id)
    values (alvo.consultoria_id, 'vencimento', null)
    returning id into doc;
  end if;
  select coalesce(max(v.numero), 0) + 1 into proximo
  from public.documento_versao as v where v.documento_id = doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, doc, proximo, p_caminho, btrim(p_nome_original), 'application/pdf',
          tamanho, lower(p_sha256), ator);
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  update public.vencimento as v set documento_id = doc, row_version = v.row_version + 1 where v.id = alvo.id;
  return p_versao_id;
end;
$$;

-- Excluir: lógica; repetir é inofensivo. O anterior volta a ser o vigente da série. Não exclui um
-- vencimento que já foi renovado.
create function public.excluir_vencimento(p_vencimento_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vencimento;
  ator uuid;
begin
  select * into alvo from public.vencimento as v where v.id = p_vencimento_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(alvo.consultoria_id);
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    return;
  end if;
  if p_row_version is null or alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.vencimento as s
    where s.consultoria_id = alvo.consultoria_id and s.anterior_id = alvo.id and s.excluido_em is null
  ) then
    raise exception 'vencimento_ja_renovado' using errcode = 'P0001';
  end if;
  update public.vencimento as v
  set excluido_por = ator, excluido_em = now(), row_version = v.row_version + 1
  where v.id = alvo.id;
end;
$$;

revoke all on function public.cadastrar_vencimento(uuid, uuid, uuid, date, uuid, uuid, text, text, text, date, text,
  text, integer, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.renovar_vencimento(uuid, uuid, integer, date, uuid, text, text, text, date, text, text,
  integer, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.editar_vencimento(uuid, integer, uuid, date, integer, uuid, uuid, text, text, text,
  date, text, text, uuid) from public, anon;
revoke all on function public.trocar_pdf_vencimento(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.excluir_vencimento(uuid, integer) from public, anon;
grant execute on function public.cadastrar_vencimento(uuid, uuid, uuid, date, uuid, uuid, text, text, text, date, text,
  text, integer, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.renovar_vencimento(uuid, uuid, integer, date, uuid, text, text, text, date, text, text,
  integer, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.editar_vencimento(uuid, integer, uuid, date, integer, uuid, uuid, text, text, text,
  date, text, text, uuid) to authenticated;
grant execute on function public.trocar_pdf_vencimento(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.excluir_vencimento(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Fontes da base (ADR-0041): create or replace mantém o retorno e os grants.
-- ---------------------------------------------------------------------------
-- Vencimento vigente da série (sem sucessor vivo) como linha de prazo: sem responsável, sem tipo de
-- licença, prazo = valido_ate. Título = tipo + número; licença = a licença ligada; sem unidade,
-- unidade_nome vazio. A antecedência não filtra: só muda a situação na tela.
create or replace function private.linhas_de_prazo_vencimento(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as (select private.hoje_da_consultoria(cid) as d)
  select
    'vencimento'::text, v.id, v.instrumento_id, v.valido_ate, v.valido_ate - h.d,
    null::text, concat_ws(' ', t.nome, v.numero), e.id, e.nome, u.id, coalesce(u.nome, ''),
    nullif(concat_ws(' ', ti.sigla, i.numero), ''), null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, v.row_version
  from public.vencimento as v
  cross join hoje as h
  join public.tipo_vencimento as t on t.consultoria_id = v.consultoria_id and t.id = v.tipo_vencimento_id
  join public.empreendimento as e on e.consultoria_id = v.consultoria_id and e.id = v.empreendimento_id
  left join public.unidade as u on u.consultoria_id = v.consultoria_id and u.id = v.unidade_id
  left join public.instrumento as i on i.consultoria_id = v.consultoria_id and i.id = v.instrumento_id
  left join public.tipo_instrumento as ti on ti.consultoria_id = i.consultoria_id and ti.id = i.tipo_id
  where v.consultoria_id = cid and v.excluido_em is null
    and not exists (
      select 1 from public.vencimento as s
      where s.consultoria_id = v.consultoria_id and s.anterior_id = v.id and s.excluido_em is null
    )
$$;

comment on function private.linhas_de_prazo_vencimento(uuid) is
  'Vencimentos (P4, ADR-0046): o vigente da série, tipo_linha vencimento, sem responsável, prazo = valido_ate.';

-- Grupo vencimento da busca: tipo, número e órgão (não o nome do empreendimento), inclusive os
-- renovados; leva ao empreendimento.
create or replace function private.busca_vencimentos(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select
    v.id,
    concat_ws(' ', t.nome, v.numero),
    concat_ws(' · ', e.nome, 'Validade ' || to_char(v.valido_ate, 'DD/MM/YYYY')),
    v.empreendimento_id,
    row_number() over (
      order by starts_with(private.normalizar_nome(concat_ws(' ', t.nome, v.numero)), b.termo) desc,
               v.valido_ate desc, v.id
    )
  from private.termo_de_busca(p_termo) as b
  join public.vencimento as v on v.consultoria_id = p_consultoria_id and v.excluido_em is null
  join public.tipo_vencimento as t on t.consultoria_id = v.consultoria_id and t.id = v.tipo_vencimento_id
  join public.empreendimento as e on e.consultoria_id = v.consultoria_id and e.id = v.empreendimento_id
  where private.normalizar_nome(concat_ws(' ', t.nome, v.numero, v.orgao)) like b.padrao
$$;

comment on function private.busca_vencimentos(uuid, text) is
  'Grupo vencimento da busca global (P4, ADR-0046): tipo, número e órgão; leva ao empreendimento.';
