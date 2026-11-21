// Relatórios escritos no Grama, na seção Evidência da ocorrência e no empreendimento (ADR-0040).
// Quadro curto: título, situação em palavra + forma, versão e quando mudou. Sem relatório, nada.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  listarRelatorios,
  ROTULO_DA_SITUACAO,
  type SituacaoDoRelatorio,
} from '@/lib/api/relatorios'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

const TOM: Record<SituacaoDoRelatorio, TomSelo> = {
  rascunho: 'padrao',
  em_revisao: 'andamento',
  devolvido: 'perigo',
  aprovado: 'sucesso',
}

export function RelatoriosEscritos({
  ocorrenciaId,
  empreendimentoId,
  comTitulo = false,
}: {
  ocorrenciaId?: string
  empreendimentoId?: string
  /** No empreendimento, a lista vem com o próprio título de seção. */
  comTitulo?: boolean
}) {
  const { atual } = useConsultoria()
  const relatorios = useQuery({
    queryKey: ['relatorios', { ocorrenciaId, empreendimentoId }],
    queryFn: () => listarRelatorios({ ocorrenciaId, empreendimentoId }),
  })

  if (relatorios.isPending) return null
  if (relatorios.isError) {
    return (
      <MensagemSecao tom="perigo" role="alert" className="mt-(--e-3)">
        {mensagemDoErro(relatorios.error)}
      </MensagemSecao>
    )
  }
  if (relatorios.data.length === 0) return null

  const lista = (
    <ul aria-label="Relatórios escritos no Grama" className="mt-(--e-2) flex flex-col">
      {relatorios.data.map((r) => (
        <li
          key={r.id}
          className="flex min-h-(--linha) flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1) border-b border-(--regra-leve) py-(--e-2)"
        >
          <Link
            to={`/relatorios/${r.id}`}
            className="min-w-0 flex-1 truncate corpo-medio text-(--link) hover:underline max-md:min-h-(--controle-toque)"
          >
            {r.titulo}
          </Link>
          <Selo tom={TOM[r.situacao]}>{ROTULO_DA_SITUACAO[r.situacao]}</Selo>
          <span className="text-xs text-(--tinta-2) numero">
            v{r.versao} · {r.autorNome} · {formatarInstanteComoData(r.atualizadoEm, atual.fuso)}
          </span>
        </li>
      ))}
    </ul>
  )
  if (!comTitulo) return lista
  return (
    <section aria-labelledby="titulo-relatorios" className="flex flex-col">
      <h2
        id="titulo-relatorios"
        className="border-b border-(--regra-forte) pb-(--e-1) titulo-secao text-(--tinta)"
      >
        Relatórios
      </h2>
      {lista}
    </section>
  )
}
