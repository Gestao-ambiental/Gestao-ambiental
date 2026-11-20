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
import { TituloDoPainel, classePainel } from '../quadro'
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
    <section aria-labelledby="titulo-secao-residuos" className={classePainel}>
      <TituloDoPainel
        id="titulo-secao-residuos"
        acoes={
          <span className="flex flex-wrap items-center gap-x-(--e-4) gap-y-(--e-1)">
            <Link
              to={caminhoDosPrazosDeResiduo(empreendimentoId)}
              className="corpo-medio max-md:inline-flex max-md:min-h-(--controle-toque) max-md:items-center"
            >
              Prazos de resíduos
            </Link>
            <Link
              to={caminho}
              className="corpo-medio max-md:inline-flex max-md:min-h-(--controle-toque) max-md:items-center"
            >
              Ver MTRs e CDFs
            </Link>
          </span>
        }
      >
        Resíduos
      </TituloDoPainel>
      {mtrs.isPending ? (
        <Carregando rotulo="Carregando MTRs" linhas={2} className="border-0" />
      ) : mtrs.isError ? (
        ehSemPermissao(mtrs.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar os MTRs."
            aoTentarDeNovo={() => void mtrs.refetch()}
            className="m-(--e-3)"
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
              className="flex min-h-(--linha) flex-wrap items-center gap-x-(--e-4) gap-y-(--e-1) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) last:border-b-0"
            >
              <span className="w-[136px] corpo-medio numero">MTR {mtr.numero}</span>
              <span className="numero text-(--tinta-2)">{formatarDataCivil(mtr.emitidoEm)}</span>
              <SeloSituacaoMtr situacao={mtr.situacao} />
              <span className="min-w-0 flex-1 truncate numero">{resumoDosItens(mtr.itens, 1)}</span>
              <span
                className={
                  mtr.temCdf ? 'whitespace-nowrap numero' : 'whitespace-nowrap text-(--tinta-2)'
                }
              >
                {mtr.temCdf ? `CDF ${mtr.cdfs.map((c) => c.numero).join(', ')}` : 'Sem CDF'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
