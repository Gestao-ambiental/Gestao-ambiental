-- Importar planilha de empreendimentos e licenças (ADR-0043; estudo "Oito funções", pacote P1).
-- A leitura do arquivo é toda no navegador; o banco recebe as linhas já normalizadas, sem CPF e sem o
-- arquivo bruto, numa área de conferência (importacao_linha) que não toca as tabelas reais antes de
-- efetivar. Só a Gestão vinculada importa.
--
-- 1. Exclusão lógica em empreendimento, unidade e instrumento (excluido_em, excluido_por), com a
--    leitura (RLS) escondendo o excluído; instrumento.somente_validade (licença sem condicionantes).
--    Guardas: instrumento_para_editar recusa licença desfeita; criar unidade ou licença num pai
--    desfeito é recusado por trigger.
-- 2. Tabelas importacao, importacao_linha e importacao_mapeamento (último mapeamento por entidade).
-- 3. Helpers privados: limpeza dos dados, recusa de CPF, conferência (erros e avisos por linha, mais o
--    resumo com o limite do plano) e busca genérica de dependentes pelo catálogo.
-- 4. RPCs, cada uma numa transação e idempotente: criar_importacao, enviar_linhas_da_importacao,
--    conferir_importacao, efetivar_importacao e desfazer_importacao (até 24 h).
-- Criada pela CLI; vem depois da base das oito (20261120183218).

-- ---------------------------------------------------------------------------
-- 1. Colunas novas e exclusão lógica
-- ---------------------------------------------------------------------------
alter table public.empreendimento
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add constraint empreendimento_exclusao_coerente check ((excluido_em is null) = (excluido_por is null)),
  add constraint empreendimento_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict;

alter table public.unidade
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add constraint unidade_exclusao_coerente check ((excluido_em is null) = (excluido_por is null)),
  add constraint unidade_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict;

alter table public.instrumento
  add column somente_validade boolean not null default false,
  add column excluido_em timestamptz,
  add column excluido_por uuid,
  add constraint instrumento_exclusao_coerente check ((excluido_em is null) = (excluido_por is null)),
  add constraint instrumento_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict;

comment on column public.empreendimento.excluido_em is
  'Exclusão lógica (ADR-0043): desfeito pela importação. A leitura (RLS) esconde.';
comment on column public.unidade.excluido_em is
  'Exclusão lógica (ADR-0043): desfeita pela importação. A leitura (RLS) esconde.';
comment on column public.instrumento.excluido_em is
  'Exclusão lógica (ADR-0043): licença desfeita pela importação, de volta a rascunho. A leitura (RLS) esconde.';
comment on column public.instrumento.somente_validade is
  'Licença importada sem condicionantes (ADR-0043): ativa só pela validade; selo "Sem condicionantes".';

-- A leitura esconde o que a importação desfez.
alter policy empreendimento_select_membro_ativo on public.empreendimento
  using ((select private.is_membro(consultoria_id)) and excluido_em is null);
alter policy unidade_select_membro_ativo on public.unidade
  using ((select private.is_membro(consultoria_id)) and excluido_em is null);
alter policy instrumento_select_membro_ativo on public.instrumento
  using ((select private.is_membro(consultoria_id)) and excluido_em is null);

-- Chave de duplicidade da licença (tipo, número e órgão normalizados).
create index instrumento_chave_da_importacao_idx on public.instrumento
  (consultoria_id, tipo_id, private.normalizar_nome(numero), private.normalizar_nome(orgao))
  where excluido_em is null;

-- Licença desfeita não volta a ser editada (mesmo corpo de 20261017202216, com a guarda nova).
create or replace function private.instrumento_para_editar(p_id uuid)
returns public.instrumento
language plpgsql
set search_path = ''
as $$
declare
  alvo public.instrumento;
begin
  select * into alvo from public.instrumento as i where i.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) or alvo.excluido_em is not null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'rascunho' then
    raise exception 'instrumento_ativo' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.instrumento_para_editar(uuid) from public, anon, authenticated;

-- Unidade ou licença nova num pai desfeito: recusa. security definer porque as RPCs que criam
-- (também security definer) enxergam o excluído, e a recusa não pode depender da RLS de quem chama.
create function private.recusar_pai_excluido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
       select 1 from public.empreendimento as e
       where e.consultoria_id = new.consultoria_id and e.id = new.empreendimento_id
         and e.excluido_em is not null) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  -- Em separado: a unidade (tabela unidade) não tem unidade_id.
  if tg_table_name = 'instrumento' then
    if exists (
         select 1 from public.unidade as u
         where u.consultoria_id = new.consultoria_id and u.id = (to_jsonb(new) ->> 'unidade_id')::uuid
           and u.excluido_em is not null) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.recusar_pai_excluido() from public, anon, authenticated;

create trigger unidade_pai_excluido
  before insert on public.unidade
  for each row execute function private.recusar_pai_excluido();

