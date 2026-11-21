-- Requisitos legais por empreendimento (pacote L6, ADR-0050, LEG-07 e LEG-08).
--
-- O requisito liga uma norma do catálogo (private.norma) a um empreendimento. Nasce sugerido pela
-- triagem (atividades, município e licenças, a mesma regra dos avisos do L5) ou à mão. Aplicabilidade:
-- a Equipe confirma que se aplica; só a Gestão marca "não se aplica", com justificativa. A avaliação
-- (conforme ou não conforme) só acrescenta e guarda a versão da norma avaliada: a situação "Rever" é
-- calculada no domínio (norma com mudança publicada depois da avaliação), nunca gravada. Ação do
-- plano vira linha de prazo (tipo acao_legal) na Visão e no Calendário. Evidência é PDF imutável no
-- Storage, com validade opcional.
--
-- Recurso de plano 'legislacao' (Equipe e Escala): requisitos, avaliações, ações e evidências só são
-- escritos com ele. O aviso de mudança de norma (L5) continua em todos os planos.

-- ---------------------------------------------------------------------------
-- 1. Recurso 'legislacao'
-- ---------------------------------------------------------------------------
alter table private.plano_catalogo drop constraint plano_catalogo_recursos;
alter table private.plano_catalogo
  add constraint plano_catalogo_recursos check (
    recursos <@ array['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes', 'legislacao']::text[]);

update private.plano_catalogo
set recursos = recursos || array['legislacao']
where codigo in ('equipe', 'escala') and not ('legislacao' = any (recursos));

