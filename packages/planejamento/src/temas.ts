// Catálogo de temas (matriz de antecipação): cada tema tem uma trava, e a trava dita o que o
// nivelamento pode mover. Este arquivo só traduz tema em atividade; o motor continua sem saber o
// que é um tema. O catálogo vem de fora (exemplos/temas-provisorios.json), nunca do código.

import { paraData, paraDia } from './datas'
import type { Antecipabilidade, Atividade, Data } from './tipos'

/** Regra de uma trava. Os valores de duração, esforço e espera são padrões para simulação. */
export interface RegraDaTrava {
  rotulo: string
  /** `fixa`, `antecipavel` ou `parcial`: o que o nivelamento pode fazer com o tema. */
  antecipabilidade?: string
  /** Em `parcial`: parte do trabalho que é preparo e pode ir para outro mês. */
  fracaoDePreparo?: number
  duracaoDias?: number
  esforcoHoras?: number
  /** Espera aplicada aos temas que dependem de terceiros. */
  esperaDeTerceirosDias?: number
  /** O trabalho só é possível a partir de tantos dias antes do prazo (ciclo de dados, validade). */
  janelaDias?: number
  /** O trabalho só é possível a partir de 1º de janeiro do ano do prazo (dados do ano-base). */
  aPartirDoInicioDoAno?: boolean
  /** Obrigação permanente, sem entrega com data: não entra na carteira. */
  foraDaCarteira?: boolean
}

export interface Tema {
  id: string
  area: string
  rotulo: string
  /** Chave de `Catalogo.travas`. */
  trava: string
  /** `id` de um nível de gravidade dos parâmetros. */
  gravidade: string
  esperaDeTerceiros: boolean
  /** `MM-DD`: a entrega tem data fixa no calendário (janela legal). */
  prazoFixo?: string
  /** Validade do resultado, em dias: não adiantar além disso. Substitui `janelaDias` da trava. */
  validadeDias?: number
}

export interface Catalogo {
  versao: string
  travas: Record<string, RegraDaTrava>
  temas: Tema[]
}

const ANTECIPABILIDADES: readonly string[] = ['fixa', 'antecipavel', 'parcial']

function regraDe(catalogo: Catalogo, tema: Tema): RegraDaTrava {
  const regra = catalogo.travas[tema.trava]
  if (!regra) throw new Error(`Tema ${tema.id}: trava desconhecida "${tema.trava}".`)
  return regra
}

/** O tema gera atividades? Condição contínua não gera. */
export function entraNaCarteira(catalogo: Catalogo, tema: Tema): boolean {
  return regraDe(catalogo, tema).foraDaCarteira !== true
}

/**
 * Atividade de um tema com o prazo dado, ou `null` se o tema não entra na carteira. As regras da
 * trava viram os campos que o motor entende: o que é móvel, que fração é preparo e a partir de
 * quando o trabalho é possível.
 */
export function atividadeDoTema(
  catalogo: Catalogo,
  temaId: string,
  dados: { id: string; prazo: Data },
): Atividade | null {
  const tema = catalogo.temas.find((t) => t.id === temaId)
  if (!tema) throw new Error(`Tema desconhecido: "${temaId}".`)
  const regra = regraDe(catalogo, tema)
  if (regra.foraDaCarteira === true) return null

  const antecipabilidade = regra.antecipabilidade ?? ''
  if (!ANTECIPABILIDADES.includes(antecipabilidade)) {
    throw new Error(`Trava ${tema.trava}: antecipabilidade inválida "${antecipabilidade}".`)
  }
  const prazo = paraDia(dados.prazo)
  if (prazo === null) throw new Error(`Prazo inválido: "${dados.prazo}".`)

  const atividade: Atividade = {
    id: dados.id,
    grupo: tema.id,
    rotulo: tema.rotulo,
    prazo: dados.prazo,
    duracaoDias: regra.duracaoDias ?? 0,
    esperaDias: tema.esperaDeTerceiros ? (regra.esperaDeTerceirosDias ?? 0) : 0,
    esforcoHoras: regra.esforcoHoras ?? 0,
    gravidade: tema.gravidade,
    antecipabilidade: antecipabilidade as Antecipabilidade,
  }
  if (antecipabilidade === 'parcial') atividade.fracaoAntecipavel = regra.fracaoDePreparo ?? 0.5

  // A partir de quando o trabalho é possível: o limite mais tardio entre os que se aplicam.
  const limites: number[] = []
  const janela = tema.validadeDias ?? regra.janelaDias
  if (janela !== undefined) limites.push(prazo - janela)
  if (regra.aPartirDoInicioDoAno === true) {
    const inicioDoAno = paraDia(`${dados.prazo.slice(0, 4)}-01-01`)
    if (inicioDoAno !== null) limites.push(inicioDoAno)
  }
  if (limites.length > 0) atividade.inicioMaisCedo = paraData(Math.max(...limites))
  return atividade
}
