// Campos da importação (ADR-0043), sinônimos de cabeçalho e o mapeamento sugerido.
// O rótulo de cada campo também é o cabeçalho do modelo .xlsx.

import type { CampoDaImportacao, EntidadeDaImportacao, MapeamentoDeColunas } from './tipos'

export interface CampoDaEntidade {
  campo: CampoDaImportacao
  rotulo: string
  obrigatorio: boolean
}

const CAMPOS_COMUNS: readonly CampoDaEntidade[] = [
  { campo: 'empreendimento', rotulo: 'Empreendimento', obrigatorio: true },
  { campo: 'cliente', rotulo: 'Cliente', obrigatorio: false },
  { campo: 'cnpj', rotulo: 'CNPJ', obrigatorio: false },
  { campo: 'unidade', rotulo: 'Unidade', obrigatorio: false },
  { campo: 'endereco', rotulo: 'Endereço da unidade', obrigatorio: false },
]

export const CAMPOS_DA_IMPORTACAO: Record<EntidadeDaImportacao, readonly CampoDaEntidade[]> = {
  empreendimento: CAMPOS_COMUNS,
  licenca: [
    ...CAMPOS_COMUNS,
    { campo: 'tipo', rotulo: 'Tipo', obrigatorio: true },
    { campo: 'numero', rotulo: 'Número', obrigatorio: true },
    { campo: 'orgao', rotulo: 'Órgão', obrigatorio: true },
    { campo: 'emitido_em', rotulo: 'Emissão', obrigatorio: true },
    { campo: 'validade', rotulo: 'Validade', obrigatorio: true },
  ],
}

/** Rótulo do campo (o mesmo nas duas entidades). */
export function rotuloDoCampoDaImportacao(campo: CampoDaImportacao): string {
  return CAMPOS_DA_IMPORTACAO.licenca.find((c) => c.campo === campo)?.rotulo ?? campo
}

/** Cabeçalhos aceitos por campo, já normalizados (sem acento, minúsculas, sem pontuação). */
export const SINONIMOS_DOS_CAMPOS: Record<CampoDaImportacao, readonly string[]> = {
  empreendimento: ['empreendimento', 'nome do empreendimento', 'empresa', 'razao social'],
  cliente: ['cliente', 'contratante', 'nome do cliente'],
  cnpj: ['cnpj', 'cnpj do empreendimento'],
  unidade: ['unidade', 'nome da unidade', 'filial'],
  endereco: ['endereco da unidade', 'endereco', 'localizacao'],
  tipo: ['tipo', 'tipo de licenca', 'tipo da licenca', 'modalidade', 'sigla'],
  numero: ['numero', 'n', 'no', 'numero da licenca', 'n da licenca', 'no da licenca'],
  orgao: ['orgao', 'orgao emissor', 'orgao ambiental'],
  emitido_em: ['emissao', 'data de emissao', 'data da emissao', 'emitida em'],
  validade: ['validade', 'vencimento', 'valida ate', 'data de validade', 'vence em'],
}

/**
 * O mesmo que private.normalizar_nome: sem acento, minúsculas, sem espaço nas pontas e com os
 * espaços de dentro colapsados.
 */
export function normalizarTextoDeComparacao(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Cabeçalho para comparar com os sinônimos: também sem pontuação ("Nº" vira "no"). */
export function normalizarCabecalho(texto: string): string {
  return normalizarTextoDeComparacao(
    texto
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' '),
  )
}

/**
 * Mapeamento sugerido: primeiro o último usado (só os cabeçalhos que existem neste arquivo),
 * depois os sinônimos. Cada cabeçalho é usado uma vez só.
 */
export function mapearCabecalhos(
  cabecalhos: readonly string[],
  entidade: EntidadeDaImportacao,
  memoria?: MapeamentoDeColunas | null,
): MapeamentoDeColunas {
  const campos = CAMPOS_DA_IMPORTACAO[entidade]
  const usados = new Set<string>()
  const resultado: MapeamentoDeColunas = {}

  for (const { campo } of campos) {
    const lembrado = memoria?.[campo]
    if (lembrado && cabecalhos.includes(lembrado) && !usados.has(lembrado)) {
      resultado[campo] = lembrado
      usados.add(lembrado)
    }
  }

  const normalizados = cabecalhos.map((c) => normalizarCabecalho(c))
  for (const { campo } of campos) {
    if (resultado[campo]) continue
    for (const sinonimo of SINONIMOS_DOS_CAMPOS[campo]) {
      const indice = normalizados.findIndex(
        (n, i) => n === sinonimo && !usados.has(cabecalhos[i] ?? ''),
      )
      const cabecalho = cabecalhos[indice]
      if (indice >= 0 && cabecalho !== undefined && cabecalho !== '') {
        resultado[campo] = cabecalho
        usados.add(cabecalho)
        break
      }
    }
  }
  return resultado
}

/** Campos obrigatórios da entidade sem coluna escolhida. */
export function faltamObrigatorios(
  mapeamento: MapeamentoDeColunas,
  entidade: EntidadeDaImportacao,
): CampoDaImportacao[] {
  return CAMPOS_DA_IMPORTACAO[entidade]
    .filter((c) => c.obrigatorio && !mapeamento[c.campo])
    .map((c) => c.campo)
}
