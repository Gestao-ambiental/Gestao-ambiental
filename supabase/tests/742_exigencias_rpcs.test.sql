-- Exigências do órgão (P3, ADR-0045): RPCs. Só a Gestão registra, edita, prorroga, atribui e
-- exclui; a Equipe responde e anexa só quando é a responsável. Registrar, responder, anexar e
-- prorrogar repetidos não duplicam. A primeira resposta encerra; as seguintes só acrescentam.
-- prazo_oficial_original nunca muda; exigencia_resposta só acrescenta, mesmo para o dono.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(92);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- Hoje da consultoria + n dias.
create function testes.h(n integer)
returns date
language sql
stable
as $$
  select current_setting('testes.hoje')::date + n
$$;

-- Exigência lida sem RLS.
create function testes.exig(p_id uuid)
returns public.exigencia
language sql
stable
security definer
set search_path = ''
as $$
  select x.* from public.exigencia as x where x.id = p_id
$$;

grant execute on function testes.h(integer) to authenticated;
grant execute on function testes.exig(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cenário: empreendimento com duas unidades, licença LAO na Matriz e PDFs enviados.
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('74200000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
  'Cerâmica Rio Novo');
select public.criar_unidade('74200000-0000-4000-8000-0000000000f1', '74200000-0000-4000-8000-0000000000e1',
  'Matriz');
select public.criar_unidade('74200000-0000-4000-8000-0000000000f2', '74200000-0000-4000-8000-0000000000e1',
  'Depósito');

reset role;
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
select '74200000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-00000000000a',
       '74200000-0000-4000-8000-0000000000e1', '74200000-0000-4000-8000-0000000000f1', t.id, '742/2026',
       'd0000000-0000-4000-8000-0000000000a1'
from public.tipo_instrumento as t
where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO';

insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/exigencia/74200000-0000-4000-8000-0000000000c1.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c2.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c3.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c4.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/exigencia/74200000-0000-4000-8000-0000000000c5.png',
   '{"mimetype": "image/png", "size": 1024}');

-- ---------------------------------------------------------------------------
-- Registrar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Equipe', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '42501', 'sem_permissao',
  'Equipe não registra exigência'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => '   ', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'assunto_obrigatorio', 'assunto vazio é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => repeat('a', 301), p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'texto_longo_demais', 'assunto acima de 300 caracteres é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Sem data', p_recebido_em => null, p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'data_de_recebimento_obrigatoria', 'recebimento é obrigatório'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Futuro', p_recebido_em => testes.h(1), p_prazo_oficial => testes.h(31),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'data_de_recebimento_futura', 'recebimento no futuro é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Sem prazo', p_recebido_em => testes.h(-10), p_prazo_oficial => null,
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'prazo_obrigatorio', 'prazo é obrigatório'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Sem contagem', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30)$$,
  '22023', 'prazo_incompleto', 'dias sem a contagem é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Zero dias', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(-10),
      p_meta_interna => testes.h(-10), p_prazo_dias => 0, p_prazo_contagem => 'corridos')$$,
  '22023', 'prazo_invalido', 'zero dias é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Prazo errado', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(21),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'prazo_divergente', 'prazo diferente do calculado no banco é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Data sem texto', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_oficial_texto => '  ')$$,
  '22023', 'texto_do_prazo_obrigatorio', 'prazo informado exige o texto original'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Data igual', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(-10),
      p_meta_interna => testes.h(-10), p_prazo_oficial_texto => 'no mesmo dia')$$,
  '22023', 'prazo_antes_do_recebimento', 'prazo informado no dia do recebimento é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Sem meta', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => null, p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'meta_interna_obrigatoria', 'meta interna é obrigatória'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Meta depois', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(21), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'meta_interna_invalida', 'meta depois do prazo é recusada'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Meta antes', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(-11), p_prazo_dias => 30, p_prazo_contagem => 'corridos')$$,
  '22023', 'meta_interna_invalida', 'meta antes do recebimento é recusada'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'PDF pela metade', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos',
      p_versao_id => '74200000-0000-4000-8000-0000000000c1')$$,
  '22023', 'pdf_incompleto', 'PDF sem caminho, nome e hash é recusado'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Imagem', p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20),
      p_meta_interna => testes.h(15), p_prazo_dias => 30, p_prazo_contagem => 'corridos',
      p_versao_id => '74200000-0000-4000-8000-0000000000c5',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/exigencia/74200000-0000-4000-8000-0000000000c5.png',
      p_nome_original => 'foto.png', p_sha256 => repeat('a', 64))$$,
  '22023', 'caminho_invalido', 'arquivo que não é PDF é recusado'
);

