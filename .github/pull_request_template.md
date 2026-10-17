## Card

<!-- Link da tarefa no ClickUp, ex.: https://app.clickup.com/t/86e3xxxxx -->

**Requisitos:** <!-- IDs, ex.: ACC-02, LIC-03 -->

## O que muda e por quê

## Como testar

1.

## Definition of Done

Itens verificáveis pela IA ou pelo autor. Revisão, aceite em staging e documentação são de pessoas.

- [ ] 1. CI verde: lint, tipos, testes de domínio, pgTAP e build
- [ ] 2. Toda tabela nova com `consultoria_id`, RLS forçada, políticas e teste negativo (usuário de outra consultoria recebe zero linhas)
- [ ] 3. Escrita multi-tabela em função do banco, em transação, idempotente quando repetível
- [ ] 4. Migration versionada, se houve mudança de schema
- [ ] 5. Trigger de auditoria, se tocou entidade crítica
- [ ] 6. `DATE` vs `TIMESTAMPTZ` corretos; nenhum cálculo de prazo no fuso do aparelho
- [ ] 7. Regra de cálculo em `packages/domain` com teste
- [ ] 8. Nenhum segredo em front, repositório ou log
- [ ] 9. Tela nova com vazio/carregando/erro/sem permissão, funcionando no celular e no tema escuro
