// Rascunho do Campo nas telas (ADR-0060): liga a fila do aparelho à sessão e ao cache de consultas,
// e diz, por vistoria e por item, o que está no servidor e o que falta enviar.

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

import type { RegistroDoAparelho } from '@/lib/campo/armazem'
import { contagemDaVistoria, filaDeCampo, type Pendencia } from '@/lib/campo/fila'
import type { ItemDaVistoriaGravado } from '@/lib/api/vistorias'

import { chaveDaVistoria } from './consultas'

export function useFilaDeCampo() {
  return useSyncExternalStore(filaDeCampo.assinar, filaDeCampo.obter)
}

/**
 * Na sessão: carrega o rascunho da conta que entrou (apagando o de outras) e, a cada registro que o
 * servidor confirma, atualiza o que a tela mostra.
 */
export function useFilaDeCampoNaSessao(usuarioId: string | null) {
  const queryClient = useQueryClient()
  useEffect(() => {
    void filaDeCampo.definirUsuario(usuarioId)
  }, [usuarioId])
  useEffect(
    () =>
      filaDeCampo.aoConfirmar((registro: RegistroDoAparelho) => {
        const chave = chaveDaVistoria(registro.vistoriaId)
        if (registro.tipo === 'item') {
          queryClient.setQueryData<ItemDaVistoriaGravado[]>([...chave, 'itens'], (itens) =>
            itens?.map((i) =>
              i.id === registro.itemId
                ? { ...i, resultado: registro.resultado, comentario: registro.comentario }
                : i,
            ),
          )
        } else if (registro.tipo === 'foto') {
          void queryClient.invalidateQueries({ queryKey: [...chave, 'fotos'] })
        } else {
          void queryClient.invalidateQueries({ queryKey: chave, exact: true })
        }
        void queryClient.invalidateQueries({ queryKey: ['vistorias'] })
      }),
    [queryClient],
  )
}

export type SituacaoNoAparelho = 'servidor' | 'no_aparelho' | 'enviando' | 'recusado'

/** O pior estado entre os registros: recusado > enviando > no aparelho. */
export function situacaoDasPendencias(pendencias: readonly Pendencia[]): SituacaoNoAparelho | null {
  if (pendencias.length === 0) return null
  if (pendencias.some((p) => p.estado === 'recusado')) return 'recusado'
  if (pendencias.some((p) => p.estado === 'enviando')) return 'enviando'
  return 'no_aparelho'
}

export function useRascunhoDaVistoria(vistoriaId: string) {
  const fila = useFilaDeCampo()
  return useMemo(() => {
    const pendencias = fila.pendencias.filter((p) => p.registro.vistoriaId === vistoriaId)
    // Uma lista por item, a mesma enquanto a fila não muda (as prévias das fotos dependem dela).
    const porItem = new Map<string, Pendencia[]>()
    const observacao: Pendencia[] = []
    for (const p of pendencias) {
      if (p.registro.tipo === 'observacao') observacao.push(p)
      else porItem.set(p.registro.itemId, [...(porItem.get(p.registro.itemId) ?? []), p])
    }
    const nenhuma: Pendencia[] = []
    return {
      carregado: fila.carregada,
      semConexao: fila.semConexao,
      pendencias,
      registros: pendencias.map((p) => p.registro),
      contagem: contagemDaVistoria(fila.pendencias, vistoriaId),
      doItem: (itemId: string) => porItem.get(itemId) ?? nenhuma,
      daObservacao: () => observacao,
    }
  }, [fila, vistoriaId])
}

/** Foto ainda no aparelho, com a prévia feita dos próprios bytes. */
export interface FotoDoAparelho {
  id: string
  legenda: string | null
  url: string | null
}

export function useFotosDoAparelho(pendencias: readonly Pendencia[]): FotoDoAparelho[] {
  const fotos = useMemo(
    () =>
      pendencias.flatMap((p) => {
        if (p.registro.tipo !== 'foto') return []
        const { dados } = p.registro
        const url =
          typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(new Blob([dados.bytes], { type: dados.mime }))
            : null
        return [{ id: p.registro.fotoId, legenda: dados.legenda, url }]
      }),
    [pendencias],
  )
  useEffect(
    () => () => {
      for (const f of fotos) if (f.url) URL.revokeObjectURL(f.url)
    },
    [fotos],
  )
  return fotos
}
