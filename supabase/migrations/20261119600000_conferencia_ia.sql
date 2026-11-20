-- Conferência do relatório por IA antes da Gestão (ADR-0036, fatia 3).
-- 1. A evidência passa a aceitar .docx (bucket e enviar_evidencia), para a Gestão corrigir no Word.
--    O resto de enviar_evidencia é o da 20261018181131 (a última definição).
-- 2. conferencia_ia: uma por versão enviada, lida por todo membro ativo. Só aponta, não decide.
-- 3. iniciar_conferencia_ia (membro): confere quem pode pedir, o plano e o tipo do arquivo, e devolve
--    o contexto do cadastro. A Edge Function conferir-relatorio lê o texto, roda as regras fixas,
--    reserva a cota e chama a IA.
-- 4. Cota somada com a extração (private.uso_de_ia): os mesmos limites para as duas.
-- 5. concluir_conferencia_ia e falhar_conferencia_ia (service role).
-- Criada pela CLI e renomeada para vir depois das migrations da camada vistoria-geral, das quais
-- depende (reservar_extracao_ia, limite_extracao_ia).

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'arquivos';

create or replace function public.enviar_evidencia(
  p_ocorrencia_id uuid,
  p_evidencia_id uuid,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_data_execucao date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  objeto record;
  doc uuid;
  proximo integer;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);

  select ev.numero into proximo from public.evidencia as ev where ev.id = p_evidencia_id;
  if found then
    if exists (select 1 from public.evidencia as ev where ev.id = p_evidencia_id and ev.ocorrencia_id = alvo.id) then
      return proximo;
    end if;
    raise exception 'evidencia_existente' using errcode = 'P0001';
  end if;

  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'em_conferencia' then
    raise exception 'aguardando_conferencia' using errcode = 'P0001';
  end if;
  if p_data_execucao is null then
    raise exception 'data_execucao_obrigatoria' using errcode = '22023';
  end if;
  if p_data_execucao > private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'data_execucao_futura' using errcode = '22023';
  end if;
  if split_part(p_caminho, '/', 1) <> alvo.consultoria_id::text
     or p_caminho !~ '^[0-9a-f-]{36}/evidencia/[0-9a-f-]{36}\.(pdf|png|jpg|docx)$' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or objeto.mime not in ('application/pdf', 'image/png', 'image/jpeg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  select ev.documento_versao_id into doc from public.evidencia as ev
  where ev.ocorrencia_id = alvo.id order by ev.numero desc limit 1;
  if found then
    select v.documento_id into doc from public.documento_versao as v where v.id = doc;
  else
    insert into public.documento (consultoria_id, entidade) values (alvo.consultoria_id, 'evidencia')
    returning id into doc;
  end if;

  select coalesce(max(ev.numero), 0) + 1 into proximo from public.evidencia as ev where ev.ocorrencia_id = alvo.id;

  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, doc, proximo, p_caminho, btrim(p_nome_original), objeto.mime,
          objeto.tamanho, lower(p_sha256), private.membro_atual(alvo.consultoria_id));
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;

  insert into public.evidencia (id, consultoria_id, ocorrencia_id, numero, documento_versao_id, data_execucao,
                                enviada_por)
  values (p_evidencia_id, alvo.consultoria_id, alvo.id, proximo, p_versao_id, p_data_execucao,
          private.membro_atual(alvo.consultoria_id));

  update public.ocorrencia as o
  set situacao = 'em_conferencia', row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'evidencia_enviada', proximo);
  return proximo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Conferência por IA de uma evidência. Uma por versão enviada; se falhar, dá para tentar de