select lives_ok(
  $$select public.registrar_exigencia(p_id => '74200000-0000-4000-8000-0000000000a1',
      p_unidade_id => '74200000-0000-4000-8000-0000000000f1', p_assunto => ' Complementação do EIA ',
      p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20), p_meta_interna => testes.h(15),
      p_recebido_em_texto => ' dez dias atrás ', p_prazo_dias => 30, p_prazo_contagem => 'corridos',
      p_instrumento_id => '74200000-0000-4000-8000-000000000011', p_numero_oficio => ' 12/2026 ',
      p_orgao => 'IMA', p_numero_processo => 'PROC-1', p_notas => '   ',
      p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a2')$$,
  'Gestão registra exigência com prazo em dias, licença e responsável'
);

select results_eq(
  $$select (x).prazo_oficial_original, (x).prazo_oficial, (x).situacao, (x).empreendimento_id, (x).assunto,
           (x).numero_oficio, (x).notas, (x).recebido_em_texto, (x).prazo_dias, (x).documento_id, (x).row_version,
           (x).criado_por
    from (select testes.exig('74200000-0000-4000-8000-0000000000a1') as x) as s$$,
  $$values (testes.h(20), testes.h(20), 'aberta'::text, '74200000-0000-4000-8000-0000000000e1'::uuid,
            'Complementação do EIA'::text, '12/2026'::text, null::text, 'dez dias atrás'::text, 30, null::uuid, 1,
            'd0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'prazo original = prazo, aberta, empreendimento da unidade, textos aparados, vazio vira nulo'
);

select is(
  public.registrar_exigencia(p_id => '74200000-0000-4000-8000-0000000000a1',
    p_unidade_id => '74200000-0000-4000-8000-0000000000f1', p_assunto => 'Outro assunto',
    p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(20), p_meta_interna => testes.h(15),
    p_prazo_dias => 30, p_prazo_contagem => 'corridos'),
  '74200000-0000-4000-8000-0000000000a1'::uuid,
  'repetir com o mesmo id devolve a mesma exigência'
);

select results_eq(
  $$select count(*), min(assunto) from public.exigencia where id = '74200000-0000-4000-8000-0000000000a1'$$,
  $$values (1::bigint, 'Complementação do EIA'::text)$$,
  'repetir não duplica nem muda nada'
);

select lives_ok(
  $$select public.registrar_exigencia(p_id => '74200000-0000-4000-8000-0000000000a4',
      p_unidade_id => '74200000-0000-4000-8000-0000000000f2', p_assunto => 'Esclarecer outorga',
      p_recebido_em => testes.h(-5), p_prazo_oficial => testes.h(10), p_meta_interna => testes.h(9),
      p_prazo_oficial_texto => ' até 15 dias da ciência ')$$,
  'Gestão registra exigência com o prazo informado pelo órgão'
);

select results_eq(
  $$select (x).prazo_dias, (x).prazo_contagem, (x).prazo_oficial_texto, (x).prazo_oficial
    from (select testes.exig('74200000-0000-4000-8000-0000000000a4') as x) as s$$,
  $$values (null::integer, null::public.contagem_prazo, 'até 15 dias da ciência'::text, testes.h(10))$$,
  'prazo informado guarda a data e o texto original, sem dias'
);

select lives_ok(
  $$select public.registrar_exigencia(p_id => '74200000-0000-4000-8000-0000000000a5',
      p_unidade_id => '74200000-0000-4000-8000-0000000000f1', p_assunto => 'Monitoramento de efluentes',
      p_recebido_em => testes.h(-5), p_prazo_oficial => testes.h(5), p_meta_interna => testes.h(4),
      p_prazo_dias => 10, p_prazo_contagem => 'corridos',
      p_versao_id => '74200000-0000-4000-8000-0000000000c1',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/exigencia/74200000-0000-4000-8000-0000000000c1.pdf',
      p_nome_original => ' oficio.pdf ', p_sha256 => repeat('B', 64))$$,
  'Gestão registra exigência com o PDF do ofício'
);

select results_eq(
  $$select oficio_caminho, oficio_nome from public.listar_exigencias(
      p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a', p_exigencia_id => '74200000-0000-4000-8000-0000000000a5')$$,
  $$values ('c0000000-0000-4000-8000-00000000000a/exigencia/74200000-0000-4000-8000-0000000000c1.pdf'::text,
            'oficio.pdf'::text)$$,
  'o detalhe traz o PDF vigente do ofício'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(), p_unidade_id => '74200000-0000-4000-8000-0000000000f1',
      p_assunto => 'Mesma versão', p_recebido_em => testes.h(-5), p_prazo_oficial => testes.h(5),
      p_meta_interna => testes.h(4), p_prazo_dias => 10, p_prazo_contagem => 'corridos',
      p_versao_id => '74200000-0000-4000-8000-0000000000c1',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/exigencia/74200000-0000-4000-8000-0000000000c1.pdf',
      p_nome_original => 'oficio.pdf', p_sha256 => repeat('b', 64))$$,
  'P0001', 'versao_existente', 'versão de PDF de outra exigência é recusada'
);

select lives_ok(
  $$select public.registrar_exigencia(p_id => '74200000-0000-4000-8000-0000000000a2',
      p_unidade_id => '74200000-0000-4000-8000-0000000000f1', p_assunto => 'Inventário de fauna',
      p_recebido_em => testes.h(-2), p_prazo_oficial => testes.h(3), p_meta_interna => testes.h(2),
      p_prazo_dias => 5, p_prazo_contagem => 'corridos')$$,
  'Gestão registra a exigência que será prorrogada'
);

select lives_ok(
  $$select public.registrar_exigencia(p_id => '74200000-0000-4000-8000-0000000000a3',
      p_unidade_id => '74200000-0000-4000-8000-0000000000f1', p_assunto => 'Registrada por engano',
      p_recebido_em => testes.h(-1), p_prazo_oficial => testes.h(4), p_meta_interna => testes.h(3),
      p_prazo_dias => 5, p_prazo_contagem => 'corridos')$$,
  'Gestão registra a exigência que será excluída'
);

-- ---------------------------------------------------------------------------
-- Editar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.editar_exigencia(p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_row_version => 1,
      p_assunto => 'Equipe', p_meta_interna => testes.h(15))$$,
  '42501', 'sem_permissao', 'Equipe não edita, nem a responsável'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.editar_exigencia(p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_row_version => 9,
      p_assunto => 'Velha', p_meta_interna => testes.h(15))$$,
  'P0001', 'conflito_de_versao', 'editar com versão velha é recusado'
);

