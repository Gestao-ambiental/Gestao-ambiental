// Cenário sintético de aglomeração: uma carteira com volume constante de atividades por mês e um
// mês de pico. Serve para experimentar regras; nenhum dado vem de cliente, e as durações, esperas
// e horas dos tipos abaixo são suposições ainda não calibradas.

import { paraData, primeiroDiaDoMes } from './datas'
import { atividadeDoTema, entraNaCarteira, type Catalogo } from './temas'
import type { Antecipabilidade, Atividade, Carteira } from './tipos'
import { em } from './util'

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo cenário sai sempre igual. */
export function sorteador(semente: number): () => number {
  let estado = semente
  return () => {
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Um tipo de atividade do cenário. `peso` é a participação relativa na carteira. */
export interface TipoDeAtividade {
  id: string
  rotulo: string
  peso: number
  duracaoDias: number
  esperaDias: number
  esforcoHoras: number
  gravidade: string
  antecipabilidade: Antecipabilidade
  fracaoAntecipavel?: number
  /** Dias antes do prazo em que o trabalho passa a ser possível; ausente = sem limite. */
  janelaDias?: number
  /** Só em `fixa`: dias antes do prazo em que a janela impõe o início. */
  inicioFixoDias?: number
}

/** Tipos sintéticos, com os níveis de gravidade dos parâmetros provisórios. */
export const TIPOS_SINTETICOS: readonly TipoDeAtividade[] = [
  {
    id: 'relatorio',
    rotulo: 'Relatório de monitoramento',
    peso: 30,
    duracaoDias: 10,
    esperaDias: 0,
    esforcoHoras: 16,
    gravidade: 'media',
    antecipabilidade: 'parcial',
    fracaoAntecipavel: 0.5,
    janelaDias: 60,
  },
  {
    id: 'analise',
    rotulo: 'Coleta e análise em laboratório',
    peso: 20,
    duracaoDias: 3,
    esperaDias: 25,
    esforcoHoras: 6,
    gravidade: 'alta',
    antecipabilidade: 'antecipavel',
    janelaDias: 90,
  },
  {
    id: 'campanha',
    rotulo: 'Campanha sazonal de campo',
    peso: 10,
    duracaoDias: 5,
    esperaDias: 15,
    esforcoHoras: 24,
    gravidade: 'alta',
    antecipabilidade: 'fixa',
    inicioFixoDias: 50,
  },
  {
    id: 'protocolo',
    rotulo: 'Protocolo junto ao órgão',
    peso: 10,
    duracaoDias: 20,
    esperaDias: 0,
    esforcoHoras: 30,
    gravidade: 'critica',
    antecipabilidade: 'antecipavel',
  },
  {
    id: 'plano',
    rotulo: 'Plano ou inventário anual',
    peso: 15,
    duracaoDias: 15,
    esperaDias: 0,
    esforcoHoras: 24,
    gravidade: 'media',
    antecipabilidade: 'antecipavel',
  },
  {
    id: 'comprovante',
    rotulo: 'Comprovante administrativo',
    peso: 15,
    duracaoDias: 2,
    esperaDias: 0,
    esforcoHoras: 2,
    gravidade: 'baixa',
    antecipabilidade: 'antecipavel',
  },
]

export interface OpcoesDoCenario {
  semente: number
  ano: number
  /** Atividades com prazo em cada mês comum. */
  porMes: number
  /** Mês de pico, de 1 a 12. */
  mesDePico: number
  /** Atividades com prazo no mês de pico. */
  noPico: number
  tipos?: readonly TipoDeAtividade[]
}

/** Carteira de um ano com `porMes` prazos em cada mês e `noPico` no mês de pico. */
export function cenarioAglomerado(opcoes: OpcoesDoCenario): Carteira {
  const tipos = opcoes.tipos ?? TIPOS_SINTETICOS
  const sorteio = sorteador(opcoes.semente)
  const pesoTotal = tipos.reduce((soma, tipo) => soma + tipo.peso, 0)
  const sortearTipo = (): TipoDeAtividade => {
    let alvo = sorteio() * pesoTotal
    for (const tipo of tipos) {
      alvo -= tipo.peso
      if (alvo < 0) return tipo
    }
    return em(tipos, tipos.length - 1)
  }

  const atividades: Atividade[] = []
  for (let mes = 1; mes <= 12; mes++) {
    const indice = opcoes.ano * 12 + (mes - 1)
    const primeiroDia = primeiroDiaDoMes(indice)
    const diasNoMes = primeiroDiaDoMes(indice + 1) - primeiroDia
    const quantidade = mes === opcoes.mesDePico ? opcoes.noPico : opcoes.porMes
    for (let k = 0; k < quantidade; k++) {
      const tipo = sortearTipo()
      const prazo = primeiroDia + Math.floor(sorteio() * diasNoMes)
      const nova: Atividade = {
        id: `${String(opcoes.ano)}-${String(mes).padStart(2, '0')}-${String(k + 1).padStart(3, '0')}`,
        grupo: tipo.id,
        rotulo: tipo.rotulo,
        prazo: paraData(prazo),
        duracaoDias: tipo.duracaoDias,
        esperaDias: tipo.esperaDias,
        esforcoHoras: tipo.esforcoHoras,
        gravidade: tipo.gravidade,
        antecipabilidade: tipo.antecipabilidade,
      }
      if (tipo.fracaoAntecipavel !== undefined) nova.fracaoAntecipavel = tipo.fracaoAntecipavel
      if (tipo.janelaDias !== undefined) nova.inicioMaisCedo = paraData(prazo - tipo.janelaDias)
      if (tipo.inicioFixoDias !== undefined) nova.inicioFixo = paraData(prazo - tipo.inicioFixoDias)
      atividades.push(nova)
    }
  }
  return { atividades }
}

export interface OpcoesDoCenarioPorTemas {
  semente: number
  ano: number
  porMes: number
  mesDePico: number
  noPico: number
  catalogo: Catalogo
}

/**
 * O mesmo cenário de aglomeração, sorteando temas do catálogo em vez dos tipos sintéticos. Tema
 * com data fixa de entrega (janela legal) só aparece no mês dessa data, com o prazo nela.
 */
export function cenarioPorTemas(opcoes: OpcoesDoCenarioPorTemas): Carteira {
  const { catalogo } = opcoes
  const sorteio = sorteador(opcoes.semente)
  const temas = catalogo.temas.filter((tema) => entraNaCarteira(catalogo, tema))
  const atividades: Atividade[] = []

  for (let mes = 1; mes <= 12; mes++) {
    const indice = opcoes.ano * 12 + (mes - 1)
    const primeiroDia = primeiroDiaDoMes(indice)
    const diasNoMes = primeiroDiaDoMes(indice + 1) - primeiroDia
    const doMes = temas.filter(
      (tema) => tema.prazoFixo === undefined || Number(tema.prazoFixo.slice(0, 2)) === mes,
    )
    if (doMes.length === 0) continue
    const quantidade = mes === opcoes.mesDePico ? opcoes.noPico : opcoes.porMes
    for (let k = 0; k < quantidade; k++) {
      const tema = em(doMes, Math.floor(sorteio() * doMes.length))
      const sorteado = paraData(primeiroDia + Math.floor(sorteio() * diasNoMes))
      const prazo =
        tema.prazoFixo === undefined ? sorteado : `${String(opcoes.ano)}-${tema.prazoFixo}`
      const id = `${String(opcoes.ano)}-${String(mes).padStart(2, '0')}-${String(k + 1).padStart(3, '0')}`
      const atividade = atividadeDoTema(catalogo, tema.id, { id, prazo })
      if (atividade) atividades.push(atividade)
    }
  }
  return { atividades }
}
