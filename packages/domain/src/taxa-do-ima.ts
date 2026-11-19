// Taxa de análise do licenciamento no IMA e dados do Simulador de Licenciamento por atividade
// (docs/estudos/simulador-ima.md).
//
// A taxa é a Taxa de Prestação de Serviços Ambientais da Lei estadual 14.262/2007, com os valores
// do Decreto 421, de 22/12/2023 (último reajuste encontrado). Cobra-se em cada fase do
// licenciamento (item 2.5) e, na renovação, o valor da classe (item 2.6). A classe junta o porte
// (primeira letra) e o potencial poluidor geral (segunda letra), item 2.7.
//
// Qual tabela vale para cada atividade vem do próprio simulador (dados-simulador-ima.ts). Valores
// em centavos.

import {
  DADOS_DO_SIMULADOR_IMA,
  INSTRUCOES_NORMATIVAS_IMA,
  type InstrucaoNormativaIma,
} from './dados-simulador-ima'
import type {
  AtividadeLicenciavel,
  FaixaDePorte,
  Medidas,
  Porte,
  Potencial,
} from './triagem-licenciamento'

export const FONTE_DA_TAXA_IMA = 'Lei estadual 14.262/2007, valores do Decreto 421/2023'

export type FaseDaLicenca = 'LAP' | 'LAI' | 'LAO'
export type ClasseDaTaxa = `${Potencial},${Potencial}`

const FASES: readonly FaseDaLicenca[] = ['LAP', 'LAI', 'LAO']

/** Tabela nº 02 (Decreto 421/2023): LAP, LAI e LAO por classe porte,potencial. */
export const TABELA_02: Readonly<Record<ClasseDaTaxa, readonly [number, number, number]>> = {
  'P,P': [20965, 52155, 104311],
  'M,P': [37025, 92105, 184212],
  'P,M': [64694, 160936, 321875],
  'M,M': [112972, 281036, 562079],
  'G,P': [169458, 421555, 843118],
  'P,G': [197617, 491602, 983215],
  'M,G': [282431, 702591, 1405197],
  'G,M': [345630, 859811, 1719638],
  'G,G': [604663, 1504199, 3008428],
}

/** Totais publicados na Tabela nº 02, para conferir a transcrição. */
export const TOTAIS_DA_TABELA_02: Readonly<Record<ClasseDaTaxa, number>> = {
  'P,P': 177432,
  'M,P': 313341,
  'P,M': 547504,
  'M,M': 956088,
  'G,P': 1434131,
  'P,G': 1672434,
  'M,G': 2390219,
  'G,M': 2925079,
  'G,G': 5117290,
}

type ClasseDaTabela03 = 'I-A' | 'I-B' | 'II-A' | 'II-B' | 'III-A' | 'III-B'

/** Tabela nº 03 (atividades agrícolas, pecuárias e florestais), por classe. */
export const TABELA_03: Readonly<Record<ClasseDaTabela03, readonly [number, number, number]>> = {
  'I-A': [20707, 57332, 38179],
  'I-B': [23683, 68696, 45814],
  'II-A': [38178, 114536, 76357],
  'II-B': [45814, 137443, 91628],
  // A LAI de III-A está publicada como 1.044,27, mas o total da coluna (4.581,45) pede 2.290,73.
  // Mantemos o valor publicado e avisamos.
  'III-A': [76357, 104427, 152715],
  'III-B': [91628, 274887, 183258],
}

export const TOTAIS_DA_TABELA_03: Readonly<Record<ClasseDaTabela03, number>> = {
  'I-A': 116219,
  'I-B': 138192,
  'II-A': 229070,
  'II-B': 274885,
  'III-A': 458145,
  'III-B': 549773,
}

const CLASSE_DA_TABELA_03: Record<ClasseDaTaxa, ClasseDaTabela03> = {
  'P,P': 'I-A',
  'M,P': 'I-A',
  'P,M': 'I-B',
  'M,M': 'II-A',
  'G,P': 'II-A',
  'P,G': 'II-B',
  'M,G': 'III-A',
  'G,M': 'III-A',
  'G,G': 'III-B',
}

