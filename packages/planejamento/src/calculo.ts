// Rede de atividades e os dois percursos da especificação 0.1 ("Regras de cálculo"): do prazo
// para trás (datas limite e recomendada) e de hoje para a frente (posição planejada).

import { em } from './util'
import type { AtividadeValida } from './validar'

export interface Ligacao {
  no: number
  defasagem: number
}

/**
 * Um bloco de trabalho seguido de espera. Atividade comum vira um nó; atividade `parcial` vira
 * dois, ligados: a parte antecipável (móvel, sem espera) e a parte fixa (o resto e toda a espera).
 */
export interface No {
  atividade: number
  /** Só o último nó de uma atividade carrega o prazo oficial. */
  prazo: number | null
  duracao: number
  espera: number
  horas: number
  /** O nivelamento pode adiantar este nó. */
  movel: boolean
  inicioMaisCedo: number | null
  inicioFixo: number | null
  antecessores: Ligacao[]
  sucessores: Ligacao[]
}

export interface Rede {
  nos: No[]
  /** Primeiro e último nó de cada atividade (o mesmo, salvo em `parcial`). */
  primeiro: number[]
  ultimo: number[]
  /** Nós em ordem topológica: todo antecessor vem antes. */
  ordem: number[]
}

function ligar(nos: No[], de: number, para: number, defasagem: number): void {
  em(nos, de).sucessores.push({ no: para, defasagem })
  em(nos, para).antecessores.push({ no: de, defasagem })
}

function ordenar(nos: readonly No[]): number[] {
  const faltam = nos.map((no) => no.antecessores.length)
  const ordem: number[] = []
  nos.forEach((_, i) => {
    if (em(faltam, i) === 0) ordem.push(i)
  })
  for (let k = 0; k < ordem.length; k++) {
    for (const sucessor of em(nos, em(ordem, k)).sucessores) {
      faltam[sucessor.no] = em(faltam, sucessor.no) - 1
      if (em(faltam, sucessor.no) === 0) ordem.push(sucessor.no)
    }
  }
  if (ordem.length !== nos.length)
    throw new Error('Rede com ciclo: a validação deveria ter barrado.')
  return ordem
}

export function montarRede(atividades: readonly AtividadeValida[]): Rede {
  const nos: No[] = []
  const primeiro: number[] = []
  const ultimo: number[] = []

  atividades.forEach((a, atividade) => {
    if (a.antecipabilidade === 'parcial') {
      // A tolerância evita que 0,3 × 10 = 3,0000000000000004 vire 4 dias.
      const dias = Math.ceil(a.fracaoAntecipavel * a.duracaoDias - 1e-9)
      const horas = a.fracaoAntecipavel * a.esforcoHoras
      primeiro.push(nos.length)
      nos.push({
        atividade,
        prazo: null,
        duracao: dias,
        espera: 0,
        horas,
        movel: true,
        inicioMaisCedo: a.inicioMaisCedo,
        inicioFixo: null,
        antecessores: [],
        sucessores: [],
      })
      ultimo.push(nos.length)
      nos.push({
        atividade,
        prazo: a.prazo,
        duracao: a.duracaoDias - dias,
        espera: a.esperaDias,
        horas: a.esforcoHoras - horas,
        movel: false,
        inicioMaisCedo: null,
        inicioFixo: null,
        antecessores: [],
        sucessores: [],
      })
      ligar(nos, nos.length - 2, nos.length - 1, 0)
      return
    }
    primeiro.push(nos.length)
    ultimo.push(nos.length)
    nos.push({
      atividade,
      prazo: a.prazo,
      duracao: a.duracaoDias,
      espera: a.esperaDias,
      horas: a.esforcoHoras,
      movel: a.antecipabilidade === 'antecipavel',
      inicioMaisCedo: a.inicioMaisCedo,
      inicioFixo: a.inicioFixo,
      antecessores: [],
      sucessores: [],
    })
  })

  const indicePorId = new Map(atividades.map((a, i) => [a.id, i]))
  atividades.forEach((a, atividade) => {
    for (const dependencia of a.dependeDe) {
      const anterior = indicePorId.get(dependencia.id)
      if (anterior === undefined) throw new Error(`Dependência sem atividade: ${dependencia.id}`)
      ligar(nos, em(ultimo, anterior), em(primeiro, atividade), dependencia.defasagemDias)
    }
  })

  return { nos, primeiro, ultimo, ordem: ordenar(nos) }
}

export interface Recuo {
  inicio: number[]
  fim: number[]
  /** Nó sucessor que limitou o fim, quando não foi o próprio prazo. */
  limitante: (number | null)[]
}

/**
 * Do prazo para trás: `fim = min(prazo − margem, início das sucessoras − defasagem)` e
 * `início = fim − duração − espera`. Com margem zero dá as datas limite; com a margem da
 * gravidade, as recomendadas.
 */
export function recuar(rede: Rede, margemDoNo: (no: No) => number): Recuo {
  const total = rede.nos.length
  const inicio = new Array<number>(total).fill(0)
  const fim = new Array<number>(total).fill(0)
  const limitante = new Array<number | null>(total).fill(null)
  for (let k = total - 1; k >= 0; k--) {
    const i = em(rede.ordem, k)
    const no = em(rede.nos, i)
    let melhor = no.prazo === null ? Infinity : no.prazo - margemDoNo(no)
    let quem: number | null = null
    for (const sucessor of no.sucessores) {
      const limite = em(inicio, sucessor.no) - sucessor.defasagem
      if (limite < melhor) {
        melhor = limite
        quem = sucessor.no
      }
    }
    fim[i] = melhor
    inicio[i] = melhor - no.duracao - no.espera
    limitante[i] = quem
  }
  return { inicio, fim, limitante }
}

/**
 * Início desejado na estratégia (a): quando o aviso de vencimento dispara. Nó sem prazo próprio
 * herda o início desejado da sucessora mais cedo.
 */
export function inicioPeloAlerta(rede: Rede, alertaDias: number): number[] {
  const total = rede.nos.length
  const desejado = new Array<number>(total).fill(0)
  for (let k = total - 1; k >= 0; k--) {
    const i = em(rede.ordem, k)
    const no = em(rede.nos, i)
    desejado[i] =
      no.prazo !== null
        ? no.prazo - alertaDias
        : Math.min(...no.sucessores.map((s) => em(desejado, s.no)))
  }
  return desejado
}

export function fimDoNo(rede: Rede, i: number, inicio: readonly number[]): number {
  const no = em(rede.nos, i)
  return em(inicio, i) + no.duracao + no.espera
}

/** Primeiro início possível de um nó, dadas as posições atuais das antecessoras. */
export function inicioPossivel(
  rede: Rede,
  i: number,
  inicio: readonly number[],
  hoje: number,
): number {
  const no = em(rede.nos, i)
  let possivel = Math.max(hoje, no.inicioMaisCedo ?? hoje)
  for (const anterior of no.antecessores) {
    possivel = Math.max(possivel, fimDoNo(rede, anterior.no, inicio) + anterior.defasagem)
  }
  return possivel
}

/** De hoje para a frente: `início planejado = max(início desejado, início possível)`. */
export function avancar(rede: Rede, desejado: readonly number[], hoje: number): number[] {
  const inicio = new Array<number>(rede.nos.length).fill(0)
  for (const i of rede.ordem) {
    const no = em(rede.nos, i)
    const alvo = no.inicioFixo ?? em(desejado, i)
    inicio[i] = Math.max(alvo, inicioPossivel(rede, i, inicio, hoje))
  }
  return inicio
}
