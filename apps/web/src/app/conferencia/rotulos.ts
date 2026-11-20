// Rótulos e situação da conferência por IA (ADR-0037, ADR-0040), compartilhados pelas telas.
import type { CategoriaDoApontamento } from '@/lib/api/conferencia-ia'

export const CATEGORIAS: Record<CategoriaDoApontamento, string> = {
  empreendimento: 'Empreendimento',
  licenca: 'Licença',
  condicionante: 'Condicionante',
  datas: 'Datas',
  consistencia: 'Consistência',
  escrita: 'Escrita',
}

export const MOTIVOS: Record<string, string> = {
  ia_fora_do_plano: 'o plano não inclui IA',
  tipo_sem_texto: 'imagem não tem texto para conferir',
  arquivo_sem_texto: 'o texto está vazio ou ilegível',
  arquivo_grande_demais: 'arquivo acima de 15 MB',
  texto_longo_demais: 'texto longo demais para a IA',
  limite_atingido: 'limite de uso da IA nas últimas 24 horas',
}

/** Motivos em que tentar de novo com o mesmo conteúdo não muda nada. */
export const SEM_NOVA_TENTATIVA = new Set([
  'tipo_sem_texto',
  'arquivo_sem_texto',
  'arquivo_grande_demais',
  'texto_longo_demais',
])

/** "Conferindo", "Sem apontamentos", "N apontamentos" ou "Não conferido pela IA: motivo". */
export function situacaoDaConferencia(
  conferindo: boolean,
  conferencia: { situacao: string; motivo: string | null } | null,
  quantos: number,
): string {
  if (conferindo) return 'Conferindo'
  if (!conferencia) return 'Não conferido'
  if (conferencia.situacao === 'falhou')
    return `Não conferido pela IA: ${MOTIVOS[conferencia.motivo ?? ''] ?? 'IA indisponível agora'}`
  if (quantos === 0) return 'Sem apontamentos'
  return quantos === 1 ? '1 apontamento' : `${String(quantos)} apontamentos`
}