/** Item 8: Autorização Ambiental (AuA); 8.1: AuA da suinocultura. */
export const TAXA_DA_AUA = 6856
export const TAXA_DA_AUA_SUINOCULTURA = 3739

/** Fator de cada fase sobre o preço básico das fórmulas (itens 13 e 14). */
const FATOR_DA_FASE: Record<FaseDaLicenca, number> = { LAP: 1, LAI: 1.5, LAO: 1.25 }

interface Formula {
  /** Preço básico fixo, em reais. */
  base: number
  /** Reais por unidade do parâmetro. */
  porUnidade: number
  parametro: string
  /** Como o decreto escreve a fórmula. */
  texto: string
  /** Quando o parâmetro da CONSEMA não é exatamente o da fórmula. */
  premissa: string | null
}

/** Fórmulas dos itens 13 (suinocultura) e 14 (agropecuárias) para as atividades da tabela 0. */
const FORMULAS: Readonly<Record<string, Formula>> = {
  '01.54.00': f(0.11, 'CmáxC', 'Pr = 24,93 + 0,11 × NC'),
  '01.54.01': f(0.2, 'CmáxM', 'Pr = 24,93 + 0,20 × NM'),
  '01.54.02': f(0.05, 'CmáxC', 'Pr = 24,93 + 0,05 × NC'),
  '01.54.03': f(0.62, 'CmáxM', 'Pr = 24,93 + 0,62 × NM'),
  '01.40.00': f(2.56, 'AU(4)', 'Pr = 24,93 + 2,56 × AU'),
  '01.51.00': f(0.19, 'CmáxC', 'Pr = 24,93 + 0,19 × NC'),
  '01.52.00': f(0.19, 'CmáxC', 'Pr = 24,93 + 0,19 × NC'),
  '01.70.00': f(0.001, 'CmáxC', 'Pr = 24,93 + 0,001 × NC'),
  '03.32.00': f(
    8.73,
    'LA',
    'Pr = 24,93 + 8,73 × AU',
    'A fórmula usa a área útil; aqui entra a lâmina d’água (LA) informada.',
  ),
}

function f(porUnidade: number, parametro: string, texto: string, premissa: string | null = null) {
  return { base: 24.93, porUnidade, parametro, texto, premissa }
}

const LETRA_DO_PORTE: Partial<Record<Porte, Potencial>> = {
  pequeno: 'P',
  medio: 'M',
  grande: 'G',
}

export interface ValorDaFase {
  fase: FaseDaLicenca
  centavos: number
}

export type TaxaDoIma =
  | { tipo: 'autorizacao'; centavos: number; item: '8' | '8.1' }
  | {
      tipo: 'licencas'
      origem: 'tabela_02' | 'tabela_03' | 'formula'
      /** Porte,potencial (tabelas) ou nulo (fórmula). */
      classe: string | null
      formula: string | null
      fases: ValorDaFase[]
      totalCentavos: number
      avisos: string[]
    }
  | { tipo: 'sem_valor'; motivo: 'sem_formula' | 'falta_medida'; parametro: string | null }

/**
 * Taxa de análise no IMA para uma atividade já enquadrada. A AuA tem valor fixo. Nas licenças,
 * entram as fases da modalidade (trifásica: LAP, LAI e LAO; "só LAO": LAO).
 */
