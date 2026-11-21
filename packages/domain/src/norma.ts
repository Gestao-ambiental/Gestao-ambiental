// Identificação de normas (catálogo de normas, ADR-0050). Lê a citação de uma norma num texto
// ("Resolução CONSEMA nº 250/2024", "IN 02", "Lei nº 9.605, de 12 de fevereiro de 1998"), monta a
// chave do catálogo no mesmo formato do banco (private.norma.chave) e o título curto exibido.

/** Esferas aceitas pelo check norma_esfera_valida. */
export const ESFERAS_DE_NORMA = ['federal', 'estadual', 'municipal'] as const
export type EsferaNorma = (typeof ESFERAS_DE_NORMA)[number]

/** Tipos aceitos pelo check norma_tipo_valido, na ordem da migration. */
export const TIPOS_DE_NORMA = [
  'lei',
  'lei_complementar',
  'decreto',
  'resolucao',
  'instrucao_normativa',
  'portaria',
  'deliberacao',
  'medida_provisoria',
] as const
export type TipoNorma = (typeof TIPOS_DE_NORMA)[number]

/** Órgãos reconhecidos na citação. Ficam em maiúsculas no identificador. */
export const ORGAOS_RECONHECIDOS = ['IMA', 'CONSEMA', 'CONAMA', 'IBAMA', 'SAMA'] as const

export interface IdentificadorDeNorma {
  tipo: TipoNorma
  /** Sem zeros à esquerda e sem pontos: "096" vira "96", "14.675" vira "14675". */
  numero: string
  /** Ano com 4 dígitos, quando a citação traz. */
  ano?: number
  /** Órgão em maiúsculas, quando a citação traz (IMA, CONSEMA, CONAMA, IBAMA, SAMA). */
  orgao?: string
}

const MESES =
  'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro'

// Abreviações (IN, LC, MP) só valem em maiúsculas; o resto aceita qualquer caixa e falta de acento.
const TIPO =
  'lei\\s+complementar|lc|lei|decreto|resolu[çc][ãa]o|res\\.|instru[çc][ãa]o\\s+normativa|in|' +
  'portaria|delibera[çc][ãa]o|medida\\s+provis[óo]ria|mp'

const PADRAO_DE_CITACAO = new RegExp(
  '(?<![\\p{L}\\p{N}])' +
    `(?<tipo>${TIPO})` +
    '(?:\\s+(?:federal|estadual|municipal))?' +
    `(?:\\s+(?:d[oa]\\s+)?(?<orgao>${ORGAOS_RECONHECIDOS.join('|')})(?![\\p{L}\\p{N}]))?` +
    '(?:\\s*(?:n\\.?\\s*[º°o]\\.?|n[º°]|n[uú]mero)(?![\\p{L}]))?' +
    '\\s*(?<numero>\\d{1,3}(?:\\.\\d{3})+|\\d+)(?![\\p{N}]|\\.\\d)' +
    '(?:' +
    '\\s*/\\s*(?<anoBarra>\\d{4})(?!\\p{N})' +
    `|\\s*,?\\s+de\\s+(?:\\d{1,2}\\s*[º°o]?\\s+de\\s+(?:${MESES})\\s+de\\s+)?(?<anoExtenso>\\d{4})(?!\\p{N})` +
    ')?',
  'giu',
)

const ABREVIACOES = new Set(['in', 'lc', 'mp'])

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '')
}

function tipoDaPalavra(palavra: string): TipoNorma | null {
  const p = semAcento(palavra).toLowerCase().replace(/\s+/g, ' ')
  if (p === 'lei complementar' || p === 'lc') return 'lei_complementar'
  if (p === 'lei') return 'lei'
  if (p === 'decreto') return 'decreto'
  if (p === 'resolucao' || p === 'res.') return 'resolucao'
  if (p === 'instrucao normativa' || p === 'in') return 'instrucao_normativa'
  if (p === 'portaria') return 'portaria'
  if (p === 'deliberacao') return 'deliberacao'
  if (p === 'medida provisoria' || p === 'mp') return 'medida_provisoria'
  return null
}

/** Número sem pontos e sem zeros à esquerda ("096" vira "96", "14.675" vira "14675"). */
export function normalizarNumeroDaNorma(numero: string): string {
  const limpo = semAcento(numero)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return limpo.replace(/^0+(?=[0-9])/, '')
}

function identificadorDoAchado(achado: RegExpMatchArray): IdentificadorDeNorma | null {
  const grupos = achado.groups ?? {}
  const palavra = grupos.tipo ?? ''
  if (ABREVIACOES.has(palavra.toLowerCase()) && palavra !== palavra.toUpperCase()) return null
  const tipo = tipoDaPalavra(palavra)
  const numero = normalizarNumeroDaNorma(grupos.numero ?? '')
  if (tipo === null || numero === '') return null
  const id: IdentificadorDeNorma = { tipo, numero }
  const ano = grupos.anoBarra ?? grupos.anoExtenso
  if (ano !== undefined) id.ano = Number(ano)
  if (grupos.orgao !== undefined) id.orgao = grupos.orgao.toUpperCase()
  return id
}

