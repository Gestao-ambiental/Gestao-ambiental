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

## Verificações (as mesmas do CI)

```sh
corepack pnpm lint        # ESLint + Prettier
corepack pnpm typecheck
corepack pnpm test        # Vitest em todos os pacotes
corepack pnpm build
```

`corepack pnpm format` aplica o Prettier.
