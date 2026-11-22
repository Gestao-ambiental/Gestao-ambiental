-- Correções da auditoria do PR #44 (ADR-0059). Aditiva: as funções mantêm assinatura e retorno.
--
-- 1. remover_apontamento: exige vínculo ativo antes de travar; só o autor ou quem tem a
--    permissão financeira. Antes, sem vínculo a checagem dava nulo e não recusava.
-- 2. exigencia_para_responder: exigência sem responsável só a Gestão responde ou anexa.
-- 3. abrir_consultoria: a reserva do teste por pessoa, e-mail e CNPJ é atômica (travas na
--    ordem pessoa, e-mail, CNPJ + insert ... on conflict na chave única) antes de criar.
-- 4. registrar_alvara: o atalho de reenvio só olha a versão da mesma consultoria e unidade.
-- 5. Datas civis: finitas e de 1900-01-01 a 2199-12-31 em toda coluna date (constraint
--    data_civil_*, not valid: dados antigos ficam), e as fontes de prazo ignoram só o item fora.
-- 6. Etapas: no máximo 200 por ocorrência (LIMITE_DE_ETAPAS), igual à tela.

-- ---------------------------------------------------------------------------
-- 1. Apontamento de horas
-- ---------------------------------------------------------------------------
create or replace function public.remover_apontamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consultoria uuid;
  v_autor uuid;
  v_eu uuid;
begin
  select a.consultoria_id, a.membro_id into v_consultoria, v_autor
  from public.apontamento_horas as a where a.id = p_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_eu := private.membro_atual(v_consultoria);
  if v_eu is null or not (v_autor = v_eu or private.is_financeiro(v_consultoria)) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform 1 from public.apontamento_horas as a where a.id = p_id for update;
  update public.apontamento_horas as a set excluido_em = coalesce(a.excluido_em, now()) where a.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Exigência: responder e anexar
-- ---------------------------------------------------------------------------
create or replace function private.exigencia_para_responder(p_exigencia_id uuid)
returns public.exigencia
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
  eu uuid;
begin
  select * into alvo from public.exigencia as x where x.id = p_exigencia_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  eu := private.membro_atual(alvo.consultoria_id);
  -- Sem responsável, a comparação daria nulo: nega por padrão.
  if eu is null
     or not (private.is_gestao(alvo.consultoria_id) or coalesce(eu = alvo.responsavel_id, false)) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into alvo from public.exigencia as x where x.id = p_exigencia_id for update;
  if alvo.excluido_em is not null then
    raise exception 'exigencia_excluida' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Abrir consultoria: reserva atômica do teste
-- ---------------------------------------------------------------------------
create or replace function public.abrir_consultoria(p_id uuid, p_nome text, p_cnpj text)
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
  v_linhas integer;
