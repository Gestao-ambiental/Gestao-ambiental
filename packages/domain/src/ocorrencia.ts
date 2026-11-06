// Execução da ocorrência (DEM-01 a DEM-04, DEM-09). Regras de apresentação calculadas a partir do
// que está gravado; o banco aplica as regras de escrita (quem confere, quem conclui).

import { lerDataDigitada, nomeDoMes } from './calendario'
import {
  adicionarDias,
  diferencaEmDias,
  formatarDataCivil,
  nomeDoDiaDaSemana,
  type DataCivil,
} from './data-civil'

export type SituacaoGravadaDaOcorrencia = 'aberta' | 'em_conferencia' | 'concluida'
/** `cancelada`: quem enviou desistiu antes da conferência; a ocorrência volta para A fazer. */
export type SituacaoDaEvidencia = 'em_conferencia' | 'aprovada' | 'devolvida' | 'cancelada'

/** Situação mostrada no detalhe (Protótipo 16): a fazer, em conferência, aprovada, devolvida, concluída. */
export type SituacaoExibida = 'a_fazer' | 'em_conferencia' | 'aprovada' | 'devolvida' | 'concluida'

export function situacaoExibida(
  situacao: SituacaoGravadaDaOcorrencia,
  ultimaEvidencia: SituacaoDaEvidencia | null,
): SituacaoExibida {
  if (situacao === 'concluida') return 'concluida'
  if (situacao === 'em_conferencia')
    return ultimaEvidencia === 'aprovada' ? 'aprovada' : 'em_conferencia'
  return ultimaEvidencia === 'devolvida' ? 'devolvida' : 'a_fazer'
}

/**
 * Próxima ação (DEM-02), a partir da situação e das etapas: corrigir o que voltou, conferir o que
 * foi enviado, concluir o que foi aprovado, ou a primeira etapa ainda aberta antes de enviar.
 */
export function proximaAcao(
  situacao: SituacaoExibida,
  etapas: readonly { titulo: string; concluida: boolean }[],
): string {
  switch (situacao) {
    case 'concluida':
      return 'Nada pendente'
    case 'aprovada':
      return 'Concluir a ocorrência'
    case 'em_conferencia':
      return 'Conferir a evidência enviada'
    case 'devolvida':
      return 'Corrigir e reenviar a evidência'
    case 'a_fazer': {
      const pendente = etapas.find((etapa) => !etapa.concluida)
      return pendente
        ? `Concluir a etapa “${pendente.titulo}”`
        : 'Enviar a evidência para conferência'
    }
  }
}

export interface JanelaDoCiclo {
  /** Primeiro dia do ciclo; nulo quando não há base (primeiro ciclo sem data de referência). */
  inicio: DataCivil | null
  /** Prazo oficial original do ciclo. */
  fim: DataCivil
}

/**
 * Janela do ciclo para o aviso de evidência fora do ciclo (DEM-09; decisão de 18/10/2026): do dia
 * seguinte ao prazo do ciclo anterior até o prazo deste. No primeiro ciclo, desde a data de
 * referência do prazo.
 */
export function janelaDoCiclo(
  prazo: DataCivil,
  prazoAnterior: DataCivil | null,
  dataReferencia: DataCivil | null,
): JanelaDoCiclo {
  return { inicio: prazoAnterior ? adicionarDias(prazoAnterior, 1) : dataReferencia, fim: prazo }
}

/** A data real de execução cai fora da janela? Só avisa; quem decide é quem confere. */
export function dataForaDoCiclo(data: DataCivil, janela: JanelaDoCiclo): boolean {
  return data > janela.fim || (janela.inicio !== null && data < janela.inicio)
}

// ---------------------------------------------------------------------------
// Tela 16 v2 (visão de quem executa)
// ---------------------------------------------------------------------------

/** Atrasada: prazo oficial atual já passou e a ocorrência não foi concluída. É selo, não status. */
export function estaAtrasada(
  prazoAtual: DataCivil,
  hoje: DataCivil,
  situacao: SituacaoGravadaDaOcorrencia,
): boolean {
  return situacao !== 'concluida' && prazoAtual < hoje
}

