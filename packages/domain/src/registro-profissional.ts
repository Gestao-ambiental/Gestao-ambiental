// Registro profissional do membro (prepara CAP-09). Em cima da profissão do membro (ADR-0021): cada
// profissão concluída pode ter um registro no conselho. A situação é calculada, nunca gravada:
// registro vencido vale mais que "aguardando confirmação". Nada aqui presume habilitação; é
// informação para a Gestão decidir. O banco tem os mesmos códigos (public.conselho_profissional).

import type { DataCivil } from './data-civil'
import type { CodigoProfissao } from './profissao-e-cargo'

/** As 27 unidades da federação, na ordem em que o banco as aceita. */
export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

export type Uf = (typeof UFS)[number]

export function ehUf(texto: string): texto is Uf {
  return (UFS as readonly string[]).includes(texto)
}

/** Conselhos de fiscalização, pela sigla do regional (o registro é no regional). */
export const CONSELHOS = [
  { codigo: 'crea', rotulo: 'Crea' },
  { codigo: 'cau', rotulo: 'CAU' },
  { codigo: 'crbio', rotulo: 'CRBio' },
  { codigo: 'crq', rotulo: 'CRQ' },
  { codigo: 'crmv', rotulo: 'CRMV' },
  { codigo: 'crt', rotulo: 'CRT' },
  { codigo: 'crta', rotulo: 'CRTA' },
  { codigo: 'corecon', rotulo: 'Corecon' },
  { codigo: 'oab', rotulo: 'OAB' },
  { codigo: 'outro', rotulo: 'Outro conselho' },
] as const

export type CodigoConselho = (typeof CONSELHOS)[number]['codigo']

export function conselhoDoCodigo(valor: unknown): CodigoConselho | null {
  return CONSELHOS.find((c) => c.codigo === valor)?.codigo ?? null
}

export function rotuloDoConselho(codigo: CodigoConselho): string {
  return CONSELHOS.find((c) => c.codigo === codigo)?.rotulo ?? codigo
}

/**
 * Conselho que a tela já deixa escolhido ao informar o registro de uma profissão. É só sugestão: a
 * pessoa troca se for outro. Nulo quando a profissão não tem conselho próprio ou pode ser
 * registrada em mais de um (a pessoa escolhe).
 */
const CONSELHO_SUGERIDO: Record<CodigoProfissao, CodigoConselho | null> = {
  eng_ambiental: 'crea',
  eng_sanitarista: 'crea',
  eng_ambiental_sanitarista: 'crea',
  eng_civil: 'crea',
  eng_quimico: 'crea',
  eng_florestal: 'crea',
  eng_agronomo: 'crea',
  eng_minas: 'crea',
  eng_agricola: 'crea',
  eng_pesca: 'crea',
  eng_seguranca_trabalho: 'crea',
  eng_cartografo_agrimensor: 'crea',
  geologo: 'crea',
  geografo: 'crea',
  meteorologista: 'crea',
  arquiteto_urbanista: 'cau',
  biologo: 'crbio',
  quimico: 'crq',
  medico_veterinario: 'crmv',
  oceanografo: null,
  arqueologo: null,
  sociologo: null,
  antropologo: null,
  economista: 'corecon',
  advogado: 'oab',
  gestor_ambiental: null,
  ecologo: null,
  tec_meio_ambiente: 'crt',
  tec_seguranca_trabalho: null,
  tec_quimica: 'crq',
  tec_agrimensura: 'crt',
  tec_agricola: 'crta',
  tec_florestal: 'crta',
  outra_nao_tecnica: null,
}

export function conselhoSugerido(profissao: CodigoProfissao): CodigoConselho | null {
  return CONSELHO_SUGERIDO[profissao]
}

/**
 * Profissões que podem ter registro: a principal, se já concluída, e as outras (sempre concluídas,
 * ADR-0021 §6). Igual à regra do banco.
 */
export function profissoesComRegistro(membro: {
  profissao: CodigoProfissao | null
  profissaoEmCurso: boolean
  outrasProfissoes: readonly CodigoProfissao[]
}): CodigoProfissao[] {
  const lista: CodigoProfissao[] = []
  if (membro.profissao && !membro.profissaoEmCurso) lista.push(membro.profissao)
  for (const codigo of membro.outrasProfissoes) {
    if (!lista.includes(codigo)) lista.push(codigo)
  }
  return lista
}

export type SituacaoDoRegistro = 'confirmado' | 'aguardando_confirmacao' | 'vencido'

/** Vencido (validade antes de hoje) vale mais; depois, confirmado ou aguardando a Gestão. */
export function situacaoDoRegistro(
  registro: { confirmado: boolean; validoAte: DataCivil | null },
  hoje: DataCivil,
): SituacaoDoRegistro {
  if (registro.validoAte !== null && registro.validoAte < hoje) return 'vencido'
  return registro.confirmado ? 'confirmado' : 'aguardando_confirmacao'
}

const ROTULOS_DA_SITUACAO: Record<SituacaoDoRegistro, string> = {
  confirmado: 'Confirmado',
  aguardando_confirmacao: 'Aguardando confirmação',
  vencido: 'Vencido',
}

export function rotuloDaSituacaoDoRegistro(situacao: SituacaoDoRegistro): string {
  return ROTULOS_DA_SITUACAO[situacao]
}

/**
 * "Crea-SC 123456": sigla do regional, UF e número. Sem UF, "Crea 123456". "Outro conselho" não
 * entra no texto: fica só o número (com a UF, se houver).
 */
export function descreverRegistro(registro: {
  conselho: CodigoConselho
  numero: string
  uf: string | null
}): string {
  const numero = registro.numero.trim()
  const sigla = registro.conselho === 'outro' ? '' : rotuloDoConselho(registro.conselho)
  const uf = registro.uf?.trim() ?? ''
  const orgao = sigla && uf ? `${sigla}-${uf}` : sigla || uf
  return orgao ? `${orgao} ${numero}` : numero
}