begin
  if v_usuario is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;
  if not exists (select 1 from public.consultoria as c where c.id = v_nova) then
    if v_cnpj = '' then
      raise exception 'cnpj_obrigatorio' using errcode = '22023';
    end if;
    if not private.cnpj_com_verificadores(v_cnpj) then
      raise exception 'cnpj_invalido' using errcode = '22023';
    end if;
  end if;

  select lower(u.email), u.email_confirmed_at is not null into v_email, v_email_confirmado
  from auth.users as u where u.id = v_usuario;
  v_email_hash := case when v_email is not null then private.hmac_do_acesso('email', v_email) end;
  v_cnpj_hash := case when v_cnpj <> '' then private.hmac_do_acesso('cnpj', v_cnpj) end;

  -- Travas sempre na mesma ordem (pessoa, e-mail, CNPJ): duas aberturas simultâneas da mesma
  -- pessoa, do mesmo e-mail ou do mesmo CNPJ esperam uma pela outra; sem ciclo, sem deadlock.
  perform pg_advisory_xact_lock(hashtext('acesso:usuario:' || v_usuario::text));
  if v_email_hash is not null then
    perform pg_advisory_xact_lock(hashtext('acesso:email:' || v_email_hash));
  end if;
  if v_cnpj_hash is not null then
    perform pg_advisory_xact_lock(hashtext('acesso:' || v_cnpj_hash));
  end if;

  -- Repetir (clique duplo, rede instável) devolve a mesma consultoria. Depois das travas.
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

  v_sem_teste := false;
  if not v_operador then
    v_sem_teste := exists (
      select 1 from public.membro as m
      left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = m.consultoria_id
      where m.usuario_id = v_usuario and m.papel = 'gestao' and not coalesce(cc.interna, false)
    ) or exists (select 1 from private.consultoria_acesso as a where a.cnpj_hash = v_cnpj_hash);
    -- Reserva atômica: a chave única de teste_usado decide quem ganha o teste.
    insert into private.teste_usado (chave, tipo) values (v_cnpj_hash, 'cnpj') on conflict (chave) do nothing;
    get diagnostics v_linhas = row_count;
    v_sem_teste := v_sem_teste or v_linhas = 0;
    if v_email_hash is not null then
      insert into private.teste_usado (chave, tipo) values (v_email_hash, 'email') on conflict (chave) do nothing;
      get diagnostics v_linhas = row_count;
      v_sem_teste := v_sem_teste or v_linhas = 0;
    end if;
  end if;
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
    update private.teste_usado as t set consultoria_id = v_nova
    where t.chave in (v_cnpj_hash, v_email_hash) and t.consultoria_id is null;
  end if;

  return query select v_nova, v_origem;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Alvará: reenvio só na mesma consultoria e unidade
