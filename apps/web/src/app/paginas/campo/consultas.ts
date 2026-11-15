// Consultas compartilhadas pelas telas de Campo (ADR-0033). Chaves sob ['vistoria', id] para
// invalidar tudo de uma vistoria de uma vez; ['vistorias'] para as listas.

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import {
  listarFotosDaVistoria,
  listarItensDaVistoria,
  obterVistoria,
  urlsDasFotos,
  type FotoDaVistoria,
} from '@/lib/api/vistorias'

export const chaveDaVistoria = (id: string) => ['vistoria', id] as const

export function useVistoria(id: string) {
  return useQuery({ queryKey: chaveDaVistoria(id), queryFn: () => obterVistoria(id) })
}

export function useItensDaVistoria(id: string, habilitado: boolean) {
  return useQuery({
    queryKey: [...chaveDaVistoria(id), 'itens'],
    queryFn: () => listarItensDaVistoria(id),
    enabled: habilitado,
  })
}

export function useFotosDaVistoria(id: string, habilitado: boolean) {
  return useQuery({
    queryKey: [...chaveDaVistoria(id), 'fotos'],
    queryFn: () => listarFotosDaVistoria(id),
    enabled: habilitado,
  })
}

/** URLs assinadas das miniaturas; falha aqui não impede o checklist (a miniatura só não aparece). */
export function useUrlsDasFotos(id: string, fotos: readonly FotoDaVistoria[]) {
  const caminhos = fotos.map((f) => f.caminho)
  return useQuery({
    queryKey: [...chaveDaVistoria(id), 'urls', caminhos.join('|')],
    queryFn: () => urlsDasFotos(caminhos),
    enabled: caminhos.length > 0,
    staleTime: 4 * 60 * 1000,
  })
}

export function recarregarVistoria(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: chaveDaVistoria(id) }),
    queryClient.invalidateQueries({ queryKey: ['vistorias'] }),
  ])
}

export function useRecarregarVistoria(id: string) {
  const queryClient = useQueryClient()
  return () => recarregarVistoria(queryClient, id)
}
