import {
  formatarDocumentoDoTitular,
  hojeNoFuso,
  rotuloDoDocumentoDoTitular,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { BotaoGerarRelatorio } from '@/app/paginas/modelos/GerarRelatorio'
import { Pagina } from '@/app/paginas/Pagina'
import { SecaoResiduosDoEmpreendimento } from '@/app/paginas/residuos/registro/SecaoResiduosDoEmpreendimento'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarUnidades, obterEmpreendimento, type Empreendimento } from '@/lib/api/empreendimentos'
import { TAMANHO_PAGINA_LICENCAS, listarLicencasDoEmpreendimento } from '@/lib/api/licencas'
import { useCelular } from '@/lib/usar-celular'
import { cn } from '@/lib/utils'

import { DialogoEmpreendimento } from './DialogoEmpreendimento'
import { DialogoUnidades } from './DialogoUnidades'
import { TabelaLicencas } from './TabelaLicencas'

const VOLTAR = { para: '/empreendimentos', rotulo: 'Empreendimentos' }

/** Linha abaixo do título: cliente contratante e documento do titular. */
function Meta({ empreendimento }: { empreendimento: Empreendimento }) {
  const documento = formatarDocumentoDoTitular(empreendimento.cnpj)
  return (
    <span className="flex flex-wrap gap-x-(--e-2)">
      <span className={empreendimento.clienteNome ? undefined : 'text-(--tinta-3)'}>
        {empreendimento.clienteNome ?? 'Cliente contratante não informado'}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {rotuloDoDocumentoDoTitular(empreendimento.cnpj)}{' '}
        {documento ? (
          <span className="numero text-(--tinta)">{documento}</span>
        ) : (
          <span className="text-(--tinta-3)">não informado</span>
        )}
      </span>
    </span>
  )
}

/**
 * /empreendimentos/:id (Protótipo 09, onda 1 "só licenças"; EMP-02). Título com o empreendimento,
 * filtro rápido por unidade, busca e o quadro de licenças com validade e situação calculada.
 */
