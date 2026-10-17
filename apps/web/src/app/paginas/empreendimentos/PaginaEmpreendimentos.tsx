import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_EMPREENDIMENTOS,
  listarEmpreendimentos,
  type EmpreendimentoNaLista,
} from '@/lib/api/empreendimentos'

import { DialogoEmpreendimento } from './DialogoEmpreendimento'
import { SiglaEmpreendimento } from './SiglaEmpreendimento'

const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150)'
const classeCelula = 'h-10 border-b px-(--space-100) align-middle first:pl-(--space-150)'

function Cliente({ nome }: { nome: string | null }) {
  return nome ? <span>{nome}</span> : <span className="text-(--text-subtle)">Não informado</span>
}

// Licenças, próxima validade e situação chegam com o instrumento (épico 4). Hoje nenhum
// empreendimento tem licença, e é isso que a tela mostra.
function ProximaValidade({ item }: { item: EmpreendimentoNaLista }) {
  return item.licencas === 0 ? <span className="text-(--text-subtle)">Nenhuma licença</span> : null
}

function Situacao({ item }: { item: EmpreendimentoNaLista }) {
  return item.licencas === 0 ? <Selo>Sem licença</Selo> : null
}

/**
 * /empreendimentos (Protótipo 08; EMP-01). Carteira da consultoria com busca por empreendimento
 * ou cliente, paginada no servidor. Qualquer membro ativo cadastra.
 */
export function PaginaEmpreendimentos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const [novoAberto, setNovoAberto] = useState(false)

  const consulta = useInfiniteQuery({
    queryKey: ['empreendimentos', cid, buscaAdiada],
    queryFn: ({ pageParam }) => listarEmpreendimentos(cid, buscaAdiada, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_EMPREENDIMENTOS && carregados < ultima.total
        ? todas.length
        : undefined
    },
    placeholderData: (anterior) => anterior,
  })

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0
  const filtrando = buscaAdiada !== ''

  function abrir(id: string) {
    void navegar(`/empreendimentos/${id}`)
  }

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando empreendimentos" linhas={5} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar os empreendimentos."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0 && !filtrando) {
    conteudo = (
      <EstadoVazio
        icone="briefcase"
        titulo="Nenhum empreendimento ainda"
        descricao="Cadastre os empreendimentos dos seus clientes para começar a registrar as licenças."
        acaoPrincipal={
          <Botao
            aparencia="primario"
            iconeAntes="plus"
            onClick={() => {
              setNovoAberto(true)
            }}
          >
            Novo empreendimento
          </Botao>
        }
      />
    )
  } else if (itens.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="search"
        titulo="Nenhum empreendimento encontrado"
        descricao={`Nada com “${buscaAdiada}”. Confira a grafia ou busque pelo cliente.`}
      />
    )
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--space-100)">
        <div className="hidden overflow-x-auto rounded-(--radius) border bg-(--surface) md:block">
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Empreendimento
                </th>
                <th scope="col" className={classeCabecalho}>
                  Cliente contratante
                </th>
                <th scope="col" className={classeCabecalho}>
                  Unidades
                </th>
                <th scope="col" className={classeCabecalho}>
                  Licenças
                </th>
                <th scope="col" className={classeCabecalho}>
                  Próxima validade
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transicao-estado hover:bg-(--surface-hover)"
                  onClick={() => {
                    abrir(item.id)
                  }}
                >
                  <td className={classeCelula}>
                    <span className="flex items-center gap-(--space-100)">
                      <SiglaEmpreendimento nome={item.nome} />
                      <Link
                        to={`/empreendimentos/${item.id}`}
                        className="corpo-medio text-(--text) hover:text-(--text)"
                        onClick={(evento) => {
                          evento.stopPropagation()
                        }}
                      >
                        {item.nome}
                      </Link>
                    </span>
                  </td>
                  <td className={classeCelula}>
                    <Cliente nome={item.clienteNome} />
                  </td>
                  <td className={classeCelula}>{item.unidades}</td>
                  <td className={classeCelula}>{item.licencas}</td>
                  <td className={classeCelula}>
                    <ProximaValidade item={item} />
                  </td>
                  <td className={classeCelula}>
                    <Situacao item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-(--space-150) py-(--space-100) text-xs text-(--text-subtle)">
            {filtrando
              ? `${String(total)} ${total === 1 ? 'empreendimento encontrado' : 'empreendimentos encontrados'}`
              : `${String(total)} ${total === 1 ? 'empreendimento' : 'empreendimentos'}`}
          </p>
        </div>

        <ul className="flex flex-col gap-(--space-100) md:hidden" aria-label="Empreendimentos">
          {itens.map((item) => (
            <li key={item.id}>
              <Link
                to={`/empreendimentos/${item.id}`}
                className="flex flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-150) text-(--text) no-underline hover:bg-(--surface-hover) hover:text-(--text) hover:no-underline"
              >
                <span className="flex items-center justify-between gap-(--space-100)">
                  <Situacao item={item} />
                  <Icone nome="chevron-right" className="text-(--icon)" />
                </span>
                <span className="flex items-center gap-(--space-100)">
                  <SiglaEmpreendimento nome={item.nome} />
                  <span className="truncate corpo-medio">{item.nome}</span>
                </span>
                <span className="text-xs text-(--text-subtle)">
                  {item.clienteNome ?? 'Cliente não informado'} ·{' '}
                  {item.unidades === 1 ? '1 unidade' : `${String(item.unidades)} unidades`} ·{' '}
                  {item.licencas === 1 ? '1 licença' : `${String(item.licencas)} licenças`}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais empreendimentos
          </Botao>
        ) : null}
        <p className="text-xs text-(--text-subtle)">
          Situação mostra a licença mais urgente do empreendimento.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-200)">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Pagina titulo="Empreendimentos">{null}</Pagina>
        <div className="flex flex-wrap items-center gap-(--space-100)">
          <label className="relative flex items-center">
            <span className="sr-only">Buscar empreendimentos</span>
            <Icone
              nome="search"
              className="pointer-events-none absolute left-(--space-100) text-(--icon-subtle)"
            />
            <input
              type="search"
              value={busca}
              placeholder="Buscar empreendimento ou cliente"
              onChange={(evento) => {
                setBusca(evento.target.value)
              }}
              className="h-(--size-control) w-[280px] max-w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) pr-(--space-100) pl-(--space-400) corpo text-(--text) outline-none transicao-estado focus:border-(--border-focus) focus:bg-(--surface-input-focus)"
            />
          </label>
          <Botao
            aparencia="primario"
            iconeAntes="plus"
            onClick={() => {
              setNovoAberto(true)
            }}
          >
            Novo empreendimento
          </Botao>
        </div>
      </div>

      {conteudo}

      <DialogoEmpreendimento
        aberto={novoAberto}
        aoMudar={setNovoAberto}
        consultoriaId={cid}
        aoSalvar={(id) => {
          void navegar(`/empreendimentos/${id}`, {
            state: { aviso: 'Empreendimento criado.' },
          })
        }}
      />
    </div>
  )
}
