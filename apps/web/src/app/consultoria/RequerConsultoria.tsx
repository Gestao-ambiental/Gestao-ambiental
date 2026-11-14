import { consultoriaInicial, suporteValendo } from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'

import { useSouOperador } from '@/app/paginas/central/operador'
import { TelaDeEspera } from '@/app/sessao/RequerSessao'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { listarMeusVinculos, type Vinculo } from '@/lib/api/acesso'
import { entrarComoSuporte, sairDoAcessoDeSuporte } from '@/lib/api/suporte'
import { definirModoSuporte, ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { FaixaDeSuporte } from './FaixaDeSuporte'
import { RequerCadastroCompleto } from './RequerCadastroCompleto'
import { useRegistroDeUso } from './registro-de-uso'
import { useTempoDeAcompanhamento } from './tempo-ativo'
import {
  CHAVE_MEUS_ACESSOS_DE_SUPORTE,
  CHAVE_MEUS_VINCULOS,
  ContextoConsultoria,
  gravarConsultoriaPreferida,
  gravarSuporteEscolhido,
  lerConsultoriaPreferida,
  lerSuporteEscolhido,
  type EstadoConsultoria,
} from './contexto-consultoria'
import { limparDadosDaConsultoria, useMeusAcessosDeSuporte } from './modo-suporte'

/** Avisos levados para /entrar ou /escolher-consultoria quando o acesso acaba. */
export interface AvisoDeAcesso {
  aviso: string
}

/**
 * Rotas do app: exigem um vínculo ativo escolhido (ACC-04) ou, para o operador da plataforma, um
 * acesso de suporte valendo escolhido na central (ADR-0025).
 */
export function RequerConsultoria() {
  const { sessao } = useSessao()
  const usuarioId = sessao?.user.id ?? ''
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [suporteId, setSuporteId] = useState(() => lerSuporteEscolhido(usuarioId))

  // Volta da consultoria do suporte para um vínculo (troca pelo menu da conta).
  const deixarSuporte = useCallback(() => {
    gravarSuporteEscolhido(usuarioId, null)
    setSuporteId(null)
  }, [usuarioId])

  // Do vínculo para o suporte (menu da conta): o banco registra uma entrada nova.
  const abrirSuporte = useCallback(
    async (consultoriaId: string) => {
      await entrarComoSuporte(consultoriaId)
      gravarSuporteEscolhido(usuarioId, consultoriaId)
      limparDadosDaConsultoria(queryClient)
      await queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_ACESSOS_DE_SUPORTE] })
      setSuporteId(consultoriaId)
      void navegar('/')
    },
    [usuarioId, queryClient, navegar],
  )

  if (suporteId) {
    return (
      <ConsultoriaComoSuporte
        key={suporteId}
        consultoriaId={suporteId}
        aoDeixar={deixarSuporte}
        abrirSuporte={abrirSuporte}
      />
    )
  }
  return <ConsultoriaDoVinculo abrirSuporte={abrirSuporte} />
}

/**
 * Um vínculo só: entra direto. Vários: a pessoa escolhe. Os vínculos são relidos a cada minuto e
 * ao voltar para a aba; se a consultoria atual foi encerrada pela gestão, a pessoa sai dela (o banco
 * já recusa tudo desde o desligamento).
 */
function ConsultoriaDoVinculo({
  abrirSuporte,
}: {
  abrirSuporte: (consultoriaId: string) => Promise<void>
}) {
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
      limparDadosDaConsultoria(queryClient)
      setPreferida(consultoriaId)
      void navegar('/')
    },
    [usuarioId, queryClient, navegar],
  )

  const valor = useMemo<EstadoConsultoria | null>(
    () => (atual && vinculos ? { atual, vinculos, trocar, suporte: null, abrirSuporte } : null),
    [atual, vinculos, trocar, abrirSuporte],
  )

  // Sinal de uso diário para a central (ADR-0024): só com consultoria escolhida.
  useRegistroDeUso(valor ? valor.atual.consultoriaId : null)
  // Tempo ativo na área de licenças e prazos (ADR-0027): só com vínculo, nunca no suporte.
  useTempoDeAcompanhamento(valor ? valor.atual.consultoriaId : null)

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
      <RequerCadastroCompleto key={valor.atual.consultoriaId}>
        <Outlet />
      </RequerCadastroCompleto>
    </ContextoConsultoria.Provider>
  )
}

/** Aviso mostrado na central quando o modo suporte acaba. */
export interface AvisoDaCentral {
  aviso: string
}

/**
 * Operador navegando a consultoria como suporte (ADR-0025). Só vale com acesso valendo no banco
 * (meus_acessos_de_suporte): quando a Gestão encerra, o prazo acaba ou o operador sai, volta para a
 * consultoria na central. O suporte não tem vínculo: não completa cadastro nem registra uso, e
 * aparece como Gestão só para a apresentação (lê o que a Gestão lê; o banco barra toda escrita).
 */
