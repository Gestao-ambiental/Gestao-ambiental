import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import type { AvisoDaCentral } from '@/app/consultoria/RequerConsultoria'

import { NOMES_PAPEL } from '@/app/papeis'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_SITUACAO_CONSULTORIA,
  TAMANHO_PAGINA_CENTRAL,
  detalharConsultoriaDaCentral,
  listarHistoricoDeSituacao,
  listarPessoasDaCentral,
  type ConsultoriaDetalhada,
  type PaginaDaCentral,
} from '@/lib/api/central'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { AcessoDeSuporteNaCentral } from './AcessoDeSuporteNaCentral'
import { DialogoMudarSituacao } from './DialogoMudarSituacao'
import { PlanoNaCentral } from './PlanoNaCentral'
import { RelerDoisFatores } from './ExigeDoisFatores'
import { UsoPorModulo } from './UsoNaCentral'
import { ValorDaConsultoria } from './ValorNaCentral'
import { TOM_DA_SITUACAO, classeCabecalho, classeCelula, plural, ultimoUsoComHora } from './comum'

function proximaPagina<T>(
  ultima: PaginaDaCentral<T>,
  todas: PaginaDaCentral<T>[],
): number | undefined {
  const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
  return ultima.itens.length === TAMANHO_PAGINA_CENTRAL && carregados < ultima.total
    ? todas.length
    : undefined
}

const classeCartao =
  'flex min-w-0 flex-col gap-(--e-1) rounded-(--raio-painel) border bg-(--folha) p-(--e-3) shadow-cartao sm:p-(--e-4)'

