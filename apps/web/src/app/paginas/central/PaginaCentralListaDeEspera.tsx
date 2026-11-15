import { formatarContato, linkDoContato } from '@gestao-ambiental/domain'
import { useInfiniteQuery } from '@tanstack/react-query'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { TAMANHO_PAGINA_CENTRAL } from '@/lib/api/central'
import { listarListaDeEspera } from '@/lib/api/lista-de-espera'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCelula, plural } from './comum'

const FUSO_DA_CENTRAL = 'America/Sao_Paulo'

const ROTULO_DO_TIPO = { email: 'E-mail', whatsapp: 'WhatsApp' } as const

/**
 * /admin/lista-de-espera (ADR-0032): quem se cadastrou pelo site, mais recentes primeiro, com o
 * link para responder por e-mail ou WhatsApp. Paginada (50).
 */
export function PaginaCentralListaDeEspera() {
  const consulta = useInfiniteQuery({
    queryKey: ['central', 'lista-de-espera'],
    queryFn: ({ pageParam }) => listarListaDeEspera(pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_CENTRAL && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando a lista de espera" linhas={6} />
  } else if (consulta.isError && ehDoisFatoresNecessarios(consulta.error)) {
    conteudo = <RelerDoisFatores />
  } else if (consulta.isError && ehSemPermissao(consulta.error)) {
    conteudo = <SemPermissao descricao={null} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar a lista de espera."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0) {
    conteudo = <EstadoVazio icone="users" titulo="Ninguém na lista de espera ainda" />
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--space-100)">
        <div className="overflow-x-auto rounded-(--radius-large) border bg-(--surface) shadow-cartao">
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Nome
                </th>
                <th scope="col" className={classeCabecalho}>
                  Contato
                </th>
                <th scope="col" className={classeCabecalho}>
                  Cadastro
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="last:[&>td]:border-b-0">
                  <td className={`${classeCelula} corpo-medio text-(--text)`}>{item.nome}</td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    <span className="rotulo mr-(--space-075)">
                      {ROTULO_DO_TIPO[item.contato.tipo]}
                    </span>
                    <a href={linkDoContato(item.contato)} target="_blank" rel="noopener noreferrer">
                      {formatarContato(item.contato)}
                    </a>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    {formatarInstanteComHora(item.criadaEm, FUSO_DA_CENTRAL)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-(--space-150) py-(--space-100) text-xs text-(--text-subtle)">
            {plural(total, 'pessoa', 'pessoas')}
          </p>
        </div>
        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-300)">
      <Pagina titulo="Lista de espera">{null}</Pagina>
      {conteudo}
    </div>
  )
}