select throws_ok(
  $$select public.editar_exigencia(p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_row_version => 1,
      p_assunto => 'Meta ruim', p_meta_interna => testes.h(21))$$,
  '22023', 'meta_interna_invalida', 'editar não aceita meta depois do prazo'
);

select is(
  public.editar_exigencia(p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_row_version => 1,
    p_assunto => '  Complementação do EIA ', p_meta_interna => testes.h(15), p_numero_oficio => '12/2026',
    p_orgao => 'IMA', p_numero_processo => 'PROC-1', p_notas => ''),
  1,
  'editar sem mudança devolve a mesma versão'
);

select is(
  public.editar_exigencia(p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_row_version => 1,
    p_assunto => 'Complementação do EIA/RIMA', p_meta_interna => testes.h(14), p_numero_oficio => '12/2026',
    p_orgao => 'IMA', p_numero_processo => 'PROC-1', p_notas => 'Ver capítulo 4'),
  2,
  'editar com mudança devolve a versão seguinte'
);

select results_eq(
  $$select (x).assunto, (x).meta_interna, (x).notas, (x).prazo_oficial
    from (select testes.exig('74200000-0000-4000-8000-0000000000a1') as x) as s$$,
  $$values ('Complementação do EIA/RIMA'::text, testes.h(14), 'Ver capítulo 4'::text, testes.h(20))$$,
  'editar muda textos e meta, não o prazo'
);

-- ---------------------------------------------------------------------------
-- Atribuir
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.atribuir_exigencia('74200000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000a2', 1)$$,
  '42501', 'sem_permissao', 'Equipe não atribui'
);

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.atribuir_exigencia('74200000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000a3', 1),
  2,
  'Gestão atribui a exigência ao Bruno'
);

select throws_ok(
  $$select public.atribuir_exigencia('74200000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000a2', 1)$$,
  'P0001', 'conflito_de_versao', 'atribuir com versão velha é recusado'
);

