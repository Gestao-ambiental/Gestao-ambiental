begin;

create temporary table personas as
select t, u, md5('carga-tenant-' || t)::uuid as tenant_id,
       md5('carga-user-' || t || '-' || u)::uuid as user_id,
       md5('carga-member-' || t || '-' || u)::uuid as member_id
from generate_series(1,20) as t cross join generate_series(1,10) as u;

insert into public.consultoria(id, nome, fuso)
select tenant_id, 'Consultoria sintética ' || t, 'America/Sao_Paulo' from personas where u=1;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select user_id,'authenticated','authenticated',format('carga-%s-%s@example.invalid',t,u),now(),
       '{"provider":"email","providers":["email"]}',jsonb_build_object('nome',format('Usuário sintético %s-%s',t,u))
from personas;

insert into public.membro(id,consultoria_id,usuario_id,papel)
select member_id,tenant_id,user_id,(case when u=1 then 'gestao' else 'equipe' end)::public.papel_membro
from personas;

do $$
declare
  gestao record;
  cliente integer;
  licenca integer;
  seq integer;
  emp uuid;
  uni uuid;
  inst uuid;
  cond uuid;
  responsavel uuid;
  tipo uuid;
  hoje date := current_date;
  referencia date;
begin
  for gestao in select * from personas where u=1 order by t loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',gestao.user_id,'role','authenticated','aal','aal1')::text,true);
    select id into strict tipo from public.tipo_instrumento where consultoria_id=gestao.tenant_id and sigla='LAO';
    for cliente in 1..25 loop
      emp := md5(format('carga-emp-%s-%s',gestao.t,cliente))::uuid;
      uni := md5(format('carga-uni-%s-%s',gestao.t,cliente))::uuid;
      insert into public.empreendimento(id,consultoria_id,nome,criado_por)
      values (emp,gestao.tenant_id,'Empreendimento sintético ' || cliente,gestao.member_id);
      insert into public.unidade(id,consultoria_id,empreendimento_id,nome)
      values (uni,gestao.tenant_id,emp,'Unidade sintética');
      for licenca in 1..2 loop
        inst := md5(format('carga-inst-%s-%s-%s',gestao.t,cliente,licenca))::uuid;
        referencia := (hoje - interval '6 months')::date + ((cliente + licenca) % 28);
        perform public.criar_instrumento(inst,uni);
        perform public.salvar_identificacao(inst,1,uni,tipo,
          format('CARGA-%s-%s-%s',gestao.t,cliente,licenca),'IMA',null,referencia,null,null,'assinatura',hoje+240);
        for seq in 1..2 loop
          cond := md5(format('carga-cond-%s-%s-%s-%s',gestao.t,cliente,licenca,seq))::uuid;
          select member_id into strict responsavel from personas
          where t=gestao.t and u=1+((2*(cliente-1)+licenca+seq-2)%10);
          perform public.salvar_condicionante(cond,inst,null,'1.' || seq,'Condicionante sintética ' || seq,'','obrigacao');
          perform public.confirmar_prazo(cond,'mensal',null,null,'corridos',referencia,
            (referencia + interval '1 month')::date,'Fixture de carga');
          perform public.definir_responsavel(cond,responsavel);
        end loop;
        perform public.ativar_plano(inst,(select row_version from public.instrumento where id=inst),gen_random_uuid());
      end loop;
    end loop;
  end loop;
end $$;

commit;
analyze;

select (select count(*) from public.consultoria) as consultorias,
       (select count(*) from public.membro) as membros,
       (select count(*) from public.empreendimento) as empreendimentos,
       (select count(*) from public.instrumento) as licencas,
       (select count(*) from public.condicionante) as condicionantes,
       (select count(*) from public.ocorrencia) as ocorrencias;
