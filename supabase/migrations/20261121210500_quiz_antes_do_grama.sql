-- Quiz "Antes do Grama" no site (ADR-0057). As 4 perguntas do diálogo da linha de base (ADR-0027)
-- saem do app e vão para o site, que grava as respostas sem login, junto da inscrição na lista de
-- espera ou antes dela. Quando a pessoa é convidada e cria a consultoria, as respostas do mesmo
-- e-mail viram a primeira linha_de_base: as métricas de valor têm base desde o primeiro dia.
--
-- Proteções iguais às da inscrição (20261119300100): faixas numéricas da linha_de_base, contato
-- validado e normalizado como na lista, até 20 envios por hora por origem (IP em hash, nunca
-- gravado) e teto global de 600 por hora. Sem texto livre: nada de CPF.

create table private.quiz_antes_do_grama (
  id uuid primary key,
  licencas_ativas integer not null,
  horas_semana_conferindo numeric(5, 1) not null,
  minutos_por_condicionante integer not null,
  surpresas_por_mes integer not null,
  contato text,
  tipo_contato text,
  respondido_em timestamptz not null default now(),
  usado_em timestamptz,
  usado_na_consultoria uuid references public.consultoria (id) on delete set null,
  constraint quiz_antes_do_grama_valores check (
    licencas_ativas between 0 and 100000
    and horas_semana_conferindo between 0 and 168
    and minutos_por_condicionante between 0 and 1440
    and surpresas_por_mes between 0 and 1000
  ),
  constraint quiz_antes_do_grama_contato check (
    (contato is null and tipo_contato is null)
    or (length(contato) between 6 and 254 and tipo_contato in ('email', 'whatsapp'))
  )
);

comment on table private.quiz_antes_do_grama is
  'Respostas do quiz "Antes do Grama" do site (ADR-0057). Viram a primeira linha_de_base da consultoria de quem tem o mesmo e-mail.';

create index quiz_antes_do_grama_contato_idx on private.quiz_antes_do_grama (contato, respondido_em desc)
  where contato is not null;

alter table private.quiz_antes_do_grama enable row level security;
alter table private.quiz_antes_do_grama force row level security;
revoke all on table private.quiz_antes_do_grama from public, anon, authenticated;

create table private.quiz_tentativa (
  origem text not null,
  criada_em timestamptz not null default now(),
  constraint quiz_tentativa_origem check (length(origem) = 32)
);

create index quiz_tentativa_origem_idx on private.quiz_tentativa (origem, criada_em);