select is(
  public.atribuir_exigencia('74200000-0000-4000-8000-0000000000a2', null, 2),
  3,
  'Gestão tira o responsável'
);

-- ---------------------------------------------------------------------------
-- Responder (Ana é a responsável pela a1)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(-1),
      p_protocolo_numero => 'BRUNO')$$,
  '42501', 'sem_permissao', 'Equipe que não é a responsável não responde'
);

select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => null, p_protocolo_numero => 'X')$$,
  '22023', 'data_do_protocolo_obrigatoria', 'resposta sem data do protocolo é recusada'
);

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(1),
      p_protocolo_numero => 'X')$$,
  '22023', 'data_do_protocolo_futura', 'protocolo no futuro é recusado'
);

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(-11),
      p_protocolo_numero => 'X')$$,
  '22023', 'protocolo_antes_do_recebimento', 'protocolo antes do recebimento é recusado'
);

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(-1),
      p_protocolo_numero => '  ')$$,
  '22023', 'resposta_sem_comprovante', 'resposta sem número e sem PDF é recusada'
);

select is(
  public.responder_exigencia(p_resposta_id => '74200000-0000-4000-8000-0000000000b1',
    p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(-1),
    p_protocolado_em_texto => 'ontem', p_protocolo_numero => ' PROT-77 '),
  3,
  'a responsável registra a resposta e a exigência sobe de versão'
);

select is(
  (testes.exig('74200000-0000-4000-8000-0000000000a1')).situacao,
  'respondida',
  'a primeira resposta encerra a exigência'
);

select is(
  public.responder_exigencia(p_resposta_id => '74200000-0000-4000-8000-0000000000b1',
    p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(-1),
    p_protocolo_numero => 'PROT-77'),
  3,
  'repetir a resposta devolve a versão atual sem duplicar'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => '74200000-0000-4000-8000-0000000000b1',
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_protocolado_em => testes.h(-1),
      p_protocolo_numero => 'PROT-77')$$,
  'P0001', 'resposta_existente', 'o id de uma resposta não serve para outra exigência'
);

select is(
  public.responder_exigencia(p_resposta_id => '74200000-0000-4000-8000-0000000000b2',
    p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_protocolado_em => testes.h(0),
    p_descricao => 'Complementação', p_versao_id => '74200000-0000-4000-8000-0000000000c2',
    p_caminho => 'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c2.pdf',
    p_nome_original => 'resposta.pdf', p_sha256 => repeat('c', 64)),
  3,
  'a segunda resposta (complementação, só com PDF) não muda a versão'
);

select results_eq(
  $$select tipo, protocolo_numero, protocolado_em, documento_id is not null
    from public.exigencia_resposta where exigencia_id = '74200000-0000-4000-8000-0000000000a1' order by id$$,
  $$values ('resposta'::text, 'PROT-77'::text, testes.h(-1), false), ('resposta', null, testes.h(0), true)$$,
  'a segunda resposta não apaga a primeira'
);

select results_eq(
  $$select situacao, primeira_resposta_em, respostas from public.listar_exigencias(
      p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a', p_exigencia_id => '74200000-0000-4000-8000-0000000000a1')$$,
  $$values ('respondida'::text, testes.h(-1), 2::bigint)$$,
  'o detalhe traz a data da primeira resposta e o tamanho do histórico'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo, protocolo_numero, documento_caminho, registrado_por_nome
    from public.listar_respostas_da_exigencia('74200000-0000-4000-8000-0000000000a1')$$,
  $$values ('resposta'::text, 'PROT-77'::text, null::text, 'Ana Ribeiro'::text),
           ('resposta', null,
            'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c2.pdf',
            'Eduardo Karnopp')$$,
  'a Equipe lê o histórico com o PDF e o autor'
);

-- ---------------------------------------------------------------------------
-- Anexar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.anexar_a_exigencia(gen_random_uuid(), '74200000-0000-4000-8000-0000000000a1', 'Anexo',
      '74200000-0000-4000-8000-0000000000c3',
      'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c3.pdf',
      'anexo.pdf', repeat('d', 64))$$,
  '42501', 'sem_permissao', 'Equipe que não é a responsável não anexa'
);

