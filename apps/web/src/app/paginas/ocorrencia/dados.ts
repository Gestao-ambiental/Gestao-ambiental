// Dados da tela da ocorrência (página e Atividade no celular): uma chave por recurso, todas abaixo de
// ['ocorrencia', id] para recarregar tudo de uma vez depois de qualquer escrita.

import { situacaoExibida, type SituacaoExibida } from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import {
  listarAtividade,
  listarEvidencias,
  obterOcorrencia,
  urlsDosArquivos,
  type Evidencia,
} from '@/lib/api/ocorrencias'
import { listarMembrosAtivos } from '@/lib/api/perfil'

export function ehImagem(mime: string): boolean {
  return mime.startsWith('image/')
}

export function useDadosDaOcorrencia(id: string) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const ocorrencia = useQuery({ queryKey: ['ocorrencia', id], queryFn: () => obterOcorrencia(id) })
  const existe = Boolean(ocorrencia.data)
  const anteriorId = ocorrencia.data?.ocorrenciaAnteriorId ?? null

  const evidencias = useQuery({
    queryKey: ['ocorrencia', id, 'evidencias'],
    queryFn: () => listarEvidencias(id),
    enabled: existe,
  })
  const atividade = useQuery({
    queryKey: ['ocorrencia', id, 'atividade'],
    queryFn: () => listarAtividade(id),
    enabled: existe,
  })
  const membros = useQuery({
    queryKey: ['membros-ativos', atual.consultoriaId],
    queryFn: () => listarMembrosAtivos(atual.consultoriaId),
    enabled: existe,
  })
  // Linha "Ciclo anterior": o envio aprovado da ocorrência do ciclo anterior.
  const anteriores = useQuery({
    queryKey: ['ocorrencia', anteriorId, 'evidencias'],
    queryFn: () => listarEvidencias(anteriorId ?? ''),
    enabled: anteriorId !== null,
  })

  // Miniaturas e carrossel: URLs assinadas das imagens de todos os envios, numa chamada só.
  const caminhos = (evidencias.data ?? [])
    .flatMap((e) => e.arquivos)
    .filter((a) => ehImagem(a.mime))
    .map((a) => a.caminho)
  const unicos = [...new Set(caminhos)].sort()
  const urls = useQuery({
    queryKey: ['arquivos-assinados', unicos],
    queryFn: () => urlsDosArquivos(unicos),
    enabled: unicos.length > 0,
    staleTime: 30 * 60 * 1000,
  })

  const lista = evidencias.data ?? []
  const ultima: Evidencia | undefined = lista[0]
  const exibida: SituacaoExibida | null = ocorrencia.data
    ? situacaoExibida(ocorrencia.data.situacao, ultima?.situacao ?? null)
    : null

  async function recarregar() {
    // A Visão e o calendário mostram situação, prazo e meta: também ficam velhos.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ocorrencia', id] }),
      queryClient.invalidateQueries({ queryKey: ['prazos'] }),
    ])
  }

  return {
    ocorrencia,
    evidencias,
    atividade,
    membros,
    anteriores,
    urls: urls.data ?? new Map<string, string>(),
    ultima,
    exibida,
    recarregar,
  }
}
