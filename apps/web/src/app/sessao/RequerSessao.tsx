import { Navigate, Outlet, useLocation } from 'react-router'

import { Carregando, EstadoErro } from '@/components/estados'

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

/** Rotas que exigem login. Sem sessão, vai para /entrar e volta para cá depois. */
export function RequerSessao() {
  const { carregando, sessao, erroConfiguracao } = useSessao()
  const local = useLocation()

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
  if (carregando) return <TelaDeEspera />
  if (!sessao) {
    const para = `${local.pathname}${local.search}`
    const busca = para === '/' ? '' : `?para=${encodeURIComponent(para)}`
    return <Navigate to={`/entrar${busca}`} replace />
  }
  return <Outlet />
}