-- Mesmo corpo de 20261114230000, com 'legislacao' na lista aceita.
create or replace function public.central_definir_recursos_do_plano(
  p_codigo text,
  p_recursos text[],
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_atual private.plano_catalogo;
  v_novos text[];
begin
  perform private.exigir_operador();
  v_motivo := private.motivo_obrigatorio(p_motivo);
  select * into v_atual from private.plano_catalogo as p where p.codigo = p_codigo for update;
  if not found then
    raise exception 'plano_inexistente' using errcode = 'P0001';
  end if;
  -- Ordem fixa e sem repetição, para o histórico comparar listas iguais.
  select coalesce(array_agg(r order by r), '{}') into v_novos
  from (select distinct unnest(coalesce(p_recursos, '{}'::text[])) as r) as x;
  if not v_novos <@ array['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes', 'legislacao']::text[] then
    raise exception 'recurso_invalido' using errcode = '22023';
  end if;
  if (select coalesce(array_agg(r order by r), '{}') from unnest(v_atual.recursos) as r) = v_novos then
    return;
  end if;

  update private.plano_catalogo as p set recursos = v_novos where p.codigo = p_codigo;
  insert into private.parametro_comercial_historico (alvo, antes, depois, motivo, alterada_por)
  values ('plano:' || p_codigo, jsonb_build_object('recursos', to_jsonb(v_atual.recursos)),
          jsonb_build_object('recursos', to_jsonb(v_novos)), v_motivo, (select auth.uid()));
end;
$$;

-- Mesmo corpo de 20261117183847, com 'legislacao' na lista aceita.
create or replace function public.recurso_liberado(p_consultoria_id uuid, p_recurso text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_membro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_recurso is null
     or p_recurso not in ('capacidade', 'integracao_ima', 'financeiro', 'analise_lotes', 'legislacao', 'ia',
                          'orcamentos') then
    raise exception 'recurso_invalido' using errcode = '22023';
  end if;
  return private.recurso_liberado(p_consultoria_id, p_recurso);
end;
$$;

-- Documento de evidência de requisito.
alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida
  check (entidade in ('instrumento', 'evidencia', 'protocolo', 'membro', 'consultoria', 'mtr', 'cdf',
                      'alvara', 'exigencia', 'exigencia_resposta', 'vencimento', 'importacao',
                      'requisito_legal'));

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
create table public.requisito_legal (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  norma_id uuid not null references private.norma (id) on delete restrict,
  dispositivo text,
  descricao text,
  origem text not null,
  motivo jsonb,
  aplicavel boolean,
  justificativa text,
  decidido_por uuid,
  decidido_em timestamptz,
  responsavel_id uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint requisito_legal_consultoria_id_id_key unique (consultoria_id, id),
  constraint requisito_legal_unico unique nulls not distinct (consultoria_id, empreendimento_id, norma_id, dispositivo),
  constraint requisito_legal_origem_valida check (origem in ('sugerido', 'manual')),
  constraint requisito_legal_dispositivo_tamanho check (dispositivo is null or length(btrim(dispositivo)) between 1 and 120),
  constraint requisito_legal_descricao_tamanho check (descricao is null or length(btrim(descricao)) between 1 and 2000),
  constraint requisito_legal_justificativa_tamanho check (justificativa is null or length(btrim(justificativa)) between 1 and 1000),
  constraint requisito_legal_nao_se_aplica_justificado check (aplicavel is distinct from false or justificativa is not null),
  constraint requisito_legal_decisao_coerente check ((aplicavel is null) = (decidido_em is null)),
  constraint requisito_legal_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint requisito_legal_decidido_por_fk foreign key (consultoria_id, decidido_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint requisito_legal_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint requisito_legal_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.requisito_legal is
  'Norma do catálogo aplicável a um empreendimento (ADR-0050, LEG-07). Situação calculada no domínio.';
comment on column public.requisito_legal.aplicavel is
  'Nulo = sugerido e ainda não decidido; false = não se aplica (só a Gestão, com justificativa).';

create index requisito_legal_empreendimento_idx on public.requisito_legal (consultoria_id, empreendimento_id);

create table public.avaliacao_conformidade (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  requisito_id uuid not null,
  resultado text not null,
  avaliada_em date not null,
  avaliada_por uuid not null,
  observacao text,
  norma_versao_id uuid references private.norma_versao (id) on delete restrict,
  criado_em timestamptz not null default now(),
  constraint avaliacao_conformidade_consultoria_id_id_key unique (consultoria_id, id),
  constraint avaliacao_conformidade_resultado_valido check (resultado in ('conforme', 'nao_conforme')),
  constraint avaliacao_conformidade_observacao_tamanho check (observacao is null or length(btrim(observacao)) between 1 and 2000),
  constraint avaliacao_conformidade_requisito_fk foreign key (consultoria_id, requisito_id)
    references public.requisito_legal (consultoria_id, id) on delete restrict,
  constraint avaliacao_conformidade_avaliada_por_fk foreign key (consultoria_id, avaliada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.avaliacao_conformidade is
  'Avaliação de um requisito legal. Só acrescenta: a última vale. Guarda a versão da norma avaliada.';

create index avaliacao_conformidade_requisito_idx on public.avaliacao_conformidade (consultoria_id, requisito_id, criado_em desc);

create table public.acao_legal (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  requisito_id uuid not null,
  avaliacao_id uuid,
  descricao text not null,
  responsavel_id uuid,
  prazo date not null,
  concluida_em timestamptz,
  concluida_por uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint acao_legal_consultoria_id_id_key unique (consultoria_id, id),
  constraint acao_legal_descricao_tamanho check (length(btrim(descricao)) between 1 and 500),
  constraint acao_legal_conclusao_coerente check ((concluida_em is null) = (concluida_por is null)),
  constraint acao_legal_requisito_fk foreign key (consultoria_id, requisito_id)
    references public.requisito_legal (consultoria_id, id) on delete restrict,
  constraint acao_legal_avaliacao_fk foreign key (consultoria_id, avaliacao_id)
    references public.avaliacao_conformidade (consultoria_id, id) on delete restrict,
  constraint acao_legal_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint acao_legal_concluida_por_fk foreign key (consultoria_id, concluida_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint acao_legal_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.acao_legal is 'Ação do plano de ação de um requisito legal (LEG-08). Vira linha de prazo acao_legal.';
comment on column public.acao_legal.prazo is 'Data civil do prazo da ação.';

create index acao_legal_aberta_idx on public.acao_legal (consultoria_id, prazo) where concluida_em is null;

create table public.evidencia_de_requisito (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  requisito_id uuid not null,
  documento_id uuid not null,
  validade date,
  enviada_por uuid not null,
  enviada_em timestamptz not null default now(),
  constraint evidencia_de_requisito_consultoria_id_id_key unique (consultoria_id, id),
  constraint evidencia_de_requisito_documento_key unique (consultoria_id, documento_id),
  constraint evidencia_de_requisito_requisito_fk foreign key (consultoria_id, requisito_id)
    references public.requisito_legal (consultoria_id, id) on delete restrict,
  constraint evidencia_de_requisito_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint evidencia_de_requisito_enviada_por_fk foreign key (consultoria_id, enviada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.evidencia_de_requisito is
  'Documento (PDF imutável) que comprova o atendimento de um requisito legal, com validade opcional.';
comment on column public.evidencia_de_requisito.validade is 'Data civil até quando a evidência vale. Nulo = sem validade.';

-- Avaliação só acrescenta.
create function private.bloquear_alteracao_de_avaliacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'avaliacao_imutavel' using errcode = 'P0001';
end;
$$;

revoke all on function private.bloquear_alteracao_de_avaliacao() from public, anon, authenticated;

create trigger avaliacao_conformidade_imutavel
before update or delete on public.avaliacao_conformidade
for each row execute function private.bloquear_alteracao_de_avaliacao();

do $$
declare
  t text;
begin
  foreach t in array array['requisito_legal', 'avaliacao_conformidade', 'acao_legal', 'evidencia_de_requisito']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_membro(consultoria_id)))',
      t || '_select_membro_ativo', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.auditar()',
      t || '_auditar', t);
    execute format(
      'create trigger _suporte_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_do_suporte()', t);
    execute format(
      'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_comercial(''consultoria_id'', ''legislacao'')', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Normas aplicáveis a um empreendimento (mesma regra de private.empreendimentos_afetados e de
--    packages/domain/src/aplicabilidade.ts, vista do lado do empreendimento). Só normas vigentes.
-- ---------------------------------------------------------------------------
create function private.normas_aplicaveis(p_consultoria_id uuid, p_empreendimento_id uuid)
returns table (norma_id uuid, motivo jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with municipio as (
    select u.municipio_ibge
    from public.unidade as u
    where u.consultoria_id = p_consultoria_id and u.empreendimento_id = p_empreendimento_id
      and u.municipio_ibge is not null
  ),
  licenca as (
    select i.id as iid, i.orgao, t.sigla
    from public.instrumento as i
    left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
    where i.consultoria_id = p_consultoria_id and i.empreendimento_id = p_empreendimento_id
      and i.situacao = 'ativo'
  ),
  atividade_da_licenca as (
    select l.iid, a.codigo
    from licenca as l
    join public.atividade_licenciada as a on a.consultoria_id = p_consultoria_id and a.instrumento_id = l.iid
  ),
  atividade_do_emp as (
    select a.codigo
    from public.atividade_do_empreendimento as a
    where a.consultoria_id = p_consultoria_id and a.empreendimento_id = p_empreendimento_id
  ),
  norma as (
    select n.id,
      exists (select 1 from private.norma_criterio as c
              where c.norma_id = n.id and c.tipo in ('atividade', 'prefixo_atividade')) as tem_atividade,
      exists (select 1 from private.norma_criterio as c where c.norma_id = n.id and c.tipo = 'municipio') as tem_municipio,
      exists (select 1 from private.norma_criterio as c where c.norma_id = n.id and c.tipo = 'tipo_licenca') as tem_tipo
    from private.norma as n
    where n.situacao_na_fonte = 'vigente'
      and (n.esfera <> 'municipal' or n.municipio_ibge in (select m.municipio_ibge from municipio as m))
  ),
  licenca_da_norma as (
    select n.id as norma_id, l.iid, l.orgao
    from norma as n
    cross join licenca as l
    where not n.tem_tipo or exists (
      select 1 from private.norma_criterio as c
      where c.norma_id = n.id and c.tipo = 'tipo_licenca' and lower(c.valor) = lower(l.sigla))
  ),
  candidato as (
    select n.id, c.tipo, c.valor
    from norma as n
    join private.norma_criterio as c on c.norma_id = n.id and c.tipo in ('atividade', 'prefixo_atividade')
    where n.tem_atividade and (
      exists (
        select 1 from licenca_da_norma as ln
        join atividade_da_licenca as al on al.iid = ln.iid
        where ln.norma_id = n.id
          and ((c.tipo = 'atividade' and al.codigo = c.valor)
               or (c.tipo = 'prefixo_atividade' and starts_with(al.codigo, c.valor || '.'))))
      or exists (
        select 1 from atividade_do_emp as ae
        where (c.tipo = 'atividade' and ae.codigo = c.valor)
           or (c.tipo = 'prefixo_atividade' and starts_with(ae.codigo, c.valor || '.')))
    )
    union all
    select n.id, c.tipo, c.valor
    from norma as n
    join private.norma_criterio as c on c.norma_id = n.id and c.tipo = 'municipio'
    where not n.tem_atividade and c.valor in (select m.municipio_ibge from municipio as m)
    union all
    select n.id, c.tipo, c.valor
    from norma as n
    join private.norma_criterio as c on c.norma_id = n.id and c.tipo = 'competencia'
    where not n.tem_atividade and not n.tem_municipio and exists (
      select 1 from licenca_da_norma as ln
      where ln.norma_id = n.id and (
        (c.valor = 'estadual' and coalesce(ln.orgao, '') ~* '\m(IMA|FATMA)\M')
        or (c.valor = 'municipal' and btrim(coalesce(ln.orgao, '')) <> '' and ln.orgao !~* '\m(IMA|FATMA)\M')))
  )
  select distinct on (x.id) x.id, jsonb_build_object('criterio', x.tipo, 'valor', x.valor)
  from candidato as x
  order by x.id,
           case x.tipo when 'atividade' then 1 when 'prefixo_atividade' then 2 when 'municipio' then 3 else 4 end,
           x.valor
$$;

comment on function private.normas_aplicaveis(uuid, uuid) is
  'Normas vigentes que alcançam o empreendimento, com o motivo. Mesma regra dos avisos (L5) e do domínio.';

revoke all on function private.normas_aplicaveis(uuid, uuid) from public, anon, authenticated;

-- Membro ativo e recurso: 'sem_permissao' antes de tudo, para não revelar o que existe.
create function private.exigir_membro_com_legislacao(p_consultoria_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ator uuid := private.membro_atual(p_consultoria_id);
begin
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not private.recurso_liberado(p_consultoria_id, 'legislacao') then
    raise exception 'recurso_fora_do_plano' using errcode = '42501', detail = 'legislacao';
  end if;
  return ator;
end;
$$;

revoke all on function private.exigir_membro_com_legislacao(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Escrita
-- ---------------------------------------------------------------------------
-- Sugere pela triagem: cria os requisitos que faltam (nunca apaga nem desfaz decisão).
create function public.sugerir_requisitos(p_consultoria_id uuid, p_empreendimento_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  inseridos integer;
begin
  if not exists (
    select 1 from public.empreendimento as e
    where e.consultoria_id = p_consultoria_id and e.id = p_empreendimento_id
  ) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;

  insert into public.requisito_legal (consultoria_id, empreendimento_id, norma_id, origem, motivo, criado_por)
  select p_consultoria_id, p_empreendimento_id, a.norma_id, 'sugerido', a.motivo, ator
  from private.normas_aplicaveis(p_consultoria_id, p_empreendimento_id) as a
  on conflict on constraint requisito_legal_unico do nothing;
  get diagnostics inseridos = row_count;
  return inseridos;
end;
$$;

-- Requisito à mão: já aplicável. Repetir (mesma norma e dispositivo) devolve o existente.
create function public.adicionar_requisito(
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_norma_id uuid,
  p_dispositivo text default null,
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  v_dispositivo text := nullif(btrim(coalesce(p_dispositivo, '')), '');
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  novo uuid;
begin
  if not exists (
    select 1 from public.empreendimento as e
    where e.consultoria_id = p_consultoria_id and e.id = p_empreendimento_id
  ) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from private.norma as n where n.id = p_norma_id) then
    raise exception 'norma_invalida' using errcode = '22023';
  end if;
  if (v_dispositivo is not null and length(v_dispositivo) > 120)
     or (v_descricao is not null and length(v_descricao) > 2000) then
    raise exception 'requisito_invalido' using errcode = '22023';
  end if;

  insert into public.requisito_legal (consultoria_id, empreendimento_id, norma_id, dispositivo, descricao, origem,
                                      aplicavel, decidido_por, decidido_em, criado_por)
  values (p_consultoria_id, p_empreendimento_id, p_norma_id, v_dispositivo, v_descricao, 'manual',
          true, ator, now(), ator)
  on conflict on constraint requisito_legal_unico do nothing
  returning id into novo;

  if novo is null then
    select r.id into novo from public.requisito_legal as r
    where r.consultoria_id = p_consultoria_id and r.empreendimento_id = p_empreendimento_id
      and r.norma_id = p_norma_id and r.dispositivo is not distinct from v_dispositivo;
  end if;
  return novo;
end;
$$;

-- Aplicabilidade: "se aplica" qualquer membro; "não se aplica" só a Gestão, com justificativa.
create function public.decidir_aplicabilidade(
  p_consultoria_id uuid,
  p_requisito_id uuid,
  p_aplicavel boolean,
  p_justificativa text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  v_justificativa text := nullif(btrim(coalesce(p_justificativa, '')), '');
  alvo public.requisito_legal;
begin
  if p_aplicavel is null then
    raise exception 'aplicabilidade_invalida' using errcode = '22023';
  end if;
  if not p_aplicavel and not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not p_aplicavel and (v_justificativa is null or length(v_justificativa) > 1000) then
    raise exception 'justificativa_obrigatoria' using errcode = '22023';
  end if;

  select * into alvo from public.requisito_legal as r
  where r.consultoria_id = p_consultoria_id and r.id = p_requisito_id
  for update;
  if not found then
    raise exception 'requisito_invalido' using errcode = '22023';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  update public.requisito_legal as r
  set aplicavel = p_aplicavel,
      justificativa = case when p_aplicavel then null else v_justificativa end,
      decidido_por = ator,
      decidido_em = now(),
      row_version = r.row_version + 1
  where r.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Confere uma ação recebida em jsonb {descricao, prazo, responsavel_id?}. Devolve a linha pronta.
create function private.ler_acao_legal(p_consultoria_id uuid, p_acao jsonb)
returns table (descricao text, prazo date, responsavel_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_descricao text;
  v_prazo date;
  v_responsavel uuid;
begin
  if jsonb_typeof(p_acao) <> 'object'
     or jsonb_typeof(p_acao -> 'descricao') is distinct from 'string'
     or jsonb_typeof(p_acao -> 'prazo') is distinct from 'string' then
    raise exception 'acao_invalida' using errcode = '22023';
  end if;
  v_descricao := btrim(p_acao ->> 'descricao');
  if length(v_descricao) not between 1 and 500 or (p_acao ->> 'prazo') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'acao_invalida' using errcode = '22023';
  end if;
  begin
    v_prazo := (p_acao ->> 'prazo')::date;
  exception when others then
    raise exception 'acao_invalida' using errcode = '22023';
  end;
  if jsonb_typeof(p_acao -> 'responsavel_id') = 'string' then
    begin
      v_responsavel := (p_acao ->> 'responsavel_id')::uuid;
    exception when others then
      raise exception 'responsavel_invalido' using errcode = '22023';
    end;
    if not exists (
      select 1 from public.membro as m
      where m.consultoria_id = p_consultoria_id and m.id = v_responsavel and m.situacao = 'ativo'
    ) then
      raise exception 'responsavel_invalido' using errcode = '22023';
    end if;
  end if;
  return query select v_descricao, v_prazo, v_responsavel;
end;
$$;

revoke all on function private.ler_acao_legal(uuid, jsonb) from public, anon, authenticated;

-- Avaliação (e ação opcional) numa transação. Requisito sugerido passa a aplicável.
create function public.avaliar_requisito(
  p_consultoria_id uuid,
  p_requisito_id uuid,
  p_resultado text,
  p_avaliada_em date,
  p_observacao text,
  p_acao jsonb,
  p_row_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  alvo public.requisito_legal;
  acao_descricao text;
  acao_prazo date;
  acao_responsavel uuid;
  v_versao uuid;
  v_avaliacao uuid;
  v_acao uuid;
begin
  if p_resultado is null or p_resultado not in ('conforme', 'nao_conforme') then
    raise exception 'resultado_invalido' using errcode = '22023';
  end if;
  if p_avaliada_em is null or p_avaliada_em > private.hoje_da_consultoria(p_consultoria_id) then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  if v_observacao is not null and length(v_observacao) > 2000 then
    raise exception 'observacao_invalida' using errcode = '22023';
  end if;

  select * into alvo from public.requisito_legal as r
  where r.consultoria_id = p_consultoria_id and r.id = p_requisito_id
  for update;
  if not found then
    raise exception 'requisito_invalido' using errcode = '22023';
  end if;
  if alvo.aplicavel is false then
    raise exception 'requisito_nao_se_aplica' using errcode = 'P0001';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  if p_acao is not null and jsonb_typeof(p_acao) <> 'null' then
    select x.descricao, x.prazo, x.responsavel_id into acao_descricao, acao_prazo, acao_responsavel
    from private.ler_acao_legal(p_consultoria_id, p_acao) as x;
  end if;

  select v.id into v_versao
  from private.norma_versao as v
  where v.norma_id = alvo.norma_id
  order by v.numero desc
  limit 1;

  insert into public.avaliacao_conformidade (consultoria_id, requisito_id, resultado, avaliada_em, avaliada_por,
                                             observacao, norma_versao_id)
  values (p_consultoria_id, alvo.id, p_resultado, p_avaliada_em, ator, v_observacao, v_versao)
  returning id into v_avaliacao;

  if acao_descricao is not null then
    insert into public.acao_legal (consultoria_id, requisito_id, avaliacao_id, descricao, responsavel_id, prazo, criado_por)
    values (p_consultoria_id, alvo.id, v_avaliacao, acao_descricao, acao_responsavel, acao_prazo, ator)
    returning id into v_acao;
  end if;

  update public.requisito_legal as r
  set aplicavel = true,
      decidido_por = coalesce(r.decidido_por, ator),
      decidido_em = coalesce(r.decidido_em, now()),
      row_version = r.row_version + 1
  where r.id = alvo.id;

  return jsonb_build_object('avaliacao_id', v_avaliacao, 'acao_id', v_acao, 'row_version', alvo.row_version + 1);
end;
$$;

-- Ação avulsa num requisito (fora de uma avaliação).
create function public.criar_acao_legal(p_consultoria_id uuid, p_requisito_id uuid, p_acao jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  acao record;
  novo uuid;
begin
  if not exists (
    select 1 from public.requisito_legal as r
    where r.consultoria_id = p_consultoria_id and r.id = p_requisito_id and r.aplicavel is distinct from false
  ) then
    raise exception 'requisito_invalido' using errcode = '22023';
  end if;
  select * into acao from private.ler_acao_legal(p_consultoria_id, p_acao);
  insert into public.acao_legal (consultoria_id, requisito_id, descricao, responsavel_id, prazo, criado_por)
  values (p_consultoria_id, p_requisito_id, acao.descricao, acao.responsavel_id, acao.prazo, ator)
  returning id into novo;
  return novo;
end;
$$;

create function public.concluir_acao_legal(p_consultoria_id uuid, p_acao_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  alvo public.acao_legal;
begin
  select * into alvo from public.acao_legal as a
  where a.consultoria_id = p_consultoria_id and a.id = p_acao_id
  for update;
  if not found then
    raise exception 'acao_invalida' using errcode = '22023';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.concluida_em is not null then
    return alvo.row_version;
  end if;
  update public.acao_legal as a
  set concluida_em = now(), concluida_por = ator, row_version = a.row_version + 1
  where a.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Atribuir (ou tirar) o responsável da ação: Gestão, como nas ocorrências.
create function public.atribuir_acao_legal(
  p_consultoria_id uuid,
  p_acao_id uuid,
  p_responsavel_id uuid,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  alvo public.acao_legal;
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_responsavel_id is not null and not exists (
    select 1 from public.membro as m
    where m.consultoria_id = p_consultoria_id and m.id = p_responsavel_id and m.situacao = 'ativo'
  ) then
    raise exception 'responsavel_invalido' using errcode = '22023';
  end if;
  select * into alvo from public.acao_legal as a
  where a.consultoria_id = p_consultoria_id and a.id = p_acao_id
  for update;
  if not found or ator is null then
    raise exception 'acao_invalida' using errcode = '22023';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  update public.acao_legal as a
  set responsavel_id = p_responsavel_id, row_version = a.row_version + 1
  where a.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Evidência: PDF já enviado ao Storage (caminho consultoria/requisito_legal/<uuid>.pdf). Retry com a
-- mesma versão devolve a evidência dela.
create function public.anexar_evidencia_ao_requisito(
  p_consultoria_id uuid,
  p_requisito_id uuid,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_validade date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := private.exigir_membro_com_legislacao(p_consultoria_id);
  tamanho bigint;
  doc uuid;
  novo uuid;
begin
  select ev.id into novo
  from public.documento_versao as v
  join public.evidencia_de_requisito as ev on ev.consultoria_id = v.consultoria_id and ev.documento_id = v.documento_id
  where v.id = p_versao_id and v.consultoria_id = p_consultoria_id;
  if found then
    return novo;
  end if;
  if exists (select 1 from public.documento_versao as v where v.id = p_versao_id) then
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.requisito_legal as r
    where r.consultoria_id = p_consultoria_id and r.id = p_requisito_id
  ) then
    raise exception 'requisito_invalido' using errcode = '22023';
  end if;

  tamanho := private.conferir_pdf_enviado(p_consultoria_id, 'requisito_legal', p_caminho, p_nome_original, p_sha256);

  insert into public.documento (consultoria_id, entidade, versao_vigente_id)
  values (p_consultoria_id, 'requisito_legal', null)
  returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, p_consultoria_id, doc, 1, p_caminho, btrim(p_nome_original), 'application/pdf',
          tamanho, lower(p_sha256), ator);
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;

  insert into public.evidencia_de_requisito (consultoria_id, requisito_id, documento_id, validade, enviada_por)
  values (p_consultoria_id, p_requisito_id, doc, p_validade, ator)
  returning id into novo;
  return novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Leitura
-- ---------------------------------------------------------------------------
-- Requisitos do empreendimento com o que a tela precisa para calcular a situação no domínio.
create function public.listar_requisitos_do_empreendimento(
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  norma_id uuid,
  norma_titulo text,
  norma_situacao_na_fonte text,
  dispositivo text,
  descricao text,
  origem text,
  motivo jsonb,
  aplicavel boolean,
  justificativa text,
  responsavel_id uuid,
  row_version integer,
  avaliacao_resultado text,
  avaliada_em date,
  avaliada_por_nome text,
  ultima_mudanca_publicada_em timestamptz,
  acao_id uuid,
  acao_descricao text,
  acao_prazo date,
  acao_responsavel_id uuid,
  acao_responsavel_nome text,
  acao_row_version integer,
  evidencias integer,
  menor_validade date,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.norma_id, n.titulo, n.situacao_na_fonte, r.dispositivo, r.descricao, r.origem, r.motivo,
    r.aplicavel, r.justificativa, r.responsavel_id, r.row_version,
    av.resultado, av.avaliada_em, mav.nome,
    (select max(m.publicada_em) from private.norma_mudanca as m
     where m.norma_id = r.norma_id and m.situacao = 'publicada'),
    ac.id, ac.descricao, ac.prazo, ac.responsavel_id, mac.nome, ac.row_version,
    (select count(*)::integer from public.evidencia_de_requisito as ev
     where ev.consultoria_id = r.consultoria_id and ev.requisito_id = r.id),
    (select min(ev.validade) from public.evidencia_de_requisito as ev
     where ev.consultoria_id = r.consultoria_id and ev.requisito_id = r.id and ev.validade is not null),
    count(*) over ()
  from public.requisito_legal as r
  join private.norma as n on n.id = r.norma_id
  left join lateral (
    select a.resultado, a.avaliada_em, a.avaliada_por
    from public.avaliacao_conformidade as a
    where a.consultoria_id = r.consultoria_id and a.requisito_id = r.id
    order by a.criado_em desc, a.id desc
    limit 1
  ) as av on true
  left join public.membro as mav on mav.consultoria_id = r.consultoria_id and mav.id = av.avaliada_por
  left join lateral (
    select x.id, x.descricao, x.prazo, x.responsavel_id, x.row_version
    from public.acao_legal as x
    where x.consultoria_id = r.consultoria_id and x.requisito_id = r.id and x.concluida_em is null
    order by x.prazo, x.id
    limit 1
  ) as ac on true
  left join public.membro as mac on mac.consultoria_id = r.consultoria_id and mac.id = ac.responsavel_id
  where r.consultoria_id = p_consultoria_id and r.empreendimento_id = p_empreendimento_id
    and private.is_membro(p_consultoria_id)
  order by (r.aplicavel is false), n.esfera, n.orgao, n.titulo, r.dispositivo nulls first, r.id
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- Evidências de um requisito (para a lista dentro da linha).
create function public.listar_evidencias_do_requisito(p_consultoria_id uuid, p_requisito_id uuid)
returns table (id uuid, documento_id uuid, caminho text, nome_original text, validade date, enviada_em timestamptz,
               enviada_por_nome text)
language sql
stable
security invoker
set search_path = ''
as $$
  select ev.id, ev.documento_id, v.caminho, v.nome_original, ev.validade, ev.enviada_em, m.nome
  from public.evidencia_de_requisito as ev
  join public.documento as d on d.consultoria_id = ev.consultoria_id and d.id = ev.documento_id
  join public.documento_versao as v on v.consultoria_id = d.consultoria_id and v.id = d.versao_vigente_id
  left join public.membro as m on m.consultoria_id = ev.consultoria_id and m.id = ev.enviada_por
  where ev.consultoria_id = p_consultoria_id and ev.requisito_id = p_requisito_id
  order by ev.enviada_em desc, ev.id
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.sugerir_requisitos(uuid, uuid)',
    'public.adicionar_requisito(uuid, uuid, uuid, text, text)',
    'public.decidir_aplicabilidade(uuid, uuid, boolean, text, integer)',
    'public.avaliar_requisito(uuid, uuid, text, date, text, jsonb, integer)',
    'public.criar_acao_legal(uuid, uuid, jsonb)',
    'public.concluir_acao_legal(uuid, uuid, integer)',
    'public.atribuir_acao_legal(uuid, uuid, uuid, integer)',
    'public.anexar_evidencia_ao_requisito(uuid, uuid, uuid, text, text, text, date)',
    'public.listar_requisitos_do_empreendimento(uuid, uuid, integer, integer)',
    'public.listar_evidencias_do_requisito(uuid, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Fonte de prazo acao_legal (redefine o stub do L0, mesma assinatura)
-- ---------------------------------------------------------------------------
-- Ação aberta com prazo. Requisito é do empreendimento: a unidade da linha é a primeira dele.
create or replace function private.linhas_de_prazo_acao_legal(cid uuid)
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
    'acao_legal'::text, a.id, null::uuid, a.prazo, a.prazo - h.d,
    r.dispositivo, a.descricao, e.id, e.nome, u.id, u.nome,
    null::text, null::uuid,
    a.responsavel_id, m.nome, null::public.situacao_ocorrencia, null::date, a.row_version
  from public.acao_legal as a
  cross join hoje as h
  join public.requisito_legal as r on r.consultoria_id = a.consultoria_id and r.id = a.requisito_id
  join public.empreendimento as e on e.consultoria_id = r.consultoria_id and e.id = r.empreendimento_id
  join lateral (
    select u.id, u.nome from public.unidade as u
    where u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id
    order by u.criado_em, u.id
    limit 1
  ) as u on true
  left join public.membro as m on m.consultoria_id = a.consultoria_id and m.id = a.responsavel_id
  where a.consultoria_id = cid and a.concluida_em is null
$$;
