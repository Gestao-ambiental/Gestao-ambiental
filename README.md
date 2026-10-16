# Gestão Ambiental (Grama)

SaaS para consultorias ambientais que transforma licenças e suas condicionantes em calendário operacional da equipe. Regras do projeto em [CLAUDE.md](CLAUDE.md); documentação em [docs/arquitetura](docs/arquitetura).

## Estrutura

```
apps/web            React + TypeScript + Vite
packages/domain     regras puras + testes
supabase/           migrations, Edge Functions e testes pgTAP
docs/               ADRs e espelho da documentação
```

## Rodar local

Requisitos: Node 24 (LTS, ver `.nvmrc`). O pnpm vem pelo corepack, que já acompanha o Node, na versão fixada em `package.json`.

```sh
corepack pnpm install
corepack pnpm dev         # apps/web em http://localhost:5173
```

Se você rodou `corepack enable pnpm`, pode omitir o `corepack` dos comandos.

### Banco

Não há Supabase local obrigatório: o desenvolvimento usa o projeto de **staging**. Copie `apps/web/.env.example` para `apps/web/.env.local` e preencha com a URL e a chave pública de staging ([docs/setup.md](docs/setup.md)).

Migrations e testes de banco rodam no CI (job `banco`), que sobe um Supabase descartável no runner do GitHub Actions, aplica `supabase/migrations` e `supabase/seed.sql` do zero e roda os testes pgTAP de `supabase/tests`.

- Nova migration: `corepack pnpm exec supabase migration new <nome>` (não precisa de Docker).
- Quem tiver Docker pode rodar o mesmo localmente: `supabase start`, `supabase db reset` e `supabase test db` (via `corepack pnpm exec`).

## Verificações (as mesmas do job `verificar` do CI)

```sh
corepack pnpm lint        # ESLint + Prettier
corepack pnpm typecheck
corepack pnpm test        # Vitest em todos os pacotes
corepack pnpm build
```

`corepack pnpm format` aplica o Prettier.
