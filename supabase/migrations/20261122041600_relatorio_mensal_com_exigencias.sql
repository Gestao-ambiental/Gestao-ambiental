-- P6 · Relatório mensal ao cliente (ADR-0052) com as exigências do órgão (P3, ADR-0045).
--
-- Redefine a fonte private.relatorio_exigencias_do_mes, que nasceu vazia, com o mesmo retorno: as
-- respostas protocoladas no mês (exigencia_resposta do tipo 'resposta', pela data do protocolo) das
-- exigências não excluídas do empreendimento. Título com o número do ofício e o assunto; detalhe com
-- o número do protocolo. Ficam de fora o que é interno: notas, descrição da resposta, anexos,
-- prorrogações, responsável e quem registrou. Continua security invoker: quem chama passa pela RLS
-- (e dados_para_relatorio_mensal já barra quem não é da Gestão).

create or replace function private.relatorio_exigencias_do_mes(cid uuid, emp uuid, de date, ate date)
returns table (data date, titulo text, detalhe text)
language sql
stable
set search_path = ''
as $$
  select r.protocolado_em,
         'Resposta à exigência: ' || concat_ws(' · ',
           'Ofício ' || nullif(btrim(e.numero_oficio), ''), e.assunto),
         nullif(btrim(r.protocolo_numero), '')
  from public.exigencia_resposta as r
  join public.exigencia as e on e.consultoria_id = r.consultoria_id and e.id = r.exigencia_id
  where r.consultoria_id = cid and e.empreendimento_id = emp and e.excluido_em is null
    and r.tipo = 'resposta' and r.protocolado_em between de and ate
$$;

comment on function private.relatorio_exigencias_do_mes(uuid, uuid, date, date) is
  'Respostas a exigências protocoladas no mês, para o relatório ao cliente (P6, ADR-0052). Sem notas nem nomes.';
