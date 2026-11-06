// Apoio de apresentação da tela da ocorrência (sem componentes, para o fast refresh): rótulos,
// formatação e escolhas que mais de uma seção usa.

import { janelaDoCiclo, type SituacaoExibida } from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { Evidencia, Ocorrencia } from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'

export const STATUS: Record<SituacaoExibida, { texto: string; tom: TomSelo }> = {
  a_fazer: { texto: 'A fazer', tom: 'padrao' },
  em_conferencia: { texto: 'Em conferência', tom: 'andamento' },
  devolvida: { texto: 'Devolvida', tom: 'atencao' },
  aprovada: { texto: 'Aprovada', tom: 'sucesso' },
  concluida: { texto: 'Concluída', tom: 'sucesso' },
}

/** "1,8 MB", "320 KB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  }
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
}

/** "05/11 10:42" no fuso da consultoria. */
export function diaEHora(instante: string, fuso: string): string {
  const completo = formatarInstanteComHora(instante, fuso)
  return `${completo.slice(0, 5)} ${completo.slice(-5)}`
}

/** Janela do ciclo para o aviso "Fora do ciclo". */
export function janelaDaOcorrencia(ocorrencia: Ocorrencia) {
  return janelaDoCiclo(
    ocorrencia.prazoOriginal,
    ocorrencia.prazoCicloAnterior,
    ocorrencia.dataReferencia,
  )
}

/** Envio devolvido ou cancelado: os arquivos e a data voltam para o formulário. */
export function envioParaRetomar(ultima: Evidencia | undefined): Evidencia | undefined {
  return ultima && (ultima.situacao === 'devolvida' || ultima.situacao === 'cancelada')
    ? ultima
    : undefined
}

/** Quem pode conferir: o conferente designado ou, sem designação, a Gestão. */
export function podeConferirPorPapel(
  ocorrencia: Ocorrencia,
  membroId: string,
  ehGestao: boolean,
): boolean {
  return ocorrencia.conferenteId ? ocorrencia.conferenteId === membroId : ehGestao
}