alter table private.quiz_tentativa enable row level security;
alter table private.quiz_tentativa force row level security;
revoke all on table private.quiz_tentativa from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gravar as respostas (anon). Idempotente pelo id que o site gera: repetir com o mesmo id corrige
-- as respostas e acrescenta o contato, quando vier.
-- ---------------------------------------------------------------------------
create function public.responder_quiz_antes_do_grama(
  p_id uuid,
  p_licencas_ativas integer,
  p_horas_semana_conferindo numeric,
  p_minutos_por_condicionante integer,
  p_surpresas_por_mes integer,
  p_contato text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bruto text := btrim(coalesce(p_contato, ''));
  v_digitos text;
  v_contato text;
  v_tipo text;
  v_origem text;
begin
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if p_licencas_ativas is null or p_licencas_ativas not between 0 and 100000
     or p_horas_semana_conferindo is null or p_horas_semana_conferindo not between 0 and 168
     or p_minutos_por_condicionante is null or p_minutos_por_condicionante not between 0 and 1440
     or p_surpresas_por_mes is null or p_surpresas_por_mes not between 0 and 1000 then
    raise exception 'resposta_invalida' using errcode = '22023';
  end if;

  -- Contato opcional, validado e normalizado como na inscrição da lista de espera.
  if v_bruto <> '' then
    if position('@' in v_bruto) > 0 then
      v_contato := lower(v_bruto);
      if length(v_contato) > 254 or v_contato !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'contato_invalido' using errcode = '22023';
      end if;
      v_tipo := 'email';
    else
      v_digitos := regexp_replace(v_bruto, '\D', '', 'g');
      if length(v_digitos) in (10, 11) then
        v_digitos := '55' || v_digitos;
      end if;
      if v_digitos !~ '^55[1-9][0-9][0-9]{8,9}$' then
        raise exception 'contato_invalido' using errcode = '22023';
      end if;
      v_contato := v_digitos;
      v_tipo := 'whatsapp';
    end if;
  end if;

  -- Teto por origem: 20 envios por hora (correções contam). Serializado por origem.
  v_origem := private.origem_da_requisicao();
  if v_origem is not null then
    perform pg_advisory_xact_lock(hashtext('quiz:' || v_origem));
    delete from private.quiz_tentativa where criada_em < now() - interval '1 hour';
    if (select count(*) from private.quiz_tentativa as t
        where t.origem = v_origem and t.criada_em > now() - interval '1 hour') >= 20 then
      raise exception 'muitas_tentativas' using errcode = 'P0001';
    end if;
    insert into private.quiz_tentativa (origem) values (v_origem);
  end if;

  -- Teto global, só como proteção final.
  if (select count(*) from private.quiz_antes_do_grama where respondido_em > now() - interval '1 hour') >= 600 then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;

  insert into private.quiz_antes_do_grama (
    id, licencas_ativas, horas_semana_conferindo, minutos_por_condicionante, surpresas_por_mes,
    contato, tipo_contato)
  values (p_id, p_licencas_ativas, round(p_horas_semana_conferindo, 1), p_minutos_por_condicionante,
          p_surpresas_por_mes, v_contato, v_tipo)
  on conflict (id) do update
  set licencas_ativas = excluded.licencas_ativas,
      horas_semana_conferindo = excluded.horas_semana_conferindo,
      minutos_por_condicionante = excluded.minutos_por_condicionante,
      surpresas_por_mes = excluded.surpresas_por_mes,
      contato = coalesce(excluded.contato, private.quiz_antes_do_grama.contato),
      tipo_contato = coalesce(excluded.tipo_contato, private.quiz_antes_do_grama.tipo_contato),
      respondido_em = now()
  -- Depois de virar linha_de_base, não muda mais.
  where private.quiz_antes_do_grama.usado_em is null;
end;
$$;

comment on function public.responder_quiz_antes_do_grama(uuid, integer, numeric, integer, integer, text) is
  'Quiz "Antes do Grama" do site (ADR-0057): grava as 4 respostas sem login, com contato opcional.';

revoke all on function public.responder_quiz_antes_do_grama(uuid, integer, numeric, integer, integer, text)
  from public;
grant execute on function public.responder_quiz_antes_do_grama(uuid, integer, numeric, integer, integer, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Convite: a primeira Gestão da consultoria nova traz as respostas do quiz do mesmo e-mail.
-- ---------------------------------------------------------------------------
create function private.linha_de_base_do_quiz()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_quiz private.quiz_antes_do_grama%rowtype;
begin
  if new.papel <> 'gestao' or new.situacao <> 'ativo' then
    return new;
  end if;
  -- Só na criação da consultoria: a primeira pessoa e sem linha de base ainda.
  if exists (select 1 from public.membro as m
             where m.consultoria_id = new.consultoria_id and m.id <> new.id)
     or exists (select 1 from public.linha_de_base as l where l.consultoria_id = new.consultoria_id) then
    return new;
  end if;
  select lower(u.email) into v_email from auth.users as u where u.id = new.usuario_id;
  if v_email is null then
    return new;
  end if;
  select * into v_quiz from private.quiz_antes_do_grama as q
  where q.contato = v_email and q.tipo_contato = 'email' and q.usado_em is null
  order by q.respondido_em desc
  limit 1;
  if not found then
    return new;
  end if;

  insert into public.linha_de_base (consultoria_id, respondido_por, licencas_ativas,
                                    horas_semana_conferindo, minutos_por_condicionante,
                                    surpresas_por_mes, respondido_em)
  values (new.consultoria_id, new.id, v_quiz.licencas_ativas, v_quiz.horas_semana_conferindo,
          v_quiz.minutos_por_condicionante, v_quiz.surpresas_por_mes, v_quiz.respondido_em);
  update private.quiz_antes_do_grama as q
  set usado_em = now(), usado_na_consultoria = new.consultoria_id
  where q.id = v_quiz.id;
  return new;
end;
$$;

revoke all on function private.linha_de_base_do_quiz() from public, anon, authenticated;

create trigger membro_linha_de_base_do_quiz
  after insert on public.membro
  for each row execute function private.linha_de_base_do_quiz();
