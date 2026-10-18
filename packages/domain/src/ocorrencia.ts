// Execução da ocorrência (DEM-01 a DEM-04, DEM-09). Regras de apresentação calculadas a partir do
// que está gravado; o banco aplica as regras de escrita (quem confere, quem conclui).

import { adicionarDias, type DataCivil } from './data-civil'

export type SituacaoGravadaDaOcorrencia = 'aberta' | 'em_conferencia' | 'concluida'
export type SituacaoDaEvidencia = 'em_conferencia' | 'aprovada' | 'devolvida'

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
