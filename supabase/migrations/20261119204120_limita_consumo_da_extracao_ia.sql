-- Cota da extração por IA. Porte da migration 20261117192451_limita_consumo_da_extracao_ia.sql do
-- PR #24 (fix/seguranca-piloto), mesmo desenho e mesmos limites, para os dois PRs convergirem.
-- Escrita para rodar também depois daquela (if not exists / create or replace): se o PR #24 entrar
-- antes, esta só confirma o que já existe.
--
-- Antes: extrair → descartar todos os itens (revisao = 'descartada') → extrair de novo não tinha
-- limite, e uma falha podia ser repetida na hora; cada vez, uma chamada paga ao provedor.
-- Agora só a Edge Function reserva uma chamada paga, uma vez por extração, depois de validar o PDF.
-- A reserva conta mesmo se o provedor falhar, se o custo ficar desconhecido ou se os itens forem
-- descartados depois. Em 24 horas: 10 por conta, 25 por consultoria, 100 no projeto todo, e no
-- máximo 4 ao mesmo tempo. Sem cota, a extração falha com 'limite_atingido' e o cadastro manual
-- continua disponível. Os limites ficam numa linha só (private.limite_extracao_ia), ajustável por
-- migration ou pelo SQL do projeto.
-- Também aceita o motivo 'pdf_texto_longo_demais': PDF dentro de 10 MB e 300 páginas cujo texto
-- passa do limite de caracteres que vai ao modelo (antes caía em 'pdf_grande_demais').
create table if not exists private.limite_extracao_ia (
  unica boolean primary key default true check (unica),
  por_conta integer not null default 10 check (por_conta >= 0),
  por_consultoria integer not null default 25 check (por_consultoria >= 0),
  por_projeto integer not null default 100 check (por_projeto >= 0),
  simultaneas integer not null default 4 check (simultaneas >= 0),
  ultima_verificacao timestamptz not null default now()
);

alter table private.limite_extracao_ia enable row level security;
alter table private.limite_extracao_ia force row level security;
revoke all on table private.limite_extracao_ia from public, anon, authenticated;
insert into private.limite_extracao_ia default values on conflict (unica) do nothing;

create table if not exists private.reserva_extracao_ia (
  extracao_id uuid primary key references public.extracao_ia (id) on delete restrict,
  reservada_em timestamptz not null
);

alter table private.reserva_extracao_ia enable row level security;
alter table private.reserva_extracao_ia force row level security;
revoke all on table private.reserva_extracao_ia from public, anon, authenticated;

create index if not exists reserva_extracao_ia_data_idx on private.reserva_extracao_ia (reservada_em);

alter table public.extracao_ia drop constraint extracao_ia_motivo_valido;
alter table public.extracao_ia
  add constraint extracao_ia_motivo_valido check (motivo is null or motivo in (
    'pdf_sem_texto', 'pdf_grande_demais', 'pdf_texto_longo_demais', 'provedor_indisponivel',
    'provedor_recusou', 'tempo_esgotado', 'resposta_invalida', 'configuracao_ausente', 'erro_interno',
    'limite_atingido'
  ));

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
  uso_conta bigint;
  uso_consultoria bigint;
  uso_projeto bigint;
  em_andamento bigint;
begin
  -- Toda reserva disputa a mesma linha. A escrita evita aceitar uma fotografia antiga
  -- em transações com isolamento acima de READ COMMITTED.
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

  if not found or exists (
    select 1 from private.reserva_extracao_ia as r where r.extracao_id = p_id
  ) then
    return false;
  end if;

  select
    count(*) filter (where m.usuario_id = alvo_usuario),
    count(*) filter (where x.consultoria_id = alvo_consultoria),
    count(*),
    count(*) filter (
      where x.situacao = 'em_andamento'
        and r.reservada_em > limites.ultima_verificacao - interval '3 minutes'
    )
  into uso_conta, uso_consultoria, uso_projeto, em_andamento
  from private.reserva_extracao_ia as r
  join public.extracao_ia as x on x.id = r.extracao_id
  join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.solicitada_por
  where r.reservada_em > limites.ultima_verificacao - interval '24 hours';

  if uso_conta >= limites.por_conta or uso_consultoria >= limites.por_consultoria
     or uso_projeto >= limites.por_projeto or em_andamento >= limites.simultaneas then
    return false;
  end if;

  insert into private.reserva_extracao_ia (extracao_id, reservada_em)
  values (p_id, limites.ultima_verificacao);
  return true;
end;
$$;

revoke all on function public.reservar_extracao_ia(uuid) from public, anon, authenticated;
grant execute on function public.reservar_extracao_ia(uuid) to service_role;
