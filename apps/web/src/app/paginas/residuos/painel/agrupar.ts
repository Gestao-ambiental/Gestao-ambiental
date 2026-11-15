// Somas de apresentação do painel de resíduos. As linhas já chegam somadas pelo banco por mês,
// empreendimento, resíduo, destinador e unidade (t, m³ ou un); aqui só se junta por uma dimensão.
// Unidades diferentes nunca se somam. Protótipo: se virar regra, mover para packages/domain.

import {
  adicionarMeses,
  inicioDoMes,
  rotuloDoMes,
  type DataCivil,
  type UnidadeResiduo,
} from '@gestao-ambiental/domain'

import type { LinhaDoPainelDeResiduos } from '@/lib/api/residuos'

export type Agrupamento = 'residuo' | 'destinador' | 'mes'
export type Periodo = 'ultimos_12_meses' | 'ano_atual' | 'ano_anterior'

export const ROTULO_DO_AGRUPAMENTO: Record<Agrupamento, string> = {
  residuo: 'Resíduo',
  destinador: 'Destinador',
  mes: 'Mês',
}

export const ROTULO_DO_PERIODO: Record<Periodo, string> = {
  ultimos_12_meses: 'Últimos 12 meses',
  ano_atual: 'Este ano',
  ano_anterior: 'Ano passado',
}

const ORDEM_DA_UNIDADE: readonly UnidadeResiduo[] = ['t', 'm3', 'un', 'kg', 'l']

export interface Grupo {
  chave: string
  rotulo: string
  unidade: UnidadeResiduo
  quantidade: number
  /** Só confiável por resíduo: um MTR com vários resíduos conta uma vez em cada um. */
  mtrs: number
}

function arredondar(valor: number): number {
  return Math.round(valor * 10_000) / 10_000
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function intervaloDoPeriodo(
  periodo: Periodo,
  hoje: DataCivil,
): { de: DataCivil; ate: DataCivil } {
  const ano = Number(hoje.slice(0, 4))
  if (periodo === 'ano_atual') return { de: `${String(ano)}-01-01` as DataCivil, ate: hoje }
  if (periodo === 'ano_anterior') {
    return {
      de: `${String(ano - 1)}-01-01` as DataCivil,
      ate: `${String(ano - 1)}-12-31` as DataCivil,
    }
  }
  return { de: adicionarMeses(inicioDoMes(hoje), -11), ate: hoje }
}

/** Primeiro dia de cada mês do intervalo, em ordem. */
export function mesesDoIntervalo(de: DataCivil, ate: DataCivil): DataCivil[] {
  const meses: DataCivil[] = []
  for (let mes = inicioDoMes(de); mes <= ate; mes = adicionarMeses(mes, 1)) meses.push(mes)
  return meses
}

export function unidadesPresentes(linhas: readonly LinhaDoPainelDeResiduos[]): UnidadeResiduo[] {
  return ORDEM_DA_UNIDADE.filter((u) => linhas.some((l) => l.unidade === u))
}

export function agrupar(linhas: readonly LinhaDoPainelDeResiduos[], por: Agrupamento): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const linha of linhas) {
    const base =
      por === 'residuo'
        ? linha.residuoCodigo
        : por === 'destinador'
          ? semAcento(linha.destinadorNome)
          : linha.mes
    const chave = `${base}|${linha.unidade}`
    const rotulo =
      por === 'residuo'
        ? `${linha.residuoCodigo} · ${linha.residuoDescricao}`
        : por === 'destinador'
          ? linha.destinadorNome
          : rotuloDoMes(linha.mes)
    const grupo = grupos.get(chave)
    if (grupo) {
      grupo.quantidade = arredondar(grupo.quantidade + linha.quantidade)
      grupo.mtrs += linha.mtrs
    } else {
      grupos.set(chave, {
        chave,
        rotulo,
        unidade: linha.unidade,
        quantidade: arredondar(linha.quantidade),
        mtrs: linha.mtrs,
      })
    }
  }
  const lista = [...grupos.values()]
  if (por === 'mes') return lista.sort((a, b) => (a.chave < b.chave ? -1 : 1))
  return lista.sort(
    (a, b) =>
      ORDEM_DA_UNIDADE.indexOf(a.unidade) - ORDEM_DA_UNIDADE.indexOf(b.unidade) ||
      b.quantidade - a.quantidade ||
      a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
  )
}

/** Quantidade de cada mês do intervalo numa unidade (zero onde não houve MTR). */
export function serieMensal(
  linhas: readonly LinhaDoPainelDeResiduos[],
  meses: readonly DataCivil[],
  unidade: UnidadeResiduo,
): { mes: DataCivil; quantidade: number }[] {
  return meses.map((mes) => ({
    mes,
    quantidade: arredondar(
      linhas
        .filter((l) => l.mes === mes && l.unidade === unidade)
        .reduce((soma, l) => soma + l.quantidade, 0),
    ),
  }))
}
