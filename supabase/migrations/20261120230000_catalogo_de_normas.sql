-- Catálogo de normas (pacote L0, ADR-0050, LEG-01 e LEG-03).
--
-- A norma é a mesma para todas as consultorias, então o catálogo é global e mora em private, como
-- private.plano_catalogo: RLS forçada, sem grant para anon nem authenticated, leitura só por RPC
-- security definer que confere se quem pede é membro ativo de alguma consultoria. A escrita vem
-- das Edge Functions de coleta (service role) e do operador (pacote L4).
--
-- Arquivos de norma são imutáveis: versão nova = linha nova com o SHA-256 do arquivo. Situação da
-- norma na tela é calculada; revogada_em/situacao_na_fonte guardam só o que a fonte publicou.
--
-- Também deixa as fontes vazias que os pacotes seguintes redefinem (mesmo desenho do P0):
-- private.linhas_de_prazo_acao_legal (L6) e private.busca_normas (L5).

-- ---------------------------------------------------------------------------
-- 1. Fontes e coletas
-- ---------------------------------------------------------------------------
create table private.fonte_legal (
  codigo text primary key,
  nome text not null,
  esfera text not null,
  url_base text not null,
  ativa boolean not null default false,
  ultima_coleta_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  constraint fonte_legal_esfera_valida check (esfera in ('federal', 'estadual', 'municipal')),
  constraint fonte_legal_codigo_formato check (codigo ~ '^[a-z][a-z0-9_]{1,39}$')
);

comment on table private.fonte_legal is
  'Fontes de legislação vigiadas (ADR-0050). ativa = false até o coletor ser publicado e ligado.';

insert into private.fonte_legal (codigo, nome, esfera, url_base) values
  ('ima_in', 'IMA · Instruções Normativas', 'estadual', 'https://in.ima.sc.gov.br/'),
  ('ima_portaria', 'IMA · Portarias', 'estadual', 'https://consultas.ima.sc.gov.br/portarias'),
  ('consema', 'CONSEMA (SEMAE)', 'estadual', 'https://www.semae.sc.gov.br/consema/'),
  ('doe_sc', 'Diário Oficial de SC', 'estadual', 'https://portal.doe.sea.sc.gov.br/'),
  ('alesc', 'ALESC · Leis estaduais', 'estadual', 'https://leis.alesc.sc.gov.br/legislativo'),
  ('joinville_doem', 'Joinville · Diário Oficial Eletrônico', 'municipal',
   'https://sei.joinville.sc.gov.br/sei/publicacoes/controlador_publicacoes.php'),
  ('ciga', 'DOM-SC · dados abertos do CIGA', 'municipal', 'https://dados.ciga.sc.gov.br/'),
  ('inlabs', 'DOU · INLABS', 'federal', 'https://inlabs.in.gov.br/'),
  ('senado', 'Senado · API de Legislação', 'federal', 'https://legis.senado.leg.br/dadosabertos/'),
  ('planalto', 'Planalto · legislação compilada', 'federal', 'https://www.planalto.gov.br/ccivil_03/');

create table private.coleta (
  id uuid primary key default gen_random_uuid(),
  fonte text not null references private.fonte_legal (codigo) on delete restrict,
  janela text not null,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  situacao text not null default 'em_andamento',
  itens_novos integer not null default 0,
  erro text,
  constraint coleta_situacao_valida check (situacao in ('em_andamento', 'concluida', 'falhou')),
  constraint coleta_janela_preenchida check (length(btrim(janela)) > 0),
  constraint coleta_itens_validos check (itens_novos >= 0),
  constraint coleta_conclusao_coerente check ((situacao = 'em_andamento') = (concluida_em is null)),
  -- Repetir a coleta da mesma janela não cria outra linha (idempotência).
  constraint coleta_fonte_janela_key unique (fonte, janela)
);

comment on column private.coleta.janela is
  'Período coberto: o dia (2026-11-20) ou o dia e a janela do diário (2026-11-20T12).';

