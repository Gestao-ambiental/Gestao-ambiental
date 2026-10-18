-- Acompanhamentos e renovação de LAO (épico 7; EQ-05, REN-01, REN-02; regras "Renovação de LAO").
-- limite de protocolo = vencimento − 120 dias corridos; início da preparação = limite − antecedência
-- (padrão 30). O plano é um snapshot: guarda os 120 dias e a antecedência, para que mudança de regra
-- não reescreva planos antigos. Protocolo guarda número, data e comprovante e não altera a validade
-- nem as obrigações vigentes.
-- Decisões de 18/10/2026: etapas preparatórias só calculadas (sem gravar); todos os membros veem,
-- só a Gestão muda a antecedência e registra o protocolo; acompanhamento do órgão depois do
-- protocolo fica para quando o intervalo for definido (nada é gerado).

alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida check (entidade in ('instrumento', 'evidencia', 'protocolo'));

-- ---------------------------------------------------------------------------
-- plano_renovacao: um por LAO ativa.
-- ---------------------------------------------------------------------------
create table public.plano_renovacao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  instrumento_id uuid not null,
  dias_limite_protocolo integer not null default 120,
  antecedencia_dias integer not null default 30,
  protocolo_numero text,
  protocolado_em date,
  protocolo_versao_id uuid,
  protocolo_registrado_por uuid,
  protocolo_registrado_em timestamptz,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint plano_renovacao_consultoria_id_id_key unique (consultoria_id, id),
  constraint plano_renovacao_instrumento_key unique (instrumento_id),
  constraint plano_renovacao_dias_limite_positivo check (dias_limite_protocolo > 0),
  constraint plano_renovacao_antecedencia_valida check (antecedencia_dias >= 0),
  constraint plano_renovacao_protocolo_completo check (
    (protocolado_em is null and protocolo_numero is null and protocolo_versao_id is null
     and protocolo_registrado_por is null and protocolo_registrado_em is null)
    or (protocolado_em is not null and length(btrim(coalesce(protocolo_numero, ''))) > 0
        and protocolo_versao_id is not null and protocolo_registrado_por is not null
        and protocolo_registrado_em is not null)
  ),
  constraint plano_renovacao_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint plano_renovacao_protocolo_versao_fk foreign key (consultoria_id, protocolo_versao_id)
    references public.documento_versao (consultoria_id, id) on delete restrict,
  constraint plano_renovacao_registrado_por_fk foreign key (consultoria_id, protocolo_registrado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.plano_renovacao is
  'Plano de renovação da LAO (REN-01, REN-02). Snapshot da regra: dias_limite_protocolo e antecedencia_dias.';
comment on column public.plano_renovacao.row_version is 'Controle otimista: cada escrita confere e incrementa (RNF 11).';

alter table public.plano_renovacao enable row level security;
alter table public.plano_renovacao force row level security;
revoke all on table public.plano_renovacao from anon, authenticated;
grant select on table public.plano_renovacao to authenticated;

create policy plano_renovacao_select_membro_ativo on public.plano_renovacao
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger plano_renovacao_auditar after insert or update or delete on public.plano_renovacao
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- Toda LAO que fica ativa ganha o plano, com a antecedência definida no cadastro.
-- A regra dos 120 dias vale só para LAO (não estender a alvará nem a outros tipos sem fonte).
-- ---------------------------------------------------------------------------
create function private.criar_plano_da_lao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.situacao = 'ativo' and exists (
    select 1 from public.tipo_instrumento as t
    where t.consultoria_id = new.consultoria_id and t.id = new.tipo_id and upper(btrim(t.sigla)) = 'LAO'
  ) then
    insert into public.plano_renovacao (consultoria_id, instrumento_id, antecedencia_dias)
    values (new.consultoria_id, new.id, new.antecedencia_renovacao_dias)
    on conflict (instrumento_id) do nothing;
  end if;
  return null;
end;
$$;

revoke all on function private.criar_plano_da_lao() from public, anon, authenticated;

create trigger instrumento_cria_plano_da_lao
  after insert or update of situacao on public.instrumento
  for each row execute function private.criar_plano_da_lao();

-- LAOs já ativas antes desta migration.
insert into public.plano_renovacao (consultoria_id, instrumento_id, antecedencia_dias)
select i.consultoria_id, i.id, i.antecedencia_renovacao_dias
from public.instrumento as i
join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
where i.situacao = 'ativo' and upper(btrim(t.sigla)) = 'LAO'
on conflict (instrumento_id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Plano travado para escrita, só pela Gestão da consultoria, conferindo a versão lida.
create function private.plano_para_gestao(p_id uuid, p_row_version integer)
returns public.plano_renovacao
language plpgsql
set search_path = ''
as $$
declare
  alvo public.plano_renovacao;
begin
  select * into alvo from public.plano_renovacao as p where p.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_row_version is distinct from alvo.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.plano_para_gestao(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: antecedência adicional (REN-01). Move só o início da preparação; o limite não muda.
-- ---------------------------------------------------------------------------
create function public.definir_antecedencia_renovacao(p_plano_id uuid, p_antecedencia integer, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.plano_renovacao;
begin
  alvo := private.plano_para_gestao(p_plano_id, p_row_version);
  if alvo.protocolado_em is not null then
    raise exception 'plano_protocolado' using errcode = 'P0001';
  end if;
  if p_antecedencia is null or p_antecedencia < 0 then
    raise exception 'antecedencia_invalida' using errcode = '22023';
  end if;
  if p_antecedencia = alvo.antecedencia_dias then
    return alvo.row_version;
  end if;

  update public.plano_renovacao as p
  set antecedencia_dias = p_antecedencia, row_version = p.row_version + 1
  where p.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar o protocolo (REN-02). Número, data e comprovante (objeto novo e imutável em
-- consultoria_id/protocolo/<uuid>.<ext>). Não toca a validade nem as obrigações da licença.
-- Repetir com a mesma versão do comprovante (retry) devolve o mesmo resultado.
-- ---------------------------------------------------------------------------
create function public.registrar_protocolo(
  p_plano_id uuid,
  p_numero text,
  p_data date,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.plano_renovacao;
  objeto record;
  doc uuid;
begin
  select * into alvo from public.plano_renovacao as p where p.id = p_plano_id;
  if found and p_versao_id is not null and alvo.protocolo_versao_id = p_versao_id
     and private.is_gestao(alvo.consultoria_id) then
    return alvo.row_version;
  end if;

  alvo := private.plano_para_gestao(p_plano_id, p_row_version);
  if alvo.protocolado_em is not null then
    raise exception 'plano_protocolado' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_numero, ''))) = 0 then
    raise exception 'numero_obrigatorio' using errcode = '22023';
  end if;
  if p_data is null then
    raise exception 'data_protocolo_obrigatoria' using errcode = '22023';
  end if;
  if p_data > private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'data_protocolo_futura' using errcode = '22023';
  end if;
  if p_versao_id is null or p_caminho is null then
    raise exception 'comprovante_obrigatorio' using errcode = '22023';
  end if;
  if split_part(p_caminho, '/', 1) <> alvo.consultoria_id::text
     or p_caminho !~ '^[0-9a-f-]{36}/protocolo/[0-9a-f-]{36}\.(pdf|png|jpg)$' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or objeto.mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  insert into public.documento (consultoria_id, entidade) values (alvo.consultoria_id, 'protocolo')
  returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, doc, 1, p_caminho, btrim(p_nome_original), objeto.mime,
          objeto.tamanho, lower(p_sha256), private.membro_atual(alvo.consultoria_id));
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;

  update public.plano_renovacao as p
  set protocolo_numero = btrim(p_numero), protocolado_em = p_data, protocolo_versao_id = p_versao_id,
      protocolo_registrado_por = private.membro_atual(alvo.consultoria_id), protocolo_registrado_em = now(),
      row_version = p.row_version + 1
  where p.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura: renovações no radar (EQ-05). Toda LAO ativa com plano; não protocoladas primeiro, pelo
-- limite de protocolo. Paginada.
-- ---------------------------------------------------------------------------
create function public.listar_renovacoes(p_consultoria_id uuid, p_limite integer default 50, p_deslocamento integer default 0)
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
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, i.id, nullif(concat_ws(' ', t.sigla, i.numero), ''), i.orgao, e.id, e.nome, u.nome, i.validade,
    p.dias_limite_protocolo, p.antecedencia_dias, p.protocolado_em, p.protocolo_numero,
    private.hoje_da_consultoria(p.consultoria_id),
    count(*) over ()
  from public.plano_renovacao as p
  join public.instrumento as i on i.consultoria_id = p.consultoria_id and i.id = p.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where p.consultoria_id = p_consultoria_id and i.situacao = 'ativo'
  order by p.protocolado_em is not null, i.validade - p.dias_limite_protocolo, p.id
  limit greatest(least(coalesce(p_limite, 50), 200), 1)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- Plano de uma LAO pelo id da licença (REN-01, REN-02), com o comprovante do protocolo quando houver.
create function public.obter_plano_renovacao(p_instrumento_id uuid)
returns table (
  id uuid,
  consultoria_id uuid,
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
  comprovante_caminho text,
  comprovante_nome text,
  comprovante_tamanho bigint,
  registrado_por_nome text,
  registrado_em timestamptz,
  hoje date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.consultoria_id, i.id, nullif(concat_ws(' ', t.sigla, i.numero), ''), i.orgao, e.id, e.nome, u.nome,
    i.validade, p.dias_limite_protocolo, p.antecedencia_dias, p.protocolado_em, p.protocolo_numero,
    v.caminho, v.nome_original, v.tamanho_bytes, m.nome, p.protocolo_registrado_em,
    private.hoje_da_consultoria(p.consultoria_id), p.row_version
  from public.plano_renovacao as p
  join public.instrumento as i on i.consultoria_id = p.consultoria_id and i.id = p.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.documento_versao as v on v.consultoria_id = p.consultoria_id and v.id = p.protocolo_versao_id
  left join public.membro as m on m.consultoria_id = p.consultoria_id and m.id = p.protocolo_registrado_por
  where p.instrumento_id = p_instrumento_id
$$;

-- ---------------------------------------------------------------------------
-- Leitura: aguardando conferência (EQ-05). Ocorrências com a última evidência em conferência,
-- a que espera há mais tempo primeiro. Paginada.
-- ---------------------------------------------------------------------------
create function public.listar_aguardando_conferencia(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  ocorrencia_id uuid,
  codigo text,
  titulo text,
  empreendimento_nome text,
  responsavel_nome text,
  conferente_nome text,
  evidencia_numero integer,
  enviada_em timestamptz,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select o.id, c.codigo, cv.titulo, e.nome, r.nome, cf.nome, ev.numero, ev.enviada_em, count(*) over ()
  from public.ocorrencia as o
  join lateral (
    select x.numero, x.enviada_em, x.situacao from public.evidencia as x
    where x.consultoria_id = o.consultoria_id and x.ocorrencia_id = o.id
    order by x.numero desc limit 1
  ) as ev on ev.situacao = 'em_conferencia'
  join public.condicionante_versao as cv on cv.consultoria_id = o.consultoria_id and cv.id = o.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = cv.consultoria_id and c.id = cv.condicionante_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.membro as r on r.consultoria_id = o.consultoria_id and r.id = o.responsavel_id
  left join public.membro as cf on cf.consultoria_id = o.consultoria_id and cf.id = o.conferente_id
  where o.consultoria_id = p_consultoria_id and o.situacao = 'em_conferencia'
  order by ev.enviada_em, o.id
  limit greatest(least(coalesce(p_limite, 50), 200), 1)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.definir_antecedencia_renovacao(uuid, integer, integer) from public, anon;
revoke all on function public.registrar_protocolo(uuid, text, date, uuid, text, text, text, integer) from public, anon;
revoke all on function public.listar_renovacoes(uuid, integer, integer) from public, anon;
revoke all on function public.obter_plano_renovacao(uuid) from public, anon;
revoke all on function public.listar_aguardando_conferencia(uuid, integer, integer) from public, anon;

grant execute on function public.definir_antecedencia_renovacao(uuid, integer, integer) to authenticated;
grant execute on function public.registrar_protocolo(uuid, text, date, uuid, text, text, text, integer) to authenticated;
grant execute on function public.listar_renovacoes(uuid, integer, integer) to authenticated;
grant execute on function public.obter_plano_renovacao(uuid) to authenticated;
grant execute on function public.listar_aguardando_conferencia(uuid, integer, integer) to authenticated;
