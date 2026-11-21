-- Renovação de LAO vira orçamento (ADR-0044, pacote P2 do estudo "Oito funções no Grama").
-- 1. orcamento.instrumento_id: o orçamento que cobra a renovação de uma licença. No máximo um
--    orçamento vivo por licença (vivo = fora da lixeira e não recusado; aprovado conta).
-- 2. atividade_licenciada: atividades da licença pela triagem CONSEMA 250/2024, gravadas só pela RPC
--    gravar_atividades_na_licenca (Gestão). Base da taxa sugerida (ADR-0042), calculada no domínio.
-- 3. criar_orcamento_de_renovacao: rascunho com cliente, objeto e taxa do órgão, numa transação e
--    idempotente pelo id e pela licença. Nunca muda situação nem envia.
-- 4. listar_renovacoes: horizonte opcional (meses sobre a validade), só LAO e o orçamento vivo.
-- Só aditiva. Nada muda em criar_orcamento, salvar_orcamento, duplicar_* nem nas fontes da base.

-- ---------------------------------------------------------------------------
-- 1. orcamento.instrumento_id
-- ---------------------------------------------------------------------------
alter table public.orcamento
  add column instrumento_id uuid,
  add constraint orcamento_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict;

comment on column public.orcamento.instrumento_id is
  'Licença cuja renovação este orçamento cobra (ADR-0044). Só criar_orcamento_de_renovacao preenche.';

-- No máximo um orçamento vivo por licença. Vivo = fora da lixeira e não recusado (aprovado conta).
create unique index orcamento_um_vivo_por_licenca
  on public.orcamento (consultoria_id, instrumento_id)
  where instrumento_id is not null and excluido_em is null and situacao <> 'recusada';

-- Conferência com mensagem clara (reabrir recusado ou restaurar da lixeira com outro vivo). O
-- índice continua sendo a garantia contra corrida.
create function private.conferir_orcamento_vivo_da_licenca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.instrumento_id is not null and new.excluido_em is null and new.situacao <> 'recusada'
     and exists (
       select 1 from public.orcamento as o
       where o.consultoria_id = new.consultoria_id and o.instrumento_id = new.instrumento_id
         and o.id <> new.id and o.excluido_em is null and o.situacao <> 'recusada'
     ) then
    raise exception 'licenca_ja_tem_orcamento' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.conferir_orcamento_vivo_da_licenca() from public, anon, authenticated;

create trigger orcamento_conferir_licenca
  before insert or update of instrumento_id, situacao, excluido_em on public.orcamento
  for each row execute function private.conferir_orcamento_vivo_da_licenca();

