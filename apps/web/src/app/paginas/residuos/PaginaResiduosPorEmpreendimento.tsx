// Resíduos, fase 1 (ADR-0028): aba "MTRs e CDFs" de /residuos. MTR e CDF são registrados por
// empreendimento; aqui a pessoa escolhe o empreendimento e vai para a lista dele.

import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { TAMANHO_PAGINA_EMPREENDIMENTOS, listarEmpreendimentos } from '@/lib/api/empreendimentos'
import { ehSemPermissao } from '@/lib/erros'

import { caminhoDosMtrs, classeControle } from './registro/comum'

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

  let conteudo
  if (empreendimentos.isPending) {
    conteudo = <Carregando rotulo="Carregando empreendimentos" linhas={3} className="border-0" />
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
      <ul className="flex flex-col">
        {lista.map((e) => (
          <li key={e.id} className="border-b last:border-b-0">
            <Link
              to={caminhoDosMtrs(e.id)}
              className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-05) px-(--e-3) py-(--e-2) text-(--tinta) no-underline transicao-estado hover:bg-(--toque)"
            >
              <span className="min-w-0 flex-1 corpo-medio">{e.nome}</span>
              {e.clienteNome ? <span className="corpo">{e.clienteNome}</span> : null}
              <Icone nome="chevron-right" className="shrink-0 text-(--icone-2)" />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Pagina titulo="MTRs e CDFs">
      <label className="flex w-full flex-col gap-(--e-1) sm:w-[320px]">
        <span className="rotulo">Buscar empreendimento</span>
        <input
          type="search"
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value)
          }}
          className={classeControle}
        />
      </label>
      <section
        aria-label="Empreendimentos"
        className="flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha) shadow-cartao"
      >
        {conteudo}
        {empreendimentos.hasNextPage ? (
          <div className="border-t px-(--e-3) py-(--e-2)">
            <Botao
              tamanho="compacto"
              disabled={empreendimentos.isFetchingNextPage}
              onClick={() => void empreendimentos.fetchNextPage()}
            >
              Mostrar mais empreendimentos
            </Botao>
          </div>
        ) : null}
      </section>
    </Pagina>
  )
}
