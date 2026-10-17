import type { PapelMembro } from '@gestao-ambiental/domain'

/** Nome do papel na interface (o banco guarda gestao | equipe). */
export const NOMES_PAPEL: Record<PapelMembro, string> = { gestao: 'Gestão', equipe: 'Equipe' }

/** O que cada papel faz (Protótipo 07, modal "Convidar pessoa"). */
export const DESCRICAO_PAPEL: Record<PapelMembro, string> = {
  equipe: 'Executa as próprias entregas, envia evidência e confere quando designada.',
  gestao: 'Cadastra licenças, conclui entregas e administra a equipe.',
}
