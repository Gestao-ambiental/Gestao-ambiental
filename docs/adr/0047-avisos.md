# ADR-0047: Avisos até a pessoa (resumo diário por e-mail e calendário)

- **Situação:** aceito em 20/11/2026. Pacote P5 do estudo "Oito funções no Grama". O Eduardo aceitou todas as recomendações do estudo (pergunta 6: resumo diário ligado por padrão, às 7 h, só em dia útil, nunca vazio; pergunta 7: WhatsApp depois, calendário só por feed ICS com título mínimo e link que só se regenera). O Kadu revisa.
- **Depende de:** ADR-0041 (fontes de prazo e a exceção da barreira comercial), ADR-0027 (resumo do mês: Resend, reserva e `CRON_TOKEN`) e ADR-0034 (pg_net e Vault na lista de espera).
- **Revê:** NOT-01 (resumo diário) sai do "fora do MVP". EQ-06 entra como "Exportar .ics" no Calendário. NOT-02 (sincronização por OAuth) continua fora.

## Contexto

O Grama só avisa de prazo quando alguém abre a tela. O estudo recomenda o resumo diário por e-mail como o aviso que de fato chega, e o feed de calendário como complemento (o Google atualiza um calendário assinado em horas, então ele não serve de alarme). A crítica do estudo apontou três riscos: a barreira comercial impedindo alguém de parar de receber aviso, o token do feed na URL e o "Exportar .ics" do EQ-06, que é um arquivo e não um feed.

## Decisão

1. **Preferência por membro.** Tabela `preferencia_aviso` (uma linha por membro, `resumo_diario`, `row_version`). **Sem linha = ligado**: todo membro ativo, inclusive quem entra depois, recebe sem precisar de linha. A pessoa desliga e religa no Perfil (seção Avisos). Não há configuração da consultoria: a hora (7 h) e a antecedência (7 dias) são fixas, sem colunas novas em `consultoria` e sem aba em Configurações.
2. **Conteúdo do resumo.** Prazos atrasados, de hoje e dos próximos 7 dias (prazo oficial), lidos de `private.linhas_de_prazo` (todas as fontes da base, então exigências e vencimentos entram sozinhos com o P3 e o P4):
   - todos: os prazos em que a pessoa é a responsável;
   - Gestão, além disso: "Sem responsável" (tipos que têm responsável e estão sem) e "Licenças e vencimentos" (tipos que não têm responsável: validade, limite de protocolo, alvará, vencimento).
     Nenhum grupo com linha: não envia e não grava nada.
3. **Quando.** Só em dia útil nacional (`private.eh_dia_util_nacional`), a partir das 7 h no fuso da consultoria. Um job do pg_cron a cada 15 minutos chama a Edge Function `enviar-avisos-do-dia` pelo pg_net (URL e token no Vault, como a lista de espera). Quem ficou de fora às 7 h (falha, função fora do ar) recebe até 9 h 59; depois das 10 h daquele dia, não sai mais. Só consultorias em `teste` ou `ativa`; a barreira comercial (somente leitura por atraso) não para o aviso.
4. **Nunca duas vezes.** `aviso_envio` tem uma linha por membro e dia (`unique (consultoria_id, membro_id, dia)`). A função reserva antes de enviar (`reservar_aviso_do_dia`), envia pelo Resend com `Idempotency-Key` `resumo-diario/<membro_id>/<dia>` e grava o resultado (`registrar_aviso_do_dia`). Recusa do Resend: `falhou`, e o próximo ciclo tenta de novo. Sem resposta: a reserva fica e só é retomada depois de 30 minutos, e a chave de idempotência do Resend (24 h) impede o segundo e-mail. No máximo 3 tentativas por dia. O registro não guarda conteúdo do e-mail.
5. **Descadastro sem login.** Todo e-mail leva `List-Unsubscribe` (URL da função `preferencias-por-link`) e `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), e um link visível para a página pública `/avisos/parar#<token>`. O token é assinado com HMAC-SHA-256 (`AVISO_ASSINATURA`), só com ids, sem validade. Só POST desliga (GET nunca muda nada: robôs de antivírus abrem links). O link só desliga; religar é no Perfil.
6. **Feed do calendário.** Tabela `feed_calendario` com **só o hash** do token (`private.hash_do_token` sobre `private.novo_token`, 32 bytes). O token aparece uma vez, ao gerar; gerar de novo revoga o anterior; revogar é imediato. A função `feed-calendario` responde `GET /feed-calendario/<token>.ics` com eventos de dia inteiro (`DTSTART;VALUE=DATE`):
   - só os prazos em que o membro é o responsável, de hoje − 60 a hoje + 400 dias, só o prazo oficial (sem meta interna);
   - título "código · empreendimento" (sem cliente e sem o texto da condicionante);
   - membro desligado, consultoria fora de `teste`/`ativa`, token revogado ou inexistente: o mesmo 404.