-- ---------------------------------------------------------------------------
-- 2. Norma, versão, mudança e critérios de aplicabilidade
-- ---------------------------------------------------------------------------
create table private.norma (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  esfera text not null,
  municipio_ibge text,
  orgao text not null,
  tipo text not null,
  numero text not null,
  ano integer,
  titulo text not null,
  titulo_normalizado text generated always as (private.normalizar_nome(titulo)) stored,
  ementa text,
  temas text[] not null default '{}',
  url_oficial text,
  fonte text references private.fonte_legal (codigo) on delete restrict,
  id_externo text,
  situacao_na_fonte text not null default 'vigente',
  revogada_em date,
  revogada_por uuid references private.norma (id) on delete restrict,
  criado_em timestamptz not null default now(),
  constraint norma_chave_key unique (chave),
  constraint norma_fonte_id_externo_key unique (fonte, id_externo),
  constraint norma_chave_formato check (chave ~ '^[a-z0-9]+(;[a-z0-9_.]+)+$'),
  constraint norma_esfera_valida check (esfera in ('federal', 'estadual', 'municipal')),
  constraint norma_municipio_coerente check (
    (esfera = 'municipal') = (municipio_ibge is not null)
    and (municipio_ibge is null or municipio_ibge ~ '^[0-9]{7}$')
  ),
  constraint norma_tipo_valido check (tipo in (
    'lei', 'lei_complementar', 'decreto', 'resolucao', 'instrucao_normativa', 'portaria',
    'deliberacao', 'medida_provisoria'
  )),
  constraint norma_ano_valido check (ano is null or ano between 1900 and 2100),
  constraint norma_titulo_preenchido check (length(btrim(titulo)) > 0),
  constraint norma_numero_preenchido check (length(btrim(numero)) > 0),
  constraint norma_situacao_valida check (situacao_na_fonte in ('vigente', 'revogada')),
  constraint norma_revogacao_coerente check (
    situacao_na_fonte = 'revogada' or (revogada_em is null and revogada_por is null)
  ),
  constraint norma_temas_validos check (temas <@ array[
    'efluentes', 'residuos', 'emissoes', 'ruido', 'supressao', 'app', 'fauna', 'recursos_hidricos',
    'taxas', 'procedimento'
  ]::text[])
);

comment on table private.norma is
  'Catálogo global de normas (ADR-0050). chave no estilo URN LexML: esfera;órgão;tipo;número[;ano].';
comment on column private.norma.situacao_na_fonte is
  'O que a fonte diz (vigente ou revogada). Sem data quando a fonte não publica a data.';

create index norma_titulo_idx on private.norma (titulo_normalizado);
create index norma_municipio_idx on private.norma (municipio_ibge) where municipio_ibge is not null;