export function calcularTaxaDoIma(
  atividade: AtividadeLicenciavel,
  faixa: FaixaDePorte,
  medidas: Medidas,
): TaxaDoIma {
  if (faixa.modalidade === 'AuA') {
    return atividade.codigo.startsWith('01.54.')
      ? { tipo: 'autorizacao', centavos: TAXA_DA_AUA_SUINOCULTURA, item: '8.1' }
      : { tipo: 'autorizacao', centavos: TAXA_DA_AUA, item: '8' }
  }

  const fases = faixa.modalidade === 'LAO' ? (['LAO'] as const) : FASES
  const avisos: string[] = []
  if (faixa.estudo === 'EIA') {
    avisos.push(
      'Com EIA/RIMA, o IMA soma o custo da análise do estudo por hora técnica (item 3 do anexo).',
    )
  }

  const tabela = DADOS_DO_SIMULADOR_IMA[atividade.codigo]?.tabela ?? 2
  if (tabela === 0) {
    const formula = FORMULAS[atividade.codigo]
    if (!formula) return { tipo: 'sem_valor', motivo: 'sem_formula', parametro: null }
    const valor = medidas[formula.parametro]
    if (valor === null || valor === undefined || !Number.isFinite(valor) || valor < 0) {
      return { tipo: 'sem_valor', motivo: 'falta_medida', parametro: formula.parametro }
    }
    if (formula.premissa) avisos.push(formula.premissa)
    const precoBasico = formula.base + formula.porUnidade * valor
    const valores = fases.map((fase) => ({
      fase,
      centavos: Math.round(precoBasico * FATOR_DA_FASE[fase] * 100),
    }))
    return {
      tipo: 'licencas',
      origem: 'formula',
      classe: null,
      formula: formula.texto,
      fases: valores,
      totalCentavos: soma(valores),
      avisos,
    }
  }

  const letraDoPorte = LETRA_DO_PORTE[faixa.porte]
  if (!letraDoPorte) return { tipo: 'sem_valor', motivo: 'sem_formula', parametro: null }
  const classe: ClasseDaTaxa = `${letraDoPorte},${atividade.potencial.geral}`
  let linha: readonly [number, number, number]
  let rotulo: string
  if (tabela === 3) {
    const classe03 = CLASSE_DA_TABELA_03[classe]
    linha = TABELA_03[classe03]
    rotulo = `${classe} (classe ${classe03})`
    if (classe03 === 'III-A' && fases.includes('LAI')) {
      avisos.push(
        'A LAI da classe III-A está publicada como R$ 1.044,27, valor que não fecha com o total da tabela; confirme com o IMA.',
      )
    }
  } else {
    linha = TABELA_02[classe]
    rotulo = classe
  }
  const valores = fases.map((fase) => ({ fase, centavos: linha[FASES.indexOf(fase)] ?? 0 }))
  return {
    tipo: 'licencas',
    origem: tabela === 3 ? 'tabela_03' : 'tabela_02',
    classe: rotulo,
    formula: null,
    fases: valores,
    totalCentavos: soma(valores),
    avisos,
  }
}

function soma(valores: readonly ValorDaFase[]): number {
  return valores.reduce((total, v) => total + v.centavos, 0)
}

export interface InformacoesDoIma {
  /** Revogada: o site do IMA marca a IN como revogada, mas o simulador ainda aponta para ela. */
  instrucaoNormativa: (InstrucaoNormativaIma & { url: string; revogada: boolean }) | null
  /** Nulo quando a atividade não está no simulador. */
  tfasc: boolean | null
  /** Potencial do simulador, quando diverge do da resolução vigente. */
  potencialDivergente: Potencial | null
}

export function urlDaInstrucaoNormativa(instrucao: InstrucaoNormativaIma): string {
  return `https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/${String(instrucao.id)}`
}

/** IN, TFASC e divergências do simulador do IMA para a atividade. */
export function informacoesDoIma(atividade: AtividadeLicenciavel): InformacoesDoIma {
  const dados = DADOS_DO_SIMULADOR_IMA[atividade.codigo]
  if (!dados) return { instrucaoNormativa: null, tfasc: null, potencialDivergente: null }
  const instrucao = INSTRUCOES_NORMATIVAS_IMA[dados.instrucaoNormativa]
  return {
    instrucaoNormativa: instrucao
      ? {
          ...instrucao,
          titulo: instrucao.titulo.replace(/\s*\(REVOGADA\)\s*$/i, ''),
          url: urlDaInstrucaoNormativa(instrucao),
          revogada: /\(REVOGADA\)/i.test(instrucao.titulo),
        }
      : null,
    tfasc: dados.tfasc,
    potencialDivergente:
      dados.potencialNoSimulador !== atividade.potencial.geral ? dados.potencialNoSimulador : null,
  }
}

/** IN 00, diretrizes gerais do licenciamento no IMA, que vale para todas as atividades. */
export const INSTRUCAO_NORMATIVA_GERAL = INSTRUCOES_NORMATIVAS_IMA[0]