-- ---------------------------------------------------------------------------
-- 2. atividade_licenciada
-- ---------------------------------------------------------------------------
create table public.atividade_licenciada (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  instrumento_id uuid not null,
  codigo text not null,
  descricao text not null,
  porte text not null,
  potencial text not null,
  medidas jsonb not null default '{}'::jsonb,
  fonte text not null,
  registrado_por uuid not null,
  registrado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint atividade_licenciada_consultoria_id_id_key unique (consultoria_id, id),
  constraint atividade_licenciada_codigo_por_licenca_key unique (consultoria_id, instrumento_id, codigo),
  constraint atividade_licenciada_codigo_formato check (codigo ~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'),
  constraint atividade_licenciada_descricao_preenchida check (length(btrim(descricao)) between 1 and 2000),
  constraint atividade_licenciada_porte_valido check (porte in ('minimo', 'pequeno', 'medio', 'grande', 'unico')),
  constraint atividade_licenciada_potencial_valido check (potencial in ('P', 'M', 'G')),
  constraint atividade_licenciada_medidas_objeto check (jsonb_typeof(medidas) = 'object'),
  constraint atividade_licenciada_fonte_preenchida check (length(btrim(fonte)) between 1 and 300),
  constraint atividade_licenciada_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint atividade_licenciada_registrado_por_fk foreign key (consultoria_id, registrado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.atividade_licenciada is
  'Atividades da licença pela triagem CONSEMA 250/2024 (ADR-0044). Escrita só por gravar_atividades_na_licenca.';
comment on column public.atividade_licenciada.potencial is 'Potencial poluidor geral (P, M, G) da atividade.';
comment on column public.atividade_licenciada.medidas is
  'Sigla do parâmetro (Anexo VII) → valor numérico ≥ 0, como digitado na triagem.';
comment on column public.atividade_licenciada.fonte is 'Catálogo usado (CATALOGO_CONSEMA_250.fonte).';

alter table public.atividade_licenciada enable row level security;
alter table public.atividade_licenciada force row level security;

revoke all on table public.atividade_licenciada from anon, authenticated;
grant select on table public.atividade_licenciada to authenticated;

create policy atividade_licenciada_select_membro_ativo on public.atividade_licenciada
  for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create trigger atividade_licenciada_auditar
  after insert or update or delete on public.atividade_licenciada
  for each row execute function private.auditar();

create trigger _suporte_somente_leitura
  before insert or update or delete on public.atividade_licenciada
  for each row execute function private.bloquear_escrita_do_suporte();

-- Sem o módulo 'orcamentos': a triagem não depende do plano de orçamentos.
create trigger _comercial_somente_leitura
  before insert or update or delete on public.atividade_licenciada
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- 3. Auxiliares privados
-- ---------------------------------------------------------------------------
-- Situação do orçamento vivo da licença, para todo membro (a Equipe não lê orcamento pela RLS).
create function private.situacao_do_orcamento_da_licenca(cid uuid, iid uuid)
returns public.situacao_orcamento
language sql
stable
security definer
set search_path = ''
as $$
  select o.situacao
  from public.orcamento as o
  where o.consultoria_id = cid and o.instrumento_id = iid
    and o.excluido_em is null and o.situacao <> 'recusada'
    and private.is_membro(cid)
  limit 1
$$;

revoke all on function private.situacao_do_orcamento_da_licenca(uuid, uuid) from public, anon;
grant execute on function private.situacao_do_orcamento_da_licenca(uuid, uuid) to authenticated;

-- Último dia do horizonte do radar: hoje + meses do calendário (dia que não existe vira o último
-- do mês: 31/08 + 6 = 28/02). Meses limitados a 1..24. Espelho de fimDoHorizonte no domínio.
create function private.fim_do_horizonte_da_renovacao(p_hoje date, p_meses integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_hoje + make_interval(months => least(greatest(p_meses, 1), 24)))::date
$$;

revoke all on function private.fim_do_horizonte_da_renovacao(date, integer) from public, anon;
grant execute on function private.fim_do_horizonte_da_renovacao(date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. criar_orcamento_de_renovacao
-- ---------------------------------------------------------------------------
create function public.criar_orcamento_de_renovacao(
  p_consultoria_id uuid,
  p_instrumento_id uuid,
  p_id uuid,
  p_taxa_centavos bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  licenca record;
  dono uuid;
  licenca_do_existente uuid;
  vivo uuid;
  objeto text;
begin
  -- Antes de tudo, para não revelar se a licença existe.
  if private.membro_atual(p_consultoria_id) is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if p_taxa_centavos is not null and p_taxa_centavos not between 0 and 99999999999 then
    raise exception 'taxa_invalida' using errcode = '22023';
  end if;

  -- Trava a licença: serializa as chamadas da mesma licença (no key: não briga com as FKs).
  select i.id, i.empreendimento_id, i.numero, i.orgao, i.situacao, t.sigla
  into licenca
  from public.instrumento as i
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where i.consultoria_id = p_consultoria_id and i.id = p_instrumento_id
  for no key update of i;
  if not found then
    raise exception 'licenca_invalida' using errcode = '22023';
  end if;

  if licenca.situacao <> 'ativo'
     or upper(btrim(coalesce(licenca.sigla, ''))) <> 'LAO'
     or not exists (
       select 1 from public.plano_renovacao as p
       where p.consultoria_id = p_consultoria_id and p.instrumento_id = p_instrumento_id
     ) then
    raise exception 'licenca_sem_renovacao' using errcode = 'P0001';
  end if;

  -- Idempotência pelo id.
  select o.consultoria_id, o.instrumento_id into dono, licenca_do_existente
  from public.orcamento as o where o.id = p_id;
  if found then
    if dono = p_consultoria_id and licenca_do_existente = p_instrumento_id then
      return p_id;
    end if;
    raise exception 'orcamento_existente' using errcode = 'P0001';
  end if;

  -- Idempotência pela licença: devolve o orçamento vivo que já existe.
  select o.id into vivo
  from public.orcamento as o
  where o.consultoria_id = p_consultoria_id and o.instrumento_id = p_instrumento_id
    and o.excluido_em is null and o.situacao <> 'recusada'
  limit 1;
  if vivo is not null then
    return vivo;
  end if;

  objeto := 'Renovação da ' || coalesce(nullif(concat_ws(' ', licenca.sigla, licenca.numero), ''), 'LAO');

  -- Mesmo caminho do rascunho comum: numeração, base, forma de preço e barreiras do plano.
  perform public.criar_orcamento(p_id, p_consultoria_id, licenca.empreendimento_id, objeto, null);

  -- Mesma transação da criação: não conta como edição (row_version fica).
  update public.orcamento as o set instrumento_id = p_instrumento_id where o.id = p_id;

  -- Taxa nula é despesa "a cotar", nunca zero.
  insert into public.orcamento_despesa (consultoria_id, orcamento_id, ordem, descricao, estimativa_centavos,
                                        tratamento)
  values (p_consultoria_id, p_id, 1,
          'Taxa do órgão na renovação' || coalesce(' (' || nullif(btrim(licenca.orgao), '') || ')', ''),
          p_taxa_centavos, 'cliente_direto');

  return p_id;
end;
$$;

comment on function public.criar_orcamento_de_renovacao(uuid, uuid, uuid, bigint) is
  'Rascunho do orçamento da renovação da LAO (ADR-0044). Só Gestão; idempotente pelo id e pela licença.';

revoke all on function public.criar_orcamento_de_renovacao(uuid, uuid, uuid, bigint) from public, anon;
grant execute on function public.criar_orcamento_de_renovacao(uuid, uuid, uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. gravar_atividades_na_licenca
-- ---------------------------------------------------------------------------
create function public.gravar_atividades_na_licenca(
  p_consultoria_id uuid,
  p_instrumento_id uuid,
  p_atividades jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
  item jsonb;
  medida record;
  codigos text[] := '{}';
  total integer;
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.instrumento as i
    where i.consultoria_id = p_consultoria_id and i.id = p_instrumento_id
  ) then
    raise exception 'licenca_invalida' using errcode = '22023';
  end if;

  -- Confere tudo antes de gravar qualquer linha.
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

  -- Inclui ou atualiza pelo código; só mexe na linha se o conteúdo mudou. Nunca apaga.
  insert into public.atividade_licenciada as a
    (consultoria_id, instrumento_id, codigo, descricao, porte, potencial, medidas, fonte, registrado_por)
  select p_consultoria_id, p_instrumento_id, x.value ->> 'codigo', btrim(x.value ->> 'descricao'),
         x.value ->> 'porte', x.value ->> 'potencial', coalesce(x.value -> 'medidas', '{}'::jsonb),
         btrim(x.value ->> 'fonte'), autor
  from jsonb_array_elements(p_atividades) as x
  on conflict on constraint atividade_licenciada_codigo_por_licenca_key do update
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
  from public.atividade_licenciada as a
  where a.consultoria_id = p_consultoria_id and a.instrumento_id = p_instrumento_id;
  return total;
end;
$$;

comment on function public.gravar_atividades_na_licenca(uuid, uuid, jsonb) is
  'Grava as atividades enquadradas da triagem na licença (ADR-0044). Só Gestão; inclui ou atualiza pelo código, nunca apaga.';

revoke all on function public.gravar_atividades_na_licenca(uuid, uuid, jsonb) from public, anon;
grant execute on function public.gravar_atividades_na_licenca(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. listar_renovacoes: horizonte, só LAO e o orçamento vivo da licença
-- ---------------------------------------------------------------------------
drop function public.listar_renovacoes(uuid, integer, integer);

-- Invoker: a RLS de quem chama decide. id/ano/sequência/revisão do orçamento só para a Gestão
-- (RLS de orcamento); a situação vem para todo membro pela função privada.
create function public.listar_renovacoes(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0,
  p_horizonte_meses integer default null
)
returns table (
  id uuid,
  instrumento_id uuid,
  licenca text,
  orgao text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_nome text,
  validade date,
  dias_limite_protocolo integer,
  antecedencia_dias integer,
  protocolado_em date,
  protocolo_numero text,
  hoje date,
  total bigint,
  acompanhamento_dias integer,
  orcamento_id uuid,
  orcamento_ano integer,
  orcamento_sequencia integer,
  orcamento_revisao integer,
  orcamento_situacao public.situacao_orcamento
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, i.id, nullif(concat_ws(' ', t.sigla, i.numero), ''), i.orgao, e.id, e.nome, u.nome, i.validade,
    p.dias_limite_protocolo, p.antecedencia_dias, p.protocolado_em, p.protocolo_numero,
    private.hoje_da_consultoria(p.consultoria_id),
    count(*) over (),
    p.acompanhamento_dias,
    orc.id, orc.ano, orc.sequencia, orc.revisao,
    private.situacao_do_orcamento_da_licenca(p.consultoria_id, i.id)
  from public.plano_renovacao as p
  join public.instrumento as i on i.consultoria_id = p.consultoria_id and i.id = p.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join lateral (
    select o.id, o.ano, o.sequencia, o.revisao
    from public.orcamento as o
    where o.consultoria_id = i.consultoria_id and o.instrumento_id = i.id
      and o.excluido_em is null and o.situacao <> 'recusada'
    limit 1
  ) as orc on true
  where p.consultoria_id = p_consultoria_id and i.situacao = 'ativo'
    and upper(btrim(t.sigla)) = 'LAO'
    and (p_horizonte_meses is null
         or i.validade <= private.fim_do_horizonte_da_renovacao(
              private.hoje_da_consultoria(p.consultoria_id), p_horizonte_meses))
  order by p.protocolado_em is not null, i.validade - p.dias_limite_protocolo, p.id
  limit greatest(least(coalesce(p_limite, 50), 200), 1)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

revoke all on function public.listar_renovacoes(uuid, integer, integer, integer) from public, anon;
grant execute on function public.listar_renovacoes(uuid, integer, integer, integer) to authenticated;