-- ---------------------------------------------------------------------------
create or replace function public.registrar_alvara(
  p_unidade_id uuid,
  p_validade date,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_numero text default null,
  p_orgao text default null,
  p_notas text default null,
  p_anterior_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  un public.unidade;
  ant public.alvara;
  ator uuid;
  tamanho bigint;
  doc uuid;
  novo uuid;
begin
  select * into un from public.unidade as u where u.id = p_unidade_id;
  if not found or not private.is_gestao(un.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(un.consultoria_id);
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Retry: a versão já registrada devolve o alvará dela.
  select a.id into novo
  from public.documento_versao as v
  join public.alvara as a on a.consultoria_id = v.consultoria_id and a.documento_id = v.documento_id
  where v.id = p_versao_id and v.consultoria_id = un.consultoria_id and a.unidade_id = un.id;
  if found then
    return novo;
  end if;
  if exists (select 1 from public.documento_versao as v where v.id = p_versao_id) then
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;

  perform private.conferir_dados_do_alvara(p_numero, p_orgao, p_notas, p_validade);

  if p_anterior_id is not null then
    select * into ant from public.alvara as a where a.id = p_anterior_id for update;
    if not found or ant.consultoria_id <> un.consultoria_id or ant.unidade_id <> un.id
       or ant.excluido_em is not null then
      raise exception 'alvara_anterior_invalido' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.alvara as s
      where s.consultoria_id = ant.consultoria_id and s.anterior_id = ant.id and s.excluido_em is null
    ) then
      raise exception 'alvara_ja_renovado' using errcode = 'P0001';
    end if;
  end if;

  tamanho := private.conferir_pdf_enviado(un.consultoria_id, 'alvara', p_caminho, p_nome_original, p_sha256);

  insert into public.documento (consultoria_id, entidade, versao_vigente_id)
  values (un.consultoria_id, 'alvara', null)
  returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, un.consultoria_id, doc, 1, p_caminho, btrim(p_nome_original), 'application/pdf',
          tamanho, lower(p_sha256), ator);
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;

  insert into public.alvara (consultoria_id, empreendimento_id, unidade_id, numero, orgao, notas, validade,
                             documento_id, anterior_id, criado_por)
  values (un.consultoria_id, un.empreendimento_id, un.id, nullif(btrim(coalesce(p_numero, '')), ''),
          nullif(btrim(coalesce(p_orgao, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), p_validade,
          doc, p_anterior_id, ator)
  returning id into novo;
  return novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Datas civis finitas e numa faixa razoável
-- ---------------------------------------------------------------------------
create function private.data_civil_valida(d date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d is null or (isfinite(d) and d between date '1900-01-01' and date '2199-12-31')
$$;
comment on function private.data_civil_valida(date) is
  'Data civil aceita (ADR-0059): nula, ou finita entre 1900-01-01 e 2199-12-31 (DATA_CIVIL_MINIMA/MAXIMA do domínio).';
revoke all on function private.data_civil_valida(date) from public, anon;
grant execute on function private.data_civil_valida(date) to authenticated;

-- Toda coluna date das tabelas do schema public. not valid: só vale para o que for escrito
-- daqui em diante; dado antigo fora da faixa fica e as leituras de prazo o ignoram.
do $$
declare
  col record;
begin
  for col in
    select c.table_name, c.column_name
    from information_schema.columns as c
    join information_schema.tables as t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.data_type = 'date' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.column_name
  loop
    execute format(
      'alter table public.%I add constraint %I check (private.data_civil_valida(%I)) not valid',
      col.table_name,
      'data_civil_' || left(md5(col.table_name || '.' || col.column_name), 16),
      col.column_name);
  end loop;
end;
$$;

-- Fontes de prazo e lista de exigências: o item com data fora da faixa sai, a lista continua.
create or replace function private.linhas_de_prazo_ocorrencia(cid uuid)
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
    'ocorrencia'::text, o.id, o.instrumento_id, o.prazo_oficial_atual, o.prazo_oficial_atual - h.d,
    c.codigo, v.titulo, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    o.responsavel_id, m.nome, o.situacao, o.meta_interna, o.row_version
  from public.ocorrencia as o
  cross join hoje as h
  join public.condicionante_versao as v on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = o.consultoria_id and m.id = o.responsavel_id
  where o.consultoria_id = cid and o.situacao <> 'concluida'
    and private.data_civil_valida(o.prazo_oficial_atual)
$$;

create or replace function private.linhas_de_prazo_validade(cid uuid)
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
    'validade'::text, i.id, i.id, i.validade, i.validade - h.d,
    null::text, 'Validade'::text, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where i.consultoria_id = cid and i.situacao = 'ativo'
    and private.data_civil_valida(i.validade)
$$;

create or replace function private.linhas_de_prazo_limite_protocolo(cid uuid)
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
    'limite_protocolo'::text, i.id, i.id, i.validade - coalesce(pr.dias_limite_protocolo, 120),
    i.validade - coalesce(pr.dias_limite_protocolo, 120) - h.d,
    null::text, 'Limite de protocolo'::text, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.plano_renovacao as pr on pr.consultoria_id = i.consultoria_id and pr.instrumento_id = i.id
  where i.consultoria_id = cid and i.situacao = 'ativo' and upper(btrim(t.sigla)) = 'LAO'
    and private.data_civil_valida(i.validade)
    and pr.protocolado_em is null
$$;

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
    and private.data_civil_valida(a.prazo)
$$;

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
    and private.data_civil_valida(v.valido_ate)
    and not exists (
      select 1 from public.vencimento as s
      where s.consultoria_id = v.consultoria_id and s.anterior_id = v.id and s.excluido_em is null
    )
$$;

create or replace function private.linhas_de_prazo_exigencia(cid uuid)
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
    'exigencia'::text, x.id, x.instrumento_id, x.prazo_oficial, x.prazo_oficial - h.d,
    x.numero_oficio, x.assunto, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), null::uuid,
    x.responsavel_id, m.nome, null::public.situacao_ocorrencia, null::date, x.row_version
  from public.exigencia as x
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = x.consultoria_id and u.id = x.unidade_id
  join public.empreendimento as e on e.consultoria_id = x.consultoria_id and e.id = x.empreendimento_id
  left join public.instrumento as i on i.consultoria_id = x.consultoria_id and i.id = x.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.responsavel_id
  where x.consultoria_id = cid and x.situacao = 'aberta' and x.excluido_em is null
    and private.data_civil_valida(x.prazo_oficial)
$$;

create or replace function public.listar_exigencias(
  p_consultoria_id uuid,
  p_empreendimento_id uuid default null,
  p_situacao text default null,
  p_exigencia_id uuid default null,
  p_limite integer default 25,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  instrumento_id uuid,
  licenca text,
  licenca_numero_processo text,
  licenca_row_version integer,
  numero_processo text,
  numero_oficio text,
  orgao text,
  assunto text,
  notas text,
  recebido_em date,
  recebido_em_texto text,
  prazo_dias integer,
  prazo_contagem public.contagem_prazo,
  prazo_oficial_original date,
  prazo_oficial date,
  prazo_oficial_texto text,
  meta_interna date,
  responsavel_id uuid,
  responsavel_nome text,
  situacao text,
  primeira_resposta_em date,
  respostas bigint,
  oficio_caminho text,
  oficio_nome text,
  criado_em timestamptz,
  criado_por_nome text,
  row_version integer,
  hoje date,
  dias integer,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with h as (select private.hoje_da_consultoria(p_consultoria_id) as d)
  select
    x.id, x.empreendimento_id, e.nome, x.unidade_id, u.nome, x.instrumento_id,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.numero_processo, i.row_version,
    x.numero_processo, x.numero_oficio, x.orgao, x.assunto, x.notas,
    x.recebido_em, x.recebido_em_texto, x.prazo_dias, x.prazo_contagem,
    x.prazo_oficial_original, x.prazo_oficial, x.prazo_oficial_texto, x.meta_interna,
    x.responsavel_id, m.nome, x.situacao,
    r.primeira_resposta_em, r.respostas,
    dv.caminho, dv.nome_original,
    x.criado_em, mc.nome, x.row_version,
    h.d, x.prazo_oficial - h.d, count(*) over ()
  from public.exigencia as x
  cross join h
  join public.unidade as u on u.consultoria_id = x.consultoria_id and u.id = x.unidade_id
  join public.empreendimento as e on e.consultoria_id = x.consultoria_id and e.id = x.empreendimento_id
  left join public.instrumento as i on i.consultoria_id = x.consultoria_id and i.id = x.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.responsavel_id
  left join public.membro as mc on mc.consultoria_id = x.consultoria_id and mc.id = x.criado_por
  left join public.documento as d on d.consultoria_id = x.consultoria_id and d.id = x.documento_id
  left join public.documento_versao as dv on dv.consultoria_id = d.consultoria_id and dv.id = d.versao_vigente_id
  cross join lateral (
    select min(er.protocolado_em) filter (where er.tipo = 'resposta') as primeira_resposta_em,
           count(*) as respostas
    from public.exigencia_resposta as er
    where er.consultoria_id = x.consultoria_id and er.exigencia_id = x.id
  ) as r
  where x.consultoria_id = p_consultoria_id
    and x.excluido_em is null
    and private.data_civil_valida(x.prazo_oficial)
    and (p_empreendimento_id is null or x.empreendimento_id = p_empreendimento_id)
    and (p_exigencia_id is null or x.id = p_exigencia_id)
    and case p_situacao
          when 'abertas' then x.situacao = 'aberta'
          when 'respondidas' then x.situacao = 'respondida'
          else true
        end
  order by
    case when x.situacao = 'aberta' then 0 else 1 end,
    case when x.situacao = 'aberta' then x.prazo_oficial end asc,
    case when x.situacao <> 'aberta' then x.prazo_oficial end desc,
    x.id
  limit least(greatest(coalesce(p_limite, 25), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- 6. Etapas: no máximo 200 por ocorrência
-- ---------------------------------------------------------------------------
create function private.limitar_etapas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serializa as inserções da mesma ocorrência antes de contar.
  perform 1 from public.ocorrencia as o
  where o.consultoria_id = new.consultoria_id and o.id = new.ocorrencia_id for update;
  if (select count(*) from public.etapa as e
      where e.consultoria_id = new.consultoria_id and e.ocorrencia_id = new.ocorrencia_id) >= 200 then
    raise exception 'limite_de_etapas' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.limitar_etapas() from public, anon, authenticated;

create trigger etapa_limite
  before insert on public.etapa
  for each row execute function private.limitar_etapas();
