-- Triagem grava no empreendimento (ADR-0050, pacote L3; LEG-05). Base para saber quais normas se
-- aplicam ao empreendimento mesmo antes de existir licença.
-- 1. unidade ganha o município (código IBGE de SC e nome), gravado pela consulta de local.
-- 2. gravar_municipio_da_unidade: qualquer membro ativo (o município é fato do mapa, não decisão).
-- 3. atividade_do_empreendimento: mesmo desenho de atividade_licenciada (ADR-0044), ligada ao
--    empreendimento em vez da licença. Escrita só pela RPC.
-- 4. gravar_atividades_no_empreendimento: só Gestão; inclui ou atualiza pelo código, nunca apaga.
--    Validação no helper private.validar_atividades_da_triagem (a RPC do P2 não muda).
-- 5. private.atividades_do_empreendimento e listar_atividades_do_empreendimento: as atividades
--    gravadas no empreendimento e nas licenças dele, juntas; a RLS decide o que se vê.
-- Só aditiva. Nada muda em atividade_licenciada nem em gravar_atividades_na_licenca.

-- ---------------------------------------------------------------------------
-- 1. Município da unidade
-- ---------------------------------------------------------------------------
alter table public.unidade
  add column municipio_ibge text,
  add column municipio_nome text,
  add column municipio_gravado_em timestamptz,
  add constraint unidade_municipio_ibge_formato check (municipio_ibge ~ '^42[0-9]{5}$'),
  add constraint unidade_municipio_nome_preenchido check (length(btrim(municipio_nome)) between 1 and 120),
  add constraint unidade_municipio_completo check (
    (municipio_ibge is null and municipio_nome is null and municipio_gravado_em is null)
    or (municipio_ibge is not null and municipio_nome is not null and municipio_gravado_em is not null)
  );

comment on column public.unidade.municipio_ibge is
  'Código IBGE do município da unidade (7 dígitos, SC começa por 42). Gravado por gravar_municipio_da_unidade.';
comment on column public.unidade.municipio_nome is 'Nome do município da unidade, como veio da consulta de local.';
comment on column public.unidade.municipio_gravado_em is 'Instante em que o município foi gravado ou mudou pela última vez.';

