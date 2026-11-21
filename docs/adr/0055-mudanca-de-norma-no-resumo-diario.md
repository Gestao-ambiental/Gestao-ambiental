# ADR-0055: Mudança de norma no resumo diário (L7)

- Situação: proposta (camada `camada/avisos-de-normas`)
- Data: 21/11/2026
- Detalha: ADR-0050 (decisão 23, "Como chega o aviso"), ADR-0047 (avisos do P5)

## Contexto

A ADR-0050 decidiu que o aviso de mudança de norma chega pelo resumo diário do P5, sem sino e sem e-mail por mudança, e que só a revogação de norma que afeta licença ativa pede e-mail na hora. Faltava ligar a `aviso_norma` (L5) ao resumo (P5).

## Decisão

- **Quem recebe**: a Gestão (todas as mudanças da consultoria) e os responsáveis pelas condicionantes das licenças afetadas (as daquela licença). Aviso sem licença (só no empreendimento) vai só para a Gestão. Regra em `private.recebe_aviso_de_norma`.
- **No resumo diário**: `normas_do_resumo_diario(consultoria, membro, dia)` traz as mudanças **publicadas** (revisadas na Central), ainda não vistas no Grama, publicadas desde o último resumo enviado à pessoa (no máximo 7 dias), para não repetir. O e-mail ganha a seção "Mudanças de norma (n)", depois dos prazos; quem só tem mudança de norma também recebe (assunto "Grama: mudanças de norma de dd/mm/aaaa").
- **E-mail na hora**: só para `tipo = 'revogada'` com ao menos uma licença **ativa** afetada (`revogacoes_para_avisar`). Um por pessoa e mudança (`aviso_revogacao_envio`, com reserva e até 3 tentativas, como o `aviso_envio`), com Idempotency-Key `revogacao/<membro>/<mudança>`. Sai a cada chamada do cron, fora do horário do resumo.
- **Preferências e descadastro do P5**: os dois respeitam `preferencia_aviso.resumo_diario` e o link de descadastro (List-Unsubscribe); só consultoria em teste ou ativa.
- A regra do e-mail na hora e o texto da linha ficam em `packages/domain/src/aviso-de-norma.ts`, com cópia em `supabase/functions/_shared/aviso-de-norma.ts` (o teste do domínio confere que são iguais).
- Sem sino (NOT-03 continua fora) e sem tela nova.

## Consequências

- Migration `20261121190000_avisos_de_normas.sql`, pgTAP 764 (com o negativo de outra consultoria), testes Deno em `_shared/avisos-do-dia.test.ts`.
- A Edge Function `enviar-avisos-do-dia` precisa ser republicada; não há segredo novo.
