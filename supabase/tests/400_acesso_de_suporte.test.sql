-- Acesso de suporte (fase 3 da central; ADR-0025; Termos de Uso §13).
-- A. A Gestão autoriza por 2, 24 ou 48 horas (49 recusa); Equipe e Gestão de outra consultoria não.
-- B. Só operador com dois fatores entra, e só com acesso valendo.
-- C. O suporte LÊ o que a Gestão lê: tabelas, RPC de leitura (inclusive orçamento) e arquivos.
-- D. O suporte NÃO escreve: direto, por RPC, como dono (security definer) nem no Storage.
-- E. O suporte não conta como pessoa da consultoria.
-- F. Histórico visível à Gestão e à central; zero linhas para Equipe e outra consultoria.
-- G. O acesso expira sozinho; H. a Gestão encerra e cai na hora.
-- I. Emergência: categoria e motivo obrigatórios, 2 horas, aviso até a Gestão marcar como visto;
--    o operador sai e o acesso acaba.
-- J. Registro append-only; K. anônimo nada.
begin;

select plan(96);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'operador@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Grama"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000001');

-- Dados da Filtroville (A) para o suporte ler: empreendimento, orçamento e um arquivo.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Licença de operação');
reset role;
insert into storage.objects (bucket_id, name)
values ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/e0000000-0000-4000-8000-000000000009.pdf');

-- ---------------------------------------------------------------------------
-- A. Autorização da Gestão
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a', 2, null)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não autoriza acesso de suporte'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a', 2, null)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria (Gustavo) não autoriza acesso à Filtroville'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a', 49, null)$$,
  '22023', 'duracao_invalida',
  '49 horas é recusado (máximo 48, só 2, 24 ou 48)'
);
select throws_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a', 3, null)$$,
  '22023', 'duracao_invalida',
  'duração fora da lista (3 horas) é recusada'
);

reset role;
select throws_ok(
  $$insert into public.acesso_suporte (id, consultoria_id, modo, inicio, fim_previsto, autorizado_por)
    values (gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'autorizado', now(),
            now() + interval '49 hours', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '23514', null,
  'nem direto na tabela um acesso passa de 48 horas'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a', 2, '  Erro ao gerar a proposta  '),
  'a5000000-0000-4000-8000-000000000001'::uuid,
  'Gestão (Eduardo) autoriza por 2 horas, com motivo'
);
select is(
  public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a', 2, 'Erro ao gerar a proposta'),
  'a5000000-0000-4000-8000-000000000001'::uuid,
  'repetir com o mesmo id devolve a mesma autorização (idempotente)'
);
select throws_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-00000000000a', 24, null)$$,
  'P0001', 'autorizacao_ativa',
  'com autorização valendo, outra é recusada'
);

