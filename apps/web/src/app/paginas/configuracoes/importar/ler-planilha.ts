// Leitura do arquivo da importação (ADR-0043), dentro do Web Worker: SheetJS 0.20.3 (tarball de
// cdn.sheetjs.com; o xlsx 0.18.5 do npm tem CVE-2023-30533 e CVE-2024-22363). Só .xlsx e .csv,
// até 5 MB e 1.000 linhas por aba. As colunas com cara de CPF saem aqui, antes de qualquer envio.
import {
  LIMITE_DE_LINHAS,
  TAMANHO_MAXIMO_DO_ARQUIVO,
  decodificarCsv,
  descartarColunasDeCpf,
  detectarSeparadorDoCsv,
  type CelulaLida,
  type LinhaLida,
  type TabelaLida,
} from '@gestao-ambiental/domain'
import { read, SSF, utils, type CellObject, type WorkBook, type WorkSheet } from 'xlsx'

export type ErroDaLeitura =
  'formato_nao_aceito' | 'arquivo_grande' | 'linhas_demais' | 'arquivo_ilegivel' | 'sem_linhas'

export interface AbaLida {
  nome: string
  tabela: TabelaLida
  /** Cabeçalhos descartados por parecer CPF. */
  descartadas: string[]
}

export type ResultadoDaLeitura = { ok: true; abas: AbaLida[] } | { ok: false; erro: ErroDaLeitura }

/** Diferença entre o sistema de datas 1904 (Excel antigo do Mac) e o 1900. */
const DIAS_ENTRE_1900_E_1904 = 1462

function celulaLida(celula: CellObject | undefined, data1904: boolean): CelulaLida {
  if (celula?.v === undefined) return { valor: null, texto: '' }
  let valor = celula.v
  if (valor instanceof Date) valor = celula.w ?? ''
  const ehDataFormatada =
    typeof valor === 'number' &&
    typeof celula.z === 'string' &&
    (SSF as { is_date: (formato: string) => boolean }).is_date(celula.z)
  if (data1904 && ehDataFormatada && typeof valor === 'number') valor += DIAS_ENTRE_1900_E_1904
  const texto = typeof celula.w === 'string' ? celula.w : String(valor)
  return { valor, texto }
}

/** Cabeçalhos únicos: vazio vira "Coluna X"; repetido ganha " (2)". */
function cabecalhosUnicos(brutos: readonly string[], primeiraColuna: number): string[] {
  const vistos = new Map<string, number>()
  return brutos.map((bruto, i) => {
    const base = bruto.trim() || `Coluna ${utils.encode_col(primeiraColuna + i)}`
    const vezes = (vistos.get(base) ?? 0) + 1
    vistos.set(base, vezes)
    return vezes === 1 ? base : `${base} (${String(vezes)})`
  })
}

function preenchidas(celulas: readonly CelulaLida[]): number {
  return celulas.filter((c) => c.texto.trim() !== '' || (c.valor !== null && c.valor !== '')).length
}

/** Linhas preenchidas olhadas para achar o cabeçalho (títulos acima dele ficam de fora). */
const LINHAS_ATE_O_CABECALHO = 10

/**
 * O cabeçalho é a primeira linha com duas ou mais células preenchidas entre as dez primeiras
 * preenchidas (sem nenhuma assim, a primeira preenchida). O que vem antes dele fica de fora, e as
 * linhas vazias depois dele também.
 */
