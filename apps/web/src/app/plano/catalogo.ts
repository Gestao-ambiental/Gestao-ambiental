// Catálogo comercial (planos e configuração) lido do banco, com cache compartilhado entre as telas
// (ADR-0026, "Parâmetros pela central"). Preço, nome e limite mostrados vêm daqui.

import { queryOptions, useQuery } from '@tanstack/react-query'

import { obterCatalogoComercial } from '@/lib/api/parametros'

export const CHAVE_CATALOGO_COMERCIAL = 'catalogo-comercial'

export const opcoesDoCatalogo = queryOptions({
  queryKey: [CHAVE_CATALOGO_COMERCIAL],
  queryFn: obterCatalogoComercial,
  staleTime: 5 * 60_000,
})

export function useCatalogoComercial() {
  return useQuery(opcoesDoCatalogo)
}
