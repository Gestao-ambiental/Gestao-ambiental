# ADR-0034: Lista de espera, contato e convite

- **Situação:** aceito em 15/11/2026, como protótipo funcional. O Kadu revisa.
- **Pedido do Eduardo:** trabalhar a central administrativa começando pela lista de espera. Este ADR cobre os três itens que ficaram de fora do ADR-0032.
- **Arquivos:**
  - migration `20261115040000_lista_de_espera_contato_e_convite.sql`;
  - teste `supabase/tests/530_lista_de_espera_contato_e_convite.test.sql`;
  - Edge Functions `avisar-lista-de-espera` e `convidar-da-lista-de-espera`, com a regra em `supabase/functions/_shared/lista-de-espera.ts` e os testes Deno ao lado;
  - domínio: `linkDoConviteNoWhatsapp` em `packages/domain/src/lista-de-espera.ts`, com teste;
  - central `PaginaCentralListaDeEspera.tsx`, com teste.

## Decisão

### Marcar quem já foi contatado

Cada linha da lista tem uma caixa "Contatado". A RPC `central_marcar_contatado(id, contatado)` só aceita o operador com dois fatores. Ela guarda quem marcou e quando, em `contatado_em` e `contatado_por`. Desmarcar limpa os dois campos.

A leitura `central_lista_de_espera` agora devolve `contatado_em` e `convidado_em`. Ela também aceita o filtro `p_so_pendentes`, que a tela mostra como "Só quem falta contatar".

### Convidar para o beta

O botão "Convidar" de cada linha registra o convite pela RPC `central_registrar_convite(id)`, também só para o operador. A RPC guarda quem convidou e quando. Se a pessoa ainda não estava marcada como contatada, também a marca. Dá para convidar de novo: o instante passa a ser o do último convite.

- **E-mail:** a Edge Function `convidar-da-lista-de-espera` usa o JWT do operador para chamar a RPC. Depois manda o convite pelo Resend, com o link `LINK_DO_BETA/criar-conta`. Sem `LINK_DO_BETA`, o link é `https://beta.gramaapp.com.br`. Sem a chave do Resend, a função recusa antes de registrar, para o convite não ficar marcado sem ter saído.
- **WhatsApp:** o Grama não manda mensagem. A tela abre `wa.me` com a mensagem pronta e o link de criar conta do próprio endereço da central, e registra o convite pela RPC. O operador envia pelo WhatsApp dele.

### Aviso de cadastro novo

A cada cadastro, os operadores recebem um e-mail. O site não muda.

1. Um gatilho por comando (`after insert … for each statement`) na tabela chama a Edge Function `avisar-lista-de-espera` pelo `pg_net`. A URL e o token ficam no Vault, com os nomes `lista_espera_aviso_url` e `lista_espera_aviso_token`. São gravados por SQL no painel, nunca no repositório.
2. Sem `pg_net`, sem Vault ou sem os segredos, o gatilho não faz nada. Qualquer erro do gatilho é engolido, para o aviso nunca impedir o cadastro.
3. A função tem `verify_jwt = false`. Ela confere o header `x-aviso-token` contra `LISTA_AVISO_TOKEN`, em tempo constante.
4. Com a service role, a função lê os cadastros ainda sem aviso (até 50) e os e-mails dos operadores. Manda um e-mail só, depois marca os cadastros como avisados (`avisado_em`).
5. Se o envio falhar, nada é marcado, e o próximo cadastro leva os pendentes junto.
6. **Aviso agrupado** (19/11/2026, migration `20261119300100_lista_de_espera_limites_e_resumo_do_aviso.sql`): o gatilho só chama a função se não chamou nos últimos 10 minutos (no máximo 6 e-mails por hora, mesmo com muitos cadastros seguidos). A reserva é uma atualização atômica em `private.lista_de_espera_aviso`. Os cadastros do intervalo ficam pendentes e vão juntos no aviso seguinte; a central mostra sempre a lista inteira. O aviso seguinte não depende de outro cadastro: um job do pg_cron (`aviso-da-lista-de-espera`, a cada 5 minutos) chama o mesmo disparo (`private.disparar_aviso_da_lista_de_espera`), que só sai se há cadastro sem aviso e já passaram os 10 minutos. Assim o último cadastro de um intervalo, o resto de um pico (50 por envio) e um envio que falhou saem em até ~15 minutos. Sem cadastro pendente, nem o gatilho nem o job gastam a janela.
7. O assunto nunca leva o nome de quem se cadastrou (texto livre de quem não tem login): "Grama: 1 pessoa entrou na lista de espera" ou "Grama: N pessoas…". O nome fica só no corpo, que é texto puro.
8. Os cadastros que já existiam antes desta migration entram como avisados, para não gerar e-mail atrasado.

Nunca vão para o log: e-mails, telefones, nomes, a chave e o token.

## Para ligar no beta

Faça nesta ordem:

1. Ative a extensão `pg_net`, se ainda não estiver ativa: Database, Extensions.
2. Aplique a migration.
3. Publique as duas funções.
4. Configure os segredos das funções: `LISTA_AVISO_TOKEN`, que é um texto aleatório longo. `RESEND_API_KEY` e `AVISO_REMETENTE` já existem para o aviso de suporte. `LINK_DO_BETA` é opcional.
5. No SQL do painel, rode `select vault.create_secret('<url da função>', 'lista_espera_aviso_url');` e `select vault.create_secret('<mesmo token>', 'lista_espera_aviso_token');`.

## Fora desta decisão

- Criar a conta automaticamente a partir do convite. A pessoa continua criando a conta pelo `/criar-conta`.
- Remover alguém da lista.
- Anotações por pessoa.
