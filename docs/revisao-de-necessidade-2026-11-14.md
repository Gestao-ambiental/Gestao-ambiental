# Revisão de necessidade do código: branch-do-duds (14/11/2026)

Pergunta do Eduardo: "a gente fez 43 mil linhas de código? É isso mesmo? Tudo isso é necessário?"

Esta revisão olhou quatro áreas (telas, domínio e API, banco, documentação e apoio). Cada achado foi conferido por um segundo revisor, que derrubou 3 e corrigiu várias estimativas para baixo. Os números abaixo já são os conferidos.

## 1. Resposta curta

Sim, são 43.682 linhas acrescentadas (e 1.106 apagadas) em relação à `main`. Mas só cerca de 16 mil são código do app. O resto é teste, banco, dados e documentação.

| Parte                |     Linhas | O que é                                                                                  |
| -------------------- | ---------: | ---------------------------------------------------------------------------------------- |
| Código do app        |     16.250 | Telas e API (13.540), regras de cálculo do domínio (2.310), estilos e configuração (400) |
| Testes               |      9.840 | Testes das telas, do domínio e do banco                                                  |
| Banco                |      9.690 | 23 migrations (mudanças no banco, em ordem)                                              |
| Dados                |      3.510 | Catálogo de 56 modelos de serviço com 485 itens                                          |
| Documentação e apoio |      4.390 | ADRs, rascunhos de trabalho com IA, tokens de cor gerados, ícones                        |
| **Total**            | **43.680** |                                                                                          |

**Não, nem tudo é necessário.** Dá para tirar cerca de **2.760 linhas sem risco e sem precisar decidir nada**, e mais cerca de **2.200 com risco baixo se você aprovar**. No máximo, uns **5.800 (13%)**.

A maior parte do volume se explica:

- **Os testes (23%) são proteção, não sobra.**
- **Metade das linhas do banco são versões antigas de funções** que foram reescritas várias vezes. Elas já rodaram no beta e não podem ser apagadas, mas mostram onde o processo inflou (ver seção 5).
- **O catálogo ocupa 3.510 linhas por causa do formato**, não por causa da quantidade de dados. É o maior corte isolado.
- **O código das telas e do domínio está enxuto.** A duplicação real é pequena e localizada: cerca de 550 linhas somando tudo.

## 2. Cortes propostos

Ordem: linhas economizadas divididas pelo risco (risco médio conta como metade). "Decisão" = precisa da sua aprovação antes.

