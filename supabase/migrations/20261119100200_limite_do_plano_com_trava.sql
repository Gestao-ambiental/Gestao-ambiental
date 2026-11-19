-- Limite do plano sem corrida (ADR-0026, atualização de 19/11/2026).
--
-- As triggers limite_do_plano (convite e instrumento) contavam pessoas e empreendimentos sem trava:
-- duas inserções simultâneas com a consultoria em N-1 viam a mesma contagem e passavam as duas.
-- Agora as duas funções travam a linha da consultoria (for update) antes de contar, como
-- assinar_plano_simulado e confirmar_adicional; a segunda transação espera a primeira terminar e
-- conta com o que ela gravou. As triggers não mudam.

create or replace function private.conferir_limite_do_convite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao = 'pendente' then
    perform 1 from public.consultoria as c where c.id = new.consultoria_id for update;
    perform private.exigir_confirmacao_de_adicional(
      new.consultoria_id, 'pessoas',
      private.pessoas_ativas(new.consultoria_id) + private.convites_pendentes(new.consultoria_id) + 1
    );
  end if;
  return new;
end;
$$;

create or replace function private.conferir_limite_do_empreendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao <> 'ativo' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.situacao = 'ativo' then
      return new;
    end if;
  end if;
  perform 1 from public.consultoria as c where c.id = new.consultoria_id for update;
  if not exists (
       select 1 from public.instrumento as i
       where i.consultoria_id = new.consultoria_id and i.empreendimento_id = new.empreendimento_id
         and i.situacao = 'ativo' and i.id <> new.id
     ) then
    perform private.exigir_confirmacao_de_adicional(
      new.consultoria_id, 'empreendimentos', private.empreendimentos_ativos(new.consultoria_id) + 1
    );
  end if;
  return new;
end;
$$;

revoke all on function private.conferir_limite_do_convite() from public, anon, authenticated;
revoke all on function private.conferir_limite_do_empreendimento() from public, anon, authenticated;
