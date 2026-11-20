import {
  formatarDataCivil,
  hojeNoFuso,
  proximaValidade,
  situacaoMaisUrgente,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { SeloSituacaoLicenca } from '@/app/paginas/licenca/SeloSituacaoLicenca'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import {
  TAMANHO_PAGINA_EMPREENDIMENTOS,
  listarEmpreendimentos,
  type EmpreendimentoNaLista,
} from '@/lib/api/empreendimentos'
import { cn } from '@/lib/utils'

import { DialogoEmpreendimento } from './DialogoEmpreendimento'

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

/** Validade mais próxima com a sigla da licença dona dela (ex.: "04/04/2027 LAO"). */
function ProximaValidade({ item }: { item: EmpreendimentoNaLista }) {
  if (item.licencas.length === 0) return <span className="text-(--tinta-3)">—</span>
  const validade = proximaValidade(item.licencas)
  if (!validade) return <span className="text-(--tinta-2)">Não informada</span>
  const sigla = item.licencas.find((l) => l.situacao === 'ativo' && l.validade === validade)?.sigla
  return (
    <span className="inline-flex items-baseline gap-(--e-2) whitespace-nowrap">
      <span className="corpo-medio numero text-(--tinta)">{formatarDataCivil(validade)}</span>
      {sigla ? <span className="text-xs text-(--tinta-2)">{sigla}</span> : null}
    </span>
  )
}

function Situacao({ item, hoje }: { item: EmpreendimentoNaLista; hoje: DataCivil }) {
  return <SeloSituacaoLicenca situacao={situacaoMaisUrgente(item.licencas, hoje)} />
}

function contar(n: number, um: string, varios: string): string {
  return `${String(n)} ${n === 1 ? um : varios}`
}

/**
 * /empreendimentos (Protótipo 08; EMP-01). Carteira da consultoria com busca por empreendimento
 * ou cliente, paginada no servidor. O que se escaneia é a próxima validade e a situação mais
 * urgente. Qualquer membro ativo cadastra.
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
  const hoje = hojeNoFuso(new Date(), atual.fuso)

  function abrir(id: string) {
    void navegar(`/empreendimentos/${id}`)
  }

  const botaoNovo = (
    <Botao
      aparencia="primario"
      iconeAntes="plus"
      onClick={() => {
        setNovoAberto(true)
      }}
    >
      Novo empreendimento
    </Botao>
  )

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
        acaoPrincipal={botaoNovo}
      />
    )
  } else if (itens.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="search"
        titulo="Nenhum empreendimento encontrado"
        descricao={`Nada com “${buscaAdiada}”.`}
        acaoPrincipal={
          <Botao
            onClick={() => {
              setBusca('')
            }}
          >
            Limpar busca
          </Botao>
        }
      />
    )
  } else {
    conteudo = (
      <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Empreendimento
                </th>
                <th scope="col" className={classeCabecalho}>
                  Próxima validade
                </th>
                <th
                  scope="col"
                  className={classeCabecalho}
                  title="A licença mais urgente do empreendimento"
                >
                  Situação
                </th>
                <th scope="col" className={classeCabecalho}>
                  Cliente contratante
                </th>
                <th scope="col" className={cn(classeCabecalho, 'text-right')}>
                  Licenças
                </th>
                <th scope="col" className={cn(classeCabecalho, 'text-right')}>
                  Unidades
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transicao-estado hover:bg-(--toque)"
                  onClick={() => {
                    abrir(item.id)
                  }}
                >
                  <td className={cn(classeCelula, 'max-w-[320px]')}>
                    <Link
                      to={`/empreendimentos/${item.id}`}
                      className="block truncate corpo-medio text-(--tinta) hover:text-(--tinta)"
                      onClick={(evento) => {
                        evento.stopPropagation()
                      }}
                    >
                      {item.nome}
                    </Link>
                  </td>
                  <td className={classeCelula}>
                    <ProximaValidade item={item} />
                  </td>
                  <td className={classeCelula}>
                    <Situacao item={item} hoje={hoje} />
                  </td>
                  <td className={cn(classeCelula, 'max-w-[280px] truncate')}>
                    {item.clienteNome ?? <span className="text-(--tinta-2)">Não informado</span>}
                  </td>
                  <td className={cn(classeCelula, 'text-right numero')}>{item.licencas.length}</td>
                  <td className={cn(classeCelula, 'text-right numero')}>{item.unidades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="flex flex-col md:hidden" aria-label="Empreendimentos">
          {itens.map((item) => (
            <li key={item.id} className="border-b border-(--regra-leve)">
              <Link
                to={`/empreendimentos/${item.id}`}
                className="flex min-h-(--controle-toque) items-center gap-(--e-3) px-(--e-4) py-(--e-3) text-(--tinta) no-underline hover:bg-(--toque) hover:text-(--tinta) hover:no-underline"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-(--e-05)">
                  <span className="truncate corpo-medio">{item.nome}</span>
                  <span className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-05)">
                    <ProximaValidade item={item} />
                    <Situacao item={item} hoje={hoje} />
                  </span>
                  <span className="truncate text-xs text-(--tinta-2)">
                    {item.clienteNome ?? 'Cliente não informado'} ·{' '}
                    {contar(item.licencas.length, 'licença', 'licenças')}
                  </span>
                </span>
                <Icone nome="chevron-right" className="text-(--icone-2)" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-(--e-2) px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
            {filtrando
              ? contar(total, 'empreendimento encontrado', 'empreendimentos encontrados')
              : contar(total, 'empreendimento', 'empreendimentos')}
          </span>
          {consulta.hasNextPage ? (
            <Botao
              tamanho="compacto"
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais
            </Botao>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Pagina titulo="Empreendimentos" acao={botaoNovo}>
      <div className="flex flex-col gap-(--e-3)">
        <label className="relative flex w-full items-center md:w-[320px]">
          <span className="sr-only">Buscar empreendimentos</span>
          <Icone
            nome="search"
            className="pointer-events-none absolute left-(--e-3) text-(--icone-2)"
          />
          <input
            type="search"
            value={busca}
            placeholder="Empreendimento ou cliente"
            onChange={(evento) => {
              setBusca(evento.target.value)
            }}
            className={cn(classeCampo, 'pl-(--e-8)')}
          />
        </label>
        {conteudo}
      </div>

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
    </Pagina>
  )
}
