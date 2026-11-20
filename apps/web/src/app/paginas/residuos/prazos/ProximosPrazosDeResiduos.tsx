// Resíduos, fase 1: próximos prazos das obrigações de resíduos ligadas (DMR trimestral, DMRSU
// mensal, Inventário Nacional e RAPP do IBAMA). Protótipo para revisão.
//
// Componente para a página de obrigações, a visão da equipe e o empreendimento. Os prazos são
// calculados no banco (prazos_obrigacoes_residuo, espelho do domínio); nada é gravado.

import {
  ROTULO_DA_OBRIGACAO_RESIDUO,
  formatarDataCivil,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Selo } from '@/components/ui/selo'
import { prazosDasObrigacoesDeResiduo, type PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'

import {
  CHAVE_PRAZOS_RESIDUO,
  caminhoDosPrazosDeResiduo,
  situacaoDoPrazoDeResiduo,
} from './prazos-de-residuos'

function janela(prazo: PrazoDeObrigacaoNoCalendario): string {
  return prazo.inicio
    ? `${formatarDataCivil(prazo.inicio)} a ${formatarDataCivil(prazo.prazo)}`
    : `Até ${formatarDataCivil(prazo.prazo)}`
}

interface Props {
  /** Só deste empreendimento; sem ele, a consultoria inteira. */
  empreendimentoId?: string | null
  /** Janela consultada; padrão do banco: de hoje a um ano. */
  de?: DataCivil
  ate?: DataCivil
  /** Linhas mostradas; acima disso aparece o link para a página de obrigações. */
  limite?: number
  titulo?: string
  /** Esconde a coluna de empreendimento (quando a tela já é de um só). */
  semEmpreendimento?: boolean
  /** Sem prazos, não mostra nada (visão da equipe de quem não acompanha resíduos). */
  ocultarSeVazio?: boolean
}

/**
 * Próximos prazos de resíduos: tabela que rola na própria região, com prazo, obrigação, referência,
 * empreendimento, janela de entrega e quanto falta (com palavra, não só cor).
 */
export function ProximosPrazosDeResiduos({
  empreendimentoId = null,
  de,
  ate,
  limite = 10,
  titulo = 'Próximos prazos de resíduos',
  semEmpreendimento = false,
  ocultarSeVazio = false,
}: Props) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const prazos = useQuery({
    queryKey: [CHAVE_PRAZOS_RESIDUO, cid, empreendimentoId, de ?? null, ate ?? null],
    queryFn: () =>
      prazosDasObrigacoesDeResiduo(cid, {
        empreendimentoId,
        de: de ?? null,
        ate: ate ?? null,
      }),
  })

  let conteudo
  if (prazos.isError) {
    conteudo = ehSemPermissao(prazos.error) ? (
      <SemPermissao descricao={null} />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar os prazos de resíduos."
        aoTentarDeNovo={() => void prazos.refetch()}
      />
    )
  } else if (prazos.isPending) {
    conteudo = <Carregando rotulo="Carregando os prazos de resíduos" linhas={3} />
  } else if (prazos.data.length === 0) {
    if (ocultarSeVazio) return null
    conteudo = (
      <EstadoVazio
        icone="calendar"
        titulo="Nenhum prazo de resíduos no período"
        className="rounded-(--raio-painel) border bg-(--folha) py-(--e-6)"
      />
    )
  } else {
    const visiveis = prazos.data.slice(0, limite)
    const restantes = prazos.data.length - visiveis.length
    conteudo = (
      <>
        <div className="overflow-x-auto rounded-(--raio-painel) border bg-(--folha) shadow-cartao">
          <table className="w-full border-collapse corpo" aria-label={titulo}>
            <thead>
              <tr>
                {[
                  'Prazo',
                  'Obrigação',
                  'Referência',
                  ...(semEmpreendimento ? [] : ['Empreendimento']),
                  'Janela de entrega',
                  'Situação',
                ].map((coluna) => (
                  <th
                    key={coluna}
                    scope="col"
                    className="h-10 border-b px-(--e-2) text-left whitespace-nowrap rotulo first:pl-(--e-3)"
                  >
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const s = situacaoDoPrazoDeResiduo(p.dias)
                return (
                  <tr key={`${p.obrigacaoId}:${p.prazo}`} className="border-b last:border-b-0">
                    <td className="h-10 px-(--e-2) pl-(--e-3) whitespace-nowrap corpo-medio">
                      {formatarDataCivil(p.prazo)}
                    </td>
                    <td className="px-(--e-2) whitespace-nowrap">
                      {ROTULO_DA_OBRIGACAO_RESIDUO[p.tipo]}
                    </td>
                    <td className="px-(--e-2) whitespace-nowrap">{p.referencia}</td>
                    {semEmpreendimento ? null : (
                      <td className="px-(--e-2)">
                        <Link
                          to={caminhoDosPrazosDeResiduo(p.empreendimentoId)}
                          className="text-(--link) hover:underline"
                        >
                          {p.empreendimentoNome}
                        </Link>
                      </td>
                    )}
                    <td className="px-(--e-2) whitespace-nowrap">{janela(p)}</td>
                    <td className="px-(--e-2) whitespace-nowrap">
                      <Selo tom={s.tom}>{s.texto}</Selo>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {restantes > 0 ? (
          <Link
            to={caminhoDosPrazosDeResiduo(empreendimentoId)}
            className="w-fit corpo text-(--link) hover:underline"
          >
            Ver todos os {prazos.data.length} prazos
          </Link>
        ) : null}
      </>
    )
  }

  return (
    <section aria-label={titulo} className="flex flex-col gap-(--e-2)">
      <h2 className="titulo-secao text-(--tinta)">{titulo}</h2>
      {conteudo}
    </section>
  )
}
