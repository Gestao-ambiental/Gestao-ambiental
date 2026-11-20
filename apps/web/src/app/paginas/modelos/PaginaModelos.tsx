// /configuracoes/modelos (ADR-0036, fatia 1): modelos de documento da consultoria, na aba Modelos de
// Configurações (ADR-0041). Só a Gestão cria e edita; a Equipe usa os modelos ao gerar o relatório.
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { listarModelosDeDocumento } from '@/lib/api/modelos-de-documento'
import { formatarInstanteComoData } from '@/lib/datas'

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

export function PaginaModelos() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao />
      </PaginaDeConfiguracoes>
    )
  }
  return <ListaDeModelos />
}

function ListaDeModelos() {
  const { atual } = useConsultoria()
  const navegar = useNavigate()
  const modelos = useQuery({
    queryKey: ['modelos-de-documento', atual.consultoriaId],
    queryFn: () => listarModelosDeDocumento(atual.consultoriaId),
  })

  const novo = (
    <Botao
      aparencia="primario"
      iconeAntes="plus"
      onClick={() => {
        void navegar('/configuracoes/modelos/novo')
      }}
    >
      Novo modelo
    </Botao>
  )
  const total = modelos.data?.length ?? 0
  const vazio = modelos.isSuccess && total === 0

  return (
    <PaginaDeConfiguracoes
      // No vazio, a ação fica no próprio estado vazio (uma só na tela).
      acao={vazio ? undefined : novo}
    >
      {modelos.isPending ? (
        <Carregando rotulo="Carregando modelos" />
      ) : modelos.isError ? (
        <EstadoErro aoTentarDeNovo={() => void modelos.refetch()} />
      ) : modelos.data.length === 0 ? (
        <EstadoVazio icone="file-text" titulo="Nenhum modelo" acaoPrincipal={novo} />
      ) : (
        // Um quadro só: no celular, data e autor descem para baixo do nome e as colunas somem.
        <div className="max-h-[calc(100dvh-280px)] overflow-auto rounded-(--raio-painel) border bg-(--folha)">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Nome
                </th>
                <th scope="col" className={`${classeCabecalho} w-[160px] max-md:hidden`}>
                  Alterado em
                </th>
                <th scope="col" className={`${classeCabecalho} w-[240px] max-md:hidden`}>
                  Por
                </th>
              </tr>
            </thead>
            <tbody>
              {modelos.data.map((modelo) => {
                const quando = formatarInstanteComoData(modelo.atualizadoEm, atual.fuso)
                return (
                  <tr key={modelo.id} className="transicao-estado hover:bg-(--toque)">
                    <td className={`${classeCelula} max-md:py-(--e-2)`}>
                      <Link
                        to={`/configuracoes/modelos/${modelo.id}`}
                        className="inline-flex items-center gap-(--e-2) corpo-medio text-(--tinta) max-md:min-h-(--controle-toque)"
                      >
                        <Icone nome="file-doc" className="text-(--tinta-3)" />
                        {modelo.nome}
                      </Link>
                      <span className="block text-xs text-(--tinta-2) md:hidden">
                        <span className="numero">{quando}</span> · {modelo.atualizadoPorNome}
                      </span>
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap numero max-md:hidden`}>
                      {quando}
                    </td>
                    <td className={`${classeCelula} text-(--tinta-2) max-md:hidden`}>
                      {modelo.atualizadoPorNome}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PaginaDeConfiguracoes>
  )
}