reset role;
select is(
  (select array[count(*)::text, max(fim_previsto - inicio)::text, max(motivo)]
   from public.acesso_suporte where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  array['1', '02:00:00', 'Erro ao gerar a proposta'],
  'uma autorização só, de 2 horas, com o motivo sem espaços nas pontas'
);

select testes.autenticar_como('eduardo@filtroville.test');
select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-000000000001');
select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-00000000000a', 24, null);
select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-000000000002');
select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-00000000000a', 48, null);

reset role;
select is(
  (select fim_previsto - inicio from public.acesso_suporte where id = 'a5000000-0000-4000-8000-000000000002'),
  interval '24 hours',
  'autorização de 24 horas'
);
select is(
  (select fim_previsto - inicio from public.acesso_suporte where id = 'a5000000-0000-4000-8000-000000000003'),
  interval '48 hours',
  'autorização de 48 horas'
);

-- ---------------------------------------------------------------------------
-- B. Quem entra
-- ---------------------------------------------------------------------------
select testes.autenticar_como('operador@grama.test');
select throws_ok(
  $$select public.entrar_como_suporte('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'dois_fatores_necessarios',
  'operador só com senha (aal1) não entra como suporte'
);

select testes.autenticar_com_dois_fatores('helena@verdesul.test');
select throws_ok(
  $$select public.entrar_como_suporte('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'quem não é operador não entra como suporte, nem com dois fatores'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'autorizado, mas antes de entrar o operador não lê nada'
);
select is(
  public.entrar_como_suporte('c0000000-0000-4000-8000-00000000000a'),
  'a5000000-0000-4000-8000-000000000003'::uuid,
  'operador com dois fatores entra pela autorização valendo'
);
select throws_ok(
  $$select public.entrar_como_suporte('c0000000-0000-4000-8000-00000000000b')$$,
  'P0001', 'sem_autorizacao_de_suporte',
  'sem autorização, não entra'
);

-- ---------------------------------------------------------------------------
-- C. O suporte lê o que a Gestão lê
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint,
  'suporte lê a equipe da consultoria'
);
select is(
  (select count(*) from public.empreendimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  1::bigint,
  'suporte lê os empreendimentos'
);
select is(
  (select count(*) from public.orcamento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  1::bigint,
  'suporte lê os orçamentos (tabela da Gestão)'
);
select is(
  public.obter_orcamento('f0000000-0000-4000-8000-0000000000f1') ->> 'objeto',
  'Licença de operação',
  'suporte lê o orçamento pela RPC de leitura'
);
select is(
  (select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a')),
  1::bigint,
  'suporte lê a lista de orçamentos pela RPC'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'arquivos'),
  1::bigint,
  'suporte lê os arquivos da consultoria no Storage'
);
select is(
  (select count(*) from public.consultoria),
  1::bigint,
  'suporte vê só a consultoria em que entrou'
);
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000b'),
  0::bigint,
  'suporte não lê outra consultoria'
);

select testes.autenticar_como('operador@grama.test');
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'mesmo depois de entrar, sessão só com senha (aal1) não lê nada'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'arquivos'),
  0::bigint,
  'sessão aal1 não lê arquivos'
);

-- ---------------------------------------------------------------------------
-- D. O suporte não escreve
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('operador@grama.test');
select throws_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f9',
      'c0000000-0000-4000-8000-00000000000a', 'Intruso')$$,
  '42501', 'sem_permissao',
  'RPC de escrita que exige autor (criar empreendimento) recusa o suporte antes de gravar'
);
select throws_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f9', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f1', 'Intruso')$$,
  '42501', 'sem_permissao',
  'RPC de escrita que exige autor (criar orçamento) recusa o suporte antes de gravar'
);
select throws_ok(
  $$select public.excluir_orcamento('f0000000-0000-4000-8000-0000000000f1', 1)$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'RPC de escrita (mandar orçamento para a lixeira) recusa o suporte'
);
select throws_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a2', 'gestao')$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'suporte não muda papel de ninguém'
);
select throws_ok(
  $$select * from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'intruso@exemplo.test', 'gestao')$$,
  '42501', 'sem_permissao',
  'suporte não convida'
);
select throws_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'orcamentos')$$,
  '42501', 'sem_permissao',
  'suporte não registra uso'
);
select throws_ok(
  $$insert into public.empreendimento (id, consultoria_id, nome)
    values ('e0000000-0000-4000-8000-0000000000f8', 'c0000000-0000-4000-8000-00000000000a', 'Intruso')$$,
  '42501', null,
  'suporte não insere direto em tabela'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/intruso.pdf')$$,
  '42501', null,
  'suporte não envia arquivo'
);

