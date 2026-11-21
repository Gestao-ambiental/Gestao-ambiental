# ADR-0040: Entrar com Google

- Situação: proposta (camada `camada/identidade-nova`)
- Data: 20/11/2026
- Muda: ADR-0004 ("login por e-mail + senha") e a linha "Auth (e-mail + senha)" da tabela de stack do `CLAUDE.md` (a atualizar por uma pessoa)

## Contexto

O Eduardo pediu "Entrar com Google", como os SaaS pesquisados para a tela de login (14 de 14 oferecem Google ou SSO). O Grama usa Supabase Auth no fluxo implícito, com convite por e-mail e o token do convite guardado só como hash.

## Decisão

- **Provedor Google do Supabase Auth** (`signInWithOAuth`), ao lado de e-mail e senha, nas telas de entrar, criar conta e convite. Sem segredo no front: Client ID e Secret ficam no painel do Supabase.
- **Antes de sair do Grama**, o front lê as configurações públicas do Auth (`GET /auth/v1/settings`). Com o Google desligado, mostra "Entrar com Google ainda não está disponível. Use e-mail e senha." em vez de levar a pessoa a uma página de erro do Supabase.
- **Retorno:** o Google volta para `/entrar?para=…` (ou para o convite). Erros vêm na URL e viram frases claras: cancelou, e-mail não verificado, provedor desligado e falha genérica. A tela segue com e-mail e senha.
- **Conta nova:** o Supabase cria a conta; a pessoa cai no mesmo caminho de quem criou conta por senha (escolher ou criar consultoria e "Complete seu cadastro" para gênero e formação).
- **Nome:** `private.nome_do_usuario` e o front leem `nome` e, na falta, `full_name` ou `name` do Google.
- **Nome escolhido (20/11/2026):** "Meu perfil" deixa trocar o nome, para quem entrou com senha ou com Google. O front grava `user_metadata.nome` pelo Auth (`updateUser`), sem migration: `nome` já vence o do Google e o pedaço do e-mail, a trigger `membro_sincronizar_identidade` copia para todos os vínculos (responsável, auditoria, propostas) e entrar de novo pelo Google só reescreve `full_name` e `name`. pgTAP 611.
- **Convite:** o "Continuar com Google" do convite volta para `/convite?token=…&aceitar=1`. Com o e-mail do Google igual ao do convite, o aceite segue sozinho; com outro e-mail, a tela já mostra "você está como X, mas o convite é para Y" e o banco recusa (`convite_de_outra_conta`). `consultar_convite` passa a tratar como "conta pronta" quem já tem identidade Google, para não pedir senha. O token continua só como hash no banco.
- **E-mail já cadastrado com senha:** o Supabase vincula a identidade Google à conta existente quando o e-mail do Google é verificado (vinculação automática). A pessoa passa a poder entrar pelos dois jeitos, na mesma conta e com os mesmos vínculos.

## Consequências

- Migration `20261120182732_entrar_com_google.sql` (nome vindo do Google e "conta pronta" no convite), com o pgTAP 610.
- Configuração manual de uma vez, feita pelo Eduardo: cliente OAuth no Google Cloud e provedor Google no Supabase, com as URLs de retorno das prévias e do beta (passo a passo nas notas da sessão).
- A conferir com o provedor ligado, em staging: vinculação com conta de senha existente; conta criada pelo link do convite (sem senha e ainda não confirmada) e depois entrada pelo Google com o mesmo e-mail.
- O Google não aceita curinga nas origens: cada prévia que usar o Google precisa ser cadastrada no cliente OAuth.
