// Como cada pessoa da equipe recebe (ADR-0018, fatia 3; decisão do Eduardo de 12/11/2026): sai o
// "pelo piso" (o sistema não tem como saber o piso de ninguém) e entra o cadastro manual de cada
// forma de recebimento. A consultoria informa os valores; o sistema só divide. Ausente é
// desconhecido, nunca zero. O banco faz a mesma conta (salvar_base_de_custos).

import {
  dividirArredondando,
  ErroDeOrcamento,
  exigirInteiro,
  HORAS_DISPONIVEIS_MAXIMAS_MES,
  PRECO_MAXIMO_CENTAVOS,
  type LinhaDaEquipe,
} from './orcamento'

/** Meio período não é forma de recebimento: é a jornada (horas no mês) de uma destas formas. */
export type FormaDeRecebimento = 'clt' | 'pro_labore' | 'estagio' | 'diaria' | 'projeto'

export const FORMAS_DE_RECEBIMENTO: readonly FormaDeRecebimento[] = [
  'clt',
  'pro_labore',
  'estagio',
  'diaria',
  'projeto',
]

/** Limites conferidos também no banco. */
export const HORAS_MAXIMAS_POR_DIARIA = 24
export const DIAS_MAXIMOS_NO_MES = 31
export const HORAS_MAXIMAS_DO_PROJETO = 100_000

export interface RemuneracaoDaPessoa {
  /** Nula = ainda não informada (linhas antigas): vale como mensal, com custo e horas do mês. */
  forma: FormaDeRecebimento | null
  /** CLT, pró-labore e estágio: custo total do mês, com encargos e benefícios informados. */
  custoMensalCentavos: number | null
  /** Horas de trabalho no mês. No projeto, a capacidade no mês, se informada. */
  horasNoMes: number | null
  custoDiariaCentavos: number | null
  horasPorDiaria: number | null
  /** Dias disponíveis no mês, se informados. */
  diasNoMes: number | null
  custoProjetoCentavos: number | null
  horasDoProjeto: number | null
}

export interface ResumoDaPessoa {
  /** Custo de uma hora desta pessoa; `null` sem horas para dividir. */
  horaDeCustoCentavos: number | null
  /** Custo do mês; `null` quando não se sabe (diária sem dias, projeto). */
  custoMensalCentavos: number | null
  /** Horas que a pessoa tem no mês; `null` = capacidade desconhecida. */
  capacidadeHorasMes: number | null
}

function exigir(valor: number | null, maximo: number): void {
  if (valor !== null) exigirInteiro(valor, maximo)
}

function dividir(numerador: number, divisor: number): number {
  return dividirArredondando(BigInt(numerador), BigInt(divisor))
}

/** Hora de custo, custo do mês e capacidade de uma pessoa, conforme a forma de recebimento. */
export function resumoDaPessoa(r: RemuneracaoDaPessoa): ResumoDaPessoa {
  exigir(r.custoMensalCentavos, PRECO_MAXIMO_CENTAVOS)
  exigir(r.horasNoMes, HORAS_DISPONIVEIS_MAXIMAS_MES)
  exigir(r.custoDiariaCentavos, PRECO_MAXIMO_CENTAVOS)
  exigir(r.horasPorDiaria, HORAS_MAXIMAS_POR_DIARIA)
  exigir(r.diasNoMes, DIAS_MAXIMOS_NO_MES)
  exigir(r.custoProjetoCentavos, PRECO_MAXIMO_CENTAVOS)
  exigir(r.horasDoProjeto, HORAS_MAXIMAS_DO_PROJETO)

  if (r.forma === 'diaria') {
    const custo = r.custoDiariaCentavos
    const horas = r.horasPorDiaria
    const hora = custo !== null && horas ? dividir(custo, horas) : null
    const dias = r.diasNoMes
    const capacidade = dias !== null && horas !== null ? dias * horas : null
    if (capacidade !== null && capacidade > HORAS_DISPONIVEIS_MAXIMAS_MES) {
      throw new ErroDeOrcamento('valor_invalido')
    }
    return {
      horaDeCustoCentavos: hora,
      custoMensalCentavos: dias !== null && custo !== null ? dias * custo : null,
      capacidadeHorasMes: capacidade,
    }
  }
  if (r.forma === 'projeto') {
    const custo = r.custoProjetoCentavos
    const horas = r.horasDoProjeto
    return {
      horaDeCustoCentavos: custo !== null && horas ? dividir(custo, horas) : null,
      // O custo do projeto não é custo do mês: não entra no rateio nem na média da equipe.
      custoMensalCentavos: null,
      capacidadeHorasMes: r.horasNoMes,
    }
  }
  // CLT, pró-labore, estágio ou ainda não informada: custo do mês ÷ horas do mês.
  const custo = r.custoMensalCentavos
  const horas = r.horasNoMes
  return {
    horaDeCustoCentavos: custo !== null && horas ? dividir(custo, horas) : null,
    custoMensalCentavos: custo,
    capacidadeHorasMes: horas,
  }
}

/** Hora de custo de cada membro (quem não tem horas para dividir fica de fora). */
export function horaDeCustoPorMembro(
  linhas: readonly (RemuneracaoDaPessoa & { membroId: string })[],
): { membroId: string; horaCentavos: number }[] {
  return linhas.flatMap((linha) => {
    const hora = resumoDaPessoa(linha).horaDeCustoCentavos
    return hora === null ? [] : [{ membroId: linha.membroId, horaCentavos: hora }]
  })
}

/**
 * As linhas que entram na hora técnica média, no rateio das contas e na hora por profissão: só
 * quem tem custo do mês e horas do mês conhecidos. Diária sem dias e projeto ficam de fora.
 */
export function linhasMensaisDaEquipe<T extends RemuneracaoDaPessoa & { socio: boolean }>(
  linhas: readonly T[],
): (LinhaDaEquipe & T)[] {
  return linhas.flatMap((linha) => {
    const resumo = resumoDaPessoa(linha)
    return resumo.custoMensalCentavos === null || resumo.capacidadeHorasMes === null
      ? []
      : [
          {
            ...linha,
            custoMensalCentavos: resumo.custoMensalCentavos,
            horasDisponiveisMes: resumo.capacidadeHorasMes,
          },
        ]
  })
}