select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.anexar_a_exigencia(gen_random_uuid(), '74200000-0000-4000-8000-0000000000a1', '  ',
      '74200000-0000-4000-8000-0000000000c3',
      'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c3.pdf',
      'anexo.pdf', repeat('d', 64))$$,
  '22023', 'descricao_obrigatoria', 'anexo sem descrição é recusado'
);

select throws_ok(
  $$select public.anexar_a_exigencia(gen_random_uuid(), '74200000-0000-4000-8000-0000000000a1', 'Sem PDF',
      null, null, null, null)$$,
  '22023', 'pdf_incompleto', 'anexo sem PDF é recusado'
);

select is(
  public.anexar_a_exigencia('74200000-0000-4000-8000-0000000000b3', '74200000-0000-4000-8000-0000000000a1',
    ' Comprovante de entrega ', '74200000-0000-4000-8000-0000000000c3',
    'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c3.pdf',
    'anexo.pdf', repeat('d', 64)),
  '74200000-0000-4000-8000-0000000000b3'::uuid,
  'a responsável anexa um PDF ao histórico'
);

select results_eq(
  $$select public.anexar_a_exigencia('74200000-0000-4000-8000-0000000000b3', '74200000-0000-4000-8000-0000000000a1',
      'Comprovante de entrega', '74200000-0000-4000-8000-0000000000c3',
      'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c3.pdf',
      'anexo.pdf', repeat('d', 64)),
    (select count(*) from public.exigencia_resposta where exigencia_id = '74200000-0000-4000-8000-0000000000a1'),
    (testes.exig('74200000-0000-4000-8000-0000000000a1')).row_version$$,
  $$values ('74200000-0000-4000-8000-0000000000b3'::uuid, 3::bigint, 3)$$,
  'repetir o anexo não duplica e anexar não muda a exigência'
);

-- ---------------------------------------------------------------------------
-- Prorrogar (a2: aberta, versão 3, prazo h+3, meta h+2, recebida em h-2)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 3, p_prazo_novo => testes.h(30),
      p_meta_interna => testes.h(28), p_motivo => 'Equipe')$$,
  '42501', 'sem_permissao', 'Equipe não prorroga'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 3, p_prazo_novo => testes.h(3),
      p_meta_interna => testes.h(2), p_motivo => 'Mesmo prazo')$$,
  '22023', 'prorrogacao_invalida', 'prorrogar para o mesmo prazo é recusado'
);

select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 3, p_prazo_novo => testes.h(30),
      p_meta_interna => testes.h(28), p_motivo => '   ')$$,
  '22023', 'motivo_obrigatorio', 'prorrogar sem motivo é recusado'
);

select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 3, p_prazo_novo => testes.h(30),
      p_meta_interna => testes.h(31), p_motivo => 'Meta ruim')$$,
  '22023', 'meta_interna_invalida', 'meta depois do prazo novo é recusada'
);

select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 1, p_prazo_novo => testes.h(30),
      p_meta_interna => testes.h(28), p_motivo => 'Versão velha')$$,
  'P0001', 'conflito_de_versao', 'prorrogar com versão velha é recusado'
);

select is(
  public.prorrogar_exigencia(p_resposta_id => '74200000-0000-4000-8000-0000000000b4',
    p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 3, p_prazo_novo => testes.h(30),
    p_meta_interna => testes.h(28), p_motivo => ' Órgão concedeu mais 27 dias ',
    p_prazo_novo_texto => 'mais 27 dias', p_versao_id => '74200000-0000-4000-8000-0000000000c4',
    p_caminho => 'c0000000-0000-4000-8000-00000000000a/exigencia_resposta/74200000-0000-4000-8000-0000000000c4.pdf',
    p_nome_original => 'deferimento.pdf', p_sha256 => repeat('e', 64)),
  4,
  'Gestão prorroga e a exigência sobe de versão'
);

select results_eq(
  $$select (x).prazo_oficial, (x).prazo_oficial_original, (x).meta_interna, (x).situacao
    from (select testes.exig('74200000-0000-4000-8000-0000000000a2') as x) as s$$,
  $$values (testes.h(30), testes.h(3), testes.h(28), 'aberta'::text)$$,
  'a prorrogação muda o prazo e a meta e mantém o prazo original'
);