create table private.norma_versao (
  id uuid primary key default gen_random_uuid(),
  norma_id uuid not null references private.norma (id) on delete restrict,
  numero integer not null,
  publicada_em date,
  publicada_em_texto text,
  coletada_em timestamptz not null default now(),
  coleta_id uuid references private.coleta (id) on delete restrict,
  id_externo text,
  sha256 text not null,
  objeto text,
  mime text,
  tamanho bigint,
  texto text,
  constraint norma_versao_numero_valido check (numero >= 1),
  constraint norma_versao_sha256_formato check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint norma_versao_tamanho_valido check (tamanho is null or tamanho >= 0),
  constraint norma_versao_objeto_formato check (objeto is null or objeto ~ '^normas/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  constraint norma_versao_numero_key unique (norma_id, numero),
  -- O mesmo arquivo coletado de novo não vira versão nova.
  constraint norma_versao_sha256_key unique (norma_id, sha256)
);

comment on table private.norma_versao is
  'Versão imutável de uma norma: arquivo original no Storage (normas/<norma>/<uuid>), SHA-256 e texto extraído sem CPF.';
comment on column private.norma_versao.publicada_em_texto is 'Texto original da data, como a fonte publicou.';

create table private.norma_mudanca (
  id uuid primary key default gen_random_uuid(),
  norma_id uuid not null references private.norma (id) on delete restrict,
  versao_anterior_id uuid references private.norma_versao (id) on delete restrict,
  versao_nova_id uuid references private.norma_versao (id) on delete restrict,
  ato_id uuid references private.norma (id) on delete restrict,
  tipo text not null,
  detectada_em timestamptz not null default now(),
  diferenca jsonb not null default '{}'::jsonb,
  resumo jsonb,
  criterios_sugeridos jsonb,
  situacao text not null default 'detectada',
  revisada_por uuid references auth.users (id) on delete restrict,
  publicada_em timestamptz,
  motivo_descarte text,
  constraint norma_mudanca_tipo_valido check (tipo in ('nova', 'alterada', 'revogada', 'republicada')),
  constraint norma_mudanca_situacao_valida check (situacao in ('detectada', 'resumida', 'publicada', 'descartada')),
  constraint norma_mudanca_publicacao_coerente check (
    (situacao = 'publicada') = (publicada_em is not null)
    and (situacao not in ('publicada', 'descartada') or revisada_por is not null)
  ),
  constraint norma_mudanca_descarte_coerente check (
    (situacao = 'descartada') = (motivo_descarte is not null)
  ),
  constraint norma_mudanca_versoes_coerentes check (
    tipo = 'revogada' or versao_nova_id is not null
  ),
  -- Detectar de novo a mesma mudança não duplica (idempotência da coleta).
  constraint norma_mudanca_unica unique nulls not distinct (norma_id, tipo, versao_nova_id, ato_id)
);

comment on table private.norma_mudanca is
  'Mudança detectada numa norma. Só gera aviso depois de publicada pelo operador (ADR-0050).';
comment on column private.norma_mudanca.ato_id is 'Ato que causou a mudança (ex.: a portaria que revoga a IN).';

create index norma_mudanca_norma_idx on private.norma_mudanca (norma_id, detectada_em desc);
create index norma_mudanca_fila_idx on private.norma_mudanca (situacao, detectada_em) where situacao in ('detectada', 'resumida');

create table private.norma_criterio (
  id uuid primary key default gen_random_uuid(),
  norma_id uuid not null references private.norma (id) on delete restrict,
  tipo text not null,
  valor text not null,
  origem text not null,
  criado_em timestamptz not null default now(),
  constraint norma_criterio_tipo_valido check (tipo in (
    'atividade', 'prefixo_atividade', 'tipo_licenca', 'municipio', 'competencia', 'tema'
  )),
  constraint norma_criterio_origem_valida check (origem in ('simulador_ima', 'curadoria', 'ia_confirmada')),
  constraint norma_criterio_valor_formato check (
    case tipo
      when 'atividade' then valor ~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'
      when 'prefixo_atividade' then valor ~ '^[0-9]{2}(\.[0-9]{2})?$'
      when 'tipo_licenca' then valor in ('LAP', 'LAI', 'LAO', 'AuA', 'LAC', 'renovacao')
      when 'municipio' then valor ~ '^[0-9]{7}$'
      when 'competencia' then valor in ('estadual', 'municipal')
      else length(btrim(valor)) > 0
    end
  ),
  constraint norma_criterio_key unique (norma_id, tipo, valor)
);

comment on table private.norma_criterio is
  'A quem a norma se aplica: atividade CONSEMA, prefixo, tipo de licença, município, competência ou tema.';

create index norma_criterio_valor_idx on private.norma_criterio (tipo, valor);

-- Versão é imutável: nem o operador nem a coleta alteram ou apagam.
create function private.bloquear_alteracao_de_versao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'versao_de_norma_imutavel' using errcode = 'P0001';
end;
$$;

create trigger norma_versao_imutavel
before update or delete on private.norma_versao
for each row execute function private.bloquear_alteracao_de_versao();

revoke all on function private.bloquear_alteracao_de_versao() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['fonte_legal', 'coleta', 'norma', 'norma_versao', 'norma_mudanca', 'norma_criterio']
  loop
    execute format('alter table private.%I enable row level security', t);
    execute format('alter table private.%I force row level security', t);
    execute format('revoke all on table private.%I from public, anon, authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Leitura (membro ativo de qualquer consultoria)
-- ---------------------------------------------------------------------------
create function private.membro_de_alguma_consultoria()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membro as m
    where m.usuario_id = (select auth.uid()) and m.situacao = 'ativo'
  )
$$;

revoke all on function private.membro_de_alguma_consultoria() from public, anon;
grant execute on function private.membro_de_alguma_consultoria() to authenticated;

-- Normas por título, número ou número/ano ("IN 02", "250/2024", "14.675"). Até 50 por página.
create function public.buscar_normas(p_termo text, p_limite integer default 20, p_deslocamento integer default 0)
returns table (
  id uuid,
  chave text,
  titulo text,
  esfera text,
  municipio_ibge text,
  orgao text,
  tipo text,
  numero text,
  ano integer,
  situacao_na_fonte text,
  ultima_versao_em date,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtradas as (
    select n.*
    from private.norma as n
    left join lateral (
      select regexp_replace(coalesce(p_termo, ''), '[^0-9/]', '', 'g') as digitos
    ) as d on true
    where private.membro_de_alguma_consultoria()
      and (
        coalesce(btrim(p_termo), '') = ''
        or n.titulo_normalizado like private.padrao_de_busca(left(p_termo, 100))
        or (length(d.digitos) >= 1 and (
              ltrim(replace(n.numero, '.', ''), '0') = ltrim(replace(split_part(d.digitos, '/', 1), '.', ''), '0')
              and (split_part(d.digitos, '/', 2) = '' or n.ano::text = split_part(d.digitos, '/', 2))
            ))
      )
  )
  select f.id, f.chave, f.titulo, f.esfera, f.municipio_ibge, f.orgao, f.tipo, f.numero, f.ano,
         f.situacao_na_fonte,
         (select coalesce(max(v.publicada_em), max(v.coletada_em)::date)
          from private.norma_versao as v where v.norma_id = f.id),
         count(*) over ()
  from filtradas as f
  order by f.esfera, f.orgao, f.tipo, f.ano nulls first,
           nullif(regexp_replace(f.numero, '[^0-9]', '', 'g'), '')::numeric nulls last, f.numero
  limit least(greatest(coalesce(p_limite, 20), 1), 50)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

comment on function public.buscar_normas(text, integer, integer) is
  'Catálogo de normas para membro ativo de qualquer consultoria. Vazio para quem não é membro.';

revoke all on function public.buscar_normas(text, integer, integer) from public, anon;
grant execute on function public.buscar_normas(text, integer, integer) to authenticated;

-- Detalhe: norma, versões (sem o texto), mudanças publicadas e critérios. Nulo para quem não é
-- membro ou para norma inexistente. Mudança não publicada não aparece para a consultoria.
create function public.detalhe_da_norma(p_norma_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', n.id,
    'chave', n.chave,
    'titulo', n.titulo,
    'ementa', n.ementa,
    'esfera', n.esfera,
    'municipio_ibge', n.municipio_ibge,
    'orgao', n.orgao,
    'tipo', n.tipo,
    'numero', n.numero,
    'ano', n.ano,
    'temas', to_jsonb(n.temas),
    'url_oficial', n.url_oficial,
    'fonte', n.fonte,
    'situacao_na_fonte', n.situacao_na_fonte,
    'revogada_em', n.revogada_em,
    'revogada_por', n.revogada_por,
    'versoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'numero', v.numero, 'publicada_em', v.publicada_em,
        'publicada_em_texto', v.publicada_em_texto, 'coletada_em', v.coletada_em,
        'id_externo', v.id_externo, 'tem_texto', v.texto is not null
      ) order by v.numero desc)
      from private.norma_versao as v where v.norma_id = n.id
    ), '[]'::jsonb),
    'mudancas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'detectada_em', m.detectada_em, 'publicada_em', m.publicada_em,
        'versao_anterior_id', m.versao_anterior_id, 'versao_nova_id', m.versao_nova_id,
        'ato_id', m.ato_id, 'diferenca', m.diferenca, 'resumo', m.resumo
      ) order by m.publicada_em desc)
      from private.norma_mudanca as m
      where m.norma_id = n.id and m.situacao = 'publicada'
    ), '[]'::jsonb),
    'criterios', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'valor', c.valor, 'origem', c.origem)
                       order by c.tipo, c.valor)
      from private.norma_criterio as c where c.norma_id = n.id
    ), '[]'::jsonb)
  )
  from private.norma as n
  where n.id = p_norma_id and private.membro_de_alguma_consultoria()