|   # | O quê                                                                                                            | Onde                                                                      | Linhas a menos | Risco | Decisão                    |
| --: | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------: | ----- | -------------------------- |
|   1 | Reescrever o catálogo de modelos num formato enxuto, com os mesmos dados                                         | `apps/web/src/app/paginas/orcamentos/catalogo-servicos.ts`                |          2.200 | baixo | não                        |
|   2 | Tirar do ADR-0016 o rascunho técnico de uma proposta ainda não decidida (D1 a D12) e levar para o Doc do ClickUp | `docs/adr/0016-automacao-do-orcamento-a-execucao.md`                      |            700 | baixo | sim                        |
|   3 | Apagar os 3 prompts escritos para o ChatGPT (o resultado já está nos ADRs 0018 a 0020)                           | `PROMPT-CHATGPT-*.md` na raiz                                             |            500 | baixo | sim                        |
|   4 | Tirar do git o diário de bordo local, com caminhos da sua máquina e o seu login, e guardá-lo numa pasta local    | `PASSAGEM-CHATGPT.md`, `ANDAMENTO-ORCAMENTO.md`                           |            498 | baixo | sim                        |
|   5 | Gerar só os 72 tokens de cor em uso (hoje são 475), sem a rampa verde que a marca lima substituiu                | `docs/design-system/tokens/fluent.css`, `scripts/gerar-tokens-fluent.mjs` |            780 | médio | sim                        |
|   6 | Tirar o de-para automático de cargos e profissões antigos, que nenhuma tela usa ainda (fica no histórico do git) | `packages/domain/src/profissao-e-cargo.ts` e teste                        |            290 | baixo | sim                        |
|   7 | Apagar as fórmulas antigas de preço, substituídas pela margem no fim                                             | `packages/domain/src/orcamento.ts` e teste                                |            165 | baixo | não                        |
|   8 | Apagar a cópia dos ícones na documentação (já está desatualizada, faltam 5)                                      | `docs/design-system/icons/`                                               |            140 | baixo | sim (confirmar com o Kadu) |
|   9 | Tirar a prosa cinza de ajuda que sobrou em Custos e taxas, no editor do orçamento e nos diálogos de cópia        | `PaginaCustosETaxas.tsx`, `PaginaOrcamento.tsx`, `DialogosDeCopia.tsx`    |             70 | baixo | sim                        |
|  10 | Limpar os ADRs: tirar instruções de processo velhas e corrigir contradições, sem mudar decisão                   | ADRs 0017 a 0020                                                          |             45 | baixo | não                        |
|  11 | Apagar `custoHoraPorMembro`, superada por `horaDeCustoPorMembro`                                                 | `packages/domain/src/preco-do-orcamento.ts` e teste                       |             42 | baixo | não                        |
|  12 | Usar os campos de texto já existentes em Dados da proposta                                                       | `PaginaDadosDaProposta.tsx`                                               |             40 | baixo | não                        |
|  13 | Apagar as etapas nomeadas dos Primeiros passos, que ninguém usa                                                  | `packages/domain/src/primeiros-passos-orcamento.ts` e teste               |             35 | baixo | não                        |
|  14 | Juntar o aviso "Sair sem salvar?" das duas telas numa peça só                                                    | `PaginaOrcamento.tsx`, `PaginaPrimeirosPassos.tsx`                        |             30 | baixo | não                        |
|  15 | Juntar as operações das listas de Equipe e Contas e os avisos de margem                                          | `PecasDaBase.tsx` e as duas telas                                         |             30 | baixo | não                        |
|  16 | Criar um atalho para mudar despesas e parcelas no editor                                                         | `PaginaOrcamento.tsx`                                                     |             25 | baixo | não                        |
|  17 | Tirar testes do banco que repetem verificações já cobertas                                                       | `supabase/tests/310_*`, `320_*`                                           |             20 | baixo | não                        |
|  18 | Pequenas sobras: campo nunca usado, funções de uma linha, exports sem uso                                        | `PaginaOrcamento.tsx`, `campos-da-base.ts`, `calculo.ts`                  |             18 | baixo | não                        |
|  19 | Usar na API os tipos do domínio em vez de redeclará-los                                                          | `apps/web/src/lib/api/orcamentos.ts`                                      |             17 | baixo | não                        |
|  20 | Juntar os leitores de JSON repetidos em três arquivos                                                            | `apps/web/src/lib/api/`                                                   |             15 | baixo | não                        |
|  21 | Parar de gravar o "piso" (já saiu da tela), na próxima migration que já recriar essas funções                    | funções de base de custos                                                 |             15 | baixo | sim                        |
|  22 | Uma função só para validar a situação do orçamento (hoje são 3)                                                  | `apps/web/src/lib/api/orcamentos.ts`                                      |             12 | baixo | não                        |
|  23 | Apagar uma constante nunca usada e tirar 7 exports internos do domínio                                           | `packages/domain/src/`                                                    |             11 | baixo | não                        |
|  24 | Parar de usar `preco_automatico` (sempre verdadeiro): 2 linhas já, o resto na próxima migration                  | `apps/web/src/lib/erros.ts` e funções do orçamento                        |             10 | baixo | não                        |
|  25 | Uma função só para gravar a pessoa da equipe no banco (hoje está escrita duas vezes)                             | `apps/web/src/lib/api/`                                                   |             10 | baixo | não                        |
|  26 | Uma função só de arredondamento de centavos (hoje há 4 cópias)                                                   | `packages/domain/src/`                                                    |             10 | baixo | não                        |
|  27 | Usar o cartão de resultado que já existe nos Primeiros passos                                                    | `PaginaPrimeirosPassos.tsx`                                               |              8 | baixo | não                        |
|  28 | Lista de pendências da API tirada do domínio, para não ficar para trás                                           | `apps/web/src/lib/api/primeiros-passos.ts`                                |              7 | baixo | não                        |
|  29 | Tirar "custos fixos da equipe", sempre 0 desde 12/11, depois de conferir o beta                                  | banco, API e Custos e taxas                                               |             12 | médio | sim                        |

Nenhum desses cortes muda o que o usuário vê, exceto o 9 (some o texto de ajuda) e o 29 (só se o beta tiver valor diferente de 0).

## 3. Quanto dá para tirar com risco baixo

