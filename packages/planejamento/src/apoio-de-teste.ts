// Apoio dos testes: parâmetros provisórios, atalhos e um gerador de carteiras com semente fixa.

import provisorios from '../exemplos/parametros-provisorios.json'
import { planejar } from './planejar'
import type { Atividade, Carteira, Estrategia, ItemDoPlano, Parametros, Plano } from './tipos'

export const PARAMETROS: Parametros = provisorios
export const HOJE = '2027-01-11'

export function atividade(parcial: Partial<Atividade> & { id: string }): Atividade {
  return {
    duracaoDias: 10,
    esperaDias: 0,
    esforcoHoras: 0,
    gravidade: 'media',
    antecipabilidade: 'antecipavel',
    ...parcial,
  }
}

export function planoDe(
  atividades: Atividade[],
  estrategia: Estrategia = 'metodo_sem_antecipacao',
  parametros: Parametros = PARAMETROS,
  hoje: string = HOJE,
): Plano {
  const resultado = planejar({ atividades }, parametros, hoje, estrategia)
  if (!resultado.ok) throw new Error(`Carteira recusada: ${JSON.stringify(resultado.erros)}`)
  return resultado.plano
}

export function itemDe(plano: Plano, id: string): ItemDoPlano {
  const item = plano.itens.find((i) => i.atividadeId === id)
  if (!item) throw new Error(`Sem item para ${id}`)
  return item
}

/** Gerador pseudoaleatório com semente (mulberry32): os testes são reproduzíveis. */
function sorteador(semente: number): () => number {
  let estado = semente
  return () => {
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Carteira sintética de 2027: prazos concentrados em março, dependências, fixas e parciais. */
export function carteiraAleatoria(semente: number, tamanho = 40): Carteira {
  const sorteio = sorteador(semente)
  const inteiro = (min: number, max: number) => min + Math.floor(sorteio() * (max - min + 1))
  const dataEm2027 = (mesPreferido?: number) => {
    const mes = mesPreferido ?? inteiro(1, 12)
    const dia = inteiro(1, DIAS_POR_MES[mes - 1] ?? 28)
    return `2027-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }
  const gravidades = ['baixa', 'media', 'alta', 'critica']
  const atividades: Atividade[] = []
  const comSucessora = new Set<number>()

  for (let i = 0; i < tamanho; i++) {
    const tipo = sorteio()
    const nova: Atividade = {
      id: `a${String(i).padStart(3, '0')}`,
      prazo: dataEm2027(sorteio() < 0.4 ? 3 : undefined),
      duracaoDias: sorteio() < 0.1 ? 0 : inteiro(1, 30),
      esperaDias: sorteio() < 0.5 ? 0 : inteiro(1, 45),
      esforcoHoras: inteiro(0, 80),
      gravidade: gravidades[inteiro(0, 3)] ?? 'media',
      antecipabilidade: tipo < 0.2 ? 'fixa' : tipo < 0.4 ? 'parcial' : 'antecipavel',
    }
    if (nova.antecipabilidade === 'parcial') nova.fracaoAntecipavel = sorteio() < 0.5 ? 0.3 : 0.5
    if (nova.antecipabilidade === 'fixa' && sorteio() < 0.3) nova.inicioFixo = dataEm2027()
    if (sorteio() < 0.2) nova.inicioMaisCedo = dataEm2027(inteiro(1, 3))
    if (i > 0 && sorteio() < 0.25) {
      const anterior = inteiro(0, i - 1)
      nova.dependeDe = [
        { id: `a${String(anterior).padStart(3, '0')}`, defasagemDias: inteiro(0, 5) },
      ]
      comSucessora.add(anterior)
    }
    atividades.push(nova)
  }
  // Parte das atividades com sucessora fica sem prazo próprio (etapa interna de uma cadeia).
  for (const i of comSucessora) {
    const alvo = atividades[i]
    if (alvo && sorteio() < 0.5) alvo.prazo = null
  }
  return { atividades }
}
