// /configuracoes/modelos (ADR-0036, fatia 1): modelos de documento da consultoria. Fica fora do menu
// do dia a dia (entra pelo menu da conta). Só a Gestão cria e edita; a Equipe usa os modelos ao
// gerar o relatório.
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { listarModelosDeDocumento } from '@/lib/api/modelos-de-documento'
import { formatarInstanteComoData } from '@/lib/datas'

const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150) last:pr-(--space-150)'
const classeCelula =
  'h-11 border-b px-(--space-100) align-middle first:pl-(--space-150) last:pr-(--space-150)'

export function PaginaModelos() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Modelos de documento">
        <SemPermissao />
      </Pagina>
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
      onClick={() => {
        void navegar('/configuracoes/modelos/novo')
      }}
    >
      <Icone nome="plus" />
      Novo modelo
    </Botao>
  )

  return (
    <Pagina titulo="Modelos de documento">
      {modelos.isPending ? (
        <Carregando rotulo="Carregando modelos" />
      ) : modelos.isError ? (
        <EstadoErro aoTentarDeNovo={() => void modelos.refetch()} />
      ) : modelos.data.length === 0 ? (
        <EstadoVazio icone="file-text" titulo="Nenhum modelo" acaoPrincipal={novo} />
      ) : (
        <div className="flex flex-col gap-(--space-200)">
          <div className="flex justify-end">{novo}</div>
          <div className="overflow-x-auto rounded-(--radius) border bg-(--surface)">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr>
                  <th className={classeCabecalho}>Nome</th>
                  <th className={classeCabecalho}>Alterado em</th>
                  <th className={classeCabecalho}>Por</th>
                </tr>
              </thead>
              <tbody>
                {modelos.data.map((modelo) => (
                  <tr key={modelo.id} className="hover:bg-(--surface-hover)">
                    <td className={classeCelula}>
                      <Link to={`/configuracoes/modelos/${modelo.id}`} className="corpo-medio">
                        {modelo.nome}
                      </Link>
                    </td>
                    <td className={`${classeCelula} tabular-nums`}>
                      {formatarInstanteComoData(modelo.atualizadoEm, atual.fuso)}
                    </td>
                    <td className={classeCelula}>{modelo.atualizadoPorNome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Pagina>
  )
}
