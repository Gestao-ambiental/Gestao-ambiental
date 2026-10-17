import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { listarCondicionantes, obterInstrumento } from '@/lib/api/licencas'

export function useInstrumento(id: string) {
  return useQuery({ queryKey: ['instrumento', id], queryFn: () => obterInstrumento(id) })
}

export function useCondicionantes(id: string) {
  return useQuery({ queryKey: ['condicionantes', id], queryFn: () => listarCondicionantes(id) })
}

/** "Rascunho salvo às HH:MM": marca o instante da última escrita e atualiza o rascunho. */
export function useSalvamento(id: string) {
  const queryClient = useQueryClient()
  const [salvoEm, setSalvoEm] = useState<Date | null>(null)
  const registrar = useCallback(async () => {
    setSalvoEm(new Date())
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['instrumento', id] }),
      queryClient.invalidateQueries({ queryKey: ['condicionantes', id] }),
    ])
  }, [queryClient, id])
  return { salvoEm, registrar }
}