$$;

revoke all on function public.detalhe_da_norma(uuid) from public, anon;
grant execute on function public.detalhe_da_norma(uuid) to authenticated;

-- Fontes vigiadas e a última coleta (para a Central e para o rodapé "atualizado em").
create function public.listar_fontes_legais()
returns table (codigo text, nome text, esfera text, ativa boolean, ultima_coleta_em timestamptz, com_erro boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.codigo, f.nome, f.esfera, f.ativa, f.ultima_coleta_em, f.ultimo_erro is not null
  from private.fonte_legal as f
  where private.membro_de_alguma_consultoria()
  order by case f.esfera when 'estadual' then 1 when 'municipal' then 2 else 3 end, f.nome
$$;

revoke all on function public.listar_fontes_legais() from public, anon;
grant execute on function public.listar_fontes_legais() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fontes vazias para os pacotes seguintes (mesmo desenho do P0)
-- ---------------------------------------------------------------------------
-- Stub do L6: ação do plano de ação de um requisito legal (tipo_linha 'acao_legal', com responsável).
create function private.linhas_de_prazo_acao_legal(cid uuid)
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
    'acao_legal'::text, null::uuid, null::uuid, null::date, null::integer,
    null::text, null::text, null::uuid, null::text, null::uuid, null::text,
    null::text, null::uuid,
    null::uuid, null::text, null::public.situacao_ocorrencia, null::date, null::integer
  where false and cid is not null
$$;

comment on function private.linhas_de_prazo_acao_legal(uuid) is
  'Ações do plano de ação dos requisitos legais (L6). Vazia até o L6: tipo_linha acao_legal, com responsável.';

revoke all on function private.linhas_de_prazo_acao_legal(uuid) from public, anon;
grant execute on function private.linhas_de_prazo_acao_legal(uuid) to authenticated;

-- A união ganha a fonte nova. Mesma assinatura e mesmo retorno: create or replace mantém os grants.
create or replace function private.linhas_de_prazo(cid uuid)
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
  select * from private.linhas_de_prazo_ocorrencia(cid)
  union all
  select * from private.linhas_de_prazo_validade(cid)
  union all
  select * from private.linhas_de_prazo_limite_protocolo(cid)
  union all
  select * from private.linhas_de_prazo_alvara(cid)
  union all
  select * from private.linhas_de_prazo_exigencia(cid)
  union all
  select * from private.linhas_de_prazo_vencimento(cid)
  union all
  select * from private.linhas_de_prazo_acao_legal(cid)
$$;

create or replace function private.tipo_linha_tem_responsavel(linha_tipo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select linha_tipo in ('ocorrencia', 'exigencia', 'acao_legal')
$$;

-- Stub do L5: grupo 'norma' da busca global. Vazio até o L5.
create function private.busca_normas(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select null::uuid, null::text, null::text, null::uuid, null::bigint
  where false and p_consultoria_id is not null and p_termo is not null
$$;

comment on function private.busca_normas(uuid, text) is
  'Grupo norma da busca global (L5). Vazio até o L5.';

revoke all on function private.busca_normas(uuid, text) from public, anon;
grant execute on function private.busca_normas(uuid, text) to authenticated;

create or replace function public.buscar_no_grama(p_consultoria_id uuid, p_termo text)
returns table (tipo text, id uuid, titulo text, detalhe text, referencia_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.tipo, r.id, r.titulo, r.detalhe, r.referencia_id
  from (
    select 1 as grupo, 'empreendimento'::text as tipo, x.*
    from private.busca_empreendimentos(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 2, 'licenca', x.* from private.busca_licencas(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 3, 'condicionante', x.*
    from private.busca_condicionantes(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 4, 'orcamento', x.* from private.busca_orcamentos(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 5, 'exigencia', x.* from private.busca_exigencias(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 6, 'vencimento', x.*
    from private.busca_vencimentos(p_consultoria_id, p_termo) as x where x.posicao <= 5
    union all
    select 7, 'norma', x.* from private.busca_normas(p_consultoria_id, p_termo) as x where x.posicao <= 5
  ) as r
  order by r.grupo, r.posicao
  limit 35
$$;

comment on function public.buscar_no_grama(uuid, text) is
  'Busca global (Ctrl+K): até 5 por grupo (35 no total), sem acento e sem caixa. Termo com menos de 2 caracteres não busca. A RLS decide o que volta; normas, pelo membro ativo.';
