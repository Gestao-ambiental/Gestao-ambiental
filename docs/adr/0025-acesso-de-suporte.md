# ADR-0025 — Central administrativa, fase 3: acesso de suporte

**Situação:** aceita em 14/11/2026, decisões do Eduardo e seção 13 dos Termos de Uso (seção 8 do Acordo de Dados). Complementa a ADR-0022 (fase 1) e a ADR-0024 (fase 2: dois fatores). Migration `20261114140000_acesso_de_suporte.sql`; testes `supabase/tests/400_acesso_de_suporte.test.sql` e a regra nova do `020_estrutura.test.sql`; Edge Function `supabase/functions/avisar-acesso-de-suporte` (regra e testes em `_shared/aviso-de-suporte.ts`).

## 1. Contexto

Até aqui o operador via só contagens e pessoas de cada consultoria (ADR-0022 §2.6). Para dar suporte de verdade ele precisa ver o que a consultoria vê, sem senha mestra, com a Gestão no controle e tudo registrado, como prometem os Termos (§13).

## 2. Decisões

### A. Quem entra e quando

1. **Sem senha mestra.** Só operador da plataforma (`private.is_operador()`) com sessão de dois fatores (`aal2`) entra como suporte, e sempre pela central. O operador usa a própria conta; o suporte **nunca** ganha linha em `membro`.
2. **Autorizado:** a Gestão, na tela Equipe, em "Acessos do suporte", clica "Permitir acesso do suporte", escolhe 2, 24 ou 48 horas (máximo 48, conferido também por check na tabela) e pode escrever um motivo (até 500 caracteres). Uma autorização por vez. Enquanto vale, a central mostra "Autorizado até dd/mm/aaaa às hh:mm" e "Entrar como suporte". A Gestão encerra a qualquer momento ("Encerrar acesso do suporte"): corta na hora.
3. **Emergência:** sem autorização, o operador escolhe a categoria (incidente de segurança; falha grave que impede o uso; ordem legal ou judicial) e escreve o motivo, os dois obrigatórios. Dura 2 horas, fixo. Já entra ao abrir. Com acesso valendo na consultoria, a emergência é recusada (use "Entrar como suporte").
4. **A Gestão é avisada da emergência** de dois jeitos: (i) faixa no topo das telas para todo membro Gestão, com data, hora, operador, categoria e motivo, até um Gestão clicar "Marcar como visto" (`avisos_de_suporte_pendentes`, `marcar_aviso_de_suporte_visto`); (ii) e-mail para a Gestão ativa pela Edge Function `avisar-acesso-de-suporte`, que o front da central chama logo depois do RPC. A função confere com o JWT de quem chama (`dados_do_aviso_de_emergencia`: operador com dois fatores e emergência valendo aberta por ele), lê os e-mails com a service role e envia pelo Resend. Sem `RESEND_API_KEY` ou `AVISO_REMETENTE`, responde `configuracao_ausente` (503); o acesso continua e a central mostra que o e-mail não saiu antes de entrar. O log da função tem só id do acesso, etapa e status; nunca e-mail, chave ou motivo.
5. **Fim:** o acesso vale enquanto `agora < fim previsto`, conferido a cada leitura, sem cron. Encerrar pela Gestão, pelo operador ("Sair do acesso de suporte", que encerra o acesso inteiro) ou pelo prazo. Os dois primeiros gravam um evento; o fim pelo prazo é o próprio fim previsto e aparece no histórico como "Pelo prazo".

### B. Só leitura, garantido no banco

6. **Leitura:** `private.is_membro(cid)` e `private.is_gestao(cid)` passaram a aceitar, além do vínculo ativo, o acesso de suporte ativo de quem chama (`private.suporte_ativo`: operador, `aal2`, acesso começado, antes do fim, não encerrado e com entrada efetiva dele). Assim as políticas de select, as RPCs de leitura (security definer ou não) e a política de leitura do Storage passam a ler para o suporte como para a Gestão, inclusive orçamentos e arquivos. `private.membro_atual` **não** mudou: o suporte não tem membro, e autor e ator continuam sendo sempre membro (nas leituras que filtram "minhas", o suporte não tem nada seu).
7. **Escrita:** trigger `BEFORE INSERT OR UPDATE OR DELETE` chamada `_suporte_somente_leitura` (`private.bloquear_escrita_do_suporte`) em **toda tabela de `public` com `consultoria_id`** e na própria `consultoria`, criada por laço na migration. Ela recusa com `acesso_de_suporte_somente_leitura` (42501) quando quem escreve é operador com acesso de suporte valendo naquela consultoria e sem vínculo de verdade com ela, com qualquer nível de sessão. Trigger dispara também dentro de RPC `security definer`, então vale para toda RPC de escrita, atual ou futura. O nome começa com `_` para disparar antes das outras triggers BEFORE. Quem não é operador sai na primeira linha (uma busca pela chave primária).
8. **Exceções da trigger, todas da plataforma:** `consultoria_situacao_historico`, `acesso_suporte` e `acesso_suporte_evento` (escritas só por RPCs com conferência própria) e, em `consultoria`, a mudança de situação feita pela central (operador com dois fatores alterando só as colunas da situação, ADR-0022). O teste 020 exige a trigger em toda tabela nova de `public` com `consultoria_id`; a lista de exceções está no próprio teste.
9. **Storage:** a política de envio (`arquivos_insert_membro_ativo`) passou a usar `private.is_membro_vinculado` (vínculo de verdade). A leitura continua com `is_membro`. Não há trigger em `storage.objects` (a tabela é do Supabase Storage).
10. **RPCs de escrita que exigem autor** (`membro_atual` nulo → `sem_permissao`, como criar empreendimento, criar orçamento e convidar) recusam antes de chegar à trigger. As demais chegam à trigger. Em modo suporte, o front mostra as duas como "Acesso de suporte é somente leitura." (`definirModoSuporte` em `lib/erros.ts`).
11. **As ações da Gestão sobre o suporte exigem vínculo de verdade** (`private.is_gestao_vinculada`): o suporte, que lê como Gestão, não autoriza, não encerra como Gestão e não marca o aviso como visto.

