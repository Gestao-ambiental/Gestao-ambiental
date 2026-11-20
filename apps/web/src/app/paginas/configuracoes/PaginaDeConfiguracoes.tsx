// Moldura das abas de Configurações (ADR-0041): título "Configurações" em todas, abas logo abaixo,
// a ação principal da aba à direita do título e, na aba com seções (Orçamentos), o segmentado
// entre elas. A Equipe (papel) vê só o título e o "sem permissão" de cada aba.
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursosLiberados } from '@/app/consultoria/recurso-liberado'
import { Pagina } from '@/app/paginas/Pagina'
import { AbasDeRota } from '@/components/ui/abas'
import { Segmentado } from '@/components/ui/segmentado'

import {
  abaDoCaminho,
  abasDeConfiguracoesVisiveis,
  RECURSOS_DAS_ABAS,
} from './abas-de-configuracoes'

export const TITULO_DE_CONFIGURACOES = 'Configurações'

export function PaginaDeConfiguracoes({
  acao,
  children,
}: {
  /** Ação principal da aba (ex.: Convidar pessoa), à direita do título. */
  acao?: ReactNode
  children: ReactNode
}) {
  const { atual } = useConsultoria()
  const ehGestao = atual.papel === 'gestao'
  return (
    <Pagina titulo={TITULO_DE_CONFIGURACOES} acao={ehGestao ? acao : undefined}>
      {ehGestao ? <AbasDeConfiguracoes /> : null}
      {children}
    </Pagina>
  )
}

function AbasDeConfiguracoes() {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const liberados = useRecursosLiberados(RECURSOS_DAS_ABAS)
  const atual = abaDoCaminho(pathname)
  const secaoAtual = atual?.secoes?.find((s) => s.para === pathname)

  return (
    <div className="flex flex-col gap-(--e-4)">
      <AbasDeRota
        rotulo={TITULO_DE_CONFIGURACOES}
        abas={abasDeConfiguracoesVisiveis(liberados).map((aba) => ({
          // Na aba com seções, o link aponta para a seção aberta: assim ela fica marcada como atual.
          para: aba === atual && secaoAtual ? secaoAtual.para : aba.para,
          rotulo: aba.rotulo,
        }))}
      />
      {atual?.secoes && secaoAtual ? (
        <Segmentado
          rotulo={atual.rotulo}
          opcoes={atual.secoes.map((s) => ({ valor: s.para, rotulo: s.rotulo }))}
          valor={secaoAtual.para}
          aoMudar={(para) => {
            void navegar(para)
          }}
          larguraTotalNoCelular
          className="self-start"
        />
      ) : null}
    </div>
  )
}