function Numeros({ consultoria }: { consultoria: ConsultoriaDetalhada }) {
  const numeros: [string, number][] = [
    ['Pessoas ativas', consultoria.pessoasAtivas],
    ['Orçamentos', consultoria.orcamentos],
    ['Empreendimentos', consultoria.empreendimentos],
    ['Licenças', consultoria.licencas],
  ]
  return (
    <section aria-label="Números">
      <dl className="grid grid-cols-2 gap-(--e-3) lg:grid-cols-4">
        {numeros.map(([titulo, valor]) => (
          <div key={titulo} className={classeCartao}>
            <dt className="corpo text-(--tinta-2)">{titulo}</dt>
            <dd className="titulo-tela text-(--tinta) tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Pessoas({ consultoria }: { consultoria: ConsultoriaDetalhada }) {
  const consulta = useInfiniteQuery({
    queryKey: ['central', 'pessoas', consultoria.id],
    queryFn: ({ pageParam }) => listarPessoasDaCentral(consultoria.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: proximaPagina,
  })
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0
  const agora = new Date()

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando pessoas" linhas={4} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar as pessoas."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0) {
    conteudo = <EstadoVazio icone="users" titulo="Nenhuma pessoa" />
  } else {
    const seloSituacao = (situacao: 'ativo' | 'desligado') =>
      situacao === 'ativo' ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Desligado</Selo>
    conteudo = (
      <div className="flex flex-col gap-(--e-2)">
        <div className="hidden overflow-x-auto rounded-(--raio-painel) border bg-(--folha) shadow-cartao md:block">
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Nome
                </th>
                <th scope="col" className={classeCabecalho}>
                  E-mail
                </th>
                <th scope="col" className={classeCabecalho}>
                  Papel
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={classeCabecalho}>
                  Desde
                </th>
                <th scope="col" className={classeCabecalho}>
                  Último uso
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Dias com uso em 30 dias
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((pessoa) => (
                <tr key={pessoa.membroId} className="last:[&>td]:border-b-0">
                  <td className={classeCelula}>{pessoa.nome}</td>
                  <td className={`${classeCelula} text-(--tinta-2)`}>{pessoa.email}</td>
                  <td className={classeCelula}>
                    <Selo>{NOMES_PAPEL[pessoa.papel]}</Selo>
                  </td>
                  <td className={classeCelula}>{seloSituacao(pessoa.situacao)}</td>
                  <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2)`}>
                    {formatarInstanteComoData(pessoa.criadoEm, consultoria.fuso)}
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    {ultimoUsoComHora(pessoa.ultimoUsoEm, consultoria.fuso, agora)}
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>
                    {pessoa.diasComUso30}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul
          aria-label="Pessoas"
          className="flex flex-col rounded-(--raio-painel) border bg-(--folha) shadow-cartao md:hidden"
        >
          {itens.map((pessoa) => (
            <li
              key={pessoa.membroId}
              className="flex flex-col gap-(--e-1) border-b px-(--e-3) py-(--e-2) last:border-b-0"
            >
              <span className="corpo-medio">{pessoa.nome}</span>
              <span className="truncate text-xs text-(--tinta-2)">{pessoa.email}</span>
              <span className="flex flex-wrap gap-(--e-15)">
                <Selo>{NOMES_PAPEL[pessoa.papel]}</Selo>
                {seloSituacao(pessoa.situacao)}
              </span>
              <span className="text-xs text-(--tinta)">
                Último uso: {ultimoUsoComHora(pessoa.ultimoUsoEm, consultoria.fuso, agora)} ·{' '}
                {plural(pessoa.diasComUso30, 'dia', 'dias')} com uso em 30 dias
              </span>
            </li>
          ))}
        </ul>
        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais pessoas
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-labelledby="central-pessoas" className="flex flex-col gap-(--e-2)">
      <div className="flex items-baseline gap-(--e-2)">
        <h2 id="central-pessoas" className="titulo-secao text-(--tinta)">
          Pessoas
        </h2>
        {consulta.isSuccess ? <span className="text-(--tinta-2) tabular-nums">{total}</span> : null}
      </div>
      {conteudo}
    </section>
  )
}

function Historico({ consultoria }: { consultoria: ConsultoriaDetalhada }) {
  const consulta = useInfiniteQuery({
    queryKey: ['central', 'historico', consultoria.id],
    queryFn: ({ pageParam }) => listarHistoricoDeSituacao(consultoria.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: proximaPagina,
  })
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando histórico" linhas={2} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o histórico."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0) {
    conteudo = <EstadoVazio icone="clock" titulo="Nenhuma mudança de situação" />
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--e-2)">
        <ol className="flex flex-col rounded-(--raio-painel) border bg-(--folha) shadow-cartao">
          {itens.map((mudanca) => (
            <li
              key={mudanca.id}
              className="flex flex-col gap-(--e-1) border-b px-(--e-3) py-(--e-2) last:border-b-0"
            >
              <span className="flex flex-wrap items-center gap-(--e-15)">
                <Selo tom={TOM_DA_SITUACAO[mudanca.anterior]}>
                  {ROTULO_SITUACAO_CONSULTORIA[mudanca.anterior]}
                </Selo>
                <span aria-hidden="true">→</span>
                <span className="sr-only">para</span>
                <Selo tom={TOM_DA_SITUACAO[mudanca.nova]}>
                  {ROTULO_SITUACAO_CONSULTORIA[mudanca.nova]}
                </Selo>
              </span>
              <span className="whitespace-pre-wrap break-words">{mudanca.motivo}</span>
              <span className="text-xs text-(--tinta-2)">
                {formatarInstanteComHora(mudanca.alteradaEm, consultoria.fuso)} ·{' '}
                {mudanca.alteradaPorNome}
              </span>
            </li>
          ))}
        </ol>
        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais mudanças
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-labelledby="central-historico" className="flex flex-col gap-(--e-2)">
      <h2 id="central-historico" className="titulo-secao text-(--tinta)">
        Histórico de situações
      </h2>
      {conteudo}
    </section>
  )
}

const linkVoltar = (
  <Link
    to="/admin"
    className="inline-flex items-center gap-(--e-1) self-start corpo-medio text-(--link) no-underline hover:underline"
  >
    <span aria-hidden="true">←</span> Consultorias
  </Link>
)

/**
 * /admin/consultorias/:id (ADM-01; ADR-0022): números, Gestão, pessoas (só leitura), situação com
 * motivo e o histórico. "Mudar situação" pede motivo e confirmação. Nesta versão a situação só
 * registra e mostra; não bloqueia o acesso de ninguém.
 */
export function PaginaCentralConsultoria() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [mudarAberto, setMudarAberto] = useState(false)
  // Volta do modo suporte (ADR-0025): "Você saiu do acesso de suporte." ou "O acesso … terminou."
  const { state } = useLocation() as { state: AvisoDaCentral | null }
  const [aviso, setAviso] = useState<string | null>(() =>
    typeof state?.aviso === 'string' ? state.aviso : null,
  )

  const consulta = useQuery({
    queryKey: ['central', 'consultoria', id],
    queryFn: () => detalharConsultoriaDaCentral(id),
  })

  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        {linkVoltar}
        <Carregando rotulo="Carregando a consultoria" linhas={5} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        {linkVoltar}
        {ehDoisFatoresNecessarios(consulta.error) ? (
          <RelerDoisFatores />
        ) : ehSemPermissao(consulta.error) ? (
          <SemPermissao descricao={null} />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar a consultoria."
            descricao="Verifique a conexão e tente de novo."
            aoTentarDeNovo={() => void consulta.refetch()}
          />
        )}
      </div>
    )
  }
  const consultoria = consulta.data
  if (!consultoria) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        {linkVoltar}
        <EstadoVazio icone="search" titulo="Consultoria não encontrada" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-6)">
      <div className="flex flex-col gap-(--e-3)">
        {linkVoltar}
        <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
          <div className="flex min-w-0 flex-wrap items-center gap-(--e-2)">
            <Pagina titulo={consultoria.nome}>{null}</Pagina>
            <Selo tom={TOM_DA_SITUACAO[consultoria.situacao]}>
              {ROTULO_SITUACAO_CONSULTORIA[consultoria.situacao]}
            </Selo>
          </div>
          <Botao
            onClick={() => {
              setAviso(null)
              setMudarAberto(true)
            }}
          >
            Mudar situação
          </Botao>
        </div>
        <dl className="grid grid-cols-1 gap-(--e-3) sm:grid-cols-2">
          <div className="flex flex-col gap-(--e-05)">
            <dt className="rotulo">Criada em</dt>
            <dd>{formatarInstanteComoData(consultoria.criadaEm, consultoria.fuso)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-(--e-05)">
            <dt className="rotulo">Gestão</dt>
            <dd className="min-w-0">
              {consultoria.gestao.length === 0
                ? 'Sem Gestão ativa'
                : consultoria.gestao.map((p) => (
                    <span key={p.email} className="block truncate">
                      {p.nome} · {p.email}
                    </span>
                  ))}
            </dd>
          </div>
          {consultoria.situacaoMotivo && consultoria.situacaoAlteradaEm ? (
            <div className="flex min-w-0 flex-col gap-(--e-05) sm:col-span-2">
              <dt className="rotulo">Motivo da situação</dt>
              <dd className="whitespace-pre-wrap break-words">
                {consultoria.situacaoMotivo}
                <span className="block text-xs text-(--tinta-2)">
                  {formatarInstanteComHora(consultoria.situacaoAlteradaEm, consultoria.fuso)}
                  {consultoria.situacaoAlteradaPorNome
                    ? ` · ${consultoria.situacaoAlteradaPorNome}`
                    : ''}
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}

      <Numeros consultoria={consultoria} />
      <PlanoNaCentral consultoriaId={consultoria.id} fuso={consultoria.fuso} />
      <AcessoDeSuporteNaCentral
        consultoriaId={consultoria.id}
        consultoriaNome={consultoria.nome}
        fuso={consultoria.fuso}
      />
      <UsoPorModulo consultoriaId={consultoria.id} />
      <ValorDaConsultoria consultoriaId={consultoria.id} />
      <Pessoas consultoria={consultoria} />
      <Historico consultoria={consultoria} />

      <DialogoMudarSituacao
        consultoria={consultoria}
        aberto={mudarAberto}
        aoMudarAberto={setMudarAberto}
        aoMudar={(nova) => {
          setAviso(`Situação mudou para ${ROTULO_SITUACAO_CONSULTORIA[nova]}.`)
          void queryClient.invalidateQueries({ queryKey: ['central'] })
        }}
        aoConflito={() => {
          void queryClient.invalidateQueries({ queryKey: ['central', 'consultoria', id] })
        }}
      />
    </div>
  )
}
