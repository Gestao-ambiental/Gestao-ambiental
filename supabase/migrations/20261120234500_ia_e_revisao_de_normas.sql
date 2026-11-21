-- Resumo de mudança de norma por IA e revisão do operador (pacote L4, ADR-0050, LEG-04).
--
-- 1. Cota de plataforma: private.limite_ia_plataforma (uma linha) e private.ia_plataforma (uma
--    linha por chamada). O resumo é feito uma vez por mudança e serve a todas as consultorias, então
--    o custo é da plataforma e fica fora de private.uso_de_ia (por consultoria). Não consome a cota
--    de extração nem de conferência.
-- 2. Service role (Edge Function resumir-mudanca): reservar, concluir e falhar. A IA recebe só o
--    texto público da norma e a diferença; nenhum dado de consultoria sai daqui.
-- 3. Gatilho: mudança nova chama a Edge Function pelo pg_net quando ele e os segredos do Vault
--    (resumo_normas_url e resumo_normas_token) existem. Sem eles não faz nada; nunca derruba o insert.
-- 4. Operador (com dois fatores, private.exigir_operador): fila "Mudanças para revisar", detalhe,
--    publicar (critérios confirmados viram norma_criterio com origem ia_confirmada), descartar com
--    motivo e uso de IA da plataforma.
-- Só aditiva: nenhuma tabela ou função existente muda. Os avisos (aviso_norma) entram no L5, que
-- redefine central_publicar_mudanca_de_norma para criá-los na mesma transação.

-- ---------------------------------------------------------------------------
-- 1. Cota de plataforma
-- ---------------------------------------------------------------------------
create table private.limite_ia_plataforma (
  unica boolean primary key default true,
  resumos_por_dia integer not null default 40,
  custo_mensal_micros bigint not null default 20000000,
  simultaneos integer not null default 3,
  ultima_verificacao timestamptz,
  constraint limite_ia_plataforma_unica check (unica),
  constraint limite_ia_plataforma_dia_valido check (resumos_por_dia >= 0),
  constraint limite_ia_plataforma_mes_valido check (custo_mensal_micros >= 0),
  constraint limite_ia_plataforma_simultaneos_validos check (simultaneos >= 1)
);

comment on table private.limite_ia_plataforma is
  'Limites da IA da plataforma (resumo de normas, ADR-0050): resumos por dia e custo por mês (micros de USD) no fuso de São Paulo, e chamadas simultâneas. Uma linha; ajuste por SQL.';
comment on column private.limite_ia_plataforma.ultima_verificacao is
  'Trava da reserva: cada reserva atualiza esta linha, e reservas ao mesmo tempo esperam uma pela outra.';

insert into private.limite_ia_plataforma default values;

create table private.ia_plataforma (
  id uuid primary key default gen_random_uuid(),
  mudanca_id uuid not null references private.norma_mudanca (id) on delete restrict,
  situacao text not null default 'reservada',
  modelo text,
  versao_prompt text,
  tokens_entrada integer,
  tokens_saida integer,
  custo_micros bigint,
  moeda text not null default 'USD',
  duracao_ms integer,
  motivo text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  constraint ia_plataforma_situacao_valida check (situacao in ('reservada', 'concluida', 'falhou')),
  constraint ia_plataforma_fim_coerente check ((situacao = 'reservada') = (concluido_em is null)),
  constraint ia_plataforma_falha_coerente check ((situacao = 'falhou') = (motivo is not null)),
  constraint ia_plataforma_motivo_tamanho check (motivo is null or length(motivo) between 1 and 500),
  constraint ia_plataforma_moeda_valida check (moeda = 'USD'),
  constraint ia_plataforma_numeros_validos check (
    coalesce(tokens_entrada, 0) >= 0 and coalesce(tokens_saida, 0) >= 0
    and coalesce(custo_micros, 0) >= 0 and coalesce(duracao_ms, 0) >= 0
  )
);

comment on table private.ia_plataforma is
  'Chamadas de IA pagas pela plataforma (resumo de mudança de norma). Toda reserva conta na cota do dia, mesmo se falhar.';
comment on column private.ia_plataforma.custo_micros is 'Custo informado pelo provedor, em milionésimos de USD.';

create index ia_plataforma_criado_idx on private.ia_plataforma (criado_em);
create index ia_plataforma_mudanca_idx on private.ia_plataforma (mudanca_id, criado_em desc);

do $$
declare
  t text;
begin
  foreach t in array array['limite_ia_plataforma', 'ia_plataforma']
  loop
    execute format('alter table private.%I enable row level security', t);
    execute format('alter table private.%I force row level security', t);
    execute format('revoke all on table private.%I from public, anon, authenticated', t);
  end loop;
