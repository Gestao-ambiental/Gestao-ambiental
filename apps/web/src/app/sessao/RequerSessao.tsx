import { Navigate, Outlet, useLocation } from 'react-router'

import { ProvedorBloqueio } from '@/app/bloqueio/ProvedorBloqueio'
import { Carregando, EstadoErro } from '@/components/estados'
import { usuarioDaSessaoLocal } from '@/lib/supabase'
import { useConectado } from '@/lib/vistoria-offline/app'

import { useSessao } from './contexto-sessao'

/** Tela de espera/erro antes de existir layout (sessão ou vínculos ainda carregando). */
export function TelaDeEspera({
  erro,
  aoTentarDeNovo,
}: {
  erro?: { titulo: string; descricao: string }
  aoTentarDeNovo?: () => void
}) {
  return (
    <main id="conteudo" className="mx-auto w-full max-w-[480px] p-(--space-200) pt-(--space-800)">
      {erro ? (
        <EstadoErro
          titulo={erro.titulo}
          descricao={erro.descricao}
          aoTentarDeNovo={aoTentarDeNovo}
        />
      ) : (
        <Carregando rotulo="Carregando sua conta" linhas={3} />
      )}
    </main>
  )
}

/**
 * Rotas que exigem login. Sem sessão, vai para /entrar e volta para cá depois. Com sessão, a tela
 * pode ser bloqueada (ACC-05) em qualquer uma delas.
 */
export function RequerSessao() {
  const { carregando, sessao, erroConfiguracao } = useSessao()
  const local = useLocation()
  const conectado = useConectado()
  const campoOffline =
    local.pathname === '/campo/offline' || local.pathname.startsWith('/campo/offline/')
  const lembrado = !conectado && !sessao ? usuarioDaSessaoLocal() : undefined

  if (erroConfiguracao) {
    return (
      <TelaDeEspera
        erro={{
          titulo: 'O app não está configurado',
          descricao:
            'Faltam as variáveis do Supabase neste ambiente. Avise quem cuida da implantação.',
        }}
      />
    )
  }
  if (!conectado && !sessao && !campoOffline && lembrado) {
    return <Navigate to="/campo/offline" replace />
  }
  if (!conectado && !sessao && !lembrado) {
    return (
      <TelaDeEspera
        erro={{
          titulo: 'Você está sem conexão',
          descricao: 'Entre no Grama com internet para preparar vistorias neste aparelho.',
        }}
      />
    )
  }
  const usuarioOffline = campoOffline ? lembrado : undefined
  if (carregando && !usuarioOffline) return <TelaDeEspera />
  if (!sessao && !usuarioOffline) {
    const para = `${local.pathname}${local.search}`
    const busca = para === '/' ? '' : `?para=${encodeURIComponent(para)}`
    return <Navigate to={`/entrar${busca}`} replace />
  }
  return (
    <ProvedorBloqueio usuarioOffline={usuarioOffline}>
      <Outlet />
    </ProvedorBloqueio>
  )
}
