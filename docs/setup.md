# Setup dos ambientes remotos

Passo a passo do que **uma pessoa** faz nos painéis do Supabase, do GitHub e da Vercel. Nada disso é feito pelo código nem pela IA: contas, projetos e segredos ficam com você.

Ao final você terá:

| Ambiente | Banco/Auth/Storage                               | Front                        | Como recebe mudanças                                                 |
| -------- | ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| CI       | Supabase descartável no runner do GitHub Actions | build                        | migrations + seed do zero e pgTAP em todo PR (job `banco`)           |
| Local    | usa o projeto de **staging** (sem Docker)        | `corepack pnpm dev`          | —                                                                    |
| Staging  | projeto Supabase `gestao-ambiental-staging`      | preview da Vercel em cada PR | migrations aplicadas pelo GitHub Actions a cada push na `main`       |
| Produção | projeto Supabase `gestao-ambiental-prod`         | produção da Vercel           | só por disparo manual, depois de staging (passo 6, antes do go-live) |

> Nunca cole senha, token ou chave secreta em issue, PR, commit, chat ou log. Segredos vivem só no GitHub (Secrets) e na Vercel (Environment Variables).

## Onde pegar cada valor

| Valor                            | Onde fica                                                                                                                                                          | Vai para                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Senha do banco                   | Você define ao criar o projeto (passo 1). Se perder: Supabase → projeto → **Database → Settings → Reset database password**.                                       | Secret `DEPLOY_SUPABASE_DB_PASSWORD` no environment    |
| Project ID (Reference ID)        | Supabase → projeto → **Project Settings → General → Project ID**. É também o trecho `xxxx` em `https://xxxx.supabase.co`.                                          | Variable `DEPLOY_SUPABASE_PROJECT_ID` no environment   |
| Access token                     | <https://supabase.com/dashboard/account/tokens> (menu do seu avatar → **Account → Access Tokens**). É da sua conta, não do projeto.                                | Secret `DEPLOY_SUPABASE_ACCESS_TOKEN` no environment   |
| Project URL                      | Supabase → projeto → **Project Settings → Data API → Project URL** (`https://xxxx.supabase.co`).                                                                   | Vercel `VITE_SUPABASE_URL`                             |
| Chave pública (publishable/anon) | Supabase → projeto → **Project Settings → API Keys** → **Publishable key** (`sb_publishable_…`). Se o projeto mostrar só as chaves legadas, use a **anon public**. | Vercel `VITE_SUPABASE_ANON_KEY`                        |
| Deploy hook de produção          | Vercel → projeto → **Settings → Git → Deploy Hooks** (passo 6).                                                                                                    | Secret `DEPLOY_VERCEL_HOOK` no environment de produção |

**Nunca** use a **secret key** (`sb_secret_…`) nem a **service_role** em lugar nenhum deste guia. Elas ignoram RLS e só podem existir em Edge Functions e no CI quando for preciso.

## 1. Criar os projetos no Supabase

Repita para `gestao-ambiental-staging` e depois para `gestao-ambiental-prod`.

1. Entre em <https://supabase.com/dashboard> e escolha (ou crie) a organização. Plano **Free** (ADR-0011: Pro só antes de dado real).
2. **New project**:
   - **Name:** `gestao-ambiental-staging` (depois `gestao-ambiental-prod`).
   - **Database password:** clique em **Generate a password** e guarde no seu gerenciador de senhas. Uma senha diferente por projeto.
   - **Region:** **South America (São Paulo)** (`sa-east-1`). Não dá para mudar depois.
3. **Create new project** e espere ficar pronto (1 a 2 minutos).
4. Anote o **Project ID**, a **Project URL** e a **chave pública** (tabela acima).

> O plano Free pausa projetos sem uso por uma semana. Se o staging pausar, reative em **Project → Restore**. Isso é aceito na construção e resolvido com o Pro no go-live.

## 2. Configurar o Auth de cada projeto

O `supabase/config.toml` vale só para o ambiente local; os projetos remotos são configurados no painel. Em **cada** projeto:

1. **Authentication → Sign In / Providers → Email**:
   - **Enable Email provider:** ligado.
   - **Confirm email:** ligado.
   - **Minimum password length:** `8`.
   - **Save**.