create trigger instrumento_pai_excluido
  before insert on public.instrumento
  for each row execute function private.recusar_pai_excluido();

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
create table public.importacao (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  entidade text not null,
  nome_arquivo text not null,
  total_linhas integer not null,
  mapeamento jsonb not null,
  situacao text not null default 'em_conferencia',
  resumo jsonb,
  conferida_em timestamptz,
  resultado jsonb,
  efetivada_em timestamptz,
  efetivada_por uuid,
  resultado_desfazer jsonb,
  desfeita_em timestamptz,
  desfeita_por uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint importacao_consultoria_id_id_key unique (consultoria_id, id),
  constraint importacao_entidade_valida check (entidade in ('empreendimento', 'licenca')),
  constraint importacao_situacao_valida check (situacao in ('em_conferencia', 'efetivada', 'desfeita')),
  constraint importacao_nome_arquivo_valido check (length(btrim(nome_arquivo)) between 1 and 255),
  constraint importacao_total_linhas_valido check (total_linhas between 1 and 1000),
  constraint importacao_mapeamento_objeto check (jsonb_typeof(mapeamento) = 'object'),
  constraint importacao_efetivacao_coerente check (
    (situacao = 'em_conferencia') = (efetivada_em is null and efetivada_por is null and resultado is null)),
  constraint importacao_desfazer_coerente check (
    (situacao = 'desfeita') = (desfeita_em is not null and desfeita_por is not null and resultado_desfazer is not null)),
  constraint importacao_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint importacao_efetivada_por_fk foreign key (consultoria_id, efetivada_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint importacao_desfeita_por_fk foreign key (consultoria_id, desfeita_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.importacao is
  'Importação de planilha (ADR-0043). O arquivo bruto não é guardado; mapeamento só com nomes de coluna.';
comment on column public.importacao.id is 'Gerado no navegador (idempotência de criar_importacao).';
comment on column public.importacao.conferida_em is 'Nulo depois de qualquer envio de linhas: precisa conferir de novo.';

create index importacao_consultoria_criado_idx on public.importacao (consultoria_id, criado_em desc, id desc);

create table public.importacao_linha (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  importacao_id uuid not null,
  numero_linha integer not null,
  dados jsonb not null,
  erros jsonb not null default '[]'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  grupo text generated always as (
    case when jsonb_array_length(erros) > 0 then 'erro'
         when jsonb_array_length(avisos) > 0 then 'aviso'
         else 'pronta' end) stored,
  resultado text,
  motivo_mantida text,
  empreendimento_id uuid,
  empreendimento_criado boolean not null default false,
  unidade_id uuid,
  unidade_criada boolean not null default false,
  instrumento_id uuid,
  instrumento_row_version integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint importacao_linha_consultoria_id_id_key unique (consultoria_id, id),
  constraint importacao_linha_numero_key unique (consultoria_id, importacao_id, numero_linha),
  constraint importacao_linha_numero_valido check (numero_linha between 2 and 1048576),
  constraint importacao_linha_dados_objeto check (jsonb_typeof(dados) = 'object'),
  constraint importacao_linha_erros_lista check (jsonb_typeof(erros) = 'array'),
  constraint importacao_linha_avisos_lista check (jsonb_typeof(avisos) = 'array'),
  constraint importacao_linha_resultado_valido check (resultado in ('criada', 'pulada', 'com_erro', 'desfeita')),
  constraint importacao_linha_motivo_valido check (
    motivo_mantida in ('alterada_depois', 'tem_dependentes', 'renovacao_em_andamento')),
  constraint importacao_linha_motivo_coerente check (motivo_mantida is null or resultado = 'criada'),
  constraint importacao_linha_unidade_com_empreendimento check (unidade_id is null or empreendimento_id is not null),
  constraint importacao_linha_importacao_fk foreign key (consultoria_id, importacao_id)
    references public.importacao (consultoria_id, id) on delete restrict,
  constraint importacao_linha_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint importacao_linha_unidade_fk foreign key (consultoria_id, empreendimento_id, unidade_id)
    references public.unidade (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint importacao_linha_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict
);

comment on table public.importacao_linha is
  'Linha da planilha já normalizada (ADR-0043), área de conferência. Nunca CPF: o banco recusa o lote.';
comment on column public.importacao_linha.numero_linha is 'Linha como o Excel mostra (cabeçalho = 1).';
comment on column public.importacao_linha.erros is 'Lista [{codigo, campo}], escrita só pela conferência.';

create index importacao_linha_grupo_idx
  on public.importacao_linha (consultoria_id, importacao_id, grupo, numero_linha);

create table public.importacao_mapeamento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  entidade text not null,
  mapeamento jsonb not null,
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint importacao_mapeamento_consultoria_id_id_key unique (consultoria_id, id),
  constraint importacao_mapeamento_entidade_key unique (consultoria_id, entidade),
  constraint importacao_mapeamento_entidade_valida check (entidade in ('empreendimento', 'licenca')),
  constraint importacao_mapeamento_objeto check (jsonb_typeof(mapeamento) = 'object'),
  constraint importacao_mapeamento_atualizado_por_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.importacao_mapeamento is
  'Último mapeamento de colunas usado por entidade (ADR-0043): {campo: cabeçalho}. Só nomes de coluna.';

do $$
declare
  tabela text;
begin
  foreach tabela in array array['importacao', 'importacao_linha', 'importacao_mapeamento'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);
    execute format('revoke all on table public.%I from anon, authenticated', tabela);
    execute format('grant select on table public.%I to authenticated', tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using ((select private.is_gestao(consultoria_id)))',
      tabela || '_select_gestao', tabela);
    execute format(
      'create trigger _suporte_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_do_suporte()', tabela);
    execute format(
      'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_comercial()', tabela);
  end loop;
end;
$$;

create trigger importacao_auditar after insert or update or delete on public.importacao
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- 3. Helpers privados
-- ---------------------------------------------------------------------------
-- Campos da planilha por entidade (CampoDaImportacao em packages/domain).
create function private.campos_da_importacao(p_entidade text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_entidade
    when 'empreendimento' then array['empreendimento', 'cliente', 'cnpj', 'unidade', 'endereco']
    when 'licenca' then array['empreendimento', 'cliente', 'cnpj', 'unidade', 'endereco',
                              'tipo', 'numero', 'orgao', 'emitido_em', 'validade']
  end
$$;

-- Só as chaves conhecidas da entidade; texto aparado, vazio vira nulo; CNPJ normalizado; em
-- `descartados`, só nomes de campo conhecidos. Toda chave aparece (nula quando não veio).
create function private.limpar_dados_da_importacao(p_entidade text, p_dados jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_campos text[] := private.campos_da_importacao(p_entidade);
  v_chaves text[];
  v_chave text;
  v_valor text;
  v_limpo jsonb := '{}'::jsonb;
  v_descartados jsonb;
begin
  v_chaves := case p_entidade
    when 'licenca' then v_campos || array['emitido_em_texto', 'validade_texto']
    else v_campos
  end;
  foreach v_chave in array v_chaves loop
    v_valor := case when jsonb_typeof(p_dados -> v_chave) in ('string', 'number', 'boolean')
                    then p_dados ->> v_chave end;
    v_valor := nullif(btrim(v_valor, E' \t\r\n'), '');
    if v_chave = 'cnpj' then
      v_valor := private.normalizar_cnpj(v_valor);
    end if;
    -- Texto acima de 300 já é erro (texto_longo); o corte em 1.000 só limita o que fica guardado.
    v_limpo := v_limpo || jsonb_build_object(v_chave, left(v_valor, 1000));
  end loop;

  select coalesce(jsonb_agg(x.campo order by array_position(v_campos, x.campo)), '[]'::jsonb)
  into v_descartados
  from (
    select distinct e.valor as campo
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_dados -> 'descartados') = 'array' then p_dados -> 'descartados'
           else '[]'::jsonb end) as e (valor)
    where e.valor = any (v_campos)
  ) as x;

  return v_limpo || jsonb_build_object('descartados', v_descartados);
end;
$$;

-- CPF não entra no banco (ADR-0043): CNPJ com 11 dígitos ou qualquer valor no formato 000.000.000-00.
create function private.tem_cpf(p_dados jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(private.normalizar_cnpj(p_dados ->> 'cnpj') ~ '^[0-9]{11}$', false)
    or exists (
      select 1 from jsonb_each_text(p_dados) as e
      where e.value ~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}'
    )
$$;

-- Data aaaa-mm-dd da planilha (o navegador já converteu), entre 1900 e 2100; senão nulo.
create function private.data_da_importacao(p_texto text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_data date := private.data_ou_nulo(p_texto);
begin
  if v_data is null or extract(year from v_data) not between 1900 and 2100 then
    return null;
  end if;
  return v_data;
end;
$$;

-- Erros só de formato (os mesmos códigos de validarLinha em packages/domain).
create function private.erros_de_formato_da_linha(p_entidade text, p_dados jsonb, p_hoje date)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_erros jsonb := '[]'::jsonb;
  v_descartados jsonb := coalesce(p_dados -> 'descartados', '[]'::jsonb);
  v_campo text;
  v_emissao date := private.data_da_importacao(p_dados ->> 'emitido_em');
  v_validade date := private.data_da_importacao(p_dados ->> 'validade');
begin
  foreach v_campo in array case p_entidade
    when 'licenca' then array['empreendimento', 'tipo', 'numero', 'orgao', 'emitido_em', 'validade']
    else array['empreendimento'] end
  loop
    continue when v_descartados ? v_campo;
    if p_dados ->> v_campo is null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'codigo', case when v_campo in ('emitido_em', 'validade') and p_dados ->> (v_campo || '_texto') is not null
                       then 'data_invalida' else 'campo_obrigatorio' end,
        'campo', v_campo));
    elsif v_campo in ('emitido_em', 'validade') and private.data_da_importacao(p_dados ->> v_campo) is null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', 'data_invalida', 'campo', v_campo));
    end if;
  end loop;

  if p_entidade = 'licenca' then
    if v_emissao > p_hoje then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', 'data_futura', 'campo', 'emitido_em'));
    end if;
    if v_validade < v_emissao then
      v_erros := v_erros || jsonb_build_array(
        jsonb_build_object('codigo', 'validade_antes_da_emissao', 'campo', 'validade'));
    end if;
  end if;

  if p_dados ->> 'cnpj' is not null and p_dados ->> 'cnpj' !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', 'cnpj_invalido', 'campo', 'cnpj'));
  end if;

  for v_campo in select e.valor from jsonb_array_elements_text(v_descartados) as e (valor) loop
    v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', 'valor_parece_cpf', 'campo', v_campo));
  end loop;

  if p_dados ->> 'endereco' is not null and p_dados ->> 'unidade' is null then
    v_erros := v_erros || jsonb_build_array(
      jsonb_build_object('codigo', 'endereco_sem_unidade', 'campo', 'endereco'));
  end if;

  foreach v_campo in array case p_entidade
    when 'licenca' then array['empreendimento', 'cliente', 'unidade', 'endereco', 'tipo', 'numero', 'orgao',
                              'emitido_em_texto', 'validade_texto']
    else array['empreendimento', 'cliente', 'unidade', 'endereco'] end
  loop
    if length(p_dados ->> v_campo) > 300 then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'codigo', 'texto_longo', 'campo', replace(v_campo, '_texto', '')));
    end if;
  end loop;

  return v_erros;
end;
$$;

-- Tipo de licença pela sigla ou pelo nome (a sigla ganha). Nulo: tipo desconhecido.
create function private.tipo_da_importacao(cid uuid, p_tipo text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id
  from public.tipo_instrumento as t
  where t.consultoria_id = cid
    and (t.sigla_normalizada = private.normalizar_nome(p_tipo)
         or private.normalizar_nome(t.nome) = private.normalizar_nome(p_tipo))
  order by (t.sigla_normalizada = private.normalizar_nome(p_tipo)) desc, t.criado_em, t.id
  limit 1
$$;

-- Chave de duplicidade do empreendimento (chaveDoEmpreendimento em packages/domain).
create function private.chave_do_empreendimento(p_dados jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_dados ->> 'cnpj' is not null then 'cnpj:' || (p_dados ->> 'cnpj')
              else 'nome:' || private.normalizar_nome(p_dados ->> 'empreendimento')
                   || '|' || private.normalizar_nome(p_dados ->> 'cliente') end
$$;

-- Empreendimentos visíveis (não excluídos) que casam com a chave da linha, fora os ignorados (os que
-- esta importação acabou de criar, para efetivar enxergar o banco como a conferência enxergou).
create function private.empreendimentos_pela_chave(cid uuid, p_dados jsonb, p_ignorar uuid[])
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(e.id order by e.id), '{}'::uuid[])
  from public.empreendimento as e
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  where e.consultoria_id = cid
    and e.excluido_em is null
    and e.id <> all (coalesce(p_ignorar, '{}'::uuid[]))
    and case when p_dados ->> 'cnpj' is not null then e.cnpj = p_dados ->> 'cnpj'
             else e.nome_normalizado = private.normalizar_nome(p_dados ->> 'empreendimento')
                  and coalesce(cl.nome_normalizado, '') = private.normalizar_nome(p_dados ->> 'cliente') end
$$;

-- Unidade já existente que a licença usa num empreendimento existente: pelo nome normalizado; com a
-- coluna em branco, a única visível. Nulo: a importação cria (ou a linha tem unidade_ambigua).
create function private.unidade_existente_da_importacao(
  cid uuid, p_empreendimento_id uuid, p_unidade text, p_ignorar uuid[])
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_achada uuid;
  v_quantas integer;
begin
  if p_empreendimento_id is null then
    return null;
  end if;
  if p_unidade is not null then
    select u.id into v_achada
    from public.unidade as u
    where u.consultoria_id = cid and u.empreendimento_id = p_empreendimento_id and u.excluido_em is null
      and u.id <> all (coalesce(p_ignorar, '{}'::uuid[]))
      and private.normalizar_nome(u.nome) = private.normalizar_nome(p_unidade)
    order by u.criado_em, u.id
    limit 1;
    return v_achada;
  end if;
  select count(*)::integer, min(u.id::text)::uuid into v_quantas, v_achada
  from public.unidade as u
  where u.consultoria_id = cid and u.empreendimento_id = p_empreendimento_id and u.excluido_em is null
    and u.id <> all (coalesce(p_ignorar, '{}'::uuid[]));
  return case when v_quantas = 1 then v_achada end;
end;
$$;

-- Linha sem erro que não cria nada (duplicidade): pulada.
create function private.linha_da_importacao_pulada(p_entidade text, p_avisos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1 from jsonb_array_elements(p_avisos) as a
    where a ->> 'codigo' in ('empreendimento_repetido_na_planilha', 'licenca_ja_existe',
                             'licenca_repetida_na_planilha')
       or (p_entidade = 'empreendimento' and a ->> 'codigo' = 'empreendimento_ja_existe')
  )
$$;

-- Limite do plano para N empreendimentos que passam a ter licença ativa (mesma regra de
-- exigir_confirmacao_de_adicional e confirmar_adicional).
create function private.limite_da_importacao(cid uuid, p_novos integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  s record;
  v_novos integer := greatest(coalesce(p_novos, 0), 0);
  v_quantidade integer := private.empreendimentos_ativos(cid) + greatest(coalesce(p_novos, 0), 0);
  v_limite integer;
  v_plano text;
begin
  select * into s from private.situacao_comercial_em(cid, private.hoje_da_consultoria(cid));
  if found then
    v_limite := s.limite_empreendimentos;
    v_plano := s.plano_vigente;
  end if;
  return jsonb_build_object(
    'recurso', 'empreendimentos',
    'quantidade', v_quantidade,
    'limite', v_limite,
    'precisa_confirmar', v_novos > 0 and v_limite is not null and v_quantidade > v_limite
      and not exists (
        select 1 from public.adicional_confirmado as a
        where a.consultoria_id = cid and a.recurso = 'empreendimentos' and a.quantidade >= v_quantidade
          and a.plano = v_plano),
    'adicionais_centavos', private.adicionais_centavos(v_plano, private.pessoas_ativas(cid), v_quantidade));
end;
$$;

-- Há linha de outra tabela (fora as ignoradas) ligada a este registro? Lê as chaves estrangeiras do
-- catálogo, então tabela nova entra sozinha. Liga a coluna que referencia `id` (e a que referencia
-- `consultoria_id`, quando a chave é composta).
create function private.referencias_externas(
  p_tabela regclass, p_consultoria_id uuid, p_id uuid, p_ignorar regclass[])
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fk record;
  v_coluna_id text;
  v_coluna_consultoria text;
  v_referenciada text;
  v_achou boolean;
begin
  for v_fk in
    select c.conrelid, c.conkey, c.confkey
    from pg_catalog.pg_constraint as c
    where c.contype = 'f' and c.confrelid = p_tabela
      and c.conrelid <> all (coalesce(p_ignorar, '{}'::regclass[])::oid[])
  loop
    v_coluna_id := null;
    v_coluna_consultoria := null;
    for i in 1 .. array_length(v_fk.confkey, 1) loop
      select a.attname into v_referenciada from pg_catalog.pg_attribute as a
      where a.attrelid = p_tabela and a.attnum = v_fk.confkey[i];
      if v_referenciada = 'id' then
        select a.attname into v_coluna_id from pg_catalog.pg_attribute as a
        where a.attrelid = v_fk.conrelid and a.attnum = v_fk.conkey[i];
      elsif v_referenciada = 'consultoria_id' then
        select a.attname into v_coluna_consultoria from pg_catalog.pg_attribute as a
        where a.attrelid = v_fk.conrelid and a.attnum = v_fk.conkey[i];
      end if;
    end loop;
    continue when v_coluna_id is null;

    execute format('select exists (select 1 from %s where %I = $2%s)',
                   v_fk.conrelid::regclass, v_coluna_id,
                   case when v_coluna_consultoria is not null then format(' and %I = $1', v_coluna_consultoria)
                        else '' end)
      into v_achou
      using p_consultoria_id, p_id;
    if v_achou then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Conferência: reescreve erros e avisos de todas as linhas e devolve o resumo (sem row_version).
-- Usada por conferir e por efetivar. Conta o que efetivar faz, pela mesma regra.
create function private.conferir_linhas_da_importacao(p_importacao_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_imp public.importacao;
  v_cid uuid;
  v_hoje date;
  v_linha public.importacao_linha;
  v_dados jsonb;
  v_erros jsonb;
  v_avisos jsonb;
  v_tipo uuid;
  v_achados uuid[];
  v_chave_emp text;
  v_chave_lic text;
  v_ref_emp text;
  v_emp_existente uuid;
  v_licenca_existe boolean;
  v_unidade uuid;
  v_chave_uni text;
  v_vistas_emp jsonb := '{}'::jsonb;
  v_vistas_lic jsonb := '{}'::jsonb;
  v_novos_emp jsonb := '{}'::jsonb;
  v_novas_uni jsonb := '{}'::jsonb;
  v_ativando jsonb := '{}'::jsonb;
  n_total integer := 0;
  n_prontas integer := 0;
  n_aviso integer := 0;
  n_erro integer := 0;
  n_puladas integer := 0;
  c_emp integer := 0;
  c_uni integer := 0;
  c_lic integer := 0;
begin
  select * into v_imp from public.importacao as i where i.id = p_importacao_id;
  v_cid := v_imp.consultoria_id;
  v_hoje := private.hoje_da_consultoria(v_cid);

  for v_linha in
    select * from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id
    order by x.numero_linha
  loop
    v_dados := v_linha.dados;
    v_erros := private.erros_de_formato_da_linha(v_imp.entidade, v_dados, v_hoje);
    v_avisos := '[]'::jsonb;
    v_tipo := null;
    v_ref_emp := null;
    v_emp_existente := null;
    v_licenca_existe := false;

    -- Licença: tipo conhecido e duplicidade (no banco, de qualquer situação, ou na planilha).
    if v_imp.entidade = 'licenca' and v_dados ->> 'tipo' is not null then
      v_tipo := private.tipo_da_importacao(v_cid, v_dados ->> 'tipo');
      if v_tipo is null then
        v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', 'tipo_desconhecido', 'campo', 'tipo'));
      end if;
    end if;
    if v_tipo is not null and v_dados ->> 'numero' is not null and v_dados ->> 'orgao' is not null then
      v_chave_lic := v_tipo::text || '|' || private.normalizar_nome(v_dados ->> 'numero')
                     || '|' || private.normalizar_nome(v_dados ->> 'orgao');
      v_licenca_existe := exists (
        select 1 from public.instrumento as i
        where i.consultoria_id = v_cid and i.tipo_id = v_tipo and i.excluido_em is null
          and private.normalizar_nome(i.numero) = private.normalizar_nome(v_dados ->> 'numero')
          and private.normalizar_nome(i.orgao) = private.normalizar_nome(v_dados ->> 'orgao'));
      if v_licenca_existe then
        v_avisos := v_avisos || jsonb_build_array(
          jsonb_build_object('codigo', 'licenca_ja_existe', 'campo', 'numero'));
      elsif v_vistas_lic ? v_chave_lic then
        v_avisos := v_avisos || jsonb_build_array(
          jsonb_build_object('codigo', 'licenca_repetida_na_planilha', 'campo', 'numero'));
      end if;
      v_vistas_lic := v_vistas_lic || jsonb_build_object(v_chave_lic, v_linha.numero_linha);
    end if;

    -- Empreendimento: existente (1), ambíguo (2 ou mais) ou novo (parecido quando o nome casa).
    if v_dados ->> 'empreendimento' is not null then
      v_chave_emp := private.chave_do_empreendimento(v_dados);
      v_achados := private.empreendimentos_pela_chave(v_cid, v_dados, null);
      if cardinality(v_achados) > 1 and v_imp.entidade = 'empreendimento' then
        -- Aba Empreendimentos: já existe (mais de um igual) é duplicidade, só aviso; a linha é pulada.
        v_emp_existente := v_achados[1];
        v_avisos := v_avisos || jsonb_build_array(
          jsonb_build_object('codigo', 'empreendimento_ja_existe', 'campo', 'empreendimento'));
      elsif cardinality(v_achados) > 1 then
        -- Licença: não há como saber em qual dos empreendimentos iguais ela entra.
        if not v_licenca_existe then
          v_erros := v_erros || jsonb_build_array(
            jsonb_build_object('codigo', 'empreendimento_ambiguo', 'campo', 'empreendimento'));
        end if;
      elsif cardinality(v_achados) = 1 then
        v_emp_existente := v_achados[1];
        v_ref_emp := 'id:' || v_emp_existente::text;
        v_avisos := v_avisos || jsonb_build_array(
          jsonb_build_object('codigo', 'empreendimento_ja_existe', 'campo', 'empreendimento'));
      else
        v_ref_emp := 'novo:' || v_chave_emp;
        if exists (
          select 1 from public.empreendimento as e
          where e.consultoria_id = v_cid and e.excluido_em is null
            and e.nome_normalizado = private.normalizar_nome(v_dados ->> 'empreendimento')
        ) then
          v_avisos := v_avisos || jsonb_build_array(
            jsonb_build_object('codigo', 'empreendimento_parecido', 'campo', 'empreendimento'));
        end if;
      end if;

      if v_imp.entidade = 'empreendimento' then
        if v_emp_existente is null and v_vistas_emp ? v_chave_emp then
          v_avisos := v_avisos || jsonb_build_array(
            jsonb_build_object('codigo', 'empreendimento_repetido_na_planilha', 'campo', 'empreendimento'));
        end if;
        v_vistas_emp := v_vistas_emp || jsonb_build_object(v_chave_emp, v_linha.numero_linha);
      elsif not v_licenca_existe and v_emp_existente is not null and v_dados ->> 'unidade' is null
            and (select count(*) from public.unidade as u
                 where u.consultoria_id = v_cid and u.empreendimento_id = v_emp_existente
                   and u.excluido_em is null) >= 2 then
        v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', 'unidade_ambigua', 'campo', 'unidade'));
      end if;
    end if;

    if v_imp.entidade = 'licenca' and private.data_da_importacao(v_dados ->> 'validade') < v_hoje then
      v_avisos := v_avisos || jsonb_build_array(
        jsonb_build_object('codigo', 'licenca_vencida', 'campo', 'validade'));
    end if;

    update public.importacao_linha as x set erros = v_erros, avisos = v_avisos where x.id = v_linha.id;

    n_total := n_total + 1;
    if jsonb_array_length(v_erros) > 0 then
      n_erro := n_erro + 1;
      continue;
    elsif jsonb_array_length(v_avisos) > 0 then
      n_aviso := n_aviso + 1;
    else
      n_prontas := n_prontas + 1;
    end if;
    if private.linha_da_importacao_pulada(v_imp.entidade, v_avisos) then
      n_puladas := n_puladas + 1;
      continue;
    end if;

    -- O que a linha cria (a mesma regra de efetivar_importacao).
    if v_imp.entidade = 'empreendimento' then
      c_emp := c_emp + 1;
      if v_dados ->> 'unidade' is not null then
        c_uni := c_uni + 1;
      end if;
      continue;
    end if;

    if v_ref_emp like 'novo:%' then
      if not v_novos_emp ? v_ref_emp then
        v_novos_emp := v_novos_emp || jsonb_build_object(v_ref_emp, true);
        c_emp := c_emp + 1;
      end if;
      v_ativando := v_ativando || jsonb_build_object(v_ref_emp, true);
    elsif not exists (
      select 1 from public.instrumento as i
      where i.consultoria_id = v_cid and i.empreendimento_id = v_emp_existente and i.situacao = 'ativo'
    ) then
      v_ativando := v_ativando || jsonb_build_object(v_ref_emp, true);
    end if;

    v_unidade := private.unidade_existente_da_importacao(v_cid, v_emp_existente, v_dados ->> 'unidade', null);
    if v_unidade is null then
      v_chave_uni := v_ref_emp || '|' || private.normalizar_nome(coalesce(v_dados ->> 'unidade', 'Matriz'));
      if not v_novas_uni ? v_chave_uni then
        v_novas_uni := v_novas_uni || jsonb_build_object(v_chave_uni, true);
        c_uni := c_uni + 1;
      end if;
    end if;
    c_lic := c_lic + 1;
  end loop;

  return jsonb_build_object(
    'total', n_total,
    'prontas', n_prontas,
    'com_aviso', n_aviso,
    'com_erro', n_erro,
    'puladas', n_puladas,
    'a_criar', jsonb_build_object('empreendimentos', c_emp, 'unidades', c_uni, 'licencas', c_lic),
    'limite', private.limite_da_importacao(
      v_cid, (select count(*)::integer from jsonb_object_keys(v_ativando))));
end;
$$;

-- Importação travada para escrita, só da Gestão vinculada. Inexistente ou de outra consultoria:
-- sem_permissao.
create function private.importacao_para_gestao(p_id uuid)
returns public.importacao
language plpgsql
set search_path = ''
as $$
declare
  alvo public.importacao;
begin
  select * into alvo from public.importacao as i where i.id = p_id for update;
  if not found or not private.is_gestao_vinculada(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return alvo;
end;
$$;

revoke all on function private.campos_da_importacao(text) from public, anon, authenticated;
revoke all on function private.limpar_dados_da_importacao(text, jsonb) from public, anon, authenticated;
revoke all on function private.tem_cpf(jsonb) from public, anon, authenticated;
revoke all on function private.data_da_importacao(text) from public, anon, authenticated;
revoke all on function private.erros_de_formato_da_linha(text, jsonb, date) from public, anon, authenticated;
revoke all on function private.tipo_da_importacao(uuid, text) from public, anon, authenticated;
revoke all on function private.chave_do_empreendimento(jsonb) from public, anon, authenticated;
revoke all on function private.empreendimentos_pela_chave(uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function private.unidade_existente_da_importacao(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
revoke all on function private.linha_da_importacao_pulada(text, jsonb) from public, anon, authenticated;
revoke all on function private.limite_da_importacao(uuid, integer) from public, anon, authenticated;
revoke all on function private.referencias_externas(regclass, uuid, uuid, regclass[])
  from public, anon, authenticated;
revoke all on function private.conferir_linhas_da_importacao(uuid) from public, anon, authenticated;
revoke all on function private.importacao_para_gestao(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------
-- Cria a importação e lembra o mapeamento (upsert por consultoria e entidade). Idempotente pelo id.
create function public.criar_importacao(
  p_id uuid,
  p_consultoria_id uuid,
  p_entidade text,
  p_nome_arquivo text,
  p_total_linhas integer,
  p_mapeamento jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_existente uuid;
  v_autor uuid;
  v_nome text := left(btrim(coalesce(p_nome_arquivo, '')), 255);
  v_mapeamento jsonb;
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select i.consultoria_id into v_existente from public.importacao as i where i.id = v_id;
  if found then
    if v_existente = p_consultoria_id then
      return v_id;
    end if;
    raise exception 'importacao_existente' using errcode = 'P0001';
  end if;

  if p_entidade is null or p_entidade not in ('empreendimento', 'licenca') then
    raise exception 'entidade_invalida' using errcode = '22023';
  end if;
  if v_nome = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;
  if p_total_linhas is null or p_total_linhas < 1 then
    raise exception 'planilha_vazia' using errcode = '22023';
  end if;
  if p_total_linhas > 1000 then
    raise exception 'linhas_demais' using errcode = '22023', detail = '1000';
  end if;
  if jsonb_typeof(p_mapeamento) is distinct from 'object' then
    raise exception 'mapeamento_invalido' using errcode = '22023';
  end if;

  -- Só campos conhecidos, com o cabeçalho (texto de até 200 caracteres).
  select coalesce(jsonb_object_agg(m.key, btrim(m.value #>> '{}')), '{}'::jsonb)
  into v_mapeamento
  from jsonb_each(p_mapeamento) as m
  where m.key = any (private.campos_da_importacao(p_entidade))
    and jsonb_typeof(m.value) = 'string'
    and length(btrim(m.value #>> '{}')) between 1 and 200;

  -- CPF também não entra pelo nome do arquivo nem por um cabeçalho (planilha sem cabeçalho).
  if private.tem_cpf(v_mapeamento) or private.tem_cpf(jsonb_build_object('nome_arquivo', v_nome)) then
    raise exception 'cpf_nao_aceito' using errcode = '22023';
  end if;

  v_autor := private.membro_atual(p_consultoria_id);

  insert into public.importacao (id, consultoria_id, entidade, nome_arquivo, total_linhas, mapeamento, criado_por)
  values (v_id, p_consultoria_id, p_entidade, v_nome, p_total_linhas, v_mapeamento, v_autor);

  insert into public.importacao_mapeamento (consultoria_id, entidade, mapeamento, atualizado_por)
  values (p_consultoria_id, p_entidade, v_mapeamento, v_autor)
  on conflict (consultoria_id, entidade) do update
  set mapeamento = excluded.mapeamento,
      atualizado_por = excluded.atualizado_por,
      atualizado_em = now(),
      row_version = public.importacao_mapeamento.row_version + 1;

  return v_id;
end;
$$;

-- Recebe um lote de até 200 linhas ([{numero_linha, dados}]). Upsert pelo número da linha; zera erros e
-- avisos e pede nova conferência. Lote com CPF é recusado inteiro, sem gravar nada. Devolve o total
-- de linhas já recebidas.
create function public.enviar_linhas_da_importacao(p_importacao_id uuid, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.importacao;
  v_item jsonb;
  v_numeros integer[] := '{}';
  v_numero integer;
  v_recebidas integer;
begin
  v_imp := private.importacao_para_gestao(p_importacao_id);
  if v_imp.situacao <> 'em_conferencia' then
    raise exception 'importacao_encerrada' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'linha_invalida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_linhas) > 200 then
    raise exception 'lote_grande_demais' using errcode = '22023', detail = '200';
  end if;

  for v_item in select e.valor from jsonb_array_elements(p_linhas) as e (valor) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'numero_linha') is distinct from 'number'
       or (v_item ->> 'numero_linha') !~ '^[0-9]{1,7}$'
       or jsonb_typeof(v_item -> 'dados') is distinct from 'object' then
      raise exception 'linha_invalida' using errcode = '22023';
    end if;
    v_numero := (v_item ->> 'numero_linha')::integer;
    if v_numero not between 2 and 1048576 or v_numero = any (v_numeros) then
      raise exception 'linha_invalida' using errcode = '22023';
    end if;
    if private.tem_cpf(v_item -> 'dados') then
      raise exception 'cpf_nao_aceito' using errcode = '22023';
    end if;
    v_numeros := v_numeros || v_numero;
  end loop;

  select count(*)::integer into v_recebidas
  from (
    select x.numero_linha from public.importacao_linha as x
    where x.consultoria_id = v_imp.consultoria_id and x.importacao_id = v_imp.id
    union
    select unnest(v_numeros)
  ) as todas;
  if v_recebidas > v_imp.total_linhas then
    raise exception 'linhas_demais' using errcode = '22023', detail = v_imp.total_linhas::text;
  end if;

  insert into public.importacao_linha (consultoria_id, importacao_id, numero_linha, dados)
  select v_imp.consultoria_id, v_imp.id, (e.valor ->> 'numero_linha')::integer,
         private.limpar_dados_da_importacao(v_imp.entidade, e.valor -> 'dados')
  from jsonb_array_elements(p_linhas) as e (valor)
  on conflict (consultoria_id, importacao_id, numero_linha) do update
  set dados = excluded.dados,
      erros = '[]'::jsonb,
      avisos = '[]'::jsonb,
      atualizado_em = now();

  update public.importacao as i
  set conferida_em = null, row_version = i.row_version + 1
  where i.id = v_imp.id;

  return v_recebidas;
end;
$$;

-- Confere todas as linhas e grava o resumo. Efetivada ou desfeita: devolve o resumo guardado.
create function public.conferir_importacao(p_importacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.importacao;
  v_recebidas integer;
  v_resumo jsonb;
begin
  v_imp := private.importacao_para_gestao(p_importacao_id);
  if v_imp.situacao <> 'em_conferencia' then
    return v_imp.resumo;
  end if;

  select count(*)::integer into v_recebidas from public.importacao_linha as x
  where x.consultoria_id = v_imp.consultoria_id and x.importacao_id = v_imp.id;
  if v_recebidas < v_imp.total_linhas then
    raise exception 'linhas_incompletas' using errcode = 'P0001',
      detail = v_recebidas::text || '/' || v_imp.total_linhas::text;
  end if;

  v_resumo := private.conferir_linhas_da_importacao(v_imp.id)
              || jsonb_build_object('row_version', v_imp.row_version + 1);

  update public.importacao as i
  set resumo = v_resumo, conferida_em = now(), row_version = i.row_version + 1
  where i.id = v_imp.id;

  return v_resumo;
end;
$$;

-- Efetiva: refaz a conferência e cria o que as linhas sem erro pedem (duplicidade é pulada).
-- Efetivar duas vezes cria uma vez (trava e situação).
create function public.efetivar_importacao(
  p_importacao_id uuid,
  p_row_version integer,
  p_confirmar_adicional boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.importacao;
  v_cid uuid;
  v_eu uuid;
  v_recebidas integer;
  v_resumo jsonb;
  v_limite jsonb;
  s record;
  v_linha public.importacao_linha;
  v_dados jsonb;
  v_achados uuid[];
  v_chave_emp text;
  v_ref_emp text;
  v_chave_uni text;
  v_nome_uni text;
  v_emp uuid;
  v_uni uuid;
  v_inst uuid;
  v_inst_rv integer;
  v_emp_criado boolean;
  v_uni_criada boolean;
  v_criados_emp jsonb := '{}'::jsonb;
  v_criadas_uni jsonb := '{}'::jsonb;
  v_ids_emp uuid[] := '{}';
  v_ids_uni uuid[] := '{}';
  n_criadas integer := 0;
  n_puladas integer := 0;
  n_erro integer := 0;
  c_emp integer := 0;
  c_uni integer := 0;
  c_lic integer := 0;
  v_resultado jsonb;
begin
  v_imp := private.importacao_para_gestao(p_importacao_id);
  if v_imp.situacao <> 'em_conferencia' then
    return v_imp.resultado;
  end if;
  if v_imp.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if v_imp.conferida_em is null then
    raise exception 'importacao_nao_conferida' using errcode = 'P0001';
  end if;
  v_cid := v_imp.consultoria_id;

  select count(*)::integer into v_recebidas from public.importacao_linha as x
  where x.consultoria_id = v_cid and x.importacao_id = v_imp.id;
  if v_recebidas < v_imp.total_linhas then
    raise exception 'linhas_incompletas' using errcode = 'P0001',
      detail = v_recebidas::text || '/' || v_imp.total_linhas::text;
  end if;

  -- Serializa com as triggers de limite e com outras efetivações (mesma trava de 602: for no key
  -- update não conflita com o key share das chaves estrangeiras das linhas filhas).
  perform 1 from public.consultoria as c where c.id = v_cid for no key update;

  v_resumo := private.conferir_linhas_da_importacao(v_imp.id);
  if (v_resumo -> 'a_criar' ->> 'empreendimentos')::integer
     + (v_resumo -> 'a_criar' ->> 'licencas')::integer = 0 then
    raise exception 'nada_para_importar' using errcode = 'P0001';
  end if;

  v_limite := v_resumo -> 'limite';
  if (v_limite ->> 'precisa_confirmar')::boolean then
    if not coalesce(p_confirmar_adicional, false) then
      raise exception 'adicional_nao_confirmado' using errcode = 'P0001', detail = 'empreendimentos';
    end if;
    select * into s from private.situacao_comercial_em(v_cid, private.hoje_da_consultoria(v_cid));
    insert into public.adicional_confirmado
      (consultoria_id, recurso, quantidade, limite, plano, adicionais_centavos, confirmado_por)
    values (v_cid, 'empreendimentos', (v_limite ->> 'quantidade')::integer, (v_limite ->> 'limite')::integer,
            s.plano_vigente, (v_limite ->> 'adicionais_centavos')::integer, private.membro_atual(v_cid));
  end if;

  perform set_config('gestao_ambiental.motivo', 'importacao:' || v_imp.id::text, true);
  v_eu := private.membro_atual(v_cid);

  for v_linha in
    select * from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id
    order by x.numero_linha
  loop
    v_dados := v_linha.dados;

    if jsonb_array_length(v_linha.erros) > 0 then
      update public.importacao_linha as x
      set resultado = 'com_erro', atualizado_em = now()
      where x.id = v_linha.id;
      n_erro := n_erro + 1;
      continue;
    end if;

    if private.linha_da_importacao_pulada(v_imp.entidade, v_linha.avisos) then
      v_emp := null;
      if v_imp.entidade = 'empreendimento' then
        v_achados := private.empreendimentos_pela_chave(v_cid, v_dados, v_ids_emp);
        if cardinality(v_achados) = 1 then
          v_emp := v_achados[1];
        else
          v_emp := (v_criados_emp ->> private.chave_do_empreendimento(v_dados))::uuid;
        end if;
      end if;
      update public.importacao_linha as x
      set resultado = 'pulada', empreendimento_id = v_emp, atualizado_em = now()
      where x.id = v_linha.id;
      n_puladas := n_puladas + 1;
      continue;
    end if;

    v_emp_criado := false;
    v_uni_criada := false;
    v_uni := null;
    v_inst := null;
    v_inst_rv := null;
    v_chave_emp := private.chave_do_empreendimento(v_dados);

    if v_imp.entidade = 'empreendimento' then
      insert into public.empreendimento (consultoria_id, nome, cliente_id, cnpj, criado_por)
      values (v_cid, v_dados ->> 'empreendimento', private.cliente_pelo_nome(v_cid, v_dados ->> 'cliente'),
              v_dados ->> 'cnpj', v_eu)
      returning id into v_emp;
      v_emp_criado := true;
      c_emp := c_emp + 1;
      v_criados_emp := v_criados_emp || jsonb_build_object(v_chave_emp, v_emp);
      v_ids_emp := v_ids_emp || v_emp;
      if v_dados ->> 'unidade' is not null then
        insert into public.unidade (consultoria_id, empreendimento_id, nome, endereco)
        values (v_cid, v_emp, v_dados ->> 'unidade', v_dados ->> 'endereco')
        returning id into v_uni;
        v_uni_criada := true;
        c_uni := c_uni + 1;
      end if;
    else
      -- Empreendimento: o criado antes nesta importação, o existente (como a conferência viu) ou novo.
      if v_criados_emp ? v_chave_emp then
        v_emp := (v_criados_emp ->> v_chave_emp)::uuid;
        v_ref_emp := 'novo:' || v_chave_emp;
      else
        v_achados := private.empreendimentos_pela_chave(v_cid, v_dados, v_ids_emp);
        if cardinality(v_achados) = 1 then
          v_emp := v_achados[1];
          v_ref_emp := 'id:' || v_emp::text;
        else
          insert into public.empreendimento (consultoria_id, nome, cliente_id, cnpj, criado_por)
          values (v_cid, v_dados ->> 'empreendimento', private.cliente_pelo_nome(v_cid, v_dados ->> 'cliente'),
                  v_dados ->> 'cnpj', v_eu)
          returning id into v_emp;
          v_emp_criado := true;
          c_emp := c_emp + 1;
          v_criados_emp := v_criados_emp || jsonb_build_object(v_chave_emp, v_emp);
          v_ids_emp := v_ids_emp || v_emp;
          v_ref_emp := 'novo:' || v_chave_emp;
        end if;
      end if;

      -- Unidade: a existente (empreendimento existente), a criada antes nesta importação ou nova.
      if v_ref_emp like 'id:%' then
        v_uni := private.unidade_existente_da_importacao(v_cid, v_emp, v_dados ->> 'unidade', v_ids_uni);
      end if;
      if v_uni is null then
        v_nome_uni := coalesce(v_dados ->> 'unidade', 'Matriz');
        v_chave_uni := v_ref_emp || '|' || private.normalizar_nome(v_nome_uni);
        if v_criadas_uni ? v_chave_uni then
          v_uni := (v_criadas_uni ->> v_chave_uni)::uuid;
        else
          insert into public.unidade (consultoria_id, empreendimento_id, nome, endereco)
          values (v_cid, v_emp, v_nome_uni, v_dados ->> 'endereco')
          returning id into v_uni;
          v_uni_criada := true;
          c_uni := c_uni + 1;
          v_criadas_uni := v_criadas_uni || jsonb_build_object(v_chave_uni, v_uni);
          v_ids_uni := v_ids_uni || v_uni;
        end if;
      end if;

      insert into public.instrumento (
        consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao, somente_validade,
        emitido_em, emitido_em_texto, marco, validade, validade_texto, criado_por, ativado_em, ativado_por,
        chave_ativacao)
      values (
        v_cid, v_emp, v_uni, private.tipo_da_importacao(v_cid, v_dados ->> 'tipo'), v_dados ->> 'numero',
        v_dados ->> 'orgao', 'ativo', true, private.data_da_importacao(v_dados ->> 'emitido_em'),
        v_dados ->> 'emitido_em_texto', 'emissao', private.data_da_importacao(v_dados ->> 'validade'),
        v_dados ->> 'validade_texto', v_eu, now(), v_eu, gen_random_uuid())
      returning id into v_inst;
      select i.row_version into v_inst_rv from public.instrumento as i where i.id = v_inst;
      c_lic := c_lic + 1;
    end if;

    update public.importacao_linha as x
    set resultado = 'criada', empreendimento_id = v_emp, empreendimento_criado = v_emp_criado,
        unidade_id = v_uni, unidade_criada = v_uni_criada, instrumento_id = v_inst,
        instrumento_row_version = v_inst_rv, atualizado_em = now()
    where x.id = v_linha.id;
    n_criadas := n_criadas + 1;
  end loop;

  -- A conferência e a efetivação contam pela mesma regra; divergir é defeito, nunca dado.
  if c_emp <> (v_resumo -> 'a_criar' ->> 'empreendimentos')::integer
     or c_uni <> (v_resumo -> 'a_criar' ->> 'unidades')::integer
     or c_lic <> (v_resumo -> 'a_criar' ->> 'licencas')::integer then
    raise exception 'conferencia_divergente' using errcode = 'P0001';
  end if;

  v_resultado := jsonb_build_object(
    'row_version', v_imp.row_version + 1,
    'linhas_criadas', n_criadas,
    'linhas_puladas', n_puladas,
    'linhas_com_erro', n_erro,
    'empreendimentos_criados', c_emp,
    'unidades_criadas', c_uni,
    'licencas_criadas', c_lic,
    'desfazer_ate', now() + interval '24 hours');

  update public.importacao as i
  set situacao = 'efetivada', efetivada_em = now(), efetivada_por = v_eu,
      resumo = v_resumo || jsonb_build_object('row_version', v_imp.row_version + 1),
      conferida_em = now(), resultado = v_resultado, row_version = i.row_version + 1
  where i.id = v_imp.id;

  return v_resultado;
end;
$$;

-- Desfaz em até 24 h, por exclusão lógica, só o que a importação criou e ninguém mudou depois.
-- O resto fica, com o motivo por linha. Cliente e adicional_confirmado ficam.
create function public.desfazer_importacao(p_importacao_id uuid, p_row_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.importacao;
  v_cid uuid;
  v_eu uuid;
  v_linha record;
  v_inst public.instrumento;
  v_uni public.unidade;
  v_emp public.empreendimento;
  v_cliente text;
  v_motivo text;
  v_motivos jsonb := '{}'::jsonb;
  v_lista text[];
  v_mantidas jsonb := '[]'::jsonb;
  n_desfeitas integer := 0;
  n_mantidas integer := 0;
  c_emp integer := 0;
  c_uni integer := 0;
  c_lic integer := 0;
  v_resultado jsonb;
begin
  v_imp := private.importacao_para_gestao(p_importacao_id);
  if v_imp.situacao = 'desfeita' then
    return v_imp.resultado_desfazer;
  end if;
  if v_imp.situacao = 'em_conferencia' then
    raise exception 'importacao_nao_efetivada' using errcode = 'P0001';
  end if;
  if v_imp.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if now() > v_imp.efetivada_em + interval '24 hours' then
    raise exception 'prazo_para_desfazer_encerrado' using errcode = 'P0001';
  end if;
  v_cid := v_imp.consultoria_id;
  v_eu := private.membro_atual(v_cid);
  perform set_config('gestao_ambiental.motivo', 'desfazer_importacao:' || v_imp.id::text, true);

  -- 1. Licenças criadas.
  for v_linha in
    select x.instrumento_id, x.instrumento_row_version from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id and x.resultado = 'criada'
      and x.instrumento_id is not null
    order by x.numero_linha
  loop
    select * into v_inst from public.instrumento as i where i.id = v_linha.instrumento_id for update;
    v_motivo := case
      when v_inst.excluido_em is not null then null
      when v_inst.row_version <> v_linha.instrumento_row_version or v_inst.documento_id is not null
        then 'alterada_depois'
      when exists (
        select 1 from public.plano_renovacao as p
        where p.consultoria_id = v_cid and p.instrumento_id = v_inst.id
          and (p.protocolado_em is not null or p.row_version <> 1)) then 'renovacao_em_andamento'
      when private.referencias_externas('public.instrumento', v_cid, v_inst.id,
             array['public.importacao_linha', 'public.plano_renovacao']::regclass[]) then 'tem_dependentes'
    end;
    if v_motivo is null and v_inst.excluido_em is null then
      update public.instrumento as i
      set excluido_em = now(), excluido_por = v_eu, situacao = 'rascunho', row_version = i.row_version + 1
      where i.id = v_inst.id;
      c_lic := c_lic + 1;
    end if;
    v_motivos := v_motivos || jsonb_build_object('i:' || v_inst.id::text, v_motivo);
  end loop;

  -- 2. Unidades criadas (nome esperado: o da planilha ou "Matriz", quando a importação a criou pelo padrão).
  for v_linha in
    select x.unidade_id, x.dados ->> 'endereco' as endereco_esperado,
           coalesce(x.dados ->> 'unidade', 'Matriz') as nome_esperado
    from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id and x.resultado = 'criada'
      and x.unidade_criada
    order by x.numero_linha
  loop
    select * into v_uni from public.unidade as u where u.id = v_linha.unidade_id for update;
    v_motivo := case
      when v_uni.excluido_em is not null then null
      when v_uni.nome is distinct from v_linha.nome_esperado
           or v_uni.endereco is distinct from v_linha.endereco_esperado then 'alterada_depois'
      when exists (
        select 1 from public.instrumento as i
        where i.consultoria_id = v_cid and i.unidade_id = v_uni.id and i.excluido_em is null)
        or private.referencias_externas('public.unidade', v_cid, v_uni.id,
             array['public.importacao_linha', 'public.instrumento']::regclass[]) then 'tem_dependentes'
    end;
    if v_motivo is null and v_uni.excluido_em is null then
      update public.unidade as u set excluido_em = now(), excluido_por = v_eu where u.id = v_uni.id;
      c_uni := c_uni + 1;
    end if;
    v_motivos := v_motivos || jsonb_build_object('u:' || v_uni.id::text, v_motivo);
  end loop;

  -- 3. Empreendimentos criados.
  for v_linha in
    select x.empreendimento_id, x.dados
    from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id and x.resultado = 'criada'
      and x.empreendimento_criado
    order by x.numero_linha
  loop
    select * into v_emp from public.empreendimento as e where e.id = v_linha.empreendimento_id for update;
    v_cliente := (select cl.nome_normalizado from public.cliente as cl
                  where cl.consultoria_id = v_cid and cl.id = v_emp.cliente_id);
    v_motivo := case
      when v_emp.excluido_em is not null then null
      when v_emp.nome is distinct from (v_linha.dados ->> 'empreendimento')
           or v_emp.cnpj is distinct from (v_linha.dados ->> 'cnpj')
           or coalesce(v_cliente, '') <> private.normalizar_nome(v_linha.dados ->> 'cliente') then 'alterada_depois'
      when exists (
        select 1 from public.unidade as u
        where u.consultoria_id = v_cid and u.empreendimento_id = v_emp.id and u.excluido_em is null)
        or exists (
        select 1 from public.instrumento as i
        where i.consultoria_id = v_cid and i.empreendimento_id = v_emp.id and i.excluido_em is null)
        or private.referencias_externas('public.empreendimento', v_cid, v_emp.id,
             array['public.importacao_linha', 'public.unidade', 'public.instrumento']::regclass[])
        then 'tem_dependentes'
    end;
    if v_motivo is null and v_emp.excluido_em is null then
      update public.empreendimento as e set excluido_em = now(), excluido_por = v_eu where e.id = v_emp.id;
      c_emp := c_emp + 1;
    end if;
    v_motivos := v_motivos || jsonb_build_object('e:' || v_emp.id::text, v_motivo);
  end loop;

  -- 4. Resultado por linha: tudo o que ela criou foi desfeito, ou fica com o motivo mais forte.
  for v_linha in
    select x.id, x.numero_linha, x.instrumento_id, x.unidade_id, x.unidade_criada, x.empreendimento_id,
           x.empreendimento_criado
    from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id and x.resultado = 'criada'
    order by x.numero_linha
  loop
    v_lista := array_remove(array[
      case when v_linha.instrumento_id is not null then v_motivos ->> ('i:' || v_linha.instrumento_id::text) end,
      case when v_linha.unidade_criada then v_motivos ->> ('u:' || v_linha.unidade_id::text) end,
      case when v_linha.empreendimento_criado then v_motivos ->> ('e:' || v_linha.empreendimento_id::text) end
    ], null);
    v_motivo := case
      when 'alterada_depois' = any (v_lista) then 'alterada_depois'
      when 'renovacao_em_andamento' = any (v_lista) then 'renovacao_em_andamento'
      when 'tem_dependentes' = any (v_lista) then 'tem_dependentes'
    end;
    if v_motivo is null then
      update public.importacao_linha as x set resultado = 'desfeita', atualizado_em = now() where x.id = v_linha.id;
      n_desfeitas := n_desfeitas + 1;
    else
      update public.importacao_linha as x set motivo_mantida = v_motivo, atualizado_em = now()
      where x.id = v_linha.id;
      n_mantidas := n_mantidas + 1;
      v_mantidas := v_mantidas || jsonb_build_array(
        jsonb_build_object('numero_linha', v_linha.numero_linha, 'motivo', v_motivo));
    end if;
  end loop;

  v_resultado := jsonb_build_object(
    'row_version', v_imp.row_version + 1,
    'linhas_desfeitas', n_desfeitas,
    'linhas_mantidas', n_mantidas,
    'empreendimentos_desfeitos', c_emp,
    'unidades_desfeitas', c_uni,
    'licencas_desfeitas', c_lic,
    'mantidas', v_mantidas);

  update public.importacao as i
  set situacao = 'desfeita', desfeita_em = now(), desfeita_por = v_eu,
      resultado_desfazer = v_resultado, row_version = i.row_version + 1
  where i.id = v_imp.id;

  return v_resultado;
end;
$$;

revoke all on function public.criar_importacao(uuid, uuid, text, text, integer, jsonb) from public, anon;
revoke all on function public.enviar_linhas_da_importacao(uuid, jsonb) from public, anon;
revoke all on function public.conferir_importacao(uuid) from public, anon;
revoke all on function public.efetivar_importacao(uuid, integer, boolean) from public, anon;
revoke all on function public.desfazer_importacao(uuid, integer) from public, anon;

grant execute on function public.criar_importacao(uuid, uuid, text, text, integer, jsonb) to authenticated;
grant execute on function public.enviar_linhas_da_importacao(uuid, jsonb) to authenticated;
grant execute on function public.conferir_importacao(uuid) to authenticated;
grant execute on function public.efetivar_importacao(uuid, integer, boolean) to authenticated;
grant execute on function public.desfazer_importacao(uuid, integer) to authenticated;
