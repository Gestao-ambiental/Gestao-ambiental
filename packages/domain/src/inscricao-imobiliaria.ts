// Inscrição imobiliária de Joinville no campo de endereço da triagem (pedido do Eduardo,
// 20/11/2026: "tem que aceitar inscrição imobiliária também, pega pelo SIMGeo"). No SIMGeo ela é
// texto em 5 grupos de números, sem zeros à esquerda: "13-20-23-7-239", "13-11-0-1-837". A pessoa
// pode digitar com pontos, espaços, barras ou zeros à esquerda (como no carnê do IPTU), e às vezes
// com a unidade no fim ("…-239-000"). A mesma regra existe na Edge Function buscar-endereco
// (supabase/functions/_shared/busca-de-endereco.ts), que não importa o pacote de domínio.

/**
 * A inscrição no formato do SIMGeo ("13-20-23-7-239"), ou nulo quando o texto não parece uma
 * inscrição (tem letras, ou não tem 5 grupos de números). Um 6º grupo só de zeros (a unidade) cai.
 */
export function lerInscricaoImobiliaria(texto: string): string | null {
  const limpo = texto.trim()
  if (limpo === '' || /[^\d\s.\-/]/.test(limpo)) return null
  const grupos = limpo.split(/[\s.\-/]+/).filter((g) => g !== '')
  if (grupos.length === 6 && /^0+$/.test(grupos[5] ?? '')) grupos.pop()
  if (grupos.length !== 5) return null
  if (grupos.some((g) => g.length > 5)) return null
  return grupos.map((g) => String(Number(g))).join('-')
}
