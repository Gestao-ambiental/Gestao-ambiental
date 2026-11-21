# ADR-0058: Acesso pago (convite do beta, um teste por pessoa e por CNPJ)

- Situação: proposta (camada `camada/acesso-pago`)
- Data: 21/11/2026
- Revê: ADR-0026 (planos e cobrança), no ponto em que toda consultoria nova ganhava o beta

## Contexto

Havia três brechas para usar o Grama sem pagar:

- `criar_consultoria` aceitava qualquer pessoa logada.
- O beta (`fim_do_beta`) deixava toda consultoria nova grátis até o fim dele.
- Criar outra consultoria dava um teste novo.

O Eduardo aprovou fechar as três.

## Decisão

- **Abrir consultoria**: a RPC nova `abrir_consultoria(p_id, p_nome, p_cnpj)` devolve `(consultoria_id, acesso)`. A antiga `criar_consultoria(p_id, p_nome)` continua com a mesma assinatura, mas só devolve uma consultoria que já existe. Para uma consultoria nova, sem CNPJ, ela responde `cnpj_obrigatorio`.
- **CNPJ**: é obrigatório e validado pelos dígitos verificadores, numérico ou alfanumérico (`cnpjValido` no domínio, `private.cnpj_com_verificadores` no banco). O banco guarda só o HMAC-SHA256 com um segredo próprio (`private.segredo_do_acesso`), nunca o número. Nada de CPF.
- **Convite do beta**: durante o beta (hoje ≤ `fim_do_beta`, no fuso de São Paulo), abrir consultoria exige um convite em `private.convite_do_beta`:
  - é de uso único e vale para o e-mail convidado, numa conta com o e-mail confirmado;
  - nasce quando a Central convida alguém da lista de espera com contato por e-mail (gatilho em `convidado_em`);
  - nasce também quando o operador o emite em `central_emitir_convite_do_beta(p_email)`, a partir de um formulário na tela da lista de espera.
  - Operador da plataforma não precisa de convite.
  - Sem convite, a RPC responde `convite_do_beta_obrigatorio`, e a tela leva a pessoa à lista de espera do site.
  - `aceitar_convite`, o convite de equipe, não muda.
- **Beta só para convidado**: a linha `private.consultoria_acesso` guarda a origem da consultoria:
  - `anterior`: já existia;
  - `beta`: aberta com convite durante o beta;
  - `teste`: aberta depois do beta;
  - `sem_teste`: já usou o teste.

  `situacao_comercial_em` só passa o `fim_do_beta` para `anterior` e `beta`. A ausência da linha conta como `anterior`, o que cobre o seed e os dados antigos. A migration marca todas as consultorias que já existem como `anterior`, então Envora, Filtroville e as demais continuam em beta.

- **Um teste por pessoa e por CNPJ**: a consultoria nasce `sem_teste`, com zero dias de teste e precisando de plano, em qualquer destes casos:
  - quem abre já foi Gestão de outra consultoria não interna (pelo `usuario_id`);
  - o HMAC do e-mail já está em `private.teste_usado`;
  - o HMAC do CNPJ já está em `private.teste_usado`.

  A tela vai direto para Plano e cobrança. A Central ainda pode dar dias de teste pela condição comercial. A migration registra o e-mail de quem já é Gestão. As contas internas continuam isentas pela condição `interna`.

## Consequências

- Migration `20261121220500_acesso_pago.sql`, pgTAP 790 e regra pura em `packages/domain/src/acesso-pago.ts`.
- Os testes pgTAP 070, 320, 330 e 780 passam a abrir a consultoria com CNPJ e convite. A regra mudou de propósito.
- O link da lista de espera na tela é `https://gramaapp.com.br/`.
- Quem foi convidado por WhatsApp precisa que o operador libere o convite do beta pelo e-mail da conta.