end;
$$;

-- Início do dia e do mês no fuso da plataforma (São Paulo), para a cota.
create function private.inicio_no_fuso_da_plataforma(p_unidade text, p_instante timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc(p_unidade, p_instante at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

revoke all on function private.inicio_no_fuso_da_plataforma(text, timestamptz) from public, anon, authenticated;

-- Resumo no formato que a Central publica: objeto com 'resumo' (texto). Outras chaves ficam.
create function private.resumo_de_norma_valido(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and jsonb_typeof(p -> 'resumo') = 'string'
    and length(btrim(p ->> 'resumo')) between 1 and 1200
    and length(p::text) <= 20000,
    false)
$$;

revoke all on function private.resumo_de_norma_valido(jsonb) from public, anon, authenticated;

-- Lista [{tipo, valor}] com os tipos de private.norma_criterio. O formato de cada valor é conferido
-- pelo check da tabela na hora de publicar.
create function private.criterios_de_norma_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 100
    and not exists (
      select 1 from jsonb_array_elements(p) as c (item)
      where jsonb_typeof(c.item) <> 'object'
         or jsonb_typeof(c.item -> 'tipo') is distinct from 'string'
         or jsonb_typeof(c.item -> 'valor') is distinct from 'string'
         or (c.item ->> 'tipo') not in
            ('atividade', 'prefixo_atividade', 'tipo_licenca', 'municipio', 'competencia', 'tema')
         or length(btrim(c.item ->> 'valor')) not between 1 and 200),
    false)
$$;

revoke all on function private.criterios_de_norma_validos(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Service role: reservar, concluir e falhar
-- ---------------------------------------------------------------------------
-- Reserva uma chamada e devolve o que a IA lê: título, tipo, órgão e esfera da norma, o tipo da
-- mudança, a diferença e os textos (até 60.000 caracteres cada). Nada de consultoria.
-- Reserva com mais de 3 minutos sem fim não conta como simultânea (a Edge Function já desistiu).
create function public.reservar_resumo_de_mudanca(p_mudanca_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  limites private.limite_ia_plataforma;
  alvo private.norma_mudanca;
  agora timestamptz := now();
  reserva uuid;
begin
  update private.limite_ia_plataforma as l
  set ultima_verificacao = clock_timestamp()
  where l.unica
  returning * into limites;
  if not found then
    raise exception 'cota_diaria_esgotada' using errcode = 'P0001';
  end if;

  select * into alvo from private.norma_mudanca as m where m.id = p_mudanca_id for update;
  if not found then
    raise exception 'mudanca_inexistente' using errcode = 'P0001';
  end if;
  if alvo.situacao in ('publicada', 'descartada') then
    raise exception 'mudanca_ja_publicada' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from private.ia_plataforma as c
    where c.mudanca_id = alvo.id and c.situacao = 'reservada' and c.criado_em > agora - interval '3 minutes'
  ) then
    raise exception 'resumo_em_andamento' using errcode = 'P0001';
  end if;

  if (select count(*) from private.ia_plataforma as c
      where c.criado_em >= private.inicio_no_fuso_da_plataforma('day', agora)) >= limites.resumos_por_dia then
    raise exception 'cota_diaria_esgotada' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(c.custo_micros), 0) from private.ia_plataforma as c
      where c.criado_em >= private.inicio_no_fuso_da_plataforma('month', agora)) >= limites.custo_mensal_micros then
    raise exception 'cota_mensal_esgotada' using errcode = 'P0001';
  end if;
  if (select count(*) from private.ia_plataforma as c
      where c.situacao = 'reservada' and c.criado_em > agora - interval '3 minutes') >= limites.simultaneos then
    raise exception 'muitas_simultaneas' using errcode = 'P0001';
  end if;

  insert into private.ia_plataforma (mudanca_id, criado_em) values (alvo.id, agora)
  returning id into reserva;

  return (
    select jsonb_build_object(
      'reserva_id', reserva,
      'norma', jsonb_build_object('titulo', n.titulo, 'tipo', n.tipo, 'orgao', n.orgao, 'esfera', n.esfera),
      'tipo_mudanca', alvo.tipo,
      'diferenca', alvo.diferenca,
      'texto_anterior', (select left(v.texto, 60000) from private.norma_versao as v
                         where v.id = alvo.versao_anterior_id),
      'texto_novo', (select left(v.texto, 60000) from private.norma_versao as v
                     where v.id = alvo.versao_nova_id)
    )
    from private.norma as n
    where n.id = alvo.norma_id
  );