--    novo (linha nova). Quem lê: todo membro ativo (quem enviou e quem confere veem o mesmo).
--    Quem grava: iniciar_conferencia_ia (membro) e, depois, só a service role da Edge Function.
-- ---------------------------------------------------------------------------
create table public.conferencia_ia (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  evidencia_id uuid not null,
  situacao text not null default 'em_andamento',
  motivo text,
  detalhe text,
  ia_liberada boolean not null,
  resumo text,
  apontamentos jsonb not null default '[]'::jsonb,
  modelo text,
  versao_prompt text,
  tokens_entrada integer,
  tokens_saida integer,
  custo_micros bigint,
  duracao_ms integer,
  solicitada_por uuid not null,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  constraint conferencia_ia_consultoria_id_id_key unique (consultoria_id, id),
  constraint conferencia_ia_situacao check (situacao in ('em_andamento', 'concluida', 'falhou')),
  constraint conferencia_ia_motivo check (motivo is null or motivo in (
    'ia_fora_do_plano', 'tipo_sem_texto', 'arquivo_sem_texto', 'arquivo_grande_demais',
    'texto_longo_demais', 'limite_atingido', 'provedor_indisponivel', 'provedor_recusou',
    'tempo_esgotado', 'resposta_invalida', 'configuracao_ausente', 'erro_interno')),
  constraint conferencia_ia_falha check ((situacao = 'falhou') = (motivo is not null)),
  constraint conferencia_ia_fim check ((situacao = 'em_andamento') = (concluida_em is null)),
  constraint conferencia_ia_apontamentos check (
    jsonb_typeof(apontamentos) = 'array' and jsonb_array_length(apontamentos) <= 60),
  constraint conferencia_ia_evidencia_fk foreign key (consultoria_id, evidencia_id)
    references public.evidencia (consultoria_id, id) on delete restrict,
  constraint conferencia_ia_solicitada_por_fk foreign key (consultoria_id, solicitada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.conferencia_ia is
  'Conferência do relatório por IA antes da Gestão (ADR-0036, fatia 3). Só aponta; não decide.';
comment on column public.conferencia_ia.apontamentos is
  '[{origem: regra|ia, categoria, gravidade: corrigir|verificar, trecho, problema, sugestao}]';
comment on column public.conferencia_ia.ia_liberada is
  'Plano com IA no início. Sem IA, só as regras fixas rodam e a linha falha com ia_fora_do_plano.';

-- Uma conferência viva (em andamento ou concluída) por evidência; as que falharam ficam de histórico.
create unique index conferencia_ia_viva_idx
  on public.conferencia_ia (evidencia_id) where situacao <> 'falhou';
create index conferencia_ia_evidencia_idx on public.conferencia_ia (consultoria_id, evidencia_id, iniciada_em desc);

alter table public.conferencia_ia enable row level security;
alter table public.conferencia_ia force row level security;
revoke all on table public.conferencia_ia from anon, authenticated;
grant select on table public.conferencia_ia to authenticated;

create policy conferencia_ia_select_membro_ativo
  on public.conferencia_ia for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create trigger conferencia_ia_auditar
  after insert or update or delete on public.conferencia_ia
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.conferencia_ia
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.conferencia_ia
  for each row execute function private.bloquear_escrita_comercial();

-- Reserva de cota da conferência: mesma regra da extração (uma por chamada paga).
create table private.reserva_conferencia_ia (
  conferencia_id uuid primary key references public.conferencia_ia (id) on delete restrict,
  reservada_em timestamptz not null
);
alter table private.reserva_conferencia_ia enable row level security;
alter table private.reserva_conferencia_ia force row level security;
revoke all on table private.reserva_conferencia_ia from public, anon, authenticated;
create index reserva_conferencia_ia_data_idx on private.reserva_conferencia_ia (reservada_em);

-- ---------------------------------------------------------------------------
-- 3. Iniciar (com o JWT de quem pediu). Pode pedir quem enviou a evidência, o conferente designado
--    ou a Gestão. Devolve o arquivo e o contexto do cadastro que a IA compara com o texto.
--    Repetir com o mesmo id, ou pedir de novo enquanto há uma viva, só devolve a situação.
--    Uma em andamento há mais de 3 minutos é dada como tempo esgotado e pode ser refeita.
-- ---------------------------------------------------------------------------
create function public.iniciar_conferencia_ia(p_id uuid, p_evidencia_id uuid)
returns table (
  conferencia_id uuid,
  nova boolean,
  situacao text,
  motivo text,
  ia_liberada boolean,
  caminho text,
  mime text,
  tamanho_bytes bigint,
  contexto jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.evidencia%rowtype;
  alvo public.ocorrencia%rowtype;
  versao public.documento_versao%rowtype;
  eu uuid;
  existente public.conferencia_ia%rowtype;
  liberada boolean;
  v_contexto jsonb;
begin
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into ev from public.evidencia as x where x.id = p_evidencia_id;
  if not found or not private.is_membro(ev.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into alvo from public.ocorrencia as o
  where o.consultoria_id = ev.consultoria_id and o.id = ev.ocorrencia_id;
  eu := private.membro_atual(ev.consultoria_id);
  -- coalesce: conferente nulo não pode virar "talvez" e deixar passar.
  if eu is null or not coalesce(
    ev.enviada_por = eu
    or alvo.conferente_id is not distinct from eu
    or private.is_gestao(ev.consultoria_id),
    false
  ) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select * into existente from public.conferencia_ia as c where c.id = p_id;
  if found and existente.evidencia_id <> ev.id then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not found then
    select * into existente from public.conferencia_ia as c
    where c.consultoria_id = ev.consultoria_id and c.evidencia_id = ev.id and c.situacao <> 'falhou'
    for update;
    if found and existente.situacao = 'em_andamento'
       and existente.iniciada_em < now() - interval '3 minutes' then
      update public.conferencia_ia as c
      set situacao = 'falhou', motivo = 'tempo_esgotado', concluida_em = now()
      where c.id = existente.id;
      existente := null;
    end if;
  end if;
  if existente.id is not null then
    return query select existente.id, false, existente.situacao, existente.motivo,
      existente.ia_liberada, null::text, null::text, null::bigint, null::jsonb;
    return;
  end if;

  if private.consultoria_somente_leitura(ev.consultoria_id) then
    raise exception 'consultoria_somente_leitura' using errcode = '42501';
  end if;
  liberada := private.recurso_liberado(ev.consultoria_id, 'ia');

  select * into versao from public.documento_versao as v
  where v.consultoria_id = ev.consultoria_id and v.id = ev.documento_versao_id;

  -- Imagem não tem texto para conferir: registra e não chama nada.
  if versao.mime not in ('application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    insert into public.conferencia_ia (id, consultoria_id, evidencia_id, situacao, motivo, ia_liberada,
                                       solicitada_por, concluida_em)
    values (p_id, ev.consultoria_id, ev.id, 'falhou', 'tipo_sem_texto', liberada, eu, now());
    return query select p_id, false, 'falhou'::text, 'tipo_sem_texto'::text, liberada,
      null::text, null::text, null::bigint, null::jsonb;
    return;
  end if;

  select jsonb_build_object(
    'hoje', private.hoje_da_consultoria(ev.consultoria_id),
    'data_execucao', ev.data_execucao,
    'empreendimento', jsonb_build_object(
      'nome', e.nome, 'cliente', cl.nome, 'cnpj', e.cnpj, 'unidade', u.nome, 'endereco', u.endereco),
    'licenca', jsonb_build_object(
      'tipo', t.sigla, 'numero', i.numero, 'orgao', i.orgao, 'emissao', i.emitido_em,
      'assinatura', i.assinado_em, 'validade', i.validade),
    'condicionante', jsonb_build_object(
      'codigo', c.codigo, 'titulo', v.titulo, 'texto', v.texto_literal,
      'prazo', alvo.prazo_oficial_atual, 'ciclo', alvo.ciclo))
  into v_contexto
  from public.instrumento as i
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  join public.condicionante_versao as v
    on v.consultoria_id = alvo.consultoria_id and v.id = alvo.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
  where i.consultoria_id = alvo.consultoria_id and i.id = alvo.instrumento_id;

  insert into public.conferencia_ia (id, consultoria_id, evidencia_id, ia_liberada, solicitada_por)
  values (p_id, ev.consultoria_id, ev.id, liberada, eu);

  return query select p_id, true, 'em_andamento'::text, null::text, liberada, versao.caminho,
    versao.mime, versao.tamanho_bytes, v_contexto;
end;
$$;

revoke all on function public.iniciar_conferencia_ia(uuid, uuid) from public, anon;
grant execute on function public.iniciar_conferencia_ia(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cota somada: extração e conferência disputam os mesmos limites de private.limite_extracao_ia
--    (por conta, por consultoria, no projeto e simultâneas, em 24 horas). As duas reservas chamam
--    private.uso_de_ia, que conta as duas tabelas. reservar_extracao_ia passa a contar também as
--    conferências; o resto dela não muda.
-- ---------------------------------------------------------------------------
create function private.uso_de_ia(p_desde timestamptz, p_recentes timestamptz, p_usuario uuid, p_consultoria uuid)
returns table (conta bigint, consultoria bigint, projeto bigint, em_andamento bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with usos as (
    select r.reservada_em, x.consultoria_id, m.usuario_id, x.situacao
    from private.reserva_extracao_ia as r
    join public.extracao_ia as x on x.id = r.extracao_id
    join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.solicitada_por
    where r.reservada_em > p_desde
    union all
    select r.reservada_em, c.consultoria_id, m.usuario_id, c.situacao
    from private.reserva_conferencia_ia as r
    join public.conferencia_ia as c on c.id = r.conferencia_id
    join public.membro as m on m.consultoria_id = c.consultoria_id and m.id = c.solicitada_por
    where r.reservada_em > p_desde
  )
  select
    count(*) filter (where u.usuario_id = p_usuario),
    count(*) filter (where u.consultoria_id = p_consultoria),
    count(*),
    count(*) filter (where u.situacao = 'em_andamento' and u.reservada_em > p_recentes)
  from usos as u
$$;

revoke all on function private.uso_de_ia(timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;

create or replace function public.reservar_extracao_ia(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limites private.limite_extracao_ia;
  alvo_consultoria uuid;
  alvo_usuario uuid;
  uso record;
begin
  update private.limite_extracao_ia
  set ultima_verificacao = clock_timestamp()
  where unica
  returning * into limites;
  if not found then
    return false;
  end if;

  select x.consultoria_id, m.usuario_id into alvo_consultoria, alvo_usuario
  from public.extracao_ia as x
  join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.solicitada_por
  where x.id = p_id and x.situacao = 'em_andamento'
    and m.situacao = 'ativo' and m.papel = 'gestao'
  for update of x;
  if not found or exists (select 1 from private.reserva_extracao_ia as r where r.extracao_id = p_id) then
    return false;
  end if;

  select * into uso from private.uso_de_ia(limites.ultima_verificacao - interval '24 hours',
    limites.ultima_verificacao - interval '3 minutes', alvo_usuario, alvo_consultoria);
  if uso.conta >= limites.por_conta or uso.consultoria >= limites.por_consultoria
     or uso.projeto >= limites.por_projeto or uso.em_andamento >= limites.simultaneas then
    return false;
  end if;

  insert into private.reserva_extracao_ia (extracao_id, reservada_em)
  values (p_id, limites.ultima_verificacao);
  return true;
end;
$$;

revoke all on function public.reservar_extracao_ia(uuid) from public, anon, authenticated;
grant execute on function public.reservar_extracao_ia(uuid) to service_role;

create function public.reservar_conferencia_ia(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limites private.limite_extracao_ia;
  alvo_consultoria uuid;
  alvo_usuario uuid;
  uso record;
begin
  update private.limite_extracao_ia
  set ultima_verificacao = clock_timestamp()
  where unica
  returning * into limites;
  if not found then
    return false;
  end if;

  select c.consultoria_id, m.usuario_id into alvo_consultoria, alvo_usuario
  from public.conferencia_ia as c
  join public.membro as m on m.consultoria_id = c.consultoria_id and m.id = c.solicitada_por
  where c.id = p_id and c.situacao = 'em_andamento' and c.ia_liberada and m.situacao = 'ativo'
  for update of c;
  if not found or exists (select 1 from private.reserva_conferencia_ia as r where r.conferencia_id = p_id) then
    return false;
  end if;

  select * into uso from private.uso_de_ia(limites.ultima_verificacao - interval '24 hours',
    limites.ultima_verificacao - interval '3 minutes', alvo_usuario, alvo_consultoria);
  if uso.conta >= limites.por_conta or uso.consultoria >= limites.por_consultoria
     or uso.projeto >= limites.por_projeto or uso.em_andamento >= limites.simultaneas then
    return false;
  end if;

  insert into private.reserva_conferencia_ia (conferencia_id, reservada_em)
  values (p_id, limites.ultima_verificacao);
  return true;
end;
$$;

revoke all on function public.reservar_conferencia_ia(uuid) from public, anon, authenticated;
grant execute on function public.reservar_conferencia_ia(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Concluir ou falhar (service role). Só uma conferência em andamento muda; repetir não muda nada.
--    Na falha, os apontamentos das regras fixas (sem IA) também ficam gravados.
-- ---------------------------------------------------------------------------
create function private.apontamentos_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 60 and not exists (
    select 1 from jsonb_array_elements(p) as a (item)
    where jsonb_typeof(a.item) <> 'object'
       or coalesce(a.item ->> 'origem', '') not in ('regra', 'ia')
       or coalesce(a.item ->> 'categoria', '') not in
          ('empreendimento', 'licenca', 'condicionante', 'datas', 'consistencia', 'escrita')
       or coalesce(a.item ->> 'gravidade', '') not in ('corrigir', 'verificar')
       or length(coalesce(a.item ->> 'problema', '')) not between 1 and 1000
       or length(coalesce(a.item ->> 'trecho', '')) > 1000
       or length(coalesce(a.item ->> 'sugestao', '')) > 1000)
$$;

revoke all on function private.apontamentos_validos(jsonb) from public, anon, authenticated;

create function public.concluir_conferencia_ia(
  p_id uuid,
  p_resumo text,
  p_apontamentos jsonb,
  p_modelo text,
  p_versao_prompt text,
  p_tokens_entrada integer,
  p_tokens_saida integer,
  p_custo_micros bigint,
  p_duracao_ms integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.apontamentos_validos(coalesce(p_apontamentos, '[]'::jsonb)) then
    raise exception 'resposta_invalida' using errcode = '22023';
  end if;
  update public.conferencia_ia as c
  set situacao = 'concluida', resumo = left(nullif(btrim(coalesce(p_resumo, '')), ''), 2000),
      apontamentos = coalesce(p_apontamentos, '[]'::jsonb), modelo = p_modelo,
      versao_prompt = p_versao_prompt, tokens_entrada = p_tokens_entrada, tokens_saida = p_tokens_saida,
      custo_micros = p_custo_micros, duracao_ms = p_duracao_ms, concluida_em = now()
  where c.id = p_id and c.situacao = 'em_andamento';
  return jsonb_array_length(coalesce(p_apontamentos, '[]'::jsonb));
end;
$$;

revoke all on function public.concluir_conferencia_ia(uuid, text, jsonb, text, text, integer, integer, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.concluir_conferencia_ia(uuid, text, jsonb, text, text, integer, integer, bigint, integer)
  to service_role;

create function public.falhar_conferencia_ia(
  p_id uuid,
  p_motivo text,
  p_detalhe text,
  p_apontamentos jsonb,
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
begin
  if not private.apontamentos_validos(coalesce(p_apontamentos, '[]'::jsonb)) then
    raise exception 'resposta_invalida' using errcode = '22023';
  end if;
  update public.conferencia_ia as c
  set situacao = 'falhou', motivo = p_motivo, detalhe = left(p_detalhe, 500),
      apontamentos = coalesce(p_apontamentos, '[]'::jsonb), modelo = p_modelo,
      versao_prompt = p_versao_prompt, tokens_entrada = p_tokens_entrada, tokens_saida = p_tokens_saida,
      custo_micros = p_custo_micros, duracao_ms = p_duracao_ms, concluida_em = now()
  where c.id = p_id and c.situacao = 'em_andamento';
end;
$$;

revoke all on function public.falhar_conferencia_ia(uuid, text, text, jsonb, text, text, integer, integer, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.falhar_conferencia_ia(uuid, text, text, jsonb, text, text, integer, integer, bigint, integer)
  to service_role;