export function PaginaEmpreendimento() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const local = useLocation()
  const queryClient = useQueryClient()
  const aviso = (local.state as { aviso?: string } | null)?.aviso
  const [editarAberto, setEditarAberto] = useState(false)
  const [unidadesAberto, setUnidadesAberto] = useState(false)
  const [unidadeFiltro, setUnidadeFiltro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const celular = useCelular()

  const empreendimento = useQuery({
    queryKey: ['empreendimento', id],
    queryFn: () => obterEmpreendimento(id),
  })
  const unidades = useQuery({
    queryKey: ['unidades', id],
    queryFn: () => listarUnidades(id),
    enabled: Boolean(empreendimento.data),
  })
  const [ordemDecrescente, setOrdemDecrescente] = useState(true)
  const licencas = useInfiniteQuery({
    queryKey: ['licencas', id],
    queryFn: ({ pageParam }) => listarLicencasDoEmpreendimento(id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_LICENCAS && carregados < ultima.total
        ? todas.length
        : undefined
    },
    enabled: Boolean(empreendimento.data),
  })

  if (empreendimento.isPending) {
    return (
      <Pagina titulo="Empreendimento" voltar={VOLTAR}>
        <Carregando rotulo="Carregando o empreendimento" linhas={4} />
      </Pagina>
    )
  }
  if (empreendimento.isError) {
    return (
      <Pagina titulo="Empreendimento" voltar={VOLTAR}>
        <EstadoErro
          titulo="Não foi possível carregar o empreendimento."
          aoTentarDeNovo={() => void empreendimento.refetch()}
        />
      </Pagina>
    )
  }
  if (!empreendimento.data) {
    // Inexistente ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <Pagina titulo="Empreendimento não encontrado" voltar={VOLTAR}>
        <EstadoVazio
          icone="briefcase"
          titulo={`Ele não existe ou não é da ${atual.consultoriaNome}.`}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/empreendimentos">Voltar para Empreendimentos</Link>
            </Botao>
          }
        />
      </Pagina>
    )
  }

  const dados = empreendimento.data
  const listaUnidades = unidades.data ?? []
  const todasLicencas = licencas.data?.pages.flatMap((p) => p.itens) ?? []
  const termo = busca.trim().toLowerCase()
  const daBusca = todasLicencas.filter(
    (l) =>
      !termo ||
      [l.numero, l.orgao, l.sigla, l.tipoNome, l.unidadeNome].some((v) =>
        v?.toLowerCase().includes(termo),
      ),
  )
  const filtradas = daBusca
    .filter((l) => !unidadeFiltro || l.unidadeId === unidadeFiltro)
    .sort(
      (a, b) =>
        (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0) *
        (ordemDecrescente ? -1 : 1),
    )
  const chips = [
    { id: null, rotulo: 'Todos', contagem: daBusca.length },
    ...listaUnidades.map((u) => ({
      id: u.id,
      rotulo: u.nome,
      contagem: daBusca.filter((l) => l.unidadeId === u.id).length,
    })),
  ]
  const ehGestao = atual.papel === 'gestao'
  const cadastrarPara = ehGestao
    ? `/licencas/nova?empreendimento=${id}${unidadeFiltro ? `&unidade=${unidadeFiltro}` : ''}`
    : null
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const filtrando = Boolean(termo || unidadeFiltro)
  const contagemLicencas = (n: number) => `${String(n)} ${n === 1 ? 'licença' : 'licenças'}`

  return (
    <Pagina
      titulo={dados.nome}
      voltar={VOLTAR}
      meta={<Meta empreendimento={dados} />}
      acao={
        <>
          <BotaoGerarRelatorio empreendimentoId={dados.id} empreendimentoNome={dados.nome} />
          <Botao
            iconeAntes="pencil"
            onClick={() => {
              setEditarAberto(true)
            }}
          >
            Editar
          </Botao>
          {cadastrarPara ? (
            <Botao aparencia="primario" asChild>
              <Link to={cadastrarPara}>
                <Icone nome="plus" />
                Cadastrar licença
              </Link>
            </Botao>
          ) : null}
        </>
      }
    >
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}

      <section
        aria-labelledby="titulo-licencas"
        className="flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
      >
        <div className="flex flex-wrap items-center gap-x-(--e-5) gap-y-(--e-2) border-b px-(--e-4) pt-(--e-2) max-md:pb-(--e-3)">
          <h2 id="titulo-licencas" className="titulo-secao text-(--tinta)">
            Licenças
          </h2>
          <div
            role="group"
            aria-label="Filtrar por unidade"
            className="flex max-w-full items-center gap-(--e-4) self-stretch overflow-x-auto overflow-y-hidden max-md:order-last max-md:w-full md:overflow-visible"
          >
            {unidades.isPending
              ? null
              : chips.map((chip) => {
                  const ligado = unidadeFiltro === chip.id
                  return (
                    <button
                      key={chip.id ?? 'todos'}
                      type="button"
                      aria-pressed={ligado}
                      onClick={() => {
                        setUnidadeFiltro(chip.id)
                      }}
                      className={cn(
                        '-mb-px inline-flex h-11 shrink-0 cursor-pointer items-center gap-(--e-2) border-b-[3px] corpo-medio whitespace-nowrap transicao-estado',
                        ligado
                          ? 'border-(--marca-linha) text-(--tinta)'
                          : 'border-transparent text-(--tinta-2) hover:text-(--tinta)',
                      )}
                    >
                      {chip.rotulo}
                      <span
                        className={cn(
                          'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
                          ligado ? 'bg-(--tinta) text-(--folha)' : 'bg-(--aperto) text-(--tinta-2)',
                        )}
                      >
                        {chip.contagem}
                      </span>
                    </button>
                  )
                })}
          </div>
          <div className="flex items-center gap-(--e-2) max-md:w-full md:ml-auto md:pb-(--e-2)">
            <label className="relative flex min-w-0 flex-1 items-center md:w-[240px] md:flex-none">
              <span className="sr-only">Buscar neste empreendimento</span>
              <Icone
                nome="search"
                className="pointer-events-none absolute left-(--e-3) text-(--icone-2)"
              />
              <input
                type="search"
                value={busca}
                placeholder="Número, tipo ou órgão"
                onChange={(evento) => {
                  setBusca(evento.target.value)
                }}
                className={cn(classeCampo, 'pl-(--e-8)')}
              />
            </label>
            {celular ? (
              <BotaoIcone
                icone="buildings"
                rotulo="Gerenciar unidades"
                aparencia="padrao"
                onClick={() => {
                  setUnidadesAberto(true)
                }}
              />
            ) : (
              <Botao
                aparencia="sutil"
                iconeAntes="buildings"
                onClick={() => {
                  setUnidadesAberto(true)
                }}
              >
                Gerenciar unidades
              </Botao>
            )}
          </div>
        </div>

        {unidades.isError ? (
          <EstadoErro
            titulo="Não foi possível carregar as unidades."
            aoTentarDeNovo={() => void unidades.refetch()}
            className="m-(--e-3)"
          />
        ) : null}

        {licencas.isPending ? (
          <Carregando rotulo="Carregando licenças" linhas={3} className="border-0" />
        ) : licencas.isError ? (
          <EstadoErro
            titulo="Não foi possível carregar as licenças."
            aoTentarDeNovo={() => void licencas.refetch()}
            className="m-(--e-3)"
          />
        ) : (
          <TabelaLicencas
            itens={filtradas}
            totalSemFiltro={todasLicencas.length}
            hoje={hoje}
            fuso={atual.fuso}
            podeEditar={ehGestao}
            ordemDecrescente={ordemDecrescente}
            aoInverterOrdem={() => {
              setOrdemDecrescente((d) => !d)
            }}
            aoLimparFiltros={() => {
              setBusca('')
              setUnidadeFiltro(null)
            }}
          />
        )}
        {todasLicencas.length > 0 ? (
          <div className="flex items-center gap-(--e-2) px-(--e-4) py-(--e-2)">
            <span className="flex-1 rotulo numero" aria-live="polite">
              {filtrando
                ? `${String(filtradas.length)} de ${contagemLicencas(todasLicencas.length)}`
                : contagemLicencas(todasLicencas.length)}
            </span>
            {licencas.hasNextPage ? (
              <Botao
                tamanho="compacto"
                disabled={licencas.isFetchingNextPage}
                onClick={() => void licencas.fetchNextPage()}
              >
                Mostrar mais
              </Botao>
            ) : null}
          </div>
        ) : null}
      </section>

      <SecaoResiduosDoEmpreendimento empreendimentoId={id} />

      <DialogoEmpreendimento
        aberto={editarAberto}
        aoMudar={setEditarAberto}
        consultoriaId={atual.consultoriaId}
        existente={dados}
        aoSalvar={() => {
          void queryClient.invalidateQueries({ queryKey: ['empreendimento', id] })
          void queryClient.invalidateQueries({ queryKey: ['empreendimentos'] })
        }}
      />
      <DialogoUnidades
        aberto={unidadesAberto}
        aoMudar={setUnidadesAberto}
        empreendimentoId={id}
        unidades={listaUnidades}
      />
    </Pagina>
  )
}