### C. Registro

12. **Duas tabelas próprias, append-only** (não a `auditoria`, cujo ator é membro): `acesso_suporte` (uma linha por acesso: modo, categoria, motivo, início, fim previsto, quem autorizou ou abriu) e `acesso_suporte_evento` (entradas efetivas do operador, encerramento pela Gestão ou pelo operador, aviso visto). As duas recusam update, delete e truncate até do dono (a mesma trigger da `auditoria`). Escolhemos eventos em vez de colunas de encerramento num registro mutável: assim não existe caminho de alteração para auditar, e cada mudança de estado tem autor e instante próprios. Um encerramento e um "visto" por acesso (índices únicos parciais).
13. **Quem vê:** a Gestão da consultoria (seção "Acessos do suporte" na Equipe, `listar_acessos_de_suporte`; e direto nas tabelas, pela RLS) e os operadores na central (`central_acessos_de_suporte`, com dois fatores). Equipe e outras consultorias leem zero linhas e recebem `sem_permissao` nas RPCs.

### D. O suporte não é pessoa da consultoria

14. Não tem linha em `membro`: não aparece na Equipe nem nas contagens da central (pessoas ativas), não convida nem muda papel (a trigger recusa), não registra uso (`registrar_uso` exige membro; o front nem chama em modo suporte) e não completa cadastro (o front pula `RequerCadastroCompleto`).

### E. Como o operador entra e sai (front)

15. **Central, detalhe da consultoria, seção "Acesso de suporte":** "Sem autorização", "Autorizado até …" ou "Acesso de emergência até …"; "Entrar como suporte" quando há acesso valendo; "Acesso de emergência" quando não há (diálogo com categoria e motivo, validados no front e no banco); histórico.
16. **Entrar:** `entrar_como_suporte` registra a entrada; o app grava a escolha no aparelho (`grama:suporte:<usuário>`), limpa o cache das telas e abre `/` em modo suporte. `RequerConsultoria` só abre o modo suporte se a consultoria está em `meus_acessos_de_suporte` (acessos valendo com entrada do operador), relido a cada minuto, ao voltar para a aba e no fim previsto. Em modo suporte o contexto tem um vínculo de apresentação (papel Gestão, sem membro), o rail mostra "Suporte" e o menu da conta lista os acessos de suporte valendo como opção de consultoria.
17. **Faixa permanente** no topo de todas as telas da consultoria (inclusive as de tela cheia): "Acesso de suporte · somente leitura · termina às hh:mm" no fuso da consultoria (com a data, "termina em dd/mm/aaaa às hh:mm", quando acaba em outro dia), região nomeada com o texto em `role="status"`, e "Sair do acesso de suporte".
18. **Sair:** "Sair do acesso de suporte" encerra no banco e volta para a consultoria na central com "Você saiu do acesso de suporte.". Se o acesso acabou (Gestão encerrou ou o prazo venceu), o app volta para a central com "O acesso de suporte terminou.".
19. **Apresentação em modo suporte:** a Equipe esconde convidar, mudar papel, desligar, convites e as ações sobre o suporte. As outras telas mantêm os botões; a escrita falha com a mensagem do item 10.

## 3. Consequências

- `is_membro` e `is_gestao` agora consultam o acesso de suporte quando quem chama não tem vínculo e é operador. Para quem não é operador, o custo extra é uma busca pela chave primária em `private.operador_plataforma`.
- Toda tabela nova de `public` com `consultoria_id` precisa da trigger `_suporte_somente_leitura` na mesma migration (o 020 quebra sem ela). Modelo: `create trigger _suporte_somente_leitura before insert or update or delete on public.<tabela> for each row execute function private.bloquear_escrita_do_suporte();`.
- Operador que tem acesso de suporte valendo numa consultoria não consegue aceitar convite para ela enquanto o acesso vale (a trigger em `membro` recusa). Caso raro; encerre o acesso antes.
- Operador que é membro de uma consultoria não entra nela como suporte (`suporte_em_consultoria_propria`): entra pelo vínculo.

## 4. Configuração antes de publicar

- Edge Function `avisar-acesso-de-suporte`: publicar e definir os segredos `RESEND_API_KEY` e `AVISO_REMETENTE` (ex.: `Grama <avisos@beta.gramaapp.com.br>`, domínio verificado no Resend). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm do Supabase. `verify_jwt` fica no padrão (ligado).
- Aplicar a migration em staging e produção pela CLI e conferir o 400 no job `banco` do CI.

## 5. Fica para depois

- **Modo de escrita** com permissão expressa da Gestão para cada alteração (Termos §13.4): o pedido, a aprovação, a alteração única e o registro do antes e depois.
- **Ordem legal que proíbe avisar a Consultoria:** hoje a emergência por ordem legal avisa a Gestão como as outras (faixa e e-mail). Falta decidir com o advogado como registrar sem avisar e quando avisar depois.
- Registrar **o que o suporte viu** (telas ou registros abertos). Hoje o registro tem quem, quando, modo, categoria, motivo, duração, entradas e encerramento; como o acesso só lê, nenhum dado é alterado.
- Reenviar o e-mail de aviso pela central quando o primeiro não saiu.
- Encerrar automaticamente o acesso quando o operador perde o papel de operador (hoje ele só deixa de ler, porque `suporte_ativo` exige `is_operador`).
