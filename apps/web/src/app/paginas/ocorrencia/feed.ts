// Montagem do feed da Atividade: eventos gravados → itens da tela (sem componentes).

import {
  formatarDataCivil,
  hojeNoFuso,
  rotuloDoCiclo,
  type DataCivil,
} from '@gestao-ambiental/domain'

import type { EventoDaAtividade, Evidencia, Ocorrencia } from '@/lib/api/ocorrencias'

interface Base {
  chave: string
  instante: string
  /** Nulo = Sistema. */
  atorId: string | null
  atorNome: string
}

export type ItemDoFeed =
  | (Base & { tipo: 'evento'; acao: string })
  | (Base & { tipo: 'comentario'; texto: string; mencoes: string[]; selo: string | null })
  | (Base & { tipo: 'envio'; evidencia: Evidencia })

export function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${String(n)} ${varios}`
}

function textoDe(dados: Record<string, unknown> | null, chave: string): string | null {
  const valor = dados?.[chave]
  return typeof valor === 'string' ? valor : null
}

function listaDe(dados: Record<string, unknown> | null, chave: string): string[] {
  const valor = dados?.[chave]
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Converte o histórico gravado nos itens do feed, em ordem cronológica. O primeiro item é a criação
 * pelo Sistema: "importou ... do histórico" quando a ocorrência foi criada depois do prazo original
 * (veio de licença antiga), senão "criou a ocorrência do {ciclo}".
 */
export function montarFeed(
  ocorrencia: Ocorrencia,
  eventos: readonly EventoDaAtividade[],
  evidencias: readonly Evidencia[],
  fuso: string,
): ItemDoFeed[] {
  const criadaEm = hojeNoFuso(new Date(ocorrencia.criadoEm), fuso)
  const ciclo = rotuloDoCiclo(ocorrencia.recorrencia, ocorrencia.prazoOriginal, ocorrencia.ciclo)
  const itens: ItemDoFeed[] = [
    {
      tipo: 'evento',
      chave: 'criacao',
      instante: ocorrencia.criadoEm,
      atorId: null,
      atorNome: 'Sistema',
      acao:
        criadaEm > ocorrencia.prazoOriginal
          ? 'importou a ocorrência do histórico da licença'
          : `criou a ocorrência do ${ciclo}`,
    },
  ]
  const ultima = evidencias[0]
  let status = 'A fazer'

  for (const e of eventos) {
    const base: Base = {
      chave: String(e.id),
      instante: e.instante,
      atorId: e.atorId,
      atorNome: e.atorNome ?? 'Sistema',
    }
    const evento = (acao: string, sufixo = '') => {
      itens.push({ ...base, chave: base.chave + sufixo, tipo: 'evento', acao })
    }
    const mudarStatus = (para: string) => {
      evento(`alterou o status de ${status} para ${para}`, '-status')
      status = para
    }

    switch (e.tipo) {
      case 'comentario':
        itens.push({
          ...base,
          tipo: 'comentario',
          texto: e.detalhe ?? '',
          mencoes: listaDe(e.dados, 'mencoes'),
          selo: null,
        })
        break
      case 'evidencia_enviada': {
        const id = textoDe(e.dados, 'evidencia_id')
        const evidencia =
          evidencias.find((ev) => ev.id === id) ??
          evidencias.find((ev) => ev.numero === e.evidenciaNumero)
        const total =
          typeof e.dados?.arquivos === 'number'
            ? e.dados.arquivos
            : (evidencia?.arquivos.length ?? 1)
        const vigente =
          evidencia !== undefined &&
          evidencia.id === ultima?.id &&
          (evidencia.situacao === 'em_conferencia' || evidencia.situacao === 'aprovada')
        if (vigente) itens.push({ ...base, tipo: 'envio', evidencia })
        else evento(`enviou ${plural(total, 'arquivo', 'arquivos')} para conferência`)
        mudarStatus('Em conferência')
        break
      }
      case 'evidencia_cancelada':
        evento('cancelou o envio')
        mudarStatus('A fazer')
        break
      case 'evidencia_devolvida':
        mudarStatus('Devolvida')
        itens.push({
          ...base,
          chave: `${base.chave}-motivo`,
          tipo: 'comentario',
          texto: e.detalhe ?? '',
          mencoes: [],
          selo: 'Devolução',
        })
        break
      case 'evidencia_aprovada':
        mudarStatus('Aprovada')
        break
      case 'concluida':
        mudarStatus('Concluída')
        break
      case 'concluida_sem_evidencia':
        mudarStatus('Concluída')
        if (e.detalhe) evento(`concluiu sem evidência: ${e.detalhe}`, '-motivo')
        break
      case 'reaberta':
        evento(e.detalhe ? `reabriu a ocorrência: ${e.detalhe}` : 'reabriu a ocorrência')
        status = 'A fazer'
        break
      case 'prazo_prorrogado': {
        const novo = textoDe(e.dados, 'novo_prazo')
        const prazo = novo ? ` para ${formatarDataCivil(novo as DataCivil)}` : ''
        const oficio = e.detalhe ? ` (ofício ${e.detalhe})` : ''
        evento(`registrou a prorrogação do prazo oficial${prazo}${oficio}`)
        break
      }
      case 'encerramento_solicitado':
        evento(e.detalhe ? `solicitou o encerramento: ${e.detalhe}` : 'solicitou o encerramento')
        break
      case 'meta_definida': {
        const meta = textoDe(e.dados, 'meta')
        evento(
          meta
            ? `definiu a meta interna para ${formatarDataCivil(meta as DataCivil)}`
            : 'definiu a meta interna',
        )
        break
      }
      case 'responsavel_definido':
        evento(e.detalhe ? `definiu ${e.detalhe} como responsável` : 'removeu o responsável')
        break
      case 'conferente_designado':
        evento(
          e.detalhe ? `definiu ${e.detalhe} como conferente` : 'definiu a Gestão como conferente',
        )
        break
      case 'etapa_criada':
        evento(`criou a etapa ${e.detalhe ?? ''}`.trim())
        break
      case 'etapa_concluida':
        evento(`concluiu a etapa ${e.detalhe ?? ''}`.trim())
        break
      default:
        break
    }
  }
  return itens
}
