# ADR-0024 — Central administrativa, fase 2: dois fatores e sinal de uso

**Situação:** aceita em 14/11/2026, decisões do Eduardo. Complementa a ADR-0022 (fase 1 da central) e muda dois itens dela: o "Último acesso não aparece" (§2.8) e o "Fica para depois" de MFA e último acesso (§4). Migration `20261114130000_central_fase_2.sql`; teste `supabase/tests/390_central_fase_2.test.sql` (o 370 passou a autenticar o operador com dois fatores).

## 1. Contexto

A central da fase 1 mostrava as consultorias, mas não dizia quem está usando o Grama, e qualquer operador entrava só com a senha. Com o beta, o operador precisa ver quem usa, quem parou de usar e com que frequência; e a conta do operador, que vê todas as consultorias, precisa de mais que uma senha.

## 2. Decisões

### A. Dois fatores (TOTP do Supabase Auth)

1. **Obrigatórios para a central.** As RPCs de dados da central (`central_listar_consultorias`, `central_detalhar_consultoria`, `central_listar_pessoas`, `central_historico_situacao`, `central_mudar_situacao` e as novas desta fase) exigem operador **e** sessão `aal2` (`auth.jwt() ->> 'aal' = 'aal2'`). A regra fica em `private.exigir_operador()`, que todas chamam: primeiro o papel (quem não é operador recebe `sem_permissao`, com qualquer nível), depois o nível (operador com `aal1` recebe `dois_fatores_necessarios`, código 42501). `sou_operador` continua respondendo com `aal1`, sem dados, para o front saber que deve pedir o código.
2. **Front em `/admin`:** operador sem fator cadastrado vê o cadastro (botão "Ativar dois fatores", QR code, chave e o primeiro código de 6 dígitos); operador com fator e sessão `aal1` vê "Confirme o código"; com `aal2`, a central abre. O fator só é criado quando a pessoa pede; cadastro anterior que ficou pela metade (fator não verificado) é descartado antes do novo. A decisão usa `mfa.getAuthenticatorAssuranceLevel()` e `mfa.listFactors()`; é apresentação, quem recusa é o banco. O erro `dois_fatores_necessarios` não vira "sem permissão": a tela relê os dois fatores.
3. **Segurança no perfil (`/seguranca`, menu da conta):** qualquer pessoa vê se tem dois fatores, ativa (mesmo fluxo) e remove. Remover exige sessão `aal2`, como o Supabase exige: com `aal1`, a tela pede o código antes. Fora da central, dois fatores são opcionais.
4. **Recuperação:** operador que perde o celular não tem como gerar código. Outro operador remove o fator por SQL no painel do Supabase (`delete from auth.mfa_factors where user_id = '<id do usuário>';`), avisa a pessoa e ela cadastra um fator novo no próximo acesso à central. Não há código de recuperação no app nesta fase.
5. **Configuração do projeto Supabase:** o TOTP precisa estar habilitado em Authentication → Multi-Factor (habilitado por padrão nos projetos novos). Conferir em staging e produção antes de publicar.

### B. Sinal de uso diário

6. **Tabela `uso_diario`:** uma linha por pessoa (`membro_id`, FK composta com `consultoria_id`), dia e área, com `primeiro_em` e `ultimo_em` (TIMESTAMPTZ). O dia é DATE no fuso da consultoria (`consultoria.fuso`), nunca no fuso do aparelho. Áreas, por check: `licencas_e_prazos`, `orcamentos`, `propostas`, `equipe_e_conta`. IA não é área (nada de IA mudou).
7. **Ninguém lê nem escreve direto.** RLS habilitada e forçada; a única política é de select com `using (false)` (o teste 020 exige ao menos uma política por tabela) e não há política de escrita nem grant de escrita. O grant de select fica só para a consulta direta devolver zero linhas (como nas outras tabelas). A Gestão da consultoria **não** vê o uso individual da equipe.
8. **Escrita só por `registrar_uso(p_consultoria_id, p_modulo)`**, security definer: confere que quem chama é membro ativo da consultoria, calcula o dia no fuso dela e grava ou renova `ultimo_em`. Idempotente: repetir não cria linha; só renova quando o último registro tem mais de 5 minutos.
9. **No front,** `useRegistroDeUso` (em `RequerConsultoria`) mapeia a rota para a área (`moduloDaRota`, no domínio): visão da equipe, calendário, empreendimentos, ocorrências, acompanhamentos, renovações e cadastro de licença → licenças e prazos; orçamentos, primeiros passos e custos → orçamentos; proposta pronta e dados da proposta → propostas; equipe, perfil e segurança → equipe e conta. Registra no máximo uma vez a cada 5 minutos por área, só com a aba visível, e renova a cada 5 minutos enquanto a pessoa fica na tela. Central, telas sem consultoria e rotas sem área não registram. Falha nunca aparece para a pessoa.

### C. A central mostra o uso

10. **Visão geral:** consultorias com uso agora (algum `ultimo_em` nos últimos 15 minutos), nos últimos 7 e nos últimos 30 dias (`central_resumo_de_uso`).
11. **Alertas:** "sem uso há 14 dias": consultoria com pessoas ativas e nenhum uso nos últimos 14 dias, incluindo a que nunca usou e foi criada há mais de 14 dias (`central_alertas_sem_uso`, paginada, mais tempo parada primeiro). **Arquivadas ficam de fora** (decisão tomada nesta implementação: já foram encerradas de propósito; ver §4).
12. **Lista:** coluna "Último uso" (`Agora` nos últimos 15 minutos, senão a data dd/mm/aaaa no fuso da consultoria; `Nunca` sem registro).
13. **Detalhe:** por pessoa, último uso (`Agora` ou dd/mm/aaaa às hh:mm no fuso da consultoria) e dias com uso em 30 dias (hoje incluído); por consultoria, dias com uso por área em 30 dias (`central_uso_por_modulo`, as quatro áreas sempre, zero quando não houve uso).
14. **Regras no domínio** (`packages/domain/src/uso-da-plataforma.ts`, com teste): limiares (15 minutos, 14 dias, 30 dias, 5 minutos), `moduloDaRota`, `classificarUltimoUso` (nunca, agora, hoje ou há N dias civis no fuso), `precisaDeAlertaDeSemUso` e os rótulos. O front passa os limiares às RPCs (`p_minutos_agora`, `p_dias`); o banco usa os mesmos valores como padrão.

## 3. Consequências

- Operador novo precisa do celular com um aplicativo autenticador no primeiro acesso à central.
- O 370 mudou de propósito: o operador entra com `testes.autenticar_com_dois_fatores` (aal2) nas asserções de dados. Os helpers de teste ganharam o nível da sessão (`autenticar_como` continua aal1).
- Termos de Uso (14.3) e Acordo de Dados (9.4) ganharam a frase sobre o registro de uso.

## 4. Fica para depois

- Códigos de recuperação de dois fatores no app (hoje a recuperação é por SQL, item 4).
- Retenção do `uso_diario` (hoje não apaga nada; a tabela cresce no máximo 4 linhas por pessoa por dia).
- Se a consultoria **suspensa** deve sair do alerta (hoje fica, porque suspensa ainda tem acesso: ADR-0022 §2.3).