-- Como dono (é o que acontece dentro de uma RPC security definer), com o JWT do operador: a
-- trigger recusa mesmo sem RLS nem grant no caminho.
reset role;
select throws_ok(
  $$insert into public.empreendimento (id, consultoria_id, nome)
    values ('e0000000-0000-4000-8000-0000000000f8', 'c0000000-0000-4000-8000-00000000000a', 'Intruso')$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'como dono: insert recusado pela trigger'
);
select throws_ok(
  $$update public.orcamento set objeto = 'Alterado' where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'como dono: update recusado pela trigger'
);
select throws_ok(
  $$delete from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'como dono: delete recusado pela trigger'
);
select throws_ok(
  $$update public.consultoria set nome = 'Outro nome' where id = 'c0000000-0000-4000-8000-00000000000a'$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'como dono: a própria consultoria também é protegida'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select array[(select count(*) from public.empreendimento
                 where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')::text,
                (select objeto from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f1'),
                (select excluido_em::text from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f1'),
                (select papel::text from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
                (select count(*) from public.convite
                 where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')::text,
                (select count(*) from public.uso_diario)::text]),
  array['1', 'Licença de operação', null, 'equipe', '0', '0'],
  'nada mudou nos dados da consultoria'
);

-- ---------------------------------------------------------------------------
-- E. O suporte não conta como pessoa da consultoria
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.membro where usuario_id = 'e1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'o suporte não tem vínculo (nenhuma linha em membro)'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select is(
  (select pessoas_ativas from public.central_listar_consultorias()
   where id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint,
  'a central conta só as 6 pessoas da consultoria'
);
select is(
  (select count(*) from public.central_listar_pessoas('c0000000-0000-4000-8000-00000000000a')),
  6::bigint,
  'a lista de pessoas da central não inclui o suporte'
);
select lives_ok(
  $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa',
      'Teste da central durante o suporte', 1, gen_random_uuid())$$,
  'a central continua mudando a situação durante o acesso de suporte (ação da plataforma)'
);

-- ---------------------------------------------------------------------------
-- F. Histórico: Gestão e central veem; Equipe e outra consultoria, nada
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  (select count(*) from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')),
  3::bigint,
  'Gestão vê os três acessos da consultoria'
);
select is(
  (select array[ativo::text, modo, jsonb_array_length(entradas)::text, entradas -> 0 ->> 'nome']
   from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')
   where id = 'a5000000-0000-4000-8000-000000000003'),
  array['true', 'autorizado', '1', 'Operador Grama'],
  'o de 48 horas está valendo, com a entrada efetiva do operador'
);
select is(
  (select array[encerramento, encerrado_por_nome, autorizado_por_nome, motivo]
   from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')
   where id = 'a5000000-0000-4000-8000-000000000001'),
  array['gestao', 'Eduardo Karnopp', 'Eduardo Karnopp', 'Erro ao gerar a proposta'],
  'o encerrado pela Gestão mostra quem autorizou, quem encerrou e o motivo'
);
select is(
  (select count(*) from public.acesso_suporte),
  3::bigint,
  'Gestão lê o registro direto na tabela'
);

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Equipe não vê os acessos do suporte'
);
select is(
  (select count(*) from public.acesso_suporte) + (select count(*) from public.acesso_suporte_evento),
  0::bigint,
  'Equipe lê zero linhas do registro'
);
select throws_ok(
  $$select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-000000000003')$$,
  '42501', 'sem_permissao',
  'Equipe não encerra o acesso'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não vê os acessos alheios'
);
select is(
  (select count(*) from public.acesso_suporte) + (select count(*) from public.acesso_suporte_evento),
  0::bigint,
  'Gestão de outra consultoria lê zero linhas do registro'
);
select throws_ok(
  $$select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-000000000003')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não encerra acesso alheio'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select is(
  (select count(*) from public.central_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')),
  3::bigint,
  'a central mostra o histórico de acessos da consultoria'
);
select is(
  (select array_agg(consultoria_nome) from public.meus_acessos_de_suporte()),
  array['Filtroville Consultoria Ambiental'],
  'meus acessos de suporte: a consultoria em que o operador entrou'
);

select testes.autenticar_com_dois_fatores('helena@verdesul.test');
select throws_ok(
  $$select * from public.central_acessos_de_suporte('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'quem não é operador não lê o histórico pela central'
);

-- ---------------------------------------------------------------------------
-- G. O acesso termina sozinho no fim previsto (sem cron)
-- ---------------------------------------------------------------------------
reset role;
select ok(
  private.suporte_ativo_em('c0000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000001',
    now() + interval '47 hours 59 minutes'),
  'autorização de 48 horas ainda vale um minuto antes do fim'
);
select ok(
  not private.suporte_ativo_em('c0000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000001',
    now() + interval '48 hours'),
  'no fim previsto o acesso acabou'
);

-- Acesso vencido na Verde Sul: começou há 3 horas, durou 2, com entrada do operador.
insert into public.acesso_suporte (id, consultoria_id, modo, inicio, fim_previsto, autorizado_por)
values ('a5000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'autorizado',
        now() - interval '3 hours', now() - interval '1 hour', 'd0000000-0000-4000-8000-0000000000b1');
insert into public.acesso_suporte_evento (consultoria_id, acesso_id, tipo, usuario_id, instante)
values ('c0000000-0000-4000-8000-00000000000b', 'a5000000-0000-4000-8000-0000000000b1', 'entrada',
        'e1000000-0000-4000-8000-000000000001', now() - interval '150 minutes');

select testes.autenticar_com_dois_fatores('operador@grama.test');
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000b'),
  0::bigint,
  'acesso vencido não lê nada'
);
select throws_ok(
  $$select public.entrar_como_suporte('c0000000-0000-4000-8000-00000000000b')$$,
  'P0001', 'sem_autorizacao_de_suporte',
  'acesso vencido não deixa entrar de novo'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select array[ativo::text, encerramento, (encerrado_em = fim_previsto)::text]
   from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000b')),
  array['false', 'prazo', 'true'],
  'no histórico, o vencido aparece encerrado pelo prazo, no fim previsto'
);

-- ---------------------------------------------------------------------------
-- H. A Gestão encerra e o acesso cai na hora
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-000000000003')$$,
  'Gestão encerra o acesso do suporte'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')
  + (select count(*) from public.orcamento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')
  + (select count(*) from storage.objects where bucket_id = 'arquivos'),
  0::bigint,
  'encerrado pela Gestão: na hora, o suporte não lê mais nada (tabelas e arquivos)'
);
select is(
  (select count(*) from public.meus_acessos_de_suporte()),
  0::bigint,
  'encerrado: some de "meus acessos de suporte"'
);

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-000000000003')$$,
  'encerrar de novo não dá erro (idempotente)'
);
select is(
  (select count(*) from public.acesso_suporte_evento
   where acesso_id = 'a5000000-0000-4000-8000-000000000003' and tipo like 'encerrado%'),
  1::bigint,
  'e não duplica o encerramento'
);

-- ---------------------------------------------------------------------------
-- I. Emergência
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('helena@verdesul.test');
select throws_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e1',
      'c0000000-0000-4000-8000-00000000000b', 'falha_grave', 'Sistema fora')$$,
  '42501', 'sem_permissao',
  'quem não é operador não abre emergência'
);

select testes.autenticar_como('operador@grama.test');
select throws_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e1',
      'c0000000-0000-4000-8000-00000000000b', 'falha_grave', 'Sistema fora')$$,
  '42501', 'dois_fatores_necessarios',
  'operador só com senha não abre emergência'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select throws_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e1',
      'c0000000-0000-4000-8000-00000000000b', null, 'Sistema fora')$$,
  '22023', 'categoria_obrigatoria',
  'emergência exige a categoria'
);
select throws_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e1',
      'c0000000-0000-4000-8000-00000000000b', 'curiosidade', 'Sistema fora')$$,
  '22023', 'categoria_obrigatoria',
  'emergência só nas três categorias'
);
select throws_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e1',
      'c0000000-0000-4000-8000-00000000000b', 'falha_grave', '   ')$$,
  '22023', 'motivo_obrigatorio',
  'emergência exige o motivo'
);
select is(
  public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e1',
    'c0000000-0000-4000-8000-00000000000b', 'falha_grave', 'Sistema fora para a Verde Sul'),
  'a5000000-0000-4000-8000-0000000000e1'::uuid,
  'operador com dois fatores abre a emergência'
);
select is(
  (select fim_previsto - inicio from public.acesso_suporte where id = 'a5000000-0000-4000-8000-0000000000e1'),
  interval '2 hours',
  'emergência dura 2 horas'
);
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000b'),
  2::bigint,
  'na emergência o suporte já entra e lê'
);
select throws_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000b2', 'gestao')$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'na emergência o suporte também só lê'
);
select is(
  (select array[consultoria_nome, categoria, motivo, operador_nome]
   from public.dados_do_aviso_de_emergencia('a5000000-0000-4000-8000-0000000000e1')),
  array['Verde Sul Ambiental', 'falha_grave', 'Sistema fora para a Verde Sul', 'Operador Grama'],
  'dados do aviso para o e-mail (sem e-mails)'
);
select throws_ok(
  $$select * from public.dados_do_aviso_de_emergencia('a5000000-0000-4000-8000-000000000003')$$,
  '42501', 'sem_acesso_de_emergencia',
  'sem emergência valendo, a função de e-mail é recusada'
);
select throws_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-0000000000e2',
      'c0000000-0000-4000-8000-00000000000b', 'incidente_de_seguranca', 'Outro')$$,
  'P0001', 'acesso_de_suporte_ativo',
  'com acesso valendo, outra emergência é recusada'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select array[categoria, operador_nome, motivo]
   from public.avisos_de_suporte_pendentes('c0000000-0000-4000-8000-00000000000b')),
  array['falha_grave', 'Operador Grama', 'Sistema fora para a Verde Sul'],
  'a Gestão recebe o aviso da emergência (categoria, operador e motivo)'
);

