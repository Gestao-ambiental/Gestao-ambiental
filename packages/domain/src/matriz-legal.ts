// Matriz legal e pendências de conformidade (ADR-0050, LEG-10): a partir dos requisitos e da
// situação calculada (situacaoDoRequisito), monta as linhas do relatório do empreendimento e o
// quadro Conformidade do Painel. Nada aqui é gravado.

import { formatarDataCivil, type DataCivil } from './data-civil'
import {
  ROTULO_DA_SITUACAO_DO_REQUISITO,
  situacaoDoRequisito,
  type RequisitoParaSituacao,
  type SituacaoDoRequisito,
} from './situacao-requisito'

export interface RequisitoDoEmpreendimento extends RequisitoParaSituacao {
  empreendimentoId: string
  empreendimentoNome: string
}

export interface PendenciasDoEmpreendimento {
  empreendimentoId: string
  empreendimentoNome: string
  acaoAtrasada: number
  rever: number
  naoConforme: number
  /** Sugeridos e não avaliados: falta alguém olhar. */
  semAvaliacao: number
}

/**
 * Pendências por empreendimento, só de quem tem alguma. Ordem: mais ações atrasadas, depois mais
 * "rever", depois mais não conformes, depois o nome.
 */
export function agruparPendencias(
  requisitos: readonly RequisitoDoEmpreendimento[],
  hoje: DataCivil,
  fuso?: string,
): PendenciasDoEmpreendimento[] {
  const porEmpreendimento = new Map<string, PendenciasDoEmpreendimento>()
  for (const requisito of requisitos) {
    const situacao = situacaoDoRequisito(requisito, hoje, fuso)
    let linha = porEmpreendimento.get(requisito.empreendimentoId)
    if (!linha) {
      linha = {
        empreendimentoId: requisito.empreendimentoId,
        empreendimentoNome: requisito.empreendimentoNome,
        acaoAtrasada: 0,
        rever: 0,
        naoConforme: 0,
        semAvaliacao: 0,
      }
      porEmpreendimento.set(requisito.empreendimentoId, linha)
    }
    if (situacao === 'acao_atrasada') linha.acaoAtrasada++
    else if (situacao === 'rever') linha.rever++
    else if (situacao === 'nao_conforme') linha.naoConforme++
    else if (situacao === 'sugerido' || situacao === 'nao_avaliado') linha.semAvaliacao++
  }
  return [...porEmpreendimento.values()]
    .filter((l) => l.acaoAtrasada + l.rever + l.naoConforme + l.semAvaliacao > 0)
    .sort(
      (a, b) =>
        b.acaoAtrasada - a.acaoAtrasada ||
        b.rever - a.rever ||
        b.naoConforme - a.naoConforme ||
        a.empreendimentoNome.localeCompare(b.empreendimentoNome, 'pt-BR'),
    )
}

export interface RequisitoDaMatriz extends RequisitoParaSituacao {
  normaTitulo: string
  dispositivo: string | null
  justificativa: string | null
  avaliadaPorNome: string | null
  acaoDescricao: string | null
  evidencias: number
  menorValidade: DataCivil | null
}

export interface LinhaDaMatriz {
  norma: string
  situacao: SituacaoDoRequisito
  rotuloDaSituacao: string
  avaliacao: string
  acao: string
  evidencia: string
}

const ORDEM: Readonly<Record<SituacaoDoRequisito, number>> = {
  acao_atrasada: 0,
  rever: 1,
  nao_conforme: 2,
  nao_avaliado: 3,
  sugerido: 4,
  conforme: 5,
  nao_se_aplica: 6,
}

/** Linhas da matriz legal do empreendimento, com o que pede atenção primeiro. */
export function linhasDaMatrizLegal(
  requisitos: readonly RequisitoDaMatriz[],
  hoje: DataCivil,
  fuso?: string,
): LinhaDaMatriz[] {
  return requisitos
    .map((r) => {
      const situacao = situacaoDoRequisito(r, hoje, fuso)
      return {
        norma: r.dispositivo ? `${r.normaTitulo} · ${r.dispositivo}` : r.normaTitulo,
        situacao,
        rotuloDaSituacao: ROTULO_DA_SITUACAO_DO_REQUISITO[situacao],
        avaliacao:
          situacao === 'nao_se_aplica'
            ? (r.justificativa ?? '')
            : r.avaliadaEm
              ? [formatarDataCivil(r.avaliadaEm), r.avaliadaPorNome].filter(Boolean).join(' · ')
              : '',
        acao:
          r.acaoDescricao && r.acaoPrazo
            ? `${r.acaoDescricao} · até ${formatarDataCivil(r.acaoPrazo)}`
            : '',
        evidencia:
          r.evidencias === 0
            ? ''
            : `${String(r.evidencias)}${r.menorValidade ? ` · válida até ${formatarDataCivil(r.menorValidade)}` : ''}`,
      }
    })
    .sort(
      (a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.norma.localeCompare(b.norma, 'pt-BR'),
    )
}
