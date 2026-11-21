-- Alvará vira vencimento (P4, ADR-0046). A conversão copia cada alvará para um vencimento do tipo
-- Alvará com o mesmo id, documento, anterior, exclusão e versão, e é idempotente. Depois dela, a
-- trigger de espelho mantém as RPCs antigas do alvará gravando no vencimento (mão única), nunca
-- desfaz a exclusão de um vencimento e recusa excluir um alvará já renovado como vencimento. A
-- fonte antiga do alvará fica vazia: o prazo não sai duplicado.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(24);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas)
-- A: E1 com U1. B: EB com UB, e o tipo Alvará de B renomeado para "Alvará municipal".
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('75300000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Supermercado Glória',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('75300000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Cerâmica Sulina',
   'd0000000-0000-4000-8000-0000000000b1');

insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('75300000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '75300000-0000-4000-8000-0000000000e1', 'Loja'),
  ('75300000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '75300000-0000-4000-8000-0000000000eb', 'Fábrica');

update public.tipo_vencimento set nome = 'Alvará municipal'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000b' and nome = 'Alvará';

insert into public.documento (id, consultoria_id, entidade) values
  ('75300000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-00000000000a', 'alvara'),
  ('75300000-0000-4000-8000-000000000302', 'c0000000-0000-4000-8000-00000000000a', 'alvara'),
  ('75300000-0000-4000-8000-000000000303', 'c0000000-0000-4000-8000-00000000000a', 'alvara'),
  ('75300000-0000-4000-8000-000000000309', 'c0000000-0000-4000-8000-00000000000b', 'alvara');

insert into storage.objects (bucket_id, name, metadata)
select 'arquivos', 'c0000000-0000-4000-8000-00000000000a/' || x.pasta || '/75300000-0000-4000-8000-0000000004'
       || x.n || '.pdf', '{"mimetype": "application/pdf", "size": 4096}'::jsonb
from (values ('alvara', '01'), ('alvara', '02'), ('alvara', '03'), ('vencimento', '04'), ('alvara', '05'))
  as x (pasta, n);

-- Alvará pela versão do PDF (lido sem RLS).
create function testes.alvara_753(versao uuid)
returns public.alvara
language sql
stable
security definer
set search_path = ''
as $$
  select a.* from public.alvara as a
  join public.documento_versao as v on v.consultoria_id = a.consultoria_id and v.documento_id = a.documento_id
  where v.id = versao
$$;

create function testes.vencimento_753(p_id uuid)
returns public.vencimento
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from public.vencimento as v where v.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 1. Conversão (os alvarás do beta já existiam antes da trigger)
-- AL2 renova AL1 (AL2 vem antes na lista: a ordem não importa); AL3 excluído; ALB em B.
-- ---------------------------------------------------------------------------
alter table public.alvara disable trigger alvara_espelhar_em_vencimento;

insert into public.alvara (id, consultoria_id, empreendimento_id, unidade_id, numero, orgao, notas, validade,
                           documento_id, anterior_id, criado_por, excluido_em, excluido_por, row_version)
values
  ('75300000-0000-4000-8000-000000000062', 'c0000000-0000-4000-8000-00000000000a',
   '75300000-0000-4000-8000-0000000000e1', '75300000-0000-4000-8000-0000000000f1', '200/2026',
   'Prefeitura de Joinville', 'Com vistoria', current_setting('testes.hoje')::date + 425,
   '75300000-0000-4000-8000-000000000302', '75300000-0000-4000-8000-000000000061',
   'd0000000-0000-4000-8000-0000000000a1', null, null, 3),
  ('75300000-0000-4000-8000-000000000061', 'c0000000-0000-4000-8000-00000000000a',
   '75300000-0000-4000-8000-0000000000e1', '75300000-0000-4000-8000-0000000000f1', '100/2025', null, null,
   current_setting('testes.hoje')::date + 60, '75300000-0000-4000-8000-000000000301', null,
   'd0000000-0000-4000-8000-0000000000a1', null, null, 1),
  ('75300000-0000-4000-8000-000000000063', 'c0000000-0000-4000-8000-00000000000a',
   '75300000-0000-4000-8000-0000000000e1', '75300000-0000-4000-8000-0000000000f1', null, null, null,
   current_setting('testes.hoje')::date + 3, '75300000-0000-4000-8000-000000000303', null,
   'd0000000-0000-4000-8000-0000000000a1', now(), 'd0000000-0000-4000-8000-0000000000a1', 2),
  ('75300000-0000-4000-8000-0000000000b6', 'c0000000-0000-4000-8000-00000000000b',
   '75300000-0000-4000-8000-0000000000eb', '75300000-0000-4000-8000-0000000000fb', '9/2026', null, null,
   current_setting('testes.hoje')::date + 15, '75300000-0000-4000-8000-000000000309', null,
   'd0000000-0000-4000-8000-0000000000b1', null, null, 1);

select is(
  (select count(*) from public.vencimento where id in ('75300000-0000-4000-8000-000000000061',
     '75300000-0000-4000-8000-000000000062', '75300000-0000-4000-8000-000000000063',
     '75300000-0000-4000-8000-0000000000b6')),
  0::bigint,
  'antes da conversão, os alvarás não são vencimentos'
);

select is(private.converter_alvaras_em_vencimentos(), 4, 'a conversão copia os quatro alvarás');

select is(
  (select count(*) from public.alvara as a
   join public.vencimento as v on v.id = a.id
   where v.consultoria_id = a.consultoria_id and v.empreendimento_id = a.empreendimento_id
     and v.unidade_id = a.unidade_id and v.instrumento_id is null
     and v.numero is not distinct from a.numero and v.orgao is not distinct from a.orgao
     and v.notas is not distinct from a.notas and v.valido_ate = a.validade
     and v.emitido_em is null and v.emitido_texto is null and v.validade_texto is null
     and v.antecedencia_dias = 60 and v.documento_id = a.documento_id
     and v.anterior_id is not distinct from a.anterior_id and v.criado_por = a.criado_por
     and v.criado_em = a.criado_em and v.excluido_em is not distinct from a.excluido_em
     and v.excluido_por is not distinct from a.excluido_por and v.row_version = a.row_version),
  4::bigint,
  'mesmo id, documento, anterior, autor, exclusão e versão; validade sem texto original e antecedência 60'
);

select results_eq(
  $$select v.consultoria_id, t.nome, t.exige_pdf, t.ativo
    from public.vencimento as v
    join public.tipo_vencimento as t on t.consultoria_id = v.consultoria_id and t.id = v.tipo_vencimento_id
    where v.id in ('75300000-0000-4000-8000-000000000061', '75300000-0000-4000-8000-0000000000b6')
    order by v.consultoria_id$$,
  $$values ('c0000000-0000-4000-8000-00000000000a'::uuid, 'Alvará'::text, true, true),
           ('c0000000-0000-4000-8000-00000000000b', 'Alvará', true, true)$$,
  'o tipo é o Alvará da consultoria (recriado onde a Gestão o renomeou)'
);

select is(private.converter_alvaras_em_vencimentos(), 0, 'converter de novo não duplica nada');

alter table public.alvara enable trigger alvara_espelhar_em_vencimento;

-- ---------------------------------------------------------------------------
-- 2. Prazo: uma linha por alvará vigente, pela fonte de vencimento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  (select count(*) from private.linhas_de_prazo_alvara('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'a fonte antiga do alvará fica vazia'
);

select results_eq(
  $$select tipo_linha, id, titulo from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('vencimento'::text, '75300000-0000-4000-8000-000000000062'::uuid, 'Alvará 200/2026'::text)$$,
  'só o vigente da série entra no prazo, uma vez, como vencimento'
);

-- ---------------------------------------------------------------------------
-- 3. Espelho das RPCs antigas
-- A Gestão de A muda a antecedência do tipo Alvará para 90: o alvará novo do front antigo a copia.
-- ---------------------------------------------------------------------------
select public.editar_tipo_vencimento(t.id, t.nome, 90, t.exige_pdf, t.ativo)
from public.tipo_vencimento as t
where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.nome = 'Alvará';

select lives_ok(
  $$select public.registrar_alvara('75300000-0000-4000-8000-0000000000f1', current_date + 200,
      '75300000-0000-4000-8000-000000000401',
      'c0000000-0000-4000-8000-00000000000a/alvara/75300000-0000-4000-8000-000000000401.pdf',
      'alvara.pdf', repeat('a', 64), ' 500/2026 ', 'Prefeitura de Joinville')$$,
  'o front antigo registra alvará'
);

select results_eq(
  $$select t.nome, (v).numero, (v).orgao, (v).valido_ate - current_date, (v).documento_id = (a).documento_id,
           (v).row_version, (v).anterior_id, (v).criado_por
    from (select testes.alvara_753('75300000-0000-4000-8000-000000000401') as a) as x
    cross join lateral (select testes.vencimento_753((x.a).id) as v) as y
    join public.tipo_vencimento as t on t.id = (y.v).tipo_vencimento_id$$,
  $$values ('Alvará'::text, '500/2026'::text, 'Prefeitura de Joinville'::text, 200, true, 1, null::uuid,
            'd0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'registrar_alvara cria o vencimento de mesmo id, com o mesmo documento'
);

select is(
  (testes.vencimento_753((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id)).antecedencia_dias,
  90,
  'o vencimento do alvará novo copia a antecedência do tipo Alvará (não um 60 fixo)'
);

select is(
  public.editar_alvara((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id, 1, current_date + 210,
    '500/2026', 'Prefeitura de Joinville', 'Vistoria junto'),
  2,
  'o front antigo edita o alvará'
);

select results_eq(
  $$select (v).valido_ate - current_date, (v).notas, (v).row_version
    from (select testes.vencimento_753((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id) as v) as x$$,
  $$values (210, 'Vistoria junto'::text, 2)$$,
  'editar_alvara chega ao vencimento'
);

select lives_ok(
  $$select public.trocar_pdf_alvara((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id,
      '75300000-0000-4000-8000-000000000402',
      'c0000000-0000-4000-8000-00000000000a/alvara/75300000-0000-4000-8000-000000000402.pdf',
      'alvara-corrigido.pdf', repeat('b', 64))$$,
  'o front antigo troca o PDF'
);

select results_eq(
  $$select (v).row_version, d.versao_vigente_id
    from (select testes.vencimento_753((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id) as v) as x
    join public.documento as d on d.id = (x.v).documento_id$$,
  $$values (3, '75300000-0000-4000-8000-000000000402'::uuid)$$,
  'trocar_pdf_alvara: o vencimento vê o PDF novo no mesmo documento e a versão anda'
);

select lives_ok(
  $$select public.registrar_alvara('75300000-0000-4000-8000-0000000000f1', current_date + 600,
      '75300000-0000-4000-8000-000000000403',
      'c0000000-0000-4000-8000-00000000000a/alvara/75300000-0000-4000-8000-000000000403.pdf',
      'alvara-2027.pdf', repeat('c', 64), '600/2027', null, null,
      (testes.alvara_753('75300000-0000-4000-8000-000000000401')).id)$$,
  'o front antigo renova o alvará'
);

select lives_ok(
  $$select public.excluir_alvara((testes.alvara_753('75300000-0000-4000-8000-000000000403')).id, 1)$$,
  'o front antigo exclui a renovação'
);

select results_eq(
  $$select (n).anterior_id, (n).excluido_por, (n).excluido_em is not null
    from (select testes.vencimento_753((testes.alvara_753('75300000-0000-4000-8000-000000000403')).id) as n) as x$$,
  $$values ((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id,
            'd0000000-0000-4000-8000-0000000000a1'::uuid, true)$$,
  'renovação e exclusão pelo front antigo chegam ao vencimento'
);

-- ---------------------------------------------------------------------------
-- 4. O espelho nunca desfaz a exclusão de um vencimento
-- ---------------------------------------------------------------------------
select public.excluir_vencimento((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id, 3);

select is(
  public.editar_alvara((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id, 3, current_date + 999),
  4,
  'o front antigo ainda edita o alvará cujo vencimento foi excluído'
);

select results_eq(
  $$select (v).excluido_em is not null, (v).valido_ate - current_date, (v).row_version
    from (select testes.vencimento_753((testes.alvara_753('75300000-0000-4000-8000-000000000401')).id) as v) as x$$,
  $$values (true, 210, 4)$$,
  'o vencimento excluído continua excluído e não muda'
);

-- ---------------------------------------------------------------------------
-- 5. Renovado no front novo: o front antigo não exclui nem renova de novo
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.renovar_vencimento('75300000-0000-4000-8000-0000000000a1', '75300000-0000-4000-8000-000000000062',
      3, current_date + 800, p_numero => '800/2028', p_versao_id => '75300000-0000-4000-8000-000000000404',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75300000-0000-4000-8000-000000000404.pdf',
      p_nome_original => 'alvara-2028.pdf', p_sha256 => repeat('d', 64))$$,
  'o front novo renova o alvará convertido'
);

select throws_ok(
  $$select public.excluir_alvara('75300000-0000-4000-8000-000000000062', 3)$$,
  'P0001', 'vencimento_ja_renovado',
  'o front antigo não exclui alvará já renovado como vencimento'
);

select throws_ok(
  $$select public.registrar_alvara('75300000-0000-4000-8000-0000000000f1', current_date + 900,
      '75300000-0000-4000-8000-000000000405',
      'c0000000-0000-4000-8000-00000000000a/alvara/75300000-0000-4000-8000-000000000405.pdf',
      'outro.pdf', repeat('e', 64), null, null, null, '75300000-0000-4000-8000-000000000062')$$,
  '23505', null,
  'o front antigo não dá um segundo sucessor ao alvará já renovado como vencimento'
);

select is(
  (select count(*) from public.alvara where id = '75300000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'mão única: a renovação feita no vencimento não cria alvará'
);

-- ---------------------------------------------------------------------------
-- 6. Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select results_eq(
  $$select consultoria_id, count(*) from public.vencimento
    where id in ('75300000-0000-4000-8000-000000000061', '75300000-0000-4000-8000-000000000062',
                 '75300000-0000-4000-8000-000000000063', '75300000-0000-4000-8000-0000000000b6')
    group by consultoria_id$$,
  $$values ('c0000000-0000-4000-8000-00000000000b'::uuid, 1::bigint)$$,
  'Gestão de B vê só o próprio alvará convertido, nenhum de A'
);

select * from finish();

rollback;
