// /configuracoes/importar (ADR-0043): histórico das importações da consultoria, na aba Importar de
// Configurações. Só a Gestão importa (o banco recusa a Equipe; aqui a Equipe vê "sem permissão").
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { listarImportacoes, TAMANHO_PAGINA_IMPORTACOES } from '@/lib/api/importacao'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao } from '@/lib/erros'

import { Paginacao, SeloDaImportacao } from './componentes'
import { ROTULO_DA_ENTIDADE } from './pecas'

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

export function PaginaImportacoes() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao descricao="Só a gestão da consultoria importa planilhas." />
      </PaginaDeConfiguracoes>
    )
  }
  return <HistoricoDeImportacoes />
}

function HistoricoDeImportacoes() {
  const { atual } = useConsultoria()
  const navegar = useNavigate()
  const [pagina, setPagina] = useState(0)
  const consulta = useQuery({
    queryKey: ['importacoes', atual.consultoriaId, pagina],
    queryFn: () => listarImportacoes(atual.consultoriaId, pagina),
    placeholderData: keepPreviousData,
  })

  const importar = (
    <Botao
      aparencia="primario"
      iconeAntes="upload"
      onClick={() => {
        void navegar('/configuracoes/importar/nova')
      }}
    >
      Importar planilha
    </Botao>
  )
  const vazio = consulta.isSuccess && consulta.data.total === 0

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando importações" />
  } else if (consulta.isError) {
    conteudo = ehSemPermissao(consulta.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />
    )
  } else if (consulta.data.itens.length === 0) {
    conteudo = <EstadoVazio icone="upload" titulo="Nenhuma importação" acaoPrincipal={importar} />
  } else {
    conteudo = (
      <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        <div className="max-h-[calc(100dvh-300px)] overflow-auto">
          <table className="w-full border-collapse corpo">
            <caption className="sr-only">Importações</caption>
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Arquivo
                </th>
                <th scope="col" className={`${classeCabecalho} max-md:hidden`}>
                  Tipo
                </th>
                <th scope="col" className={`${classeCabecalho} text-right max-md:hidden`}>
                  Linhas
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={`${classeCabecalho} max-md:hidden`}>
                  Data
                </th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.itens.map((item) => {
                const quando = formatarInstanteComoData(item.criadoEm, atual.fuso)
                return (
                  <tr key={item.id} className="transicao-estado hover:bg-(--toque)">
                    <td className={`${classeCelula} max-md:py-(--e-2)`}>
                      <Link
                        to={`/configuracoes/importar/${item.id}`}
                        className="inline-flex max-w-[360px] items-center gap-(--e-2) corpo-medio text-(--tinta) max-md:min-h-(--controle-toque)"
                      >
                        <Icone nome="file-text" className="shrink-0 text-(--tinta-3)" />
                        <span className="truncate">{item.nomeArquivo}</span>
                      </Link>
                      <span className="block text-xs text-(--tinta-2) md:hidden">
                        {ROTULO_DA_ENTIDADE[item.entidade]} ·{' '}
                        <span className="numero">{item.totalLinhas}</span> linhas ·{' '}
                        <span className="numero">{quando}</span>
                      </span>
                    </td>
                    <td className={`${classeCelula} max-md:hidden`}>
                      {ROTULO_DA_ENTIDADE[item.entidade]}
                    </td>
                    <td className={`${classeCelula} text-right numero max-md:hidden`}>
                      {item.totalLinhas.toLocaleString('pt-BR')}
                    </td>
                    <td className={classeCelula}>
                      <SeloDaImportacao situacao={item.situacao} />
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap numero max-md:hidden`}>
                      {quando}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Paginacao
          pagina={pagina}
          tamanho={TAMANHO_PAGINA_IMPORTACOES}
          total={consulta.data.total}
          aoMudar={setPagina}
        />
      </div>
    )
  }

  return (
    // No vazio, a ação fica no próprio estado vazio (uma só na tela).
    <PaginaDeConfiguracoes acao={vazio ? undefined : importar}>{conteudo}</PaginaDeConfiguracoes>
  )
}