-- ---------------------------------------------------------------------------
-- 2. gravar_municipio_da_unidade
-- ---------------------------------------------------------------------------
create function public.gravar_municipio_da_unidade(
  p_consultoria_id uuid,
  p_unidade_id uuid,
  p_codigo_ibge text,
  p_nome text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_limpo text := btrim(coalesce(p_nome, ''));
  mudou integer;
begin
  -- Antes de tudo, para não revelar se a unidade existe. O suporte não tem membro.
  if private.membro_atual(p_consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.unidade as u
    where u.consultoria_id = p_consultoria_id and u.id = p_unidade_id
  ) then
    raise exception 'unidade_invalida' using errcode = '22023';
  end if;

  if p_codigo_ibge is null or p_codigo_ibge !~ '^42[0-9]{5}$' or length(nome_limpo) not between 1 and 120 then
    raise exception 'municipio_invalido' using errcode = '22023';
  end if;

  -- Só mexe na linha se mudou (as barreiras de suporte e comercial da unidade valem aqui).
  update public.unidade as u
  set municipio_ibge = p_codigo_ibge,
      municipio_nome = nome_limpo,
      municipio_gravado_em = now()
  where u.consultoria_id = p_consultoria_id and u.id = p_unidade_id
    and (u.municipio_ibge, u.municipio_nome) is distinct from (p_codigo_ibge, nome_limpo);
  get diagnostics mudou = row_count;
  return mudou > 0;
end;
$$;

comment on function public.gravar_municipio_da_unidade(uuid, uuid, text, text) is
  'Grava o município (código IBGE de SC e nome) da unidade (ADR-0050). Qualquer membro ativo; devolve se mudou.';

revoke all on function public.gravar_municipio_da_unidade(uuid, uuid, text, text) from public, anon;
grant execute on function public.gravar_municipio_da_unidade(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. atividade_do_empreendimento
-- ---------------------------------------------------------------------------
create table public.atividade_do_empreendimento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  codigo text not null,
  descricao text not null,
  porte text not null,
  potencial text not null,
  medidas jsonb not null default '{}'::jsonb,
  fonte text not null,
  registrado_por uuid not null,
  registrado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint atividade_do_empreendimento_consultoria_id_id_key unique (consultoria_id, id),
  constraint atividade_do_empreendimento_codigo_key unique (consultoria_id, empreendimento_id, codigo),
  constraint atividade_do_empreendimento_codigo_formato check (codigo ~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'),
  constraint atividade_do_empreendimento_descricao_preenchida check (length(btrim(descricao)) between 1 and 2000),
  constraint atividade_do_empreendimento_porte_valido
    check (porte in ('minimo', 'pequeno', 'medio', 'grande', 'unico')),
  constraint atividade_do_empreendimento_potencial_valido check (potencial in ('P', 'M', 'G')),
  constraint atividade_do_empreendimento_medidas_objeto check (jsonb_typeof(medidas) = 'object'),
  constraint atividade_do_empreendimento_fonte_preenchida check (length(btrim(fonte)) between 1 and 300),
  constraint atividade_do_empreendimento_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint atividade_do_empreendimento_registrado_por_fk foreign key (consultoria_id, registrado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.atividade_do_empreendimento is
  'Atividades do empreendimento pela triagem CONSEMA 250/2024 (ADR-0050). Escrita só por gravar_atividades_no_empreendimento.';
comment on column public.atividade_do_empreendimento.potencial is 'Potencial poluidor geral (P, M, G) da atividade.';
comment on column public.atividade_do_empreendimento.medidas is
  'Sigla do parâmetro (Anexo VII) → valor numérico ≥ 0, como digitado na triagem.';
comment on column public.atividade_do_empreendimento.fonte is 'Catálogo usado (CATALOGO_CONSEMA_250.fonte).';

alter table public.atividade_do_empreendimento enable row level security;
alter table public.atividade_do_empreendimento force row level security;

revoke all on table public.atividade_do_empreendimento from anon, authenticated;
grant select on table public.atividade_do_empreendimento to authenticated;

create policy atividade_do_empreendimento_select_membro_ativo on public.atividade_do_empreendimento
  for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create trigger atividade_do_empreendimento_auditar
  after insert or update or delete on public.atividade_do_empreendimento
  for each row execute function private.auditar();

create trigger _suporte_somente_leitura
  before insert or update or delete on public.atividade_do_empreendimento
  for each row execute function private.bloquear_escrita_do_suporte();

-- Sem o módulo 'orcamentos': a triagem não depende do plano de orçamentos.
create trigger _comercial_somente_leitura
  before insert or update or delete on public.atividade_do_empreendimento
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- 4. gravar_atividades_no_empreendimento
-- ---------------------------------------------------------------------------
-- Confere o payload da triagem inteiro antes de gravar qualquer linha: array de 1 a 50 objetos com
-- código no formato 00.00.00 (sem repetir), descrição, porte, potencial, fonte e medidas numéricas
-- ≥ 0. Qualquer falha: 'atividades_invalidas'. Mesma regra de gravar_atividades_na_licenca.
create function private.validar_atividades_da_triagem(p_atividades jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  medida record;
  codigos text[] := '{}';
begin
  if p_atividades is null or jsonb_typeof(p_atividades) <> 'array'
     or jsonb_array_length(p_atividades) not between 1 and 50 then
    raise exception 'atividades_invalidas' using errcode = '22023';
  end if;

  for item in select a.value from jsonb_array_elements(p_atividades) as a loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item -> 'codigo') is distinct from 'string'
       or jsonb_typeof(item -> 'descricao') is distinct from 'string'
       or jsonb_typeof(item -> 'porte') is distinct from 'string'
       or jsonb_typeof(item -> 'potencial') is distinct from 'string'
       or jsonb_typeof(item -> 'fonte') is distinct from 'string'
       or jsonb_typeof(coalesce(item -> 'medidas', '{}'::jsonb)) <> 'object' then
      raise exception 'atividades_invalidas' using errcode = '22023';
    end if;
    if (item ->> 'codigo') !~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'
       or (item ->> 'codigo') = any (codigos)
       or length(btrim(item ->> 'descricao')) not between 1 and 2000
       or (item ->> 'porte') not in ('minimo', 'pequeno', 'medio', 'grande', 'unico')
       or (item ->> 'potencial') not in ('P', 'M', 'G')
       or length(btrim(item ->> 'fonte')) not between 1 and 300 then
      raise exception 'atividades_invalidas' using errcode = '22023';
    end if;
    for medida in select m.key, m.value from jsonb_each(coalesce(item -> 'medidas', '{}'::jsonb)) as m loop
      if length(medida.key) not between 1 and 40 or jsonb_typeof(medida.value) <> 'number' then
        raise exception 'atividades_invalidas' using errcode = '22023';
      end if;
      -- Separado: o cast só roda depois de saber que é número.
      if (medida.value #>> '{}')::numeric < 0 then
        raise exception 'atividades_invalidas' using errcode = '22023';
      end if;
    end loop;
    codigos := codigos || (item ->> 'codigo');
  end loop;
end;
$$;

comment on function private.validar_atividades_da_triagem(jsonb) is
  'Confere o payload de atividades da triagem CONSEMA 250/2024; recusa com atividades_invalidas (22023).';

revoke all on function private.validar_atividades_da_triagem(jsonb) from public, anon, authenticated;

create function public.gravar_atividades_no_empreendimento(
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_atividades jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
  total integer;
begin
  -- Antes de tudo, para não revelar se o empreendimento existe.
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.empreendimento as e
    where e.consultoria_id = p_consultoria_id and e.id = p_empreendimento_id
  ) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;

  perform private.validar_atividades_da_triagem(p_atividades);

  -- Inclui ou atualiza pelo código; só mexe na linha se o conteúdo mudou. Nunca apaga.
  insert into public.atividade_do_empreendimento as a
    (consultoria_id, empreendimento_id, codigo, descricao, porte, potencial, medidas, fonte, registrado_por)
  select p_consultoria_id, p_empreendimento_id, x.value ->> 'codigo', btrim(x.value ->> 'descricao'),
         x.value ->> 'porte', x.value ->> 'potencial', coalesce(x.value -> 'medidas', '{}'::jsonb),
         btrim(x.value ->> 'fonte'), autor
  from jsonb_array_elements(p_atividades) as x
  on conflict on constraint atividade_do_empreendimento_codigo_key do update
  set descricao = excluded.descricao,
      porte = excluded.porte,
      potencial = excluded.potencial,
      medidas = excluded.medidas,
      fonte = excluded.fonte,
      registrado_por = excluded.registrado_por,
      registrado_em = now(),
      row_version = a.row_version + 1
  where (a.descricao, a.porte, a.potencial, a.medidas, a.fonte)
        is distinct from (excluded.descricao, excluded.porte, excluded.potencial, excluded.medidas, excluded.fonte);

  select count(*)::integer into total
  from public.atividade_do_empreendimento as a
  where a.consultoria_id = p_consultoria_id and a.empreendimento_id = p_empreendimento_id;
  return total;
end;
$$;

comment on function public.gravar_atividades_no_empreendimento(uuid, uuid, jsonb) is
  'Grava as atividades enquadradas da triagem no empreendimento (ADR-0050). Só Gestão; inclui ou atualiza pelo código, nunca apaga.';

revoke all on function public.gravar_atividades_no_empreendimento(uuid, uuid, jsonb) from public, anon;
grant execute on function public.gravar_atividades_no_empreendimento(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Atividades do empreendimento (gravadas nele e nas licenças dele)
-- ---------------------------------------------------------------------------
-- Base da aplicabilidade de normas (LEG-05). security invoker: a RLS das duas tabelas decide.
create function private.atividades_do_empreendimento(cid uuid, eid uuid)
returns table (codigo text, porte text, origem text, instrumento_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.codigo, a.porte, 'empreendimento'::text, null::uuid
  from public.atividade_do_empreendimento as a
  where a.consultoria_id = cid and a.empreendimento_id = eid
  union all
  select l.codigo, l.porte, 'licenca'::text, l.instrumento_id
  from public.atividade_licenciada as l
  join public.instrumento as i on i.consultoria_id = l.consultoria_id and i.id = l.instrumento_id
  where l.consultoria_id = cid and i.empreendimento_id = eid
$$;

comment on function private.atividades_do_empreendimento(uuid, uuid) is
  'Atividades do empreendimento (origem empreendimento) e das licenças dele (origem licenca). A RLS decide.';

revoke all on function private.atividades_do_empreendimento(uuid, uuid) from public, anon;
grant execute on function private.atividades_do_empreendimento(uuid, uuid) to authenticated;

create function public.listar_atividades_do_empreendimento(p_consultoria_id uuid, p_empreendimento_id uuid)
returns table (
  codigo text,
  descricao text,
  porte text,
  potencial text,
  origem text,
  instrumento_id uuid,
  registrado_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.codigo, x.descricao, x.porte, x.potencial, x.origem, x.instrumento_id, x.registrado_em
  from (
    select a.codigo, a.descricao, a.porte, a.potencial, 'empreendimento'::text as origem,
           null::uuid as instrumento_id, a.registrado_em
    from public.atividade_do_empreendimento as a
    where a.consultoria_id = p_consultoria_id and a.empreendimento_id = p_empreendimento_id
    union all
    select l.codigo, l.descricao, l.porte, l.potencial, 'licenca'::text, l.instrumento_id, l.registrado_em
    from public.atividade_licenciada as l
    join public.instrumento as i on i.consultoria_id = l.consultoria_id and i.id = l.instrumento_id
    where l.consultoria_id = p_consultoria_id and i.empreendimento_id = p_empreendimento_id
  ) as x
  order by x.codigo, x.origem, x.instrumento_id
$$;

comment on function public.listar_atividades_do_empreendimento(uuid, uuid) is
  'Atividades do empreendimento e das licenças dele, por código (ADR-0050). Qualquer membro; a RLS decide.';

revoke all on function public.listar_atividades_do_empreendimento(uuid, uuid) from public, anon;
grant execute on function public.listar_atividades_do_empreendimento(uuid, uuid) to authenticated;