end;
$$;

comment on function public.reservar_resumo_de_mudanca(uuid) is
  'Service role: reserva a cota da plataforma e devolve o texto público da mudança para a IA.';

-- Grava o resumo e os critérios sugeridos e fecha a reserva. Repetir não muda nada. Mudança que já
-- foi publicada ou descartada enquanto a IA rodava fica como está; o custo fica registrado.
create function public.concluir_resumo_de_mudanca(
  p_reserva_id uuid,
  p_resumo jsonb,
  p_criterios jsonb,
  p_modelo text,
  p_versao_prompt text,
  p_tokens_entrada integer,
  p_tokens_saida integer,
  p_custo_micros bigint,
  p_duracao_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  chamada private.ia_plataforma;
begin
  select * into chamada from private.ia_plataforma as c where c.id = p_reserva_id for update;
  if not found then
    raise exception 'reserva_inexistente' using errcode = 'P0001';
  end if;
  if chamada.situacao <> 'reservada' then
    return;
  end if;
  if not private.resumo_de_norma_valido(p_resumo)
     or not private.criterios_de_norma_validos(coalesce(p_criterios, '[]'::jsonb)) then
    raise exception 'resposta_invalida' using errcode = '22023';
  end if;

  update private.norma_mudanca as m
  set resumo = p_resumo || jsonb_build_object('resumo', btrim(p_resumo ->> 'resumo')),
      criterios_sugeridos = coalesce(p_criterios, '[]'::jsonb),
      situacao = 'resumida'
  where m.id = chamada.mudanca_id and m.situacao in ('detectada', 'resumida');

  update private.ia_plataforma as c
  set situacao = 'concluida', modelo = left(p_modelo, 200), versao_prompt = left(p_versao_prompt, 50),
      tokens_entrada = p_tokens_entrada, tokens_saida = p_tokens_saida, custo_micros = p_custo_micros,
      duracao_ms = p_duracao_ms, concluido_em = now()
  where c.id = chamada.id;
end;
$$;

comment on function public.concluir_resumo_de_mudanca(uuid, jsonb, jsonb, text, text, integer, integer, bigint, integer) is
  'Service role: grava o resumo e os critérios sugeridos (situação resumida) e fecha a reserva.';

create function public.falhar_resumo_de_mudanca(p_reserva_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.ia_plataforma as c where c.id = p_reserva_id) then
    raise exception 'reserva_inexistente' using errcode = 'P0001';
  end if;
  update private.ia_plataforma as c
  set situacao = 'falhou', motivo = coalesce(left(nullif(btrim(p_motivo), ''), 500), 'erro_interno'),
      concluido_em = now()
  where c.id = p_reserva_id and c.situacao = 'reservada';
end;
$$;

comment on function public.falhar_resumo_de_mudanca(uuid, text) is
  'Service role: fecha a reserva com o motivo da falha. A mudança continua sem resumo.';

-- ---------------------------------------------------------------------------
-- 3. Gatilho: mudança nova pede o resumo à Edge Function resumir-mudanca
-- ---------------------------------------------------------------------------
-- Mesmo desenho de private.disparar_aviso_da_lista_de_espera: URL e token no Vault (gravados por SQL
-- no painel, nunca no repositório); sem Vault, segredos ou pg_net (banco local, CI) não faz nada.
create function private.disparar_resumo_de_mudanca(p_mudanca_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_schema_net text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_url using 'resumo_normas_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_token using 'resumo_normas_token';
  if v_url is null or v_token is null then
    return;
  end if;
  select n.nspname into v_schema_net
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pg_net';
  if v_schema_net is null then
    return;
  end if;
  execute format('select %I.http_post(url := $1, body := $2, headers := $3)', v_schema_net)
    using v_url, jsonb_build_object('mudanca_id', p_mudanca_id),
          jsonb_build_object('Content-Type', 'application/json', 'x-resumo-token', v_token);
end;
$$;

revoke all on function private.disparar_resumo_de_mudanca(uuid) from public, anon, authenticated;

create function private.chamar_resumo_de_mudanca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.disparar_resumo_de_mudanca(new.id);
  return null;
exception when others then
  -- O resumo nunca impede a coleta de gravar a mudança.
  return null;
end;
$$;

revoke all on function private.chamar_resumo_de_mudanca() from public, anon, authenticated;

create trigger norma_mudanca_resumir
  after insert on private.norma_mudanca
  for each row
  when (new.situacao = 'detectada')
  execute function private.chamar_resumo_de_mudanca();

-- ---------------------------------------------------------------------------
-- 4. Operador: fila, detalhe, publicar, descartar e uso
-- ---------------------------------------------------------------------------
-- Fila "Mudanças para revisar". Sem filtro: detectada e resumida, mais antigas primeiro.
create function public.central_listar_mudancas_de_norma(
  p_situacao text default null,
  p_limite integer default 25,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  norma_id uuid,
  norma_titulo text,
  tipo text,
  situacao text,
  detectada_em timestamptz,
  tem_resumo boolean,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  if p_situacao is not null and p_situacao not in ('detectada', 'resumida', 'publicada', 'descartada') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  return query
  select m.id, m.norma_id, n.titulo, m.tipo, m.situacao, m.detectada_em, m.resumo is not null,
         count(*) over ()
  from private.norma_mudanca as m
  join private.norma as n on n.id = m.norma_id
  where (p_situacao is null and m.situacao in ('detectada', 'resumida'))
     or m.situacao = p_situacao
  order by m.detectada_em, m.id
  limit least(greatest(coalesce(p_limite, 25), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- Detalhe para revisar: norma, diferença, resumo, critérios sugeridos, versões com um trecho de até
-- 4.000 caracteres e as chamadas de IA da mudança com o custo. A Edge Function resumir-mudanca
-- também chama esta função, com o JWT do operador, para conferir quem pede o resumo pela Central.
create function public.central_detalhe_da_mudanca_de_norma(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  if not exists (select 1 from private.norma_mudanca as m where m.id = p_id) then
    raise exception 'mudanca_inexistente' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'id', m.id,
      'tipo', m.tipo,
      'situacao', m.situacao,
      'detectada_em', m.detectada_em,
      'publicada_em', m.publicada_em,
      'motivo_descarte', m.motivo_descarte,
      'norma', jsonb_build_object(
        'id', n.id, 'chave', n.chave, 'titulo', n.titulo, 'ementa', n.ementa, 'esfera', n.esfera,
        'municipio_ibge', n.municipio_ibge, 'orgao', n.orgao, 'tipo', n.tipo, 'numero', n.numero,
        'ano', n.ano, 'situacao_na_fonte', n.situacao_na_fonte),
      'url_oficial', n.url_oficial,
      'diferenca', m.diferenca,
      'resumo', m.resumo,
      'criterios_sugeridos', m.criterios_sugeridos,
      'criterios', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'valor', c.valor, 'origem', c.origem)
                         order by c.tipo, c.valor)
        from private.norma_criterio as c where c.norma_id = n.id
      ), '[]'::jsonb),
      'versao_anterior', (
        select jsonb_build_object('id', v.id, 'numero', v.numero, 'publicada_em', v.publicada_em,
                                  'publicada_em_texto', v.publicada_em_texto, 'trecho', left(v.texto, 4000))
        from private.norma_versao as v where v.id = m.versao_anterior_id),
      'versao_nova', (
        select jsonb_build_object('id', v.id, 'numero', v.numero, 'publicada_em', v.publicada_em,
                                  'publicada_em_texto', v.publicada_em_texto, 'trecho', left(v.texto, 4000))
        from private.norma_versao as v where v.id = m.versao_nova_id),
      'chamadas_ia', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'situacao', c.situacao, 'modelo', c.modelo, 'versao_prompt', c.versao_prompt,
          'tokens_entrada', c.tokens_entrada, 'tokens_saida', c.tokens_saida,
          'custo_micros', c.custo_micros, 'moeda', c.moeda, 'duracao_ms', c.duracao_ms,
          'motivo', c.motivo, 'criado_em', c.criado_em, 'concluido_em', c.concluido_em
        ) order by c.criado_em desc, c.id)
        from private.ia_plataforma as c where c.mudanca_id = m.id
      ), '[]'::jsonb)
    )
    from private.norma_mudanca as m
    join private.norma as n on n.id = m.norma_id
    where m.id = p_id
  );