select results_eq(
  $$select tipo, prazo_anterior, prazo_novo, prazo_novo_texto, meta_interna_anterior, meta_interna_nova, motivo,
           documento_id is not null
    from public.exigencia_resposta where id = '74200000-0000-4000-8000-0000000000b4'$$,
  $$values ('prorrogacao'::text, testes.h(3), testes.h(30), 'mais 27 dias'::text, testes.h(2), testes.h(28),
            'Órgão concedeu mais 27 dias'::text, true)$$,
  'a prorrogação fica no histórico com o prazo anterior, o novo e o motivo'
);

select is(
  public.prorrogar_exigencia(p_resposta_id => '74200000-0000-4000-8000-0000000000b4',
    p_exigencia_id => '74200000-0000-4000-8000-0000000000a2', p_row_version => 3, p_prazo_novo => testes.h(30),
    p_meta_interna => testes.h(28), p_motivo => 'Órgão concedeu mais 27 dias'),
  4,
  'repetir a prorrogação com a versão de antes devolve a versão atual'
);

select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a1', p_row_version => 3, p_prazo_novo => testes.h(60),
      p_meta_interna => testes.h(50), p_motivo => 'Já respondida')$$,
  'P0001', 'exigencia_respondida', 'exigência respondida não é prorrogada'
);

select throws_ok(
  $$select public.atribuir_exigencia('74200000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a3', 3)$$,
  'P0001', 'exigencia_respondida', 'exigência respondida não muda de responsável'
);

-- ---------------------------------------------------------------------------
-- Travas, mesmo como dono das tabelas
-- ---------------------------------------------------------------------------
reset role;

select throws_ok(
  $$update public.exigencia set prazo_oficial_original = prazo_oficial_original + 1
    where id = '74200000-0000-4000-8000-0000000000a2'$$,
  'P0001', 'prazo_oficial_original não muda',
  'update direto em prazo_oficial_original falha'
);

select throws_ok(
  $$update public.exigencia set situacao = 'aberta' where id = '74200000-0000-4000-8000-0000000000a1'$$,
  'P0001', 'exigencia_respondida',
  'respondida não volta a aberta'
);

select throws_ok(
  $$update public.exigencia set recebido_em = recebido_em - 1 where id = '74200000-0000-4000-8000-0000000000a2'$$,
  'P0001', 'campo_imutavel',
  'a data de recebimento não muda'
);

select throws_ok(
  $$update public.exigencia_resposta set motivo = 'outro' where id = '74200000-0000-4000-8000-0000000000b4'$$,
  '42501', 'exigencia_resposta é append-only: UPDATE não é permitido',
  'update em exigencia_resposta falha, mesmo como dono'
);

select throws_ok(
  $$delete from public.exigencia_resposta where id = '74200000-0000-4000-8000-0000000000b1'$$,
  '42501', 'exigencia_resposta é append-only: DELETE não é permitido',
  'delete em exigencia_resposta falha, mesmo como dono'
);

select throws_ok(
  $$truncate public.exigencia_resposta$$,
  '42501', 'exigencia_resposta é append-only: TRUNCATE não é permitido',
  'truncate em exigencia_resposta falha, mesmo como dono'
);

-- ---------------------------------------------------------------------------
-- Excluir
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.excluir_exigencia('74200000-0000-4000-8000-0000000000a3', 1)$$,
  '42501', 'sem_permissao', 'Equipe não exclui'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.excluir_exigencia('74200000-0000-4000-8000-0000000000a1', 3)$$,
  'P0001', 'exigencia_com_respostas', 'exigência com histórico não é excluída'
);

select throws_ok(
  $$select public.excluir_exigencia('74200000-0000-4000-8000-0000000000a3', 9)$$,
  'P0001', 'conflito_de_versao', 'excluir com versão velha é recusado'
);

select lives_ok(
  $$select public.excluir_exigencia('74200000-0000-4000-8000-0000000000a3', 1)$$,
  'Gestão exclui exigência sem histórico'
);

select lives_ok(
  $$select public.excluir_exigencia('74200000-0000-4000-8000-0000000000a3', 1)$$,
  'repetir a exclusão é inofensivo'
);

select throws_ok(
  $$select public.editar_exigencia(p_exigencia_id => '74200000-0000-4000-8000-0000000000a3', p_row_version => 2,
      p_assunto => 'Excluída', p_meta_interna => testes.h(3))$$,
  'P0001', 'exigencia_excluida', 'exigência excluída não é editada'
);

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74200000-0000-4000-8000-0000000000a3', p_protocolado_em => testes.h(0),
      p_protocolo_numero => 'X')$$,
  'P0001', 'exigencia_excluida', 'exigência excluída não recebe resposta'
);

