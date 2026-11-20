import { formatarDataCivil, situacaoDaLicenca, type DataCivil } from '@gestao-ambiental/domain'
import { Link } from 'react-router'

import { ProgressoCadastro } from '@/app/paginas/licenca/ProgressoCadastro'
import { PASSOS } from '@/app/paginas/licenca/passos'
import { SeloSituacaoLicenca } from '@/app/paginas/licenca/SeloSituacaoLicenca'
import { EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import type { LicencaNaLista } from '@/lib/api/licencas'
import { formatarInstanteComoData } from '@/lib/datas'

const classeCabecalho =
  'h-10 border-b px-(--e-2) text-left rotulo whitespace-nowrap first:pl-(--e-3)'
const classeCelula = 'h-10 border-b px-(--e-2) align-middle first:pl-(--e-3)'

function titulo(licenca: LicencaNaLista): string {
  const sigla = licenca.sigla ?? 'Licença'
  return licenca.numero ? `${sigla} ${licenca.numero}` : `${sigla} sem número`
}

/**
 * Licenças do empreendimento (Protótipo 09, onda 1): da mais recente para a mais antiga, com
 * validade e situação calculada. Rascunho mostra a linha de progresso do cadastro e, para a
 * Gestão, "Continuar" no passo em que parou.
 */
export function TabelaLicencas({
  itens,
  totalSemFiltro,
  hoje,
  fuso,
  podeEditar,
  aoLimparFiltros,
  ordemDecrescente,
  aoInverterOrdem,
}: {
  itens: readonly LicencaNaLista[]
  totalSemFiltro: number
  hoje: DataCivil
  fuso: string
  podeEditar: boolean
  aoLimparFiltros: () => void
  ordemDecrescente: boolean
  aoInverterOrdem: () => void
}) {
  if (totalSemFiltro === 0) {
    return (
      <EstadoVazio
        icone="file-text"
        titulo="Nenhuma licença cadastrada"
        descricao="As licenças deste empreendimento aparecem aqui, com validade e situação."
      />
    )
  }
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone="search"
        titulo="Nada com estes filtros"
        descricao="Mude a busca ou a unidade."
        acaoPrincipal={<Botao onClick={aoLimparFiltros}>Limpar filtros</Botao>}
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse corpo">
        <thead>
          <tr>
            <th scope="col" className={classeCabecalho}>
              Item
            </th>
            <th scope="col" className={classeCabecalho}>
              Tipo
            </th>
            <th scope="col" className={classeCabecalho}>
              Órgão
            </th>
            <th scope="col" className={classeCabecalho}>
              Unidade
            </th>
            <th scope="col" className={classeCabecalho}>
              Data
            </th>
            <th scope="col" className={classeCabecalho}>
              Situação
            </th>
            <th
              scope="col"
              className={classeCabecalho}
              aria-sort={ordemDecrescente ? 'descending' : 'ascending'}
            >
              <button
                type="button"
                onClick={aoInverterOrdem}
                className="inline-flex cursor-pointer items-center gap-(--e-1) rotulo"
              >
                Criado em
                <Icone nome={ordemDecrescente ? 'chevron-down' : 'chevron-up'} tamanho={12} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((licenca) => {
            const rascunho = licenca.situacao === 'rascunho'
            const passo = licenca.passoCadastro ?? 1
            return (
              <tr key={licenca.id}>
                <td className={classeCelula}>
                  <span className="flex items-center gap-(--e-2)">
                    <Icone nome="file-check" className="text-(--icone)" />
                    <span className={rascunho ? 'text-(--tinta-2)' : 'corpo-medio'}>
                      {titulo(licenca)}
                    </span>
                    <span className="text-xs text-(--tinta-2)">
                      {rascunho
                        ? 'cadastro incompleto'
                        : licenca.condicionantes === 1
                          ? '1 condicionante'
                          : `${String(licenca.condicionantes)} condicionantes`}
                    </span>
                  </span>
                </td>
                <td className={classeCelula}>
                  {licenca.tipoNome ? (
                    <Selo title={licenca.tipoNome}>{licenca.tipoNome}</Selo>
                  ) : (
                    <span className="text-(--tinta-2)">—</span>
                  )}
                </td>
                <td className={classeCelula}>
                  {licenca.orgao ?? <span className="text-(--tinta-2)">Não informado</span>}
                </td>
                <td className={classeCelula}>{licenca.unidadeNome}</td>
                <td className={`${classeCelula} whitespace-nowrap`}>
                  <span className="text-xs text-(--tinta-2)">Validade </span>
                  {licenca.validade ? formatarDataCivil(licenca.validade) : '—'}
                </td>
                <td className={`${classeCelula} whitespace-nowrap`}>
                  <span className="flex items-center gap-(--e-3)">
                    {rascunho ? (
                      <ProgressoCadastro passo={passo} />
                    ) : (
                      <SeloSituacaoLicenca situacao={situacaoDaLicenca(licenca, hoje)} />
                    )}
                    {rascunho && podeEditar ? (
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
                </td>
                <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2)`}>
                  {formatarInstanteComoData(licenca.criadoEm, fuso)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
