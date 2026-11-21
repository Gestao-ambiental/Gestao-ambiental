import { formatarDataCivil, situacaoDaLicenca, type DataCivil } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { ProgressoCadastro } from '@/app/paginas/licenca/ProgressoCadastro'
import { PASSOS } from '@/app/paginas/licenca/passos'
import { SeloSituacaoLicenca } from '@/app/paginas/licenca/SeloSituacaoLicenca'
import { EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import type { LicencaNaLista } from '@/lib/api/licencas'
import { listarLicencasComMudancaDeNorma } from '@/lib/api/normas-da-licenca'
import { formatarInstanteComoData } from '@/lib/datas'
import { useCelular } from '@/lib/usar-celular'
import { cn } from '@/lib/utils'

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula =
  'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle whitespace-nowrap'

function titulo(licenca: LicencaNaLista): string {
  const sigla = licenca.sigla ?? 'Licença'
  return licenca.numero ? `${sigla} ${licenca.numero}` : `${sigla} sem número`
}

/** Identificador forte: sigla + número em numeral tabular; rascunho sem número fica apagado. */
function Identificador({ licenca }: { licenca: LicencaNaLista }) {
  return (
    <span
      title={licenca.tipoNome ?? undefined}
      className={cn('numero', licenca.numero ? 'corpo-medio text-(--tinta)' : 'text-(--tinta-2)')}
    >
      {titulo(licenca)}
    </span>
  )
}

/** Aba Normas de Acompanhamentos (mesmo ?aba=… que a página lê). */
const DESTINO_DAS_MUDANCAS_DE_NORMA = '/acompanhamentos?aba=normas'

/**
 * Selo "Norma mudou" (ADR-0050, item 25): a licença tem aviso de mudança de norma ainda não visto.
 * Ícone e palavra, nunca só a cor; leva à aba Normas de Acompanhamentos.
 */
function SeloNormaMudou({ licenca, mudancas }: { licenca: LicencaNaLista; mudancas: number }) {
  const quantas = mudancas === 1 ? '1 mudança' : `${String(mudancas)} mudanças`
  return (
    <Link
      to={DESTINO_DAS_MUDANCAS_DE_NORMA}
      aria-label={`Norma mudou: ${quantas} para ${titulo(licenca)}`}
      className="inline-flex shrink-0 items-center gap-(--e-1) rounded-(--raio-mini) text-xs font-[750] whitespace-nowrap text-(--alerta-texto) underline-offset-2 hover:underline"
    >
      <Icone nome="megaphone" tamanho={12} rotulo="Aviso de norma" />
      Norma mudou
    </Link>
  )
}

/** Identificador e, quando houver aviso não visto, o selo "Norma mudou" ao lado. */
function LicencaComSelo({
  licenca,
  mudancas,
}: {
  licenca: LicencaNaLista
  mudancas: number | undefined
}) {
  if (!mudancas) return <Identificador licenca={licenca} />
  return (
    <span className="inline-flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1)">
      <Identificador licenca={licenca} />
      <SeloNormaMudou licenca={licenca} mudancas={mudancas} />
    </span>
  )
}

/**
 * Licenças com aviso de norma não visto. Erro ou carregando: nenhum selo, a tabela segue igual.
 */
function useMudancasDeNorma(
  empreendimentoId: string,
  temLicencas: boolean,
): ReadonlyMap<string, number> {
  const { atual } = useConsultoria()
  const consulta = useQuery({
    queryKey: ['licencas-com-mudanca-de-norma', atual.consultoriaId, empreendimentoId],
    queryFn: () => listarLicencasComMudancaDeNorma(atual.consultoriaId, empreendimentoId),
    enabled: temLicencas,
    staleTime: 60_000,
  })
  return new Map((consulta.data ?? []).map((l) => [l.instrumentoId, l.mudancas]))
}

function Situacao({
  licenca,
  hoje,
  podeEditar,
}: {
  licenca: LicencaNaLista
  hoje: DataCivil
  podeEditar: boolean
}) {
  if (licenca.situacao !== 'rascunho') {
    return <SeloSituacaoLicenca situacao={situacaoDaLicenca(licenca, hoje)} />
  }
  const passo = licenca.passoCadastro ?? 1
  return (
    <span className="inline-flex items-center gap-(--e-3)">
      <ProgressoCadastro passo={passo} />
      {podeEditar ? (
        <Botao tamanho="compacto" asChild>
          <Link
            to={`/licencas/${licenca.id}/${(PASSOS[passo] ?? PASSOS[1]).chave}`}
            aria-label={`Continuar o cadastro de ${titulo(licenca)}`}
          >
            Continuar
          </Link>
        </Botao>
      ) : null}
    </span>
  )
}

function Condicionantes({ licenca }: { licenca: LicencaNaLista }) {
  if (licenca.situacao === 'rascunho') return <span className="text-(--tinta-3)">—</span>
  return <span className="numero">{licenca.condicionantes}</span>
}

/**
 * Licenças do empreendimento (Protótipo 09, onda 1): da mais recente para a mais antiga, com
 * validade e situação calculada. O número da licença é o identificador da linha. Rascunho diz
 * onde parou e, para a Gestão, "Continuar" no passo em que parou. Licença com mudança de norma
 * não vista ganha o selo "Norma mudou". No celular, vira lista.
 */
export function TabelaLicencas({
  empreendimentoId,
  itens,
  totalSemFiltro,
  hoje,
  fuso,
  podeEditar,
  aoLimparFiltros,
  ordemDecrescente,
  aoInverterOrdem,
}: {
  empreendimentoId: string
  itens: readonly LicencaNaLista[]
  totalSemFiltro: number
  hoje: DataCivil
  fuso: string
  podeEditar: boolean
  aoLimparFiltros: () => void
  ordemDecrescente: boolean
  aoInverterOrdem: () => void
}) {
  const celular = useCelular()
  const mudancasDeNorma = useMudancasDeNorma(empreendimentoId, itens.length > 0)

  if (totalSemFiltro === 0) {
    return <EstadoVazio icone="file-text" titulo="Nenhuma licença cadastrada" />
  }
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone="search"
        titulo="Nada com estes filtros"
        acaoPrincipal={<Botao onClick={aoLimparFiltros}>Limpar filtros</Botao>}
      />
    )
  }

  if (celular) {
    return (
      <ul className="flex flex-col" aria-label="Licenças do empreendimento">
        {itens.map((licenca) => (
          <li
            key={licenca.id}
            className="flex flex-col gap-(--e-1) border-b border-(--regra-leve) px-(--e-4) py-(--e-3)"
          >
            <span className="flex items-baseline justify-between gap-(--e-2)">
              <LicencaComSelo licenca={licenca} mudancas={mudancasDeNorma.get(licenca.id)} />
              <span className="corpo-medio numero">
                {licenca.validade ? formatarDataCivil(licenca.validade) : '—'}
              </span>
            </span>
            <Situacao licenca={licenca} hoje={hoje} podeEditar={podeEditar} />
            <span className="truncate text-xs text-(--tinta-2)">
              {[licenca.tipoNome, licenca.orgao, licenca.unidadeNome].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse corpo">
        <thead>
          <tr>
            <th scope="col" className={classeCabecalho}>
              Licença
            </th>
            <th scope="col" className={classeCabecalho}>
              Validade
            </th>
            <th scope="col" className={classeCabecalho}>
              Situação
            </th>
            <th scope="col" className={classeCabecalho}>
              Órgão
            </th>
            <th scope="col" className={cn(classeCabecalho, 'hidden 2xl:table-cell')}>
              Unidade
            </th>
            <th scope="col" className={cn(classeCabecalho, 'text-right')}>
              Condicionantes
            </th>
            <th
              scope="col"
              className={cn(classeCabecalho, 'text-right')}
              aria-sort={ordemDecrescente ? 'descending' : 'ascending'}
            >
              <button
                type="button"
                onClick={aoInverterOrdem}
                className="inline-flex cursor-pointer items-center gap-(--e-1) rounded-(--raio-mini) rotulo-maiusculo text-(--tinta) hover:text-(--tinta)"
              >
                Criada em
                <Icone nome={ordemDecrescente ? 'chevron-down' : 'chevron-up'} tamanho={12} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((licenca) => (
            <tr key={licenca.id} className="transicao-estado hover:bg-(--toque)">
              <td className={classeCelula}>
                <LicencaComSelo licenca={licenca} mudancas={mudancasDeNorma.get(licenca.id)} />
              </td>
              <td className={cn(classeCelula, 'numero')}>
                {licenca.validade ? (
                  formatarDataCivil(licenca.validade)
                ) : (
                  <span className="text-(--tinta-3)">—</span>
                )}
              </td>
              <td className={classeCelula}>
                <Situacao licenca={licenca} hoje={hoje} podeEditar={podeEditar} />
              </td>
              <td className={cn(classeCelula, 'max-w-[200px] truncate')}>
                {licenca.orgao ?? <span className="text-(--tinta-2)">Não informado</span>}
              </td>
              <td className={cn(classeCelula, 'hidden max-w-[200px] truncate 2xl:table-cell')}>
                {licenca.unidadeNome}
              </td>
              <td className={cn(classeCelula, 'text-right')}>
                <Condicionantes licenca={licenca} />
              </td>
              <td className={cn(classeCelula, 'text-right text-(--tinta-2) numero')}>
                {formatarInstanteComoData(licenca.criadoEm, fuso)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
