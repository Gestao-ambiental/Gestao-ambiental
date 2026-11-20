// /configuracoes (ADR-0041): no desktop abre a primeira aba; no celular, as abas viram uma lista e
// cada item abre a aba. A Equipe (papel) vê "sem permissão".
import { Link, Navigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursosLiberados } from '@/app/consultoria/recurso-liberado'
import { Pagina } from '@/app/paginas/Pagina'
import { SemPermissao } from '@/components/estados'
import { Icone } from '@/components/ui/icone'
import { useCelular } from '@/lib/usar-celular'

import { abasDeConfiguracoesVisiveis, RECURSOS_DAS_ABAS } from './abas-de-configuracoes'
import { TITULO_DE_CONFIGURACOES } from './PaginaDeConfiguracoes'

export function PaginaConfiguracoes() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo={TITULO_DE_CONFIGURACOES}>
        <SemPermissao descricao="Configurações são da gestão." />
      </Pagina>
    )
  }
  return <ConfiguracoesDaGestao />
}

function ConfiguracoesDaGestao() {
  const celular = useCelular()
  const liberados = useRecursosLiberados(RECURSOS_DAS_ABAS)
  const abas = abasDeConfiguracoesVisiveis(liberados)
  const primeira = abas[0]

  if (!celular && primeira) return <Navigate to={primeira.para} replace />

  return (
    <Pagina titulo={TITULO_DE_CONFIGURACOES}>
      <nav aria-label={TITULO_DE_CONFIGURACOES}>
        <ul className="overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          {abas.map((aba) => (
            <li key={aba.para} className="border-b border-(--regra-leve) last:border-b-0">
              <Link
                to={aba.para}
                className="flex min-h-(--controle-toque) items-center gap-(--e-3) px-(--e-4) py-(--e-2) corpo-medio text-(--tinta) no-underline transicao-estado hover:bg-(--toque) hover:no-underline active:bg-(--aperto)"
              >
                <Icone nome={aba.icone} className="text-(--icone-2)" />
                <span className="flex-1">{aba.rotulo}</span>
                <Icone nome="chevron-right" className="text-(--icone-2)" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Pagina>
  )
}