select testes.autenticar_como('helena@verdesul.test');
select throws_ok(
  $$select * from public.avisos_de_suporte_pendentes('c0000000-0000-4000-8000-00000000000b')$$,
  '42501', 'sem_permissao',
  'Equipe não vê o aviso de emergência'
);
select throws_ok(
  $$select public.marcar_aviso_de_suporte_visto('a5000000-0000-4000-8000-0000000000e1')$$,
  '42501', 'sem_permissao',
  'Equipe não marca o aviso como visto'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select throws_ok(
  $$select public.marcar_aviso_de_suporte_visto('a5000000-0000-4000-8000-0000000000e1')$$,
  '42501', 'sem_permissao',
  'o próprio suporte (que lê como Gestão) não marca o aviso como visto'
);
select throws_ok(
  $$select public.encerrar_acesso_de_suporte('a5000000-0000-4000-8000-0000000000e1')$$,
  '42501', 'sem_permissao',
  'nem encerra como se fosse a Gestão'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select * from public.avisos_de_suporte_pendentes('c0000000-0000-4000-8000-00000000000b')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não vê o aviso'
);

select testes.autenticar_como('gustavo@verdesul.test');
select lives_ok(
  $$select public.marcar_aviso_de_suporte_visto('a5000000-0000-4000-8000-0000000000e1')$$,
  'Gestão marca o aviso como visto'
);
select lives_ok(
  $$select public.marcar_aviso_de_suporte_visto('a5000000-0000-4000-8000-0000000000e1')$$,
  'marcar de novo não dá erro (idempotente)'
);
select is(
  (select count(*) from public.avisos_de_suporte_pendentes('c0000000-0000-4000-8000-00000000000b')),
  0::bigint,
  'visto: a faixa some para toda a Gestão'
);

-- O operador sai: o acesso acaba na hora.
select testes.autenticar_com_dois_fatores('operador@grama.test');
select lives_ok(
  $$select public.sair_do_acesso_de_suporte('c0000000-0000-4000-8000-00000000000b')$$,
  'operador sai do acesso de suporte'
);
select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000b'),
  0::bigint,
  'depois de sair, o suporte não lê mais'
);
select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select array[encerramento, encerrado_por_nome, categoria, aviso_visto_por_nome]
   from public.listar_acessos_de_suporte('c0000000-0000-4000-8000-00000000000b')
   where id = 'a5000000-0000-4000-8000-0000000000e1'),
  array['operador', 'Operador Grama', 'falha_grave', 'Gustavo Pereira'],
  'no histórico: encerrado pelo operador, categoria e quem viu o aviso'
);

-- ---------------------------------------------------------------------------
-- J. Registro append-only, até para o dono
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$update public.acesso_suporte set motivo = 'apagado' where id = 'a5000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'o registro de acesso não muda'
);
select throws_ok(
  $$delete from public.acesso_suporte_evento$$,
  '42501', null,
  'os eventos não são apagados'
);
select throws_ok(
  $$truncate public.acesso_suporte_evento, public.acesso_suporte$$,
  '42501', null,
  'nem truncados'
);
select ok(
  not has_table_privilege('authenticated', 'public.acesso_suporte', 'insert')
  and not has_table_privilege('authenticated', 'public.acesso_suporte_evento', 'insert')
  and not has_table_privilege('authenticated', 'public.acesso_suporte', 'update'),
  'o cliente não escreve no registro (só pelas RPCs)'
);

-- ---------------------------------------------------------------------------
-- K. Anônimo
-- ---------------------------------------------------------------------------
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.autorizar_acesso_de_suporte(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 2, null)$$,
  '42501', null,
  'anônimo não executa as RPCs do suporte'
);
select throws_ok(
  $$select count(*) from public.acesso_suporte$$,
  '42501', null,
  'anônimo não lê o registro'
);

select * from finish();

rollback;