-- ---------------------------------------------------------------------------
-- Listar: filtros, ordem e página
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.listar_exigencias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
     p_empreendimento_id => '74200000-0000-4000-8000-0000000000e1')),
  4::bigint,
  'a exigência excluída sai da lista'
);

select results_eq(
  $$select id from public.listar_exigencias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74200000-0000-4000-8000-0000000000e1', p_situacao => 'abertas')$$,
  $$values ('74200000-0000-4000-8000-0000000000a5'::uuid), ('74200000-0000-4000-8000-0000000000a4'::uuid),
           ('74200000-0000-4000-8000-0000000000a2'::uuid)$$,
  'abertas, do prazo mais perto ao mais longe'
);

select results_eq(
  $$select id from public.listar_exigencias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74200000-0000-4000-8000-0000000000e1', p_situacao => 'respondidas')$$,
  $$values ('74200000-0000-4000-8000-0000000000a1'::uuid)$$,
  'respondidas'
);

select results_eq(
  $$select id from public.listar_exigencias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74200000-0000-4000-8000-0000000000e1', p_situacao => 'todas')$$,
  $$values ('74200000-0000-4000-8000-0000000000a5'::uuid), ('74200000-0000-4000-8000-0000000000a4'::uuid),
           ('74200000-0000-4000-8000-0000000000a2'::uuid), ('74200000-0000-4000-8000-0000000000a1'::uuid)$$,
  'todas: abertas primeiro, depois respondidas'
);

select results_eq(
  $$select id, total from public.listar_exigencias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74200000-0000-4000-8000-0000000000e1', p_limite => 2, p_deslocamento => 2)$$,
  $$values ('74200000-0000-4000-8000-0000000000a2'::uuid, 4::bigint), ('74200000-0000-4000-8000-0000000000a1'::uuid, 4::bigint)$$,
  'página 2 de 2 em 2, com o total'
);

-- ---------------------------------------------------------------------------
-- Número do processo na licença
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.definir_processo_da_licenca('74200000-0000-4000-8000-000000000011', 1, 'PROC-9')$$,
  '42501', 'sem_permissao', 'Equipe não grava o processo na licença'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.definir_processo_da_licenca('74200000-0000-4000-8000-000000000011', 1, repeat('9', 61))$$,
  '22023', 'texto_longo_demais', 'processo acima de 60 caracteres é recusado'
);

select throws_ok(
  $$select public.definir_processo_da_licenca('74200000-0000-4000-8000-000000000011', 7, 'PROC-9')$$,
  'P0001', 'conflito_de_versao', 'gravar o processo com versão velha é recusado'
);

select is(
  public.definir_processo_da_licenca('74200000-0000-4000-8000-000000000011', 1, ' PROC-9 '),
  2,
  'Gestão grava o processo na licença'
);

select is(
  public.definir_processo_da_licenca('74200000-0000-4000-8000-000000000011', 2, 'PROC-9'),
  2,
  'gravar o mesmo processo devolve a mesma versão'
);

select results_eq(
  $$select licenca, licenca_numero_processo, licenca_row_version from public.listar_exigencias(
      p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a', p_exigencia_id => '74200000-0000-4000-8000-0000000000a1')$$,
  $$values ('LAO 742/2026'::text, 'PROC-9'::text, 2)$$,
  'o detalhe da exigência traz a licença com o processo e a versão'
);

select is(
  public.definir_processo_da_licenca('74200000-0000-4000-8000-000000000011', 2, '  '),
  3,
  'processo vazio limpa o campo'
);

-- ---------------------------------------------------------------------------
-- Auditoria (entidade crítica)
-- ---------------------------------------------------------------------------
reset role;

select results_eq(
  $$select entidade, acao::text, count(*) from public.auditoria
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'
      and entidade_id in ('74200000-0000-4000-8000-0000000000a1', '74200000-0000-4000-8000-0000000000b1')
    group by entidade, acao order by entidade, acao::text$$,
  $$values ('exigencia'::text, 'insert'::text, 1::bigint), ('exigencia', 'update', 2::bigint),
           ('exigencia_resposta', 'insert', 1::bigint)$$,
  'registro, edição, resposta e mudança de situação ficam na auditoria'
);

select * from finish();

rollback;