/** Qual seção ocupa o lugar da evidência: formulário, leitura do envio, Regularizar ou nada. */
export type SecaoDaOcorrencia = 'evidencia' | 'conferencia' | 'regularizar' | 'concluida'

export function secaoDaOcorrencia(situacao: SituacaoExibida, atrasada: boolean): SecaoDaOcorrencia {
  if (situacao === 'concluida') return 'concluida'
  if (situacao === 'em_conferencia' || situacao === 'aprovada') return 'conferencia'
  return atrasada ? 'regularizar' : 'evidencia'
}

export type ErroDeData = 'invalida' | 'futura' | 'passada' | 'obrigatoria'

export const MENSAGEM_DO_ERRO_DE_DATA: Record<ErroDeData, string> = {
  invalida: 'Data inválida',
  futura: 'Data futura não permitida',
  passada: 'Use uma data futura',
  obrigatoria: 'Obrigatório',
}

export interface ValidacaoDaDataDeExecucao {
  data: DataCivil | null
  erro: ErroDeData | null
  /** Aviso âmbar, não bloqueia: quem confere decide. */
  foraDoCiclo: boolean
}

/**
 * Data de execução (DEM-09): obrigatória, existente e nunca futura. Fora da janela do ciclo só
 * avisa. `exigir` liga as mensagens de vazio e de data incompleta (depois de tentar enviar ou de
 * sair do campo); data inexistente ou futura aparece assim que está completa.
 */
export function validarDataDeExecucao(
  texto: string,
  hoje: DataCivil,
  janela: JanelaDoCiclo | null,
  exigir: boolean,
): ValidacaoDaDataDeExecucao {
  const leitura = lerDataDigitada(texto)
  switch (leitura.situacao) {
    case 'vazia':
      return { data: null, erro: exigir ? 'obrigatoria' : null, foraDoCiclo: false }
    case 'incompleta':
      return { data: null, erro: exigir ? 'invalida' : null, foraDoCiclo: false }
    case 'inexistente':
      return { data: null, erro: 'invalida', foraDoCiclo: false }
    case 'valida':
      if (leitura.data > hoje) return { data: null, erro: 'futura', foraDoCiclo: false }
      return {
        data: leitura.data,
        erro: null,
        foraDoCiclo: janela !== null && dataForaDoCiclo(leitura.data, janela),
      }
  }
}

/** Novo prazo oficial e nova meta interna: obrigatórios e depois de hoje. */
export function validarDataFutura(
  texto: string,
  hoje: DataCivil,
  exigir: boolean,
): { data: DataCivil | null; erro: ErroDeData | null } {
  const leitura = lerDataDigitada(texto)
  switch (leitura.situacao) {
    case 'vazia':
      return { data: null, erro: exigir ? 'obrigatoria' : null }
    case 'incompleta':
      return { data: null, erro: exigir ? 'invalida' : null }
    case 'inexistente':
      return { data: null, erro: 'invalida' }
    case 'valida':
      return leitura.data > hoje
        ? { data: leitura.data, erro: null }
        : { data: null, erro: 'passada' }
  }
}

/** "Fora do ciclo (01/10 a 31/12/2026)"; sem início conhecido, "Fora do ciclo (até 31/12/2026)". */
export function avisoForaDoCiclo(janela: JanelaDoCiclo): string {
  const fim = formatarDataCivil(janela.fim)
  if (!janela.inicio) return `Fora do ciclo (até ${fim})`
  return `Fora do ciclo (${formatarDataCivil(janela.inicio).slice(0, 5)} a ${fim})`
}

/** Itens que faltam, na ordem dos campos; lista vazia = pronto. */
export function listarPendencias(campos: readonly { rotulo: string; ok: boolean }[]): string[] {
  return campos.filter((campo) => !campo.ok).map((campo) => campo.rotulo)
}

