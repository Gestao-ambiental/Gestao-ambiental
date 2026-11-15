-- Titular pessoa física (pedido do Mateus, decisão do Eduardo de 14/11/2026): o documento do
-- empreendimento e do cliente do orçamento aceita CNPJ OU CPF. Algumas autorizações (ex.: de
-- corte) são emitidas para o CPF de uma pessoa. O CPF fica guardado como o CNPJ (só os 11 dígitos),
-- é exibido mascarado e valida os dígitos verificadores. As colunas continuam se chamando `cnpj`
-- para não mudar as RPCs; o CNPJ da própria consultoria (consultoria_identidade) segue só CNPJ.

-- CPF com 11 dígitos, verificadores certos e sem sequência repetida (111.111.111-11).
create function private.cpf_digitos_ok(cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int;
  resto int;
  tamanho int;
  i int;
begin
  if cpf !~ '^[0-9]{11}$' or cpf ~ '^(.)\1{10}$' then
    return false;
  end if;
  foreach tamanho in array array[9, 10] loop
    soma := 0;
    for i in 1..tamanho loop
      soma := soma + substr(cpf, i, 1)::int * (tamanho + 2 - i);
    end loop;
    resto := (soma * 10) % 11;
    if resto = 10 then
      resto := 0;
    end if;
    if resto <> substr(cpf, tamanho + 1, 1)::int then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.cpf_digitos_ok(text) from public, anon, authenticated;

-- Mesma assinatura de antes: devolve o documento só com letras e dígitos, ou nulo se vazio.
-- 11 dígitos = CPF (dígitos conferidos); 14 caracteres = CNPJ (só formato, como sempre foi).
create or replace function private.cnpj_valido(cnpj text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalizado text := private.normalizar_cnpj(cnpj);
begin
  if normalizado is null then
    return null;
  end if;
  if normalizado ~ '^[0-9]{11}$' then
    if not private.cpf_digitos_ok(normalizado) then
      raise exception 'cpf_invalido' using errcode = '22023';
    end if;
    return normalizado;
  end if;
  if normalizado !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    raise exception 'cnpj_invalido' using errcode = '22023';
  end if;
  return normalizado;
end;
$$;

revoke all on function private.cnpj_valido(text) from public, anon, authenticated;

alter table public.empreendimento drop constraint empreendimento_cnpj_formato;
alter table public.empreendimento
  add constraint empreendimento_cnpj_formato
  check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$' or cnpj ~ '^[0-9]{11}$');

alter table public.orcamento drop constraint orcamento_prospecto_cnpj_formato;
alter table public.orcamento
  add constraint orcamento_prospecto_cnpj_formato
  check (prospecto_cnpj is null or prospecto_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'
         or prospecto_cnpj ~ '^[0-9]{11}$');

comment on column public.empreendimento.cnpj is
  'Documento do titular: CNPJ (14 caracteres, numérico ou alfanumérico) ou CPF (11 dígitos). Opcional. Repetido é aviso, não erro.';
comment on column public.orcamento.prospecto_cnpj is
  'Documento de quem pediu o orçamento: CNPJ (14) ou CPF (11). Opcional.';
