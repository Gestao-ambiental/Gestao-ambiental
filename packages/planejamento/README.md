# @gestao-ambiental/planejamento

Motor do método de planejamento antecipado de condicionantes (especificação 0.1). É uma função pura: recebe uma carteira de atividades, os parâmetros, a data de hoje e a estratégia, e devolve o plano ou a lista de erros.

```ts
import { planejar } from '@gestao-ambiental/planejamento'

const resultado = planejar(carteira, parametros, '2027-01-11', 'metodo_completo')
if (resultado.ok) console.log(resultado.plano.triagem, resultado.plano.cargaMensal)
```

- **Independente do produto.** Não importa nada do Grama nem usa o vocabulário dele (o lint barra). Quem monta a carteira converte os próprios dados em atividades.
- **Sem parâmetros no código.** Margens, níveis e limiares vêm sempre de fora. `exemplos/parametros-provisorios.json` traz os valores provisórios, ainda não calibrados.
- **Teto de capacidade opcional.** Com `capacidadeMensalHoras` nos parâmetros, a estratégia (c) só mexe nos meses acima do teto e antecipa o mínimo necessário; sem ela, achata o quanto der.
- **Determinístico.** Sem relógio, rede ou sorteio; a mesma entrada dá a mesma saída, em qualquer ordem de atividades e em qualquer fuso.

## Estratégias

| Valor                    | Estratégia                      |
| ------------------------ | ------------------------------- |
| `so_prazo`               | (a) só pelo prazo               |
| `folga_sem_gravidade`    | (b) pela folga, sem gravidade   |
| `metodo_completo`        | (c) método completo             |
| `metodo_sem_antecipacao` | (d) método sem antecipabilidade |

## Arquivos

| Arquivo          | Conteúdo                                                        |
| ---------------- | --------------------------------------------------------------- |
| `tipos.ts`       | Contrato de entrada e saída                                     |
| `validar.ts`     | Erros que recusam a carteira                                    |
| `calculo.ts`     | Datas limite e recomendada (do prazo para trás) e posição final |
| `carga.ts`       | Horas por mês                                                   |
| `nivelamento.ts` | Heurística gulosa da estratégia (c)                             |
| `planejar.ts`    | Orquestra, monta itens, triagem e métricas                      |
| `cenario.ts`     | Carteira sintética com um mês de pico, para experimentar regras |
| `comparar.ts`    | As quatro estratégias sobre a mesma carteira                    |

```sh
corepack pnpm --filter @gestao-ambiental/planejamento test   # roda em 3 fusos
```
