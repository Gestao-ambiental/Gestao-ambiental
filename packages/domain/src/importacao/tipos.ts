// Importar planilha (ADR-0043): tipos e limites comuns ao navegador e ao banco.
// O banco usa os mesmos códigos de erro e aviso (conferir_importacao).

import type { DataCivil } from '../data-civil'

export type EntidadeDaImportacao = 'empreendimento' | 'licenca'

export type CampoDaImportacao =
  | 'empreendimento'
  | 'cliente'
  | 'cnpj'
  | 'unidade'
  | 'endereco'
  | 'tipo'
  | 'numero'
  | 'orgao'
  | 'emitido_em'
  | 'validade'

/** Campo -> cabeçalho exato do arquivo. */
export type MapeamentoDeColunas = Partial<Record<CampoDaImportacao, string>>

/** Célula como a planilha entrega: o valor bruto e o texto formatado (cell.w ou String(valor)). */
export interface CelulaLida {
  valor: string | number | boolean | null
  texto: string
}

export interface LinhaLida {
  /** Linha como o Excel mostra (cabeçalho na linha 1). */
  numeroLinha: number
  celulas: CelulaLida[]
}

export interface TabelaLida {
  cabecalhos: string[]
  linhas: LinhaLida[]
}

export interface DadosDaLinha {
  empreendimento: string | null
  cliente: string | null
  cnpj: string | null
  unidade: string | null
  endereco: string | null
  tipo: string | null
  numero: string | null
  orgao: string | null
  emitido_em: DataCivil | null
  emitido_em_texto: string | null
  validade: DataCivil | null
  validade_texto: string | null
  /** Campos cujo valor o navegador apagou por parecer CPF. */
  descartados: CampoDaImportacao[]
}

export type CodigoDeErroDaLinha =
  | 'campo_obrigatorio'
  | 'data_invalida'
  | 'data_futura'
  | 'validade_antes_da_emissao'
  | 'cnpj_invalido'
  | 'valor_parece_cpf'
  | 'tipo_desconhecido'
  | 'unidade_ambigua'
  | 'endereco_sem_unidade'
  | 'empreendimento_ambiguo'
  | 'texto_longo'

export type CodigoDeAvisoDaLinha =
  | 'empreendimento_ja_existe'
  | 'empreendimento_parecido'
  | 'empreendimento_repetido_na_planilha'
  | 'licenca_ja_existe'
  | 'licenca_repetida_na_planilha'
  | 'licenca_vencida'

export interface ProblemaDaLinha {
  codigo: CodigoDeErroDaLinha | CodigoDeAvisoDaLinha
  campo: CampoDaImportacao | null
}

export type GrupoDaLinha = 'pronta' | 'aviso' | 'erro'

export const LIMITE_DE_LINHAS = 1000
export const TAMANHO_DO_LOTE = 200
export const TAMANHO_MAXIMO_DO_ARQUIVO = 5 * 1024 * 1024
export const TEXTO_MAXIMO = 300
export const PRAZO_PARA_DESFAZER_HORAS = 24
export const NOME_DA_UNIDADE_PADRAO = 'Matriz'
