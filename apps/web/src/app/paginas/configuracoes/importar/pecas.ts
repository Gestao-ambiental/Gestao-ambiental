// Peças comuns das telas de Importar (ADR-0043): rótulos, download e as consultas a renovar
// depois de importar ou desfazer.
import {
  formatarDataCivil,
  type CampoDaImportacao,
  type DadosDaLinha,
  type EntidadeDaImportacao,
} from '@gestao-ambiental/domain'
import type { QueryClient } from '@tanstack/react-query'

import { CHAVE_SITUACAO_COMERCIAL } from '@/app/plano/situacao'
import type { MotivoMantida } from '@/lib/api/importacao'

export const ROTULO_DA_ENTIDADE: Record<EntidadeDaImportacao, string> = {
  empreendimento: 'Empreendimentos',
  licenca: 'Licenças',
}

export const ROTULO_DO_MOTIVO: Record<MotivoMantida, string> = {
  alterada_depois: 'Alterada depois da importação',
  tem_dependentes: 'Tem outros dados ligados',
  renovacao_em_andamento: 'Renovação em andamento',
}

/** Valor do campo como a tela mostra: a data com o texto que veio no arquivo. */
export function valorDoCampo(dados: DadosDaLinha, campo: CampoDaImportacao): string {
  if (campo === 'emitido_em' || campo === 'validade') {
    return dados[`${campo}_texto`] ?? formatarDataCivil(dados[campo])
  }
  return dados[campo] ?? ''
}

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
}

/** Baixa o arquivo pelo navegador (link temporário), sem enviar nada a lugar nenhum. */
export function baixarArquivo(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

/**
 * Depois de importar ou desfazer: empreendimentos, licenças, prazos (Visão e Calendário),
 * renovações e a situação comercial (limite do plano) mudam.
 */
export async function renovarDepoisDeImportar(queryClient: QueryClient): Promise<void> {
  const chaves = [
    'importacoes',
    'empreendimentos',
    'empreendimento',
    'unidades',
    'unidades-consultoria',
    'licencas',
    'instrumento',
    'prazos',
    'prazos-contadores',
    'prazos-totais',
    'calendario',
    'renovacoes',
    'plano-renovacao',
    'resumo-do-mes',
    CHAVE_SITUACAO_COMERCIAL,
  ]
  await Promise.all(chaves.map((chave) => queryClient.invalidateQueries({ queryKey: [chave] })))
}