7. **Exportar .ics.** O "…" do Calendário baixa o recorte visível (período e filtros, com resíduos e tarefas), gerado no navegador pela função pura `gerarIcs` de `packages/domain`. O feed usa a mesma regra em `supabase/functions/_shared/ics.ts`, porque a Edge Function (Deno) não importa o domínio; as duas passam pelos mesmos vetores de teste. Links "criar evento no Google/Outlook" do EQ-06 ficam para depois.
8. **Barreira comercial.** `preferencia_aviso` e `feed_calendario` ficam sem `_comercial_somente_leitura` (exceções já listadas no pgTAP 020): consultoria inadimplente não impede ninguém de parar de receber aviso nem de revogar o feed. `aviso_envio` tem a trigger, sem efeito prático (só a service role escreve), para não abrir exceção nova. As três têm `_suporte_somente_leitura`.
9. **Auditoria.** `preferencia_aviso` e `feed_calendario` têm `private.auditar` (sem `token_hash` e sem `ultimo_acesso_em`, para o acesso do calendário não encher a auditoria). `aviso_envio` é ele mesmo o registro e não é auditado.
10. **E-mail.** `_shared/resend.ts` concentra a URL, o tempo limite e o envio pelo Resend. As funções antigas passam a importar só as constantes de lá, sem mudar comportamento. Remetente `AVISO_REMETENTE` (domínio do beta, sem domínio novo); link do app `LINK_DO_BETA`. Nunca vão para o log: e-mails, nomes, tokens, a chave e o conteúdo.
11. **WhatsApp** fica para depois (pacote próprio, com consentimento).

## Consequências

- Uma migration aditiva (três tabelas, dez RPCs, o disparo do pg_cron) e três Edge Functions novas com `verify_jwt = false`. Segredo novo: `AVISO_ASSINATURA`. No Vault, por SQL no painel (nunca no repositório): `avisos_do_dia_url` e `avisos_do_dia_token` (mesmo valor de `CRON_TOKEN`). Sem eles, o job não chama nada.
- O token do feed vai no caminho da URL e fica nos logs de acesso da plataforma (Supabase). Mitigação: o feed só lê, mostra o mínimo, é revogável e regenerável, e o banco guarda só o hash. A URL é a da própria função; não há rewrite no `vercel.json`.
- Resend Free: 100 e-mails por dia. A Filtroville cabe; antes de abrir para muitas consultorias, contratar o Pro. Cada chamada da função tenta no máximo 60 envios (quem não tem item no dia não ocupa vaga); o resto sai no ciclo seguinte.
- Feriado municipal não conta: um feriado de Joinville que caia em dia útil nacional recebe resumo.
- Sem webhook de bounce do Resend e sem subdomínio próprio de avisos (sugestões do estudo para depois).
- A regra do gerador de .ics existe em dois lugares (domínio e `_shared`); mudar uma exige mudar a outra e os vetores de teste das duas.