function tabelaDaAba(aba: WorkSheet, data1904: boolean): TabelaLida | 'linhas_demais' | null {
  const ref = aba['!ref']
  if (!ref) return null
  const faixa = utils.decode_range(ref)
  const larguraMaxima = Math.min(faixa.e.c, faixa.s.c + 199)
  let cabecalhos: string[] | null = null
  const antes: LinhaLida[] = []
  const linhas: LinhaLida[] = []

  const acrescentar = (linha: LinhaLida, largura: number): boolean => {
    if (linhas.length >= LIMITE_DE_LINHAS) return false
    linhas.push({ numeroLinha: linha.numeroLinha, celulas: linha.celulas.slice(0, largura) })
    return true
  }
  /** Os cabeçalhos escolhidos; nulo quando as linhas já passam do limite. */
  const escolherCabecalho = (): string[] | null => {
    const indice = Math.max(
      0,
      antes.findIndex((l) => preenchidas(l.celulas) >= 2),
    )
    const celulas = antes[indice]?.celulas ?? []
    // Sem colunas vazias à direita do último cabeçalho.
    let fim = celulas.length
    while (fim > 0 && (celulas[fim - 1]?.texto.trim() ?? '') === '') fim--
    const escolhidos = cabecalhosUnicos(
      celulas.slice(0, fim).map((c) => c.texto),
      faixa.s.c,
    )
    return antes.slice(indice + 1).every((l) => acrescentar(l, escolhidos.length))
      ? escolhidos
      : null
  }

  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    const celulas: CelulaLida[] = []
    for (let c = faixa.s.c; c <= larguraMaxima; c++) {
      const celula = aba[utils.encode_cell({ r, c })] as CellObject | undefined
      celulas.push(celulaLida(celula, data1904))
    }
    if (preenchidas(celulas) === 0) continue
    const linha = { numeroLinha: r + 1, celulas }
    if (cabecalhos === null) {
      antes.push(linha)
      if (antes.length === LINHAS_ATE_O_CABECALHO) {
        cabecalhos = escolherCabecalho()
        if (cabecalhos === null) return 'linhas_demais'
      }
      continue
    }
    if (!acrescentar(linha, cabecalhos.length)) return 'linhas_demais'
  }
  if (cabecalhos === null && antes.length > 0) {
    cabecalhos = escolherCabecalho()
    if (cabecalhos === null) return 'linhas_demais'
  }
  if (cabecalhos === null || linhas.length === 0) return null
  return { cabecalhos, linhas }
}

function ehXlsx(bytes: Uint8Array): boolean {
  // Arquivo .xlsx é um zip: começa com "PK".
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

function lerLivro(bytes: Uint8Array, csv: boolean): WorkBook | null {
  const comum = {
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
  } as const
  if (!csv) {
    if (!ehXlsx(bytes)) return null
    return read(bytes, { ...comum, type: 'array', cellNF: true })
  }
  const texto = decodificarCsv(bytes)
  // Texto que começa com "<" seria lido como HTML ou XML: não é CSV.
  if (texto.trimStart().startsWith('<')) return null
  return read(texto, { ...comum, type: 'string', FS: detectarSeparadorDoCsv(texto), raw: true })
}

export function lerPlanilha(bytes: ArrayBuffer, nomeArquivo: string): Promise<ResultadoDaLeitura> {
  return Promise.resolve(lerAgora(bytes, nomeArquivo))
}

function lerAgora(bytes: ArrayBuffer, nomeArquivo: string): ResultadoDaLeitura {
  const nome = nomeArquivo.toLowerCase()
  const csv = nome.endsWith('.csv')
  if (!csv && !nome.endsWith('.xlsx')) return { ok: false, erro: 'formato_nao_aceito' }
  if (bytes.byteLength > TAMANHO_MAXIMO_DO_ARQUIVO) return { ok: false, erro: 'arquivo_grande' }

  let livro: WorkBook | null
  try {
    livro = lerLivro(new Uint8Array(bytes), csv)
  } catch {
    return { ok: false, erro: 'arquivo_ilegivel' }
  }
  if (!livro) return { ok: false, erro: csv ? 'arquivo_ilegivel' : 'formato_nao_aceito' }

  const data1904 = Boolean(livro.Workbook?.WBProps?.date1904)
  const abas: AbaLida[] = []
  for (const nomeDaAba of livro.SheetNames) {
    const aba = livro.Sheets[nomeDaAba]
    if (!aba) continue
    const tabela = tabelaDaAba(aba, data1904)
    if (tabela === 'linhas_demais') return { ok: false, erro: 'linhas_demais' }
    if (!tabela) continue
    const limpa = descartarColunasDeCpf(tabela)
    abas.push({ nome: nomeDaAba, tabela: limpa.tabela, descartadas: limpa.descartadas })
  }
  if (abas.length === 0) return { ok: false, erro: 'sem_linhas' }
  return { ok: true, abas }
}
