// Resíduos, fase 1 (ADR-0028): aba "MTRs e CDFs" de /residuos. MTR e CDF são registrados por
// empreendimento; aqui a pessoa escolhe o empreendimento e vai para a lista dele.

import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { TAMANHO_PAGINA_EMPREENDIMENTOS, listarEmpreendimentos } from '@/lib/api/empreendimentos'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { AbasResiduos } from './LayoutResiduos'
import {
  RodapeDoQuadro,
  classeCabecalho,
  classeCelula,
  classeLinha,
  classePainel,
  classeRegiao,
} from './quadro'
import { caminhoDosMtrs } from './registro/comum'

export function PaginaResiduosPorEmpreendimento() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [texto, setTexto] = useState('')
  const busca = useDeferredValue(texto.trim())

  const empreendimentos = useInfiniteQuery({
    queryKey: ['empreendimentos', cid, busca, 'residuos'],
    queryFn: ({ pageParam }) => listarEmpreendimentos(cid, busca, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) =>
      ultima.itens.length === TAMANHO_PAGINA_EMPREENDIMENTOS &&
      todas.length * TAMANHO_PAGINA_EMPREENDIMENTOS < ultima.total
        ? todas.length
        : undefined,
  })
  const lista = empreendimentos.data?.pages.flatMap((p) => p.itens) ?? []
  const total = empreendimentos.data?.pages[0]?.total ?? lista.length

  let conteudo
  if (empreendimentos.isPending) {
    conteudo = <Carregando rotulo="Carregando empreendimentos" linhas={4} className="border-0" />
  } else if (empreendimentos.isError) {
    conteudo = ehSemPermissao(empreendimentos.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar os empreendimentos."
        aoTentarDeNovo={() => void empreendimentos.refetch()}
        className="m-(--e-3)"
      />
    )
  } else if (lista.length === 0) {
    conteudo =
      busca !== '' ? (
        <EstadoVazio
          icone="search"
          titulo="Nenhum empreendimento com esta busca"
          acaoPrincipal={
            <Botao
              onClick={() => {
                setTexto('')
              }}
            >
              Limpar busca
            </Botao>
          }
        />
      ) : (
        <EstadoVazio
          icone="briefcase"
          titulo="Nenhum empreendimento cadastrado"
          acaoPrincipal={
            <Botao asChild>
              <Link to="/empreendimentos">Ir para Empreendimentos</Link>
            </Botao>
          }
        />
      )
  } else {
    conteudo = (
      <div className={classeRegiao}>
        <table className="w-full border-collapse corpo">
          <caption className="sr-only">Empreendimentos</caption>
          <thead className="sticky top-0 z-10 bg-(--folha)">
            <tr>
              <th scope="col" className={classeCabecalho}>
                Empreendimento
              </th>
              <th scope="col" className={cn(classeCabecalho, 'hidden md:table-cell')}>
                Cliente contratante
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className={classeLinha}>
                <td className={cn(classeCelula, 'max-w-[360px] max-md:py-(--e-2)')}>
                  <Link
                    to={caminhoDosMtrs(e.id)}
                    className="block truncate corpo-medio text-(--tinta) hover:text-(--tinta) max-md:min-h-(--controle-toque) max-md:content-center"
                  >
                    {e.nome}
                  </Link>
                  {e.clienteNome ? (
                    <span className="block truncate text-xs text-(--tinta-2) md:hidden">
                      {e.clienteNome}
                    </span>
                  ) : null}
                </td>
                <td className={cn(classeCelula, 'hidden max-w-[320px] truncate md:table-cell')}>
                  {e.clienteNome ?? <span className="text-(--tinta-2)">Não informado</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <Pagina titulo="MTRs e CDFs">
      <AbasResiduos />
      <section aria-label="Empreendimentos" className={classePainel}>
        <div className="border-b px-(--e-4) py-(--e-3)">
          <label className="relative block w-full sm:w-[320px]">
            <span className="sr-only">Buscar empreendimento</span>
            <Icone
              nome="search"
              className="pointer-events-none absolute top-1/2 left-(--e-3) -translate-y-1/2 text-(--tinta-3)"
            />
            <input
              type="search"
              value={texto}
              placeholder="Buscar empreendimento"
              onChange={(evento) => {
                setTexto(evento.target.value)
              }}
              className={cn(classeCampo, 'pl-(--e-10)')}
            />
          </label>
        </div>
        {conteudo}
        {lista.length > 0 ? (
          <RodapeDoQuadro texto={`${String(lista.length)} de ${String(total)}`}>
            {empreendimentos.hasNextPage ? (
              <Botao
                tamanho="compacto"
                disabled={empreendimentos.isFetchingNextPage}
                onClick={() => void empreendimentos.fetchNextPage()}
              >
                Mostrar mais empreendimentos
              </Botao>
            ) : null}
          </RodapeDoQuadro>
        ) : null}
      </section>
    </Pagina>
  )
}