2. **Authentication → URL Configuration**:
   - **Staging:**
     - **Site URL:** a URL de qualquer preview da Vercel que você vai receber no passo 4. O app manda o endereço de retorno em cada e-mail; a Site URL é só o padrão. Pode voltar aqui depois do passo 4.
     - **Redirect URLs:** adicione `https://*-<time>.vercel.app/**` (troque `<time>` pelo slug do seu time na Vercel, que aparece nas URLs de preview) e `http://localhost:5173/**`. É esse curinga que libera os previews de todos os PRs.
   - **Produção:**
     - **Site URL:** a URL de produção da Vercel (ex.: `https://gestao-ambiental.vercel.app`) ou o domínio próprio, quando existir.
     - **Redirect URLs:** a mesma URL com `/**` no final.
3. **Authentication → Sign In / Providers → Email** (épico 2, convite e senha):
   - **Secure password change:** desligado. Quem chega pelo link do convite define a senha logo em seguida, sem senha anterior.
   - **Email OTP Expiration:** `3600` (1 hora). A tela de recuperação de senha diz "Ele vale por 1 hora".
4. **Authentication → Emails → Templates** (épico 2). O convite viaja pelo e-mail do próprio Auth: a gestão convida, o app chama `signInWithOtp` para o e-mail convidado e o link volta para `/convite?token=…` já com a sessão da pessoa. Para conta nova o Auth usa o modelo **Confirm signup**; para conta existente, **Magic Link**. Troque o texto padrão (em inglês) por um neutro, que sirva para convite e para acesso, mantendo `{{ .ConfirmationURL }}`:
   - **Assunto:** `Seu acesso ao Grama`
   - **Corpo:** `<p>Você recebeu um link de acesso ao Grama, a ferramenta de licenças e prazos da sua consultoria.</p><p><a href="{{ .ConfirmationURL }}">Abrir o Grama</a></p><p>O link vale por 1 hora e funciona uma vez. Se você não esperava este e-mail, ignore.</p>`
   - **Reset Password:** assunto `Criar senha nova no Grama`, corpo com o mesmo link e a validade de 1 hora.

> Os e-mails (confirmação, convite e senha) usam o SMTP padrão do Supabase, que só entrega para endereços da equipe da organização no Supabase e manda poucos e-mails por hora. Para convidar a equipe real do piloto é preciso configurar o SMTP próprio (Resend) em **Authentication → Emails → SMTP Settings** — só painel, sem mudança de código. Ele é item do go-live (F12).

## 3. Credenciais de deploy no GitHub

