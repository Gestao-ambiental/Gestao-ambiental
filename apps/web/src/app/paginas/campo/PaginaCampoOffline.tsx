import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  lerConsultoriaPreferida,
  lerSuporteEscolhido,
} from '@/app/consultoria/contexto-consultoria'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MarcaGrama } from '@/components/ui/marca-grama'
import { listarMeusVinculos } from '@/lib/api/acesso'
import { usuarioDaSessaoLocal } from '@/lib/supabase'
import { useConectado } from '@/lib/vistoria-offline/app'
import { lerRascunhos } from '@/lib/vistoria-offline/rascunho'

import { EditorOffline } from './EditorOffline'
import { VoltarPara } from './pecas'

export function PaginaCampoOffline() {
  const { sessao } = useSessao()
  const conectado = useConectado()
  const usuario = sessao?.user.id ?? (conectado ? '' : (usuarioDaSessaoLocal() ?? ''))
  const consultoria = lerSuporteEscolhido(usuario) ? null : lerConsultoriaPreferida(usuario)
  const { id } = useParams()
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgora(Date.now())
    }, 10000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])
  const acesso = useQuery({
    queryKey: ['campo-offline-vinculos', usuario],
    queryFn: listarMeusVinculos,
    enabled: conectado && Boolean(usuario && consultoria),
    staleTime: 30000,
  })
  const vinculo = acesso.data?.find(
    (v) => v.consultoriaId === consultoria && v.situacao === 'ativo',
  )
  const consulta = useQuery({
    queryKey: ['campo-offline', usuario, consultoria],
    queryFn: () => lerRascunhos(usuario, consultoria ?? ''),
    enabled: Boolean(usuario && consultoria),
    networkMode: 'always',
  })
  const disponiveis =
    consulta.data?.filter((v) =>
      conectado ? v.membroId === vinculo?.membroId : v.acessoAte > agora,
    ) ?? []
  const aberto = disponiveis.find((v) => v.visita.id === id)

  return (
    <div className="min-h-dvh bg-(--surface-sunken) pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between gap-3 border-b bg-(--surface) px-4 py-3">
        <MarcaGrama />
        <span role="status" className="rounded-full border px-3 py-1 text-xs text-(--text-subtle)">
          {conectado ? 'Com conexão' : 'Sem conexão'}
        </span>
      </header>
      <main id="conteudo" className="mx-auto grid w-full max-w-xl gap-4 p-4">
        {id ? (
          <VoltarPara para="/campo/offline" rotulo="Vistorias salvas" />
        ) : (
          <>
            {conectado ? <VoltarPara para="/campo" rotulo="Minhas vistorias" /> : null}
            <h1 className="titulo-tela">Vistorias salvas no aparelho</h1>
          </>
        )}
        {!usuario || !consultoria ? (
          <p>Abra o Grama com internet e prepare uma vistoria na sua consultoria.</p>
        ) : consulta.isError || (conectado && acesso.isError) ? (
          <EstadoErro
            titulo="Não foi possível abrir as vistorias salvas"
            aoTentarDeNovo={() => {
              void consulta.refetch()
              if (conectado) void acesso.refetch()
            }}
          />
        ) : consulta.isPending || (conectado && acesso.isPending) ? (
          <Carregando rotulo="Carregando vistorias salvas" linhas={3} />
        ) : aberto ? (
          <EditorOffline
            key={aberto.visita.id}
            inicial={aberto}
            conectado={conectado}
            aoAtualizar={async () => {
              await consulta.refetch()
            }}
          />
        ) : id ? (
          <p role="alert">
            Esta vistoria não está disponível neste aparelho. Abra Minhas vistorias com internet
            para renovar o acesso.
          </p>
        ) : disponiveis.length === 0 ? (
          <p>Prepare uma vistoria com internet. O rascunho aparecerá aqui para usar sem sinal.</p>
        ) : (
          <ul className="grid gap-2">
            {disponiveis.map((v) => (
              <li
                key={v.visita.id}
                className="grid gap-1 rounded-(--radius) border bg-(--surface) p-4"
              >
                <Link
                  className="inline-flex min-h-11 items-center corpo-medio"
                  to={`/campo/offline/${v.visita.id}`}
                >
                  {v.visita.titulo}
                </Link>
                <span className="text-sm text-(--text-subtle)">
                  {v.visita.unidadeNome} · {v.revisado ? 'Aguardando envio' : 'Rascunho'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!id && conectado ? (
          <Botao asChild className="min-h-11 justify-self-start">
            <Link to="/">Ir para o início</Link>
          </Botao>
        ) : null}
      </main>
    </div>
  )
}
