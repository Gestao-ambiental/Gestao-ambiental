// Texto de cada linha da auditoria da ocorrência: o que aconteceu e quais campos mudaram. Só
// apresentação; o registro em si é do banco (trigger private.auditar, append-only).

import { ehDataCivil, formatarDataCivil } from '@gestao-ambiental/domain'

import type { RegistroDeAuditoria } from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'

export interface Mudanca {
  campo: string
  de: string | null
  para: string | null
}

export interface LinhaDaAuditoria {
  acao: string
  mudancas: Mudanca[]
}

const CAMPOS: Record<string, string> = {
  situacao: 'Situação',
  prazo_oficial_atual: 'Prazo atual',
  prazo_oficial_original: 'Prazo oficial',
  meta_interna: 'Meta interna',
  responsavel_id: 'Responsável',
  responsavel_externo: 'Responsável externo',
  conferente_id: 'Conferente',
  concluida_em: 'Concluída em',
  concluida_por: 'Concluída por',
  concluida_sem_evidencia: 'Concluída sem evidência',
  evidencia_aprovada_id: 'Evidência aprovada',
  titulo: 'Título',
  modo: 'Modo',
  horas_estimadas: 'Horas estimadas',
  meta: 'Meta',
  posicao: 'Posição',
  data_execucao: 'Data real de execução',
}

// Controle interno: não diz nada a quem lê.
const IGNORADOS = new Set(['row_version'])

// Referências (uuid) e instantes têm leitura própria; o resto mostra o valor.
const INSTANTE = /^\d{4}-\d{2}-\d{2}T/

function rotuloDoCampo(campo: string): string {
  return CAMPOS[campo] ?? campo.replaceAll('_', ' ')
}

function ehReferencia(campo: string): boolean {
  return campo.endsWith('_id') || campo.endsWith('_por')
}

function valorLegivel(valor: unknown, fuso: string): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'string') {
    if (ehDataCivil(valor)) return formatarDataCivil(valor)
    if (INSTANTE.test(valor)) return formatarInstanteComHora(valor, fuso)
    return valor.replaceAll('_', ' ')
  }
  return JSON.stringify(valor)
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function mudancasDe(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  fuso: string,
): Mudanca[] {
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)])
  const mudancas: Mudanca[] = []
  for (const campo of campos) {
    if (IGNORADOS.has(campo)) continue
    if (JSON.stringify(antes[campo]) === JSON.stringify(depois[campo])) continue
    if (ehReferencia(campo)) {
      const tinha = antes[campo] !== null && antes[campo] !== undefined
      const tem = depois[campo] !== null && depois[campo] !== undefined
      mudancas.push({
        campo: rotuloDoCampo(campo),
        de: tinha ? 'definido' : null,
        para: tem ? (tinha ? 'outro' : 'definido') : null,
      })
      continue
    }
    mudancas.push({
      campo: rotuloDoCampo(campo),
      de: valorLegivel(antes[campo], fuso),
      para: valorLegivel(depois[campo], fuso),
    })
  }
  return mudancas
}

function acaoDe(r: RegistroDeAuditoria): string {
  const dados = r.depois ?? r.antes ?? {}
  const verbo = r.acao === 'insert' ? 'Criou' : r.acao === 'update' ? 'Alterou' : 'Apagou'
  switch (r.entidade) {
    case 'ocorrencia':
      return `${verbo} a ocorrência`
    case 'etapa':
      return `${verbo} a etapa “${texto(dados.titulo)}”`
    case 'evidencia': {
      const numero = typeof dados.numero === 'number' ? ` v${String(dados.numero)}` : ''
      if (r.acao === 'insert') return `Enviou a evidência${numero}`
      return `${verbo} a evidência${numero}`
    }
    case 'conferencia':
      if (r.acao !== 'insert') return `${verbo} a conferência`
      return dados.decisao === 'aprovada'
        ? 'Aprovou a evidência'
        : `Devolveu a evidência: “${texto(dados.motivo)}”`
    case 'conferencia_de_arquivo':
      return dados.confere === true
        ? 'Servidor conferiu o arquivo: igual ao enviado'
        : 'Servidor conferiu o arquivo: diferente do enviado'
    default:
      return `${verbo} ${r.entidade.replaceAll('_', ' ')}`
  }
}

/** Ação e campos alterados (só em alteração), prontos para a tela. */
export function descreverRegistro(r: RegistroDeAuditoria, fuso: string): LinhaDaAuditoria {
  return {
    acao: acaoDe(r),
    mudancas: r.acao === 'update' && r.antes && r.depois ? mudancasDe(r.antes, r.depois, fuso) : [],
  }
}
