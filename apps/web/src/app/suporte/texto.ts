import type { AcessoDeSuporte } from '@/lib/api/suporte'
import { formatarInstanteComHora } from '@/lib/datas'

/** Estado do acesso valendo, em uma linha: "Autorizado até …", "Acesso de emergência até …". */
export function textoDoAcessoValendo(valendo: AcessoDeSuporte | null, fuso: string): string {
  if (!valendo) return 'Sem autorização'
  const ate = formatarInstanteComHora(valendo.fimPrevisto, fuso)
  return valendo.modo === 'emergencia' ? `Acesso de emergência até ${ate}` : `Autorizado até ${ate}`
}
