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
import {
  classeCabecalho,
  classeCelula,
  classeLinha,
  classePainel,
  classeRegiao,
} from '@/app/paginas/residuos/quadro'
import { Contagem } from '@/app/paginas/visao/Contagem'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Selo } from '@/components/ui/selo'
import { prazosDasObrigacoesDeResiduo, type PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

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
        className={cn(classePainel, 'py-(--e-6)')}
      />
    )
  } else {
    const visiveis = prazos.data.slice(0, limite)
    const restantes = prazos.data.length - visiveis.length
    conteudo = (
      <div className={classePainel}>
        <div className={cn(classeRegiao, 'hidden md:block')}>
          <table className="w-full border-collapse corpo" aria-label={titulo}>
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={cn(classeCabecalho, 'w-[88px]')}>
                  Faltam
                </th>
                {[
                  'Prazo',
                  'Obrigação',
                  ...(semEmpreendimento ? [] : ['Empreendimento']),
                  'Janela de entrega',
                  'Situação',
                ].map((coluna) => (
                  <th key={coluna} scope="col" className={classeCabecalho}>
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p, indice) => {
                const s = situacaoDoPrazoDeResiduo(p.dias)
                return (
                  <tr
                    key={`${p.obrigacaoId}:${p.prazo}`}
                    className={cn(
                      classeLinha,
                      p.dias === 0 && 'bg-(--sinal-fundo) hover:bg-(--sinal-fundo)',
                    )}
                  >
                    <td className={classeCelula}>
                      <Contagem dias={p.dias} ordem={indice} />
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap corpo-medio numero`}>
                      {formatarDataCivil(p.prazo)}
                    </td>
                    <td className={classeCelula}>
                      <span className="corpo-medio">{ROTULO_DA_OBRIGACAO_RESIDUO[p.tipo]}</span>
                      <span className="text-(--tinta-2)"> · {p.referencia}</span>
                    </td>
                    {semEmpreendimento ? null : (
                      <td className={classeCelula}>
                        <Link
                          to={caminhoDosPrazosDeResiduo(p.empreendimentoId)}
                          className="block max-w-[240px] truncate text-(--tinta)"
                        >
                          {p.empreendimentoNome}
                        </Link>
                      </td>
                    )}
                    <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}>
                      {janela(p)}
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      <Selo tom={s.tom}>{s.texto}</Selo>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <ul aria-label={titulo} className="flex flex-col md:hidden">
          {visiveis.map((p, indice) => {
            const s = situacaoDoPrazoDeResiduo(p.dias)
            return (
              <li
                key={`${p.obrigacaoId}:${p.prazo}`}
                className={cn(
                  'flex gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0',
                  p.dias === 0 && 'bg-(--sinal-fundo)',
                )}
              >
                <Contagem dias={p.dias} ordem={indice} />
                <span className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
                  <span className="flex flex-wrap items-center justify-between gap-x-(--e-2) gap-y-(--e-1)">
                    <span className="corpo-medio numero">{formatarDataCivil(p.prazo)}</span>
                    <Selo tom={s.tom}>{s.texto}</Selo>
                  </span>
                  <span>
                    <span className="corpo-medio">{ROTULO_DA_OBRIGACAO_RESIDUO[p.tipo]}</span>
                    <span className="text-(--tinta-2)"> · {p.referencia}</span>
                  </span>
                  <span className="truncate text-xs text-(--tinta-2) numero">
                    {semEmpreendimento ? '' : `${p.empreendimentoNome} · `}
                    {janela(p)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>

        {restantes > 0 ? (
          <div className="border-t px-(--e-4) py-(--e-2)">
            <Link
              to={caminhoDosPrazosDeResiduo(empreendimentoId)}
              className="corpo-medio max-md:inline-flex max-md:min-h-(--controle-toque) max-md:items-center"
            >
              Ver todos os {prazos.data.length} prazos
            </Link>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-label={titulo} className="flex flex-col gap-(--e-3)">
      <h2 className="titulo-secao text-(--tinta)">{titulo}</h2>
      {conteudo}
    </section>
  )
}