Antes do merge que ativa estes workflows, um administrador deve criar os environments
`supabase-staging` e `supabase-producao` em **Settings → Environments**. Em cada um, selecione
**Selected branches and tags** e permita apenas a branch `main`, sem tags. Proteja a `main` com
revisão obrigatória de PR e checks de CI. Configure aprovação separada para produção.
[Configuração de environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

| Nome                           | Tipo no environment              | Valor                                                            |
| ------------------------------ | -------------------------------- | ---------------------------------------------------------------- |
| `DEPLOY_SUPABASE_ACCESS_TOKEN` | Secret                           | Token de gerenciamento com o menor acesso necessário ao ambiente |
| `DEPLOY_SUPABASE_DB_PASSWORD`  | Secret                           | Senha do banco desse ambiente                                    |
| `DEPLOY_SUPABASE_PROJECT_ID`   | Variable                         | Identificador do projeto desse ambiente                          |
| `DEPLOY_VERCEL_HOOK`           | Secret só em `supabase-producao` | URL do deploy hook de produção                                   |

Use credenciais independentes para staging e produção. Ao transferir o deploy, remova as
credenciais antigas do escopo do repositório e confirme que estes segredos também não são
herdados da organização. Faça rotação dos valores que foram usados no escopo anterior.

O workflow **Migrations** aplica o schema e publica a Edge Function em staging a cada push
na `main`. Em PR, o CI valida migrations, tipos e testes com Supabase descartável no runner.

### 3.1 Segredo da extração por IA (Edge Function)

A chave do OpenRouter fica **só** nos segredos das Edge Functions do Supabase: nunca no GitHub, no front ou no repositório (ADR-0006).

1. Em <https://openrouter.ai/settings/keys> crie uma chave (`gestao-ambiental-staging`), com limite de crédito. Em **Settings → Privacy**, deixe desligado o uso de provedores que guardam ou treinam com os dados (a função também pede isso em cada chamada).
2. No Supabase **de staging** → **Edge Functions → Secrets** (ou `supabase secrets set --project-ref <id>`), cadastre:

| Nome                 | Valor                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY` | a chave do item 1                                                            |
| `OPENROUTER_MODEL`   | opcional; padrão `openai/gpt-4.1-mini` (trocar o modelo é trocar este valor) |

Sem `OPENROUTER_API_KEY`, a extração falha com "IA indisponível" e o cadastro manual continua completo. Em produção, repita com uma chave própria de produção.

A extração paga reserva uma vaga no banco antes de chamar o provedor. Os valores iniciais
são 10 chamadas por conta, 25 por consultoria e 100 por projeto em uma janela de 24 horas,
com até 4 reservas recentes em andamento por projeto. São limites operacionais do piloto.
A equipe pode ajustá-los com acesso administrativo à tabela privada `limite_extracao_ia`.
Defina o teto de crédito no provedor por ambiente e acompanhe o consumo.

## 4. Vercel com preview por PR

1. Entre em <https://vercel.com> → **Add New… → Project** → **Import Git Repository**.
2. Se o repositório não aparecer: **Adjust GitHub App Permissions** → instale o app da Vercel na organização `Gestao-ambiental` com acesso ao repositório `Gestao-ambiental`.
3. Na tela de configuração:
   - **Project Name:** `gestao-ambiental`.
   - **Root Directory:** deixe a **raiz** (`./`). O `vercel.json` da raiz já define instalação (`pnpm` via corepack), build (`pnpm --filter @gestao-ambiental/web build`), saída (`apps/web/dist`) e o rewrite de SPA.
   - **Framework Preset:** Vite (vem do `vercel.json`); não altere os comandos de build.
4. **Environment Variables**: cadastre as duas variáveis **duas vezes**, uma para cada ambiente da Vercel. Desmarque **Development**.

| Variável                 | Ambiente da Vercel | Valor                         |
| ------------------------ | ------------------ | ----------------------------- |
| `VITE_SUPABASE_URL`      | **Preview**        | Project URL **de staging**    |
| `VITE_SUPABASE_ANON_KEY` | **Preview**        | chave pública **de staging**  |
| `VITE_SUPABASE_URL`      | **Production**     | Project URL **de produção**   |
| `VITE_SUPABASE_ANON_KEY` | **Production**     | chave pública **de produção** |

5. **Deploy**. Depois, em **Settings → Build and Deployment → Node.js Version**, confirme **24.x**.

Como fica o comportamento:

- Todo PR ganha um **preview** apontando para o Supabase de staging. A Vercel comenta a URL no PR. É lá que o Eduardo faz o aceite.
- Push na `main` **não** publica produção sozinho (`git.deploymentEnabled.main = false` no `vercel.json`). A produção só é publicada pelo passo 6, depois que a migration de produção foi aplicada, para o front nunca chegar antes do schema.
- O deploy feito pela importação, logo no passo 5, pode sair como produção sem banco ainda configurado. É inofensivo: o app ainda não tem dados.

## 5. Conferir

1. Abra um PR qualquer (o do épico 1 serve). Confira:
   - os checks **Lint, tipos, testes e build** e **Banco (migrations, seed e pgTAP)** verdes;
   - o comentário da Vercel com a URL do preview, e a página abrindo.
2. Faça o merge. Em **Actions → Migrations**, o job **Aplicar migrations em staging** deve ficar verde.
3. No Supabase de staging → **Storage**: o bucket **arquivos** existe e está marcado como **private**.

## 6. Produção (antes do go-live, não agora)

Produção é publicada pelo workflow **Deploy produção** (`.github/workflows/deploy-producao.yml`),
por disparo manual na `main` e com as proteções do environment de produção.

1. Vercel → projeto → **Settings → Git → Deploy Hooks** → nome `producao`, branch `main` → **Create Hook** → copie a URL. Teste uma vez com `curl -X POST <url>` e confira em **Deployments** que saiu um deploy de **Production**.
2. Cadastre a URL em `DEPLOY_VERCEL_HOOK` no environment `supabase-producao` (passo 3).

Para publicar: GitHub → **Actions → Deploy produção → Run workflow**, branch **main**. O workflow segue sempre esta ordem e para no primeiro erro: migrations pendentes em staging → migrations em produção → deploy de produção na Vercel. Assim o front de produção nunca chega antes do schema.
