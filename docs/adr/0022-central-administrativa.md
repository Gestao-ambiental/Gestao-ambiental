# ADR-0022 — Central administrativa (primeira versão)

**Situação:** decisões do Eduardo de 14/11/2026 para a primeira versão do ADM-01 (02 Requisitos funcionais, onda 11). Migration `20261114100000_central_administrativa.sql`; teste `supabase/tests/370_central_administrativa.test.sql`.

## 1. Contexto

Com o beta, quem opera a plataforma (Eduardo e Cadu) precisa ver as consultorias cadastradas e marcar a situação de cada uma, sem entrar nos dados delas. O ADM-01 pede auditoria própria, permissão de plataforma e nada de "entrar como cliente".

## 2. Decisões

1. **Escopo:** ver e mudar a situação. Lista paginada (50) com nome, data de criação, Gestão (nome e e-mail), pessoas com vínculo ativo, orçamentos fora da lixeira, empreendimentos, licenças (instrumentos, rascunho ou ativos) e situação; busca por nome (sem acento e sem caixa) e filtro por situação. Detalhe com os mesmos números, a lista de pessoas e o histórico de situações.
2. **Situações:** `teste`, `ativa`, `suspensa`, `arquivada` (o tipo `situacao_consultoria` ganhou `teste`; o padrão continua `ativa`). Mudar exige motivo (até 500 caracteres), confere `row_version` (controle otimista) e é idempotente pela chave da operação: repetir com a mesma chave devolve a mesma versão, sem duplicar.
3. **Efeito da situação nesta versão: só registra e mostra (selo na central). Não bloqueia o acesso de ninguém.** `is_membro`, `is_gestao` e as políticas não olham `consultoria.situacao`. O teste 370 confere isso.
4. **Pessoas:** a central lista nome, e-mail, papel e situação do vínculo, sem alterar nada. Convidar, mudar papel e desligar continuam com a Gestão de cada consultoria.
5. **Acesso:** só operador da plataforma, em `private.operador_plataforma (usuario_id, criado_em)`, fora da API (schema `private`, sem grant, RLS forçada sem política). A migration não cadastra ninguém: e-mails não vão para o repositório; o cadastro é por SQL no banco. O operador entra com a própria conta do Grama.
6. **Leitura e escrita só por RPC `security definer`** que confere `private.is_operador()` (desde a ADR-0024, também a sessão com dois fatores) e devolve só os campos permitidos: `sou_operador`, `central_listar_consultorias`, `central_detalhar_consultoria`, `central_listar_pessoas`, `central_historico_situacao` e `central_mudar_situacao`. Quem não é operador (Gestão, Equipe) recebe `sem_permissao`; anônimo nem executa (sem grant). As tabelas das consultorias continuam com a RLS de sempre: o operador que não é membro lê zero linhas por consulta direta. Sem acesso a documentos, licenças, orçamentos ou arquivos: só contagens.
7. **Histórico em tabela própria, append-only** (`consultoria_situacao_historico`), e não na `auditoria`. Na `auditoria` o ator é membro (FK composta para `membro`) e a Gestão da consultoria lê tudo; o operador não é membro, e o ADM-01 pede auditoria própria da central. A tabela não tem grant para o cliente (leitura só pela RPC) e recusa update, delete e truncate até do dono, com a mesma trigger da `auditoria`. Na consultoria ficam a situação atual, o motivo, quando e quem (usuário operador).
8. **Último acesso não aparece.** Não há dado confiável: `auth.users.last_sign_in_at` só muda no login com senha (a sessão renova por refresh token sem tocá-lo) e `auth.sessions` é interno do Auth e some ao sair. Para mostrar, o app teria de registrar o acesso. **Substituído pela ADR-0024:** o app registra o uso diário (`uso_diario`) e a central mostra o último uso, as ativas e os alertas.
9. **Front:** rota `/admin` fora do contexto de consultoria (o operador pode não ser membro de nenhuma); o link aparece no menu da conta só para operador. Quem não é operador vê "sem permissão" (apresentação; quem decide é o banco).

## 3. Observação

Os membros de uma consultoria leem a própria linha de `consultoria` (RLS de sempre), o que inclui `situacao` e `situacao_motivo`. Escreva o motivo sabendo disso. Restringir colunas exigiria trocar o grant de tabela por grant por coluna.

## 4. Fica para depois

- Bloqueio por situação (o que `suspensa` e `arquivada` impedem, para quem, e a mensagem na tela).
- Planos e limites (assentos, armazenamento, extrações de IA por mês).
- ~~MFA obrigatório para operador.~~ Feito na ADR-0024 (dois fatores TOTP, sessão aal2).
- ~~Último acesso registrado pelo app.~~ Feito na ADR-0024 (sinal de uso diário).
- Cadastro de operador pela própria central (hoje é SQL no banco).
