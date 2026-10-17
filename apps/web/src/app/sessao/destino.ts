/** Destino interno seguro para depois do login (nunca outro site). */
export function destinoSeguro(para: string | null | undefined, padrao = '/'): string {
  return para?.startsWith('/') && !para.startsWith('//') && !para.startsWith('/\\') ? para : padrao
}
