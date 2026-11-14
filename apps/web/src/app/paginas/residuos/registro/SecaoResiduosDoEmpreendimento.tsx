import { formatarDataCivil } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { caminhoDosPrazosDeResiduo } from '@/app/paginas/residuos/prazos/prazos-de-residuos'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { listarMtrs } from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'

import { SeloSituacaoMtr } from './campos'
import { caminhoDosMtrs, resumoDosItens } from './comum'

const QUANTOS = 5

/**
 * Seção "Resíduos" da página do empreendimento: os últimos MTRs registrados e o caminho para a
 * lista completa (onde se registra MTR e CDF).
 */
export function SecaoResiduosDoEmpreendimento({ empreendimentoId }: { empreendimentoId: string }) {
  const { atual } = useConsultoria()
  const mtrs = useQuery({
    queryKey: ['mtrs', atual.consultoriaId, empreendimentoId, 'ultimos'],
    queryFn: () => listarMtrs(atual.consultoriaId, { empreendimentoId }, 0),
  })
  const caminho = caminhoDosMtrs(empreendimentoId)
  const ultimos = mtrs.data?.itens.slice(0, QUANTOS) ?? []

  return (
    <section
      aria-labelledby="titulo-secao-residuos"
      className="flex min-w-0 flex-col overflow-hidden rounded-(--radius-large) border bg-(--surface) shadow-cartao"
    >
      <div className="flex flex-wrap items-center gap-(--space-100) border-b px-(--space-150) py-(--space-100)">
        <h2 id="titulo-secao-residuos" className="flex-1 titulo-secao text-(--text)">
          Resíduos
        </h2>
        <Link
          to={caminhoDosPrazosDeResiduo(empreendimentoId)}
          className="corpo text-(--text-link) hover:underline"
        >
          Prazos de resíduos
        </Link>
        <Link to={caminho} className="corpo text-(--text-link) hover:underline">
          Ver MTRs e CDFs
        </Link>
      </div>
      {mtrs.isPending ? (
        <Carregando rotulo="Carregando MTRs" linhas={2} className="border-0" />
      ) : mtrs.isError ? (
        ehSemPermissao(mtrs.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar os MTRs."
            aoTentarDeNovo={() => void mtrs.refetch()}
            className="m-(--space-150)"
          />
        )
      ) : ultimos.length === 0 ? (
        <EstadoVazio
          icone="file-text"
          titulo="Nenhum MTR registrado"
          acaoPrincipal={
            <Botao asChild>
              <Link to={caminho}>Registrar MTR</Link>
            </Botao>
          }
        />
      ) : (
        <ul aria-label="Últimos MTRs" className="flex flex-col">
          {ultimos.map((mtr) => (
            <li
              key={mtr.id}
              className="flex flex-wrap items-center gap-x-(--space-150) gap-y-(--space-050) border-b px-(--space-150) py-(--space-100) last:border-b-0"
            >
              <span className="corpo-medio">MTR {mtr.numero}</span>
              <span>{formatarDataCivil(mtr.emitidoEm)}</span>
              <SeloSituacaoMtr situacao={mtr.situacao} />
              <span className="min-w-0 flex-1">{resumoDosItens(mtr.itens, 1)}</span>
              <span className="whitespace-nowrap">
                {mtr.temCdf ? `CDF ${mtr.cdfs.map((c) => c.numero).join(', ')}` : 'Sem CDF'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
