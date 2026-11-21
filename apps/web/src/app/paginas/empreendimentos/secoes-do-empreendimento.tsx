// Seções da tela do empreendimento, na ordem em que aparecem. Função nova com seção própria
// acrescenta UMA linha em SECOES e o componente num arquivo próprio. Seção que só faz sentido com
// conteúdo devolve null quando está vazia (Relatórios, Resíduos).
import type { DataCivil } from '@gestao-ambiental/domain'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ComponentType } from 'react'

import { SecaoExigenciasDoEmpreendimento } from '@/app/paginas/exigencias/SecaoExigenciasDoEmpreendimento'
import { RelatoriosEscritos } from '@/app/paginas/relatorios/RelatoriosEscritos'
import { SecaoResiduosDoEmpreendimento } from '@/app/paginas/residuos/registro/SecaoResiduosDoEmpreendimento'
import type { Empreendimento, Unidade } from '@/lib/api/empreendimentos'

import { SecaoLicencas } from './SecaoLicencas'
import { SecaoRequisitosLegais } from './SecaoRequisitosLegais'
import { SecaoVencimentos } from './SecaoVencimentos'

export interface PropsDaSecao {
  empreendimento: Empreendimento
  unidades: UseQueryResult<Unidade[]>
  hoje: DataCivil
  ehGestao: boolean
  /** Unidade escolhida no filtro das licenças (também vai para "Cadastrar licença"). */
  unidadeFiltro: string | null
  aoFiltrarUnidade: (unidadeId: string | null) => void
}

function SecaoRelatorios({ empreendimento }: PropsDaSecao) {
  return <RelatoriosEscritos empreendimentoId={empreendimento.id} comTitulo />
}

function SecaoDeVencimentos({ empreendimento, unidades, hoje, ehGestao }: PropsDaSecao) {
  return (
    <SecaoVencimentos
      empreendimentoId={empreendimento.id}
      unidades={unidades.data ?? []}
      hoje={hoje}
      ehGestao={ehGestao}
    />
  )
}

function SecaoResiduos({ empreendimento }: PropsDaSecao) {
  return <SecaoResiduosDoEmpreendimento empreendimentoId={empreendimento.id} />
}

const SECOES: readonly { id: string; Secao: ComponentType<PropsDaSecao> }[] = [
  { id: 'licencas', Secao: SecaoLicencas },
  { id: 'requisitos-legais', Secao: SecaoRequisitosLegais },
  { id: 'exigencias', Secao: SecaoExigenciasDoEmpreendimento },
  { id: 'relatorios', Secao: SecaoRelatorios },
  { id: 'vencimentos', Secao: SecaoDeVencimentos },
  { id: 'residuos', Secao: SecaoResiduos },
]

export function SecoesDoEmpreendimento(props: PropsDaSecao) {
  return (
    <>
      {SECOES.map(({ id, Secao }) => (
        <Secao key={id} {...props} />
      ))}
    </>
  )
}