| Grupo                                                                     |                   Linhas |
| ------------------------------------------------------------------------- | -----------------------: |
| Risco baixo, sem decisão, dá para fazer já (itens 1, 7, 10 a 20, 22 a 28) |                    2.760 |
| Risco baixo, depende da sua aprovação (itens 2, 3, 4, 6, 8, 9, 21)        |                    2.210 |
| **Total com risco baixo**                                                 |                **4.970** |
| Risco médio, com decisão (itens 5 e 29)                                   |                      790 |
| **Teto**                                                                  | **cerca de 5.760 (13%)** |

Por área:

- **Telas:** 2.420 (2.200 só do catálogo).
- **Domínio e API:** 620 (330 sem decisão).
- **Banco:** 60 (a maior parte só na próxima migration que já for mexer nessas funções).
- **Documentação e apoio:** 2.660.

## 4. O que não vale cortar

- **Testes (9.840 linhas).** São o que garante que o preço, a margem e as regras dos Primeiros passos continuam certos quando alguém mexe no código. Só saem os 20 do item 17, que testam a mesma coisa duas vezes.
- **Migrations já aplicadas (9.690 linhas).** Cerca de 5.100 linhas são versões de funções que outra migration substituiu depois. Mesmo assim, elas já rodaram no beta. Apagar ou reescrever quebraria o histórico do banco e o CI, que recria o banco do zero a partir delas.
- **Regras já decididas.** São diferenças de propósito, não duplicação:
  - Em Custos e taxas, campo em branco vale 0; nos Primeiros passos, fica vazio (ADR-0020).
  - O atalho ACEAMB só em Custos e taxas e o campo sócio sem tela (ADR-0021).
  - A lista própria de pendências de Custos e taxas. Trocar pela do domínio muda o comportamento, e isso está registrado como pendência conhecida no ADR-0020 §8.5.
- **Levar o catálogo para o banco.** Não diminui linhas (vira dado de carga) e vai contra o ADR-0017 ("fixo no sistema"). Só o formato do arquivo muda.
- **Arquivos grandes como `PaginaOrcamento.tsx` (o editor tem cerca de 1.700 linhas) e `PaginaPrimeirosPassos.tsx`.** Dá para dividir em arquivos menores, o que facilita a leitura, mas não diminui linhas.
- **Funções do banco.** Todas as 30 funções públicas novas são chamadas pelo app. Não há função morta nem versão antiga esquecida no banco.
- **`palette.css`.** Parecia órfão, mas o README do design system cita o arquivo. Ele fica.
- **Trocar a base de custos por um parâmetro único em JSON e juntar as validações do banco.** Parece economia, mas custa o mesmo número de linhas. Vale só pela organização, e na próxima vez que essas funções mudarem.

## 5. Para não inchar daqui para frente

1. **Corrigir a migration da fatia enquanto ela não foi para o beta**, em vez de criar outra que recria a mesma função inteira. Os commits 1afce02 e 098f7db trazem 7 migrations cada e reescrevem a mesma função 2 ou 3 vezes. Só esses dois commits deixaram 1.565 linhas substituídas antes de saírem da máquina.
2. **Uma migration por fatia, não uma por ajuste.**
3. **Quebrar as funções gigantes do banco em funções menores na próxima mudança.** `salvar_base_de_custos` teve 9 versões, somando 1.648 linhas, e em média só 14% de cada reescrita mudou de fato. Com funções pequenas, um ajuste recria 50 linhas, não 350. O padrão já existe no repositório: a migration 20261113195000 tem só 107 linhas por causa dele.
4. **Quando uma regra for substituída, apagar a antiga no mesmo PR, junto com o teste dela.** Isso vale para as fórmulas de preço, `custoHoraPorMembro`, o piso, `preco_automatico` e os custos fixos da equipe.
5. **Não escrever código para uma tela que ainda não existe**, como o de-para de cargos. Ele pode ser feito na fatia da tela.
6. **Rascunhos de trabalho com IA (prompts, passagem, andamento) ficam fora do git**, numa pasta local excluída. Decisão vai para ADR. Rascunho de proposta não decidida vai para o ClickUp.
7. **Dados grandes em formato enxuto.** Uma lista de nomes ocupa uma linha por item, não um objeto de 6 linhas.
8. **Um componente de tela só aparece uma vez.** Antes de criar uma peça local, procurar em `components/ui` e em `PecasDaBase`.