/** Pendência do envio para conferência: arquivos e data de execução válida. */
export function pendenciasDoEnvio(envio: { arquivos: number; dataValida: boolean }): string[] {
  return listarPendencias([
    { rotulo: 'arquivos', ok: envio.arquivos > 0 },
    { rotulo: 'data de execução', ok: envio.dataValida },
  ])
}

/** "Pendente: arquivos, data de execução" ou "Pronto para enviar". */
export function textoDaPendencia(pendencias: readonly string[]): string {
  return pendencias.length > 0 ? `Pendente: ${pendencias.join(', ')}` : 'Pronto para enviar'
}

/** "em 25 dias", "hoje", "amanhã", "há 1 dia", "há 2237 dias". */
export function distanciaEmDias(data: DataCivil, hoje: DataCivil): string {
  const dias = diferencaEmDias(data, hoje)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias > 1) return `em ${String(dias)} dias`
  return dias === -1 ? 'há 1 dia' : `há ${String(-dias)} dias`
}

/**
 * Rótulo do ciclo (decisão de 05/11/2026): trimestral "4º tri 2026", semestral "2º sem 2026" e
 * anual "2026", pelo período do prazo oficial original; as demais recorrências, "Ciclo N".
 */
export function rotuloDoCiclo(
  recorrencia: string,
  prazoOriginal: DataCivil,
  ciclo: number,
): string {
  const [ano = 0, mes = 1] = prazoOriginal.split('-').map(Number)
  switch (recorrencia) {
    case 'trimestral':
      return `${String(Math.ceil(mes / 3))}º tri ${String(ano)}`
    case 'semestral':
      return `${String(Math.ceil(mes / 6))}º sem ${String(ano)}`
    case 'anual':
      return String(ano)
    default:
      return `Ciclo ${String(ciclo)}`
  }
}

/** Resumo de um envio para a linha "Ciclo anterior": "1 PDF + 4 fotos". */
export function resumoDoEnvio(arquivos: readonly { mime: string }[]): string {
  const pdfs = arquivos.filter((a) => a.mime === 'application/pdf').length
  const fotos = arquivos.filter((a) => a.mime.startsWith('image/')).length
  const outros = arquivos.length - pdfs - fotos
  const partes: string[] = []
  if (pdfs > 0) partes.push(pdfs === 1 ? '1 PDF' : `${String(pdfs)} PDFs`)
  if (fotos > 0) partes.push(fotos === 1 ? '1 foto' : `${String(fotos)} fotos`)
  if (outros > 0) partes.push(outros === 1 ? '1 arquivo' : `${String(outros)} arquivos`)
  return partes.join(' + ')
}

/** Separador de dia do feed: "quarta-feira, 5 de novembro". */
export function rotuloDoDia(data: DataCivil): string {
  const [, mes = 1, dia = 1] = data.split('-').map(Number)
  return `${nomeDoDiaDaSemana(data)}, ${String(dia)} de ${nomeDoMes(mes)}`
}

export type ParteDoComentario = { tipo: 'texto'; texto: string } | { tipo: 'mencao'; nome: string }

/**
 * Divide o comentário em texto e menções "@Nome" das pessoas mencionadas (os nomes vêm do
 * banco; "@" sem pessoa mencionada fica como texto). Nomes mais longos casam primeiro.
 */
export function partesDoComentario(texto: string, nomes: readonly string[]): ParteDoComentario[] {
  const ordenados = [...new Set(nomes)].filter(Boolean).sort((a, b) => b.length - a.length)
  const partes: ParteDoComentario[] = []
  let corrido = ''
  let i = 0
  while (i < texto.length) {
    if (texto[i] === '@') {
      const nome = ordenados.find((n) => texto.startsWith(n, i + 1))
      if (nome) {
        if (corrido) partes.push({ tipo: 'texto', texto: corrido })
        corrido = ''
        partes.push({ tipo: 'mencao', nome })
        i += nome.length + 1
        continue
      }
    }
    corrido += texto[i] ?? ''
    i += 1
  }
  if (corrido) partes.push({ tipo: 'texto', texto: corrido })
  return partes
}