end;
$$;

-- Publica a mudança revisada: o resumo conferido pelo operador (texto de 1 a 1.200 caracteres em
-- 'resumo') e os critérios confirmados, que viram norma_criterio com origem 'ia_confirmada'.
-- Critério que já existe (de qualquer origem) fica como está.
create function public.central_publicar_mudanca_de_norma(p_id uuid, p_resumo jsonb, p_criterios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo private.norma_mudanca;
  criterio jsonb;
begin
  perform private.exigir_operador();

  select * into alvo from private.norma_mudanca as m where m.id = p_id for update;
  if not found then
    raise exception 'mudanca_inexistente' using errcode = 'P0001';
  end if;
  if alvo.situacao in ('publicada', 'descartada') then
    raise exception 'mudanca_ja_revisada' using errcode = 'P0001';
  end if;

  if p_resumo is null or jsonb_typeof(p_resumo) <> 'object'
     or jsonb_typeof(coalesce(p_resumo -> 'resumo', '""'::jsonb)) <> 'string' then
    raise exception 'resumo_invalido' using errcode = '22023';
  end if;
  if btrim(coalesce(p_resumo ->> 'resumo', '')) = '' then
    raise exception 'resumo_obrigatorio' using errcode = '22023';
  end if;
  if not private.resumo_de_norma_valido(p_resumo) then
    raise exception 'resumo_invalido' using errcode = '22023';
  end if;
  if not private.criterios_de_norma_validos(coalesce(p_criterios, '[]'::jsonb)) then
    raise exception 'criterio_invalido' using errcode = '22023';
  end if;

  update private.norma_mudanca as m
  set resumo = p_resumo || jsonb_build_object('resumo', btrim(p_resumo ->> 'resumo')),
      situacao = 'publicada',
      revisada_por = auth.uid(),
      publicada_em = now()
  where m.id = alvo.id;

  for criterio in select c.item from jsonb_array_elements(coalesce(p_criterios, '[]'::jsonb)) as c (item)
  loop
    begin
      insert into private.norma_criterio (norma_id, tipo, valor, origem)
      values (alvo.norma_id, criterio ->> 'tipo', btrim(criterio ->> 'valor'), 'ia_confirmada')
      on conflict (norma_id, tipo, valor) do nothing;
    exception when check_violation then
      raise exception 'criterio_invalido' using errcode = '22023';
    end;
  end loop;
end;
$$;

-- Descarta a mudança (ato sem efeito para as consultorias, falso positivo da coleta) com motivo.
create function public.central_descartar_mudanca_de_norma(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo private.norma_mudanca;
  motivo_limpo text;
begin
  perform private.exigir_operador();
  motivo_limpo := private.motivo_obrigatorio(p_motivo);

  select * into alvo from private.norma_mudanca as m where m.id = p_id for update;
  if not found then
    raise exception 'mudanca_inexistente' using errcode = 'P0001';
  end if;
  if alvo.situacao in ('publicada', 'descartada') then
    raise exception 'mudanca_ja_revisada' using errcode = 'P0001';
  end if;

  update private.norma_mudanca as m
  set situacao = 'descartada', revisada_por = auth.uid(), motivo_descarte = motivo_limpo
  where m.id = alvo.id;
end;
$$;

-- Uso da IA da plataforma hoje e no mês (fuso de São Paulo) e os limites.
create function public.central_uso_de_ia_da_plataforma()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return (
    select jsonb_build_object(
      'resumos_hoje', (select count(*) from private.ia_plataforma as c
                       where c.criado_em >= private.inicio_no_fuso_da_plataforma('day', now())),
      'custo_mes_micros', (select coalesce(sum(c.custo_micros), 0) from private.ia_plataforma as c
                           where c.criado_em >= private.inicio_no_fuso_da_plataforma('month', now())),
      'limite_dia', l.resumos_por_dia,
      'limite_mes_micros', l.custo_mensal_micros
    )
    from private.limite_ia_plataforma as l
    where l.unica
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.reservar_resumo_de_mudanca(uuid) from public, anon, authenticated;
revoke all on function public.concluir_resumo_de_mudanca(uuid, jsonb, jsonb, text, text, integer, integer, bigint, integer)
  from public, anon, authenticated;
revoke all on function public.falhar_resumo_de_mudanca(uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_resumo_de_mudanca(uuid) to service_role;
grant execute on function public.concluir_resumo_de_mudanca(uuid, jsonb, jsonb, text, text, integer, integer, bigint, integer)
  to service_role;
grant execute on function public.falhar_resumo_de_mudanca(uuid, text) to service_role;

revoke all on function public.central_listar_mudancas_de_norma(text, integer, integer) from public, anon;
revoke all on function public.central_detalhe_da_mudanca_de_norma(uuid) from public, anon;
revoke all on function public.central_publicar_mudanca_de_norma(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.central_descartar_mudanca_de_norma(uuid, text) from public, anon;
revoke all on function public.central_uso_de_ia_da_plataforma() from public, anon;
grant execute on function public.central_listar_mudancas_de_norma(text, integer, integer) to authenticated;
grant execute on function public.central_detalhe_da_mudanca_de_norma(uuid) to authenticated;
grant execute on function public.central_publicar_mudanca_de_norma(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.central_descartar_mudanca_de_norma(uuid, text) to authenticated;
grant execute on function public.central_uso_de_ia_da_plataforma() to authenticated;
