# ADR-0042: Taxa sugerida da renovação é a fase LAO da classe

- **Situação:** aceito em 20/11/2026, por decisão do Eduardo (pergunta 4 do estudo "Oito funções no Grama sem abrir janelas novas", que ficou sem recomendação). O Kadu revisa.
- **Diverge de:** o Protótipo 05.
- **Depende de:** ADR-0041 (base das oito funções). Aplica-se no pacote P2 (renovação vira orçamento).

## Contexto

Quando uma LAO entra no radar de renovação, o pacote P2 gera um rascunho de orçamento com a taxa do órgão como despesa do cliente. O domínio já calcula as taxas do IMA (`packages/domain/src/taxa-do-ima.ts`, Decreto 421/2023): cada fase do licenciamento (item 2.5) e, na renovação, o "valor da classe" (item 2.6), que hoje só aparece num comentário. O estudo deixou em aberto qual dos dois a renovação usa.

## Decisão

1. A taxa sugerida da renovação é o **valor da fase LAO da classe** (porte e potencial) da atividade, nas tabelas do Decreto 421/2023 que `calcularTaxaDoIma` já usa.
2. É só sugestão: o valor aparece preenchido e **editável** no diálogo de renovação e entra no orçamento como despesa do cliente. Nada é enviado sozinho.
3. Vale só quando o órgão da licença é o IMA, como recomendado no estudo. Para outro órgão, o campo vem vazio.

## Consequências

- O item 2.6 ("valor da classe") não é usado agora. Se o IMA cobrar outro valor na renovação, quem monta o orçamento corrige no campo.
- Diverge do Protótipo 05; o protótipo e a documentação de regras precisam ser atualizados por uma pessoa.