function ConsultoriaComoSuporte({
  consultoriaId,
  aoDeixar,
  abrirSuporte,
}: {
  consultoriaId: string
  aoDeixar: () => void
  abrirSuporte: (consultoriaId: string) => Promise<void>
}) {
  const { sessao } = useSessao()
  const usuarioId = sessao?.user.id ?? ''
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const operador = useSouOperador()
  const acessos = useMeusAcessosDeSuporte()
  const vinculos = useQuery({
    queryKey: [CHAVE_MEUS_VINCULOS, usuarioId],
    queryFn: listarMeusVinculos,
  })
  const [agora, setAgora] = useState(() => Date.now())

  const acesso = acessos.data?.find((a) => a.consultoriaId === consultoriaId)
  const fimPrevisto = acesso?.fimPrevisto

  // Escritas recusadas aparecem como "Acesso de suporte é somente leitura" enquanto durar.
  useEffect(() => {
    definirModoSuporte(true)
    return () => {
      definirModoSuporte(false)
    }
  }, [])

  // No fim previsto, relê: o banco já não deixa ler nada desde esse instante.
  useEffect(() => {
    if (!fimPrevisto) return
    const espera = Math.min(Math.max(new Date(fimPrevisto).getTime() - Date.now(), 0), 2 ** 31 - 1)
    const relogio = window.setTimeout(() => {
      setAgora(Date.now())
      void queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_ACESSOS_DE_SUPORTE] })
    }, espera)
    return () => {
      window.clearTimeout(relogio)
    }
  }, [fimPrevisto, queryClient])

  const voltarParaCentral = useCallback(
    (aviso: string) => {
      gravarSuporteEscolhido(usuarioId, null)
      limparDadosDaConsultoria(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['central'] })
      const estado: AvisoDaCentral = { aviso }
      void navegar(`/admin/consultorias/${consultoriaId}`, { replace: true, state: estado })
    },
    [usuarioId, queryClient, navegar, consultoriaId],
  )

  const recusado =
    acessos.isError &&
    !acessos.data &&
    (ehSemPermissao(acessos.error) || ehDoisFatoresNecessarios(acessos.error))
  const terminou =
    (operador.isSuccess && !operador.data) ||
    recusado ||
    (acessos.isSuccess && !acesso) ||
    (fimPrevisto !== undefined && !suporteValendo(fimPrevisto, new Date(agora)))

  useEffect(() => {
    if (terminou) voltarParaCentral('O acesso de suporte terminou.')
  }, [terminou, voltarParaCentral])

  const sair = useCallback(async () => {
    await sairDoAcessoDeSuporte(consultoriaId)
    voltarParaCentral('Você saiu do acesso de suporte.')
  }, [consultoriaId, voltarParaCentral])

  const trocar = useCallback(
    (outra: string) => {
      if (outra === consultoriaId) return
      // Trocar para uma consultoria própria deixa o modo suporte (o acesso continua valendo até
      // o fim ou até alguém encerrar).
      gravarConsultoriaPreferida(usuarioId, outra)
      limparDadosDaConsultoria(queryClient)
      aoDeixar()
      void navegar('/')
    },
    [consultoriaId, usuarioId, queryClient, aoDeixar, navegar],
  )

  const valor = useMemo<EstadoConsultoria | null>(() => {
    if (!acesso) return null
    const atual: Vinculo = {
      membroId: '',
      consultoriaId: acesso.consultoriaId,
      consultoriaNome: acesso.consultoriaNome,
      fuso: acesso.fuso,
      papel: 'gestao',
      situacao: 'ativo',
      desligadoEm: null,
    }
    return {
      atual,
      vinculos: vinculos.data ?? [],
      trocar,
      abrirSuporte,
      suporte: {
        acessoId: acesso.acessoId,
        modo: acesso.modo,
        fimPrevisto: acesso.fimPrevisto,
        sair,
      },
    }
  }, [acesso, vinculos.data, trocar, abrirSuporte, sair])

  if (acessos.isError && !acessos.data && !recusado) {
    return (
      <TelaDeEspera
        erro={{
          titulo: 'Não foi possível abrir o acesso de suporte',
          descricao: 'Verifique a conexão e tente de novo.',
        }}
        aoTentarDeNovo={() => void acessos.refetch()}
      />
    )
  }
  if (!valor || terminou) return <TelaDeEspera />

  return (
    <ContextoConsultoria.Provider value={valor}>
      <div className="flex h-dvh flex-col">
        <FaixaDeSuporte />
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </div>
      </div>
    </ContextoConsultoria.Provider>
  )
}
