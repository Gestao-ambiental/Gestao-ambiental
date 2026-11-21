-- O alvará (camada #4, 20261117184545, já no beta com dados reais) passa a ser um vencimento do
-- tipo Alvará (ADR-0046). Aditiva: nada é apagado.
-- 1. Cada alvará vira um vencimento com o mesmo id, o mesmo documento (PDF, entidade 'alvara'; nada
--    é copiado no Storage), o mesmo anterior, autor, exclusão e row_version. Idempotente.
-- 2. A tabela alvara e as RPCs antigas (registrar, editar, trocar PDF, excluir) continuam, para o
--    front antigo do beta. Uma trigger de mão única espelha cada inclusão e alteração do alvará no
--    vencimento de mesmo id. O espelho nunca desfaz a exclusão de um vencimento e recusa excluir um
--    alvará cujo vencimento já foi renovado. Nenhuma RPC de vencimento escreve em alvara.
-- 3. private.linhas_de_prazo_alvara passa a where false: o alvará entra no prazo uma vez só, pela
--    fonte de vencimento.

-- ---------------------------------------------------------------------------
-- 1. Tipo Alvará da consultoria (criado se a Gestão o tiver renomeado)
-- ---------------------------------------------------------------------------
create function private.tipo_alvara_da_consultoria(cid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tipo uuid;
begin
  select t.id into tipo from public.tipo_vencimento as t
  where t.consultoria_id = cid and t.nome_normalizado = private.normalizar_nome('Alvará');
  if tipo is null then
    insert into public.tipo_vencimento (consultoria_id, nome, antecedencia_dias, exige_pdf)
    values (cid, 'Alvará', 60, true)
    on conflict (consultoria_id, nome_normalizado) do nothing
    returning id into tipo;
    if tipo is null then
      select t.id into tipo from public.tipo_vencimento as t
      where t.consultoria_id = cid and t.nome_normalizado = private.normalizar_nome('Alvará');
    end if;
  end if;
  return tipo;
end;
$$;

revoke all on function private.tipo_alvara_da_consultoria(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Conversão (idempotente: o que já existe com o mesmo id fica como está)
-- ---------------------------------------------------------------------------
create function private.converter_alvaras_em_vencimentos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inseridos integer;
begin
  perform private.tipo_alvara_da_consultoria(c.consultoria_id)
  from (select distinct a.consultoria_id from public.alvara as a) as c;

  -- A FK do anterior é conferida no fim do comando: a ordem das linhas não importa.
  insert into public.vencimento (id, consultoria_id, empreendimento_id, unidade_id, instrumento_id,
                                 tipo_vencimento_id, numero, orgao, notas, emitido_em, emitido_texto, valido_ate,
                                 validade_texto, antecedencia_dias, responsavel_tecnico_id, documento_id,
                                 anterior_id, criado_por, criado_em, excluido_por, excluido_em, row_version)
  select a.id, a.consultoria_id, a.empreendimento_id, a.unidade_id, null, t.id, a.numero, a.orgao, a.notas,
         null, null, a.validade, null, 60, null, a.documento_id, a.anterior_id, a.criado_por, a.criado_em,
         a.excluido_por, a.excluido_em, a.row_version
  from public.alvara as a
  join public.tipo_vencimento as t
    on t.consultoria_id = a.consultoria_id and t.nome_normalizado = private.normalizar_nome('Alvará')
  on conflict (id) do nothing;
  get diagnostics inseridos = row_count;
  return inseridos;
end;
$$;

revoke all on function private.converter_alvaras_em_vencimentos() from public, anon, authenticated;

select private.converter_alvaras_em_vencimentos();

-- ---------------------------------------------------------------------------
-- 3. Espelho de mão única: alvara → vencimento (mesmo id)
-- ---------------------------------------------------------------------------
create function private.espelhar_alvara_em_vencimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vencimento;
  tipo public.tipo_vencimento;
begin
  if tg_op = 'INSERT' then
    -- Antecedência copiada do tipo Alvará, como no cadastro pelo front novo.
    select * into tipo from public.tipo_vencimento as t
    where t.id = private.tipo_alvara_da_consultoria(new.consultoria_id);
    -- Se o anterior já tem sucessor vivo em vencimento (renovado pelo front novo), o índice único
    -- recusa e a RPC antiga falha.
    insert into public.vencimento (id, consultoria_id, empreendimento_id, unidade_id, instrumento_id,
                                   tipo_vencimento_id, numero, orgao, notas, valido_ate, antecedencia_dias,
                                   documento_id, anterior_id, criado_por, criado_em, excluido_por, excluido_em,
                                   row_version)
    values (new.id, new.consultoria_id, new.empreendimento_id, new.unidade_id, null,
            tipo.id, new.numero, new.orgao, new.notas,
            new.validade, tipo.antecedencia_dias, new.documento_id, new.anterior_id, new.criado_por,
            new.criado_em, new.excluido_por, new.excluido_em, new.row_version)
    on conflict (id) do nothing;
    return null;
  end if;

  select * into alvo from public.vencimento as v where v.id = new.id for update;
  if not found or alvo.excluido_em is not null then
    -- O espelho nunca desfaz uma exclusão feita no vencimento.
    return null;
  end if;

  if new.excluido_em is not null then
    if exists (
      select 1 from public.vencimento as s
      where s.consultoria_id = alvo.consultoria_id and s.anterior_id = alvo.id and s.excluido_em is null
    ) then
      raise exception 'vencimento_ja_renovado' using errcode = 'P0001';
    end if;
    update public.vencimento as v
    set numero = new.numero, orgao = new.orgao, notas = new.notas, valido_ate = new.validade,
        excluido_em = new.excluido_em, excluido_por = new.excluido_por, row_version = v.row_version + 1
    where v.id = alvo.id;
  else
    -- Edição e troca de PDF (o documento é o mesmo; só o row_version anda).
    update public.vencimento as v
    set numero = new.numero, orgao = new.orgao, notas = new.notas, valido_ate = new.validade,
        row_version = v.row_version + 1
    where v.id = alvo.id;
  end if;
  return null;
end;
$$;

revoke all on function private.espelhar_alvara_em_vencimento() from public, anon, authenticated;

create trigger alvara_espelhar_em_vencimento
  after insert or update on public.alvara
  for each row execute function private.espelhar_alvara_em_vencimento();

comment on trigger alvara_espelhar_em_vencimento on public.alvara is
  'Mão única: as RPCs antigas do alvará continuam gravando no vencimento de mesmo id (ADR-0046).';

-- ---------------------------------------------------------------------------
-- 4. A fonte antiga do alvará fica vazia (o vencimento já traz a linha)
-- ---------------------------------------------------------------------------
create or replace function private.linhas_de_prazo_alvara(cid uuid)
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
  select
    'validade'::text, null::uuid, null::uuid, null::date, null::integer,
    null::text, null::text, null::uuid, null::text, null::uuid, null::text,
    null::text, null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, null::integer
  where false and cid is not null
$$;

comment on function private.linhas_de_prazo_alvara(uuid) is
  'Vazia desde o P4: o alvará passou a vencimento (ADR-0046) e entra no prazo por private.linhas_de_prazo_vencimento.';

comment on table public.alvara is
  'Alvará simples (ALV-01, ALV-02). Desde o P4 (ADR-0046) cada alvará é espelhado no vencimento de mesmo id; o front novo usa só vencimento.';
