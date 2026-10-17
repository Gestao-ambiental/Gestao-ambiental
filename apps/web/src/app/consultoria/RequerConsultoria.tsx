import { consultoriaInicial } from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'

import { TelaDeEspera } from '@/app/sessao/RequerSessao'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { listarMeusVinculos } from '@/lib/api/acesso'

import {
  CHAVE_MEUS_VINCULOS,
  ContextoConsultoria,
  gravarConsultoriaPreferida,
  lerConsultoriaPreferida,
} from './contexto-consultoria'

/** Avisos levados para /entrar ou /escolher-consultoria quando o acesso acaba. */
export interface AvisoDeAcesso {
  aviso: string
}

/**
 * Rotas do app: exigem um vínculo ativo escolhido (ACC-04). Um vínculo só: entra direto. Vários:
 * a pessoa escolhe. Os vínculos são relidos a cada minuto e ao voltar para a aba; se a consultoria
 * atual foi encerrada pela gestão, a pessoa sai dela (o banco já recusa tudo desde o desligamento).
 */
export function RequerConsultoria() {
  const { sessao, sair } = useSessao()
  const usuarioId = sessao?.user.id ?? ''
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [preferida, setPreferida] = useState(() => lerConsultoriaPreferida(usuarioId))

  const consulta = useQuery({
    queryKey: [CHAVE_MEUS_VINCULOS, usuarioId],
    queryFn: listarMeusVinculos,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const vinculos = consulta.data
  const ativos = useMemo(() => vinculos?.filter((v) => v.situacao === 'ativo') ?? [], [vinculos])
  const atualId = vinculos ? consultoriaInicial(ativos, preferida) : null
  const atual = ativos.find((v) => v.consultoriaId === atualId)
  const encerrada =
    vinculos && preferida && !atual
      ? vinculos.find((v) => v.consultoriaId === preferida && v.situacao === 'desligado')
      : undefined
  const perdeuTudo = Boolean(encerrada) && ativos.length === 0

  // Seleção automática (um vínculo só) vira a preferida, para detectar depois se ela foi encerrada.
  if (atual && atual.consultoriaId !== preferida) setPreferida(atual.consultoriaId)

  useEffect(() => {
    if (atual) gravarConsultoriaPreferida(usuarioId, atual.consultoriaId)
  }, [atual, usuarioId])

  // Sem nenhum vínculo ativo: a sessão não serve para nada; sai e o login mostra o motivo.
  useEffect(() => {
    if (!perdeuTudo || !encerrada) return
    gravarConsultoriaPreferida(usuarioId, null)
    void sair(`Seu acesso à ${encerrada.consultoriaNome} foi encerrado.`)
  }, [perdeuTudo, encerrada, usuarioId, sair])

  const trocar = useCallback(
    (consultoriaId: string) => {
      gravarConsultoriaPreferida(usuarioId, consultoriaId)
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_MEUS_VINCULOS })
      setPreferida(consultoriaId)
      void navegar('/')
    },
    [usuarioId, queryClient, navegar],
  )

  const valor = useMemo(
    () => (atual && vinculos ? { atual, vinculos, trocar } : null),
    [atual, vinculos, trocar],
  )

  if (consulta.isPending) return <TelaDeEspera />
  if (consulta.isError) {
    return (
      <TelaDeEspera
        erro={{
          titulo: 'Não foi possível carregar suas consultorias',
          descricao: 'Verifique a conexão e tente de novo.',
        }}
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  if (!valor) {
    // Dado em cache pode estar velho (ex.: logo após criar consultoria ou aceitar convite).
    if (perdeuTudo || consulta.isFetching) return <TelaDeEspera />
    const estado: AvisoDeAcesso | undefined = encerrada
      ? { aviso: `Seu acesso à ${encerrada.consultoriaNome} foi encerrado.` }
      : undefined
    return <Navigate to="/escolher-consultoria" replace state={estado} />
  }

  return (
    <ContextoConsultoria.Provider value={valor}>
      {/* key: trocar de consultoria remonta as telas, sem sobra de estado da anterior */}
      <Outlet key={valor.atual.consultoriaId} />
    </ContextoConsultoria.Provider>
  )
}