/** Primeira norma citada no texto, ou null quando nada é reconhecido. */
export function lerIdentificadorDeNorma(texto: string): IdentificadorDeNorma | null {
  for (const achado of texto.matchAll(PADRAO_DE_CITACAO)) {
    const id = identificadorDoAchado(achado)
    if (id !== null) return id
  }
  return null
}

/**
 * Todas as normas citadas, na ordem em que aparecem, sem repetir. Citações da mesma norma se
 * juntam quando uma só completa a outra ("Resolução CONSEMA nº 250" e, adiante, "Resolução
 * CONSEMA nº 250/2024" viram uma, com o ano).
 */
export function lerTodosOsIdentificadores(texto: string): IdentificadorDeNorma[] {
  const todos: IdentificadorDeNorma[] = []
  for (const achado of texto.matchAll(PADRAO_DE_CITACAO)) {
    const id = identificadorDoAchado(achado)
    if (id === null) continue
    const igual = todos.find(
      (outro) =>
        outro.tipo === id.tipo &&
        outro.numero === id.numero &&
        (outro.ano === undefined || id.ano === undefined || outro.ano === id.ano) &&
        (outro.orgao === undefined || id.orgao === undefined || outro.orgao === id.orgao),
    )
    if (igual === undefined) {
      todos.push(id)
      continue
    }
    if (igual.ano === undefined && id.ano !== undefined) igual.ano = id.ano
    if (igual.orgao === undefined && id.orgao !== undefined) igual.orgao = id.orgao
  }
  return todos
}

export interface DadosDaChaveDaNorma {
  esfera: EsferaNorma
  /** UF da norma estadual ou municipal. Padrão: SC. */
  uf?: string
  /** Código IBGE do município (7 dígitos), obrigatório na esfera municipal. */
  municipioIbge?: string
  /** Órgão emissor ("IMA", "CONSEMA"); nas leis federais, "federal". */
  orgao: string
  tipo: TipoNorma
  numero: string
  ano?: number
}

const FORMATO_DA_CHAVE = /^[a-z0-9]+(;[a-z0-9_.]+)+$/

function parteDaChave(texto: string): string {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Chave do catálogo no formato da migration (check norma_chave_formato), em minúsculas e separada
 * por ';': federal "br;órgão;tipo;número[;ano]", estadual "uf;órgão;tipo;número[;ano]" e municipal
 * "uf;ibge;órgão;tipo;número[;ano]". Lança erro quando os dados não formam uma chave válida.
 */
export function chaveDaNorma(dados: DadosDaChaveDaNorma): string {
  const partes: string[] = []
  if (dados.esfera === 'federal') {
    partes.push('br')
  } else {
    partes.push(parteDaChave(dados.uf ?? 'sc'))
    if (dados.esfera === 'municipal') {
      const ibge = dados.municipioIbge ?? ''
      if (!/^[0-9]{7}$/.test(ibge)) {
        throw new Error('Norma municipal precisa do código IBGE do município com 7 dígitos.')
      }
      partes.push(ibge)
    }
  }
  partes.push(parteDaChave(dados.orgao), dados.tipo, normalizarNumeroDaNorma(dados.numero))
  if (dados.ano !== undefined) partes.push(String(dados.ano))
  const chave = partes.join(';')
  if (partes.some((parte) => parte === '') || !FORMATO_DA_CHAVE.test(chave)) {
    throw new Error(`Chave de norma inválida: ${chave}`)
  }
  return chave
}

const ROTULO_DO_TIPO: Record<TipoNorma, string> = {
  lei: 'Lei',
  lei_complementar: 'Lei Complementar',
  decreto: 'Decreto',
  resolucao: 'Resolução',
  instrucao_normativa: 'IN',
  portaria: 'Portaria',
  deliberacao: 'Deliberação',
  medida_provisoria: 'Medida Provisória',
}

const TIPOS_COM_MILHAR: readonly TipoNorma[] = ['lei', 'lei_complementar', 'decreto']

/**
 * Título curto: "IN 2", "Resolução CONSEMA 250/2024", "Lei 14.675/2009". Leis e decretos com 4 ou
 * mais dígitos ganham ponto de milhar, como são citados.
 */
export function tituloCurtoDaNorma(id: IdentificadorDeNorma): string {
  let numero = id.numero
  if (TIPOS_COM_MILHAR.includes(id.tipo) && /^\d{4,}$/.test(numero)) {
    numero = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }
  const partes = [ROTULO_DO_TIPO[id.tipo]]
  if (id.orgao !== undefined) partes.push(id.orgao)
  partes.push(id.ano === undefined ? numero : `${numero}/${String(id.ano)}`)
  return partes.join(' ')
}
