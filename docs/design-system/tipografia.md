# Tipografia e densidade

Segunda rodada da revisão de UI (23/11/2026), focada em tipografia e densidade. Motivo: a equipe relatou excesso de negrito, falta de hierarquia e "coisa demais na tela".

## Como estava

Medido nas 25 telas do beta:

- 44 combinações de tamanho, peso e cor de texto
- 11 tamanhos (10, 11, 12, 14, 16, 20, 22, 24, 26, 34 e 46px) e 5 pesos (400, 600, 650, 700 e 750)
- 63% do texto em negrito (492 de 784 elementos)

## Escala: quatro níveis

| Nível | Utilitário | Estilo | Uso |
| --- | --- | --- | --- |
| Título da página | `titulo-tela` | 34px Anton, maiúsculas | um por tela |
| Título de seção | `titulo-secao` (e `titulo-painel`, que agora é igual) | 16px, peso 600 | seção, painel, estado vazio |
| Texto | `corpo` | 14px, peso 400 | valor, conteúdo, célula de tabela |
| Texto secundário | `rotulo` e `rotulo-maiusculo` | 12px, peso 400, `--tinta-2` | rótulo de campo, cabeçalho de tabela, metadado, data, contagem auxiliar |

Fora da escala de texto, com regra própria:

- **Número-chave** em Anton (`numero-grande` 46px e `numero-contagem` 26px): placar, preço, total.
- **Botão** e **selo de situação** são componentes e mantêm o peso 600.

## Quando usar negrito

Negrito (peso 600) só em:

1. título de seção;
2. número-chave;
3. rótulo de botão e selo de situação.

Todo o resto é peso 400. `corpo-medio` (14/600) não serve para dar ênfase a texto comum, nome de item, data, rótulo ou valor de tabela: use `corpo` e, se precisar destacar, use a cor `--tinta` contra o `--tinta-2` do entorno. Não use os pesos 650, 700 nem 750 (`font-[650]`, `font-[750]`, `font-bold`).

## Rótulo mais fraco que o valor

O rótulo de campo é texto secundário: 12px, peso 400, cinza. O valor fica em 14px, peso 400, na cor principal. A diferença de tamanho e de cor já faz a hierarquia, sem negrito.

## Densidade

Nenhuma funcionalidade sai sem aprovação. Cada tela lista o que poderia ser escondido, agrupado ou removido, e a lista vai para aprovação antes de qualquer mudança.
