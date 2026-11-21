import { formatarDataCivil, rotuloDoMotivo, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import type { DiferencaDaMudanca } from '@/lib/api/central-normas'
import {
  CHAVES_DE_NORMAS,
  ROTULO_DA_MUDANCA,
  afetadosPelaMudanca,
  detalheDaNorma,
  marcarMudancaVista,
  rotuloDoTipoDeNorma,
  type DetalheDaNorma,
  type MudancaDaNorma,
  type VersaoDaNorma,
} from '@/lib/api/normas'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

const VOLTAR = { para: '/acompanhamentos?aba=normas', rotulo: 'Normas' }

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'
const classeRegiao =
  'max-h-[360px] overflow-auto rounded-(--raio-painel) border bg-(--folha) [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-(--folha)'
const classeIns =
  'rounded-(--raio-mini) bg-(--ok-fundo) px-(--e-1) text-(--tinta) no-underline [overflow-wrap:anywhere]'
const classeDel = 'text-(--tinta-2) [overflow-wrap:anywhere]'

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-(--e-3)">
      <h2 id={id} className="titulo-secao text-(--tinta)">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function dataCivil(data: string | null): string | null {
  return data ? formatarDataCivil(data as DataCivil) : null
}

/** Diferença entre versões: incluídos, alterados (antes riscado, depois destacado) e revogados. */
function Diferenca({ diferenca }: { diferenca: DiferencaDaMudanca }) {
  if (!diferenca.estruturada) {
    return (
      <p className="corpo-medio text-(--tinta)">
        {diferenca.mudou ? 'Texto mudou' : 'Texto igual'}
      </p>
    )
  }
  const { incluidos, alterados, revogados } = diferenca
  if (incluidos.length + alterados.length + revogados.length === 0) {
    return <p className="corpo text-(--tinta)">Nenhum dispositivo mudou</p>
  }
  return (
    <div className="flex flex-col gap-(--e-4)">
      {incluidos.length > 0 ? (
        <div className="flex flex-col gap-(--e-2)">
          <h4 className="corpo-medio text-(--tinta)">Incluídos ({String(incluidos.length)})</h4>
          <ul className="flex flex-col gap-(--e-2)">
            {incluidos.map((d) => (
              <li key={d.caminho} className="flex flex-col gap-(--e-1)">
                <span className="corpo-medio">{d.rotulo}</span>
                <ins className={classeIns}>{d.texto}</ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {alterados.length > 0 ? (
        <div className="flex flex-col gap-(--e-2)">
          <h4 className="corpo-medio text-(--tinta)">Alterados ({String(alterados.length)})</h4>
          <ul className="flex flex-col gap-(--e-3)">
            {alterados.map((d) => (
              <li key={d.caminho} className="flex flex-col gap-(--e-1)">
                <span className="corpo-medio">{d.rotulo}</span>
                <span className="rotulo">Antes</span>
                <del className={classeDel}>{d.antes}</del>
                <span className="rotulo">Depois</span>
                <ins className={classeIns}>{d.depois}</ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {revogados.length > 0 ? (
        <div className="flex flex-col gap-(--e-2)">
          <h4 className="corpo-medio text-(--tinta)">Revogados ({String(revogados.length)})</h4>
          <ul className="flex flex-col gap-(--e-2)">
            {revogados.map((d) => (
              <li key={d.caminho} className="flex flex-col gap-(--e-1)">
                <span className="corpo-medio">{d.rotulo}</span>
                <del className={classeDel}>{d.texto}</del>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Empreendimentos e licenças da consultoria afetados pela mudança; marca o aviso como visto. */
function Afetados({ mudancaId }: { mudancaId: string }) {
  const { atual, suporte } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const marcada = useRef(false)

  const consulta = useQuery({
    queryKey: [CHAVES_DE_NORMAS.afetados, cid, mudancaId],
    queryFn: () => afetadosPelaMudanca(cid, mudancaId),
  })
  const marcar = useMutation({
    mutationFn: () => marcarMudancaVista(cid, mudancaId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVES_DE_NORMAS.naoVistas, cid] }),
        queryClient.invalidateQueries({ queryKey: [CHAVES_DE_NORMAS.mudancas, cid] }),
        // Selo "norma mudou" na tabela de licenças do Empreendimento.
        queryClient.invalidateQueries({ queryKey: ['licencas-com-mudanca-de-norma', cid] }),
      ]),
  })
  // O suporte só lê (sem membro): não marca o aviso da consultoria como visto.
  const temNaoVisto = suporte === null && consulta.data?.some((a) => a.vistoEm === null) === true
  const { mutate } = marcar

  useEffect(() => {
    if (!temNaoVisto || marcada.current) return
    marcada.current = true
    mutate()
  }, [temNaoVisto, mutate])

  if (consulta.isPending) return <Carregando rotulo="Carregando afetados" linhas={3} />
  if (consulta.isError) {
    return ehSemPermissao(consulta.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar os afetados."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  if (consulta.data.length === 0) {
    return <p className="corpo text-(--tinta-2)">Nenhum empreendimento da carteira afetado</p>
  }
  return (
    <div
      className={classeRegiao}
      role="region"
      aria-label="Afetados na carteira"
      // Região que rola sozinha: o foco deixa rolar pelo teclado (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className="w-full min-w-[560px] border-collapse corpo">
        <thead>
          <tr>
            <th scope="col" className={classeCabecalho}>
              Empreendimento
            </th>
            <th scope="col" className={classeCabecalho}>
              Cliente
            </th>
            <th scope="col" className={classeCabecalho}>
              Licença
            </th>
            <th scope="col" className={classeCabecalho}>
              Motivo
            </th>
          </tr>
        </thead>
        <tbody>
          {consulta.data.map((a) => (
            <tr
              key={`${a.empreendimentoId}-${a.instrumentoId ?? ''}-${a.motivo.criterio}-${a.motivo.valor}`}
              className="transicao-estado hover:bg-(--toque) last:[&>td]:border-b-0"
            >
              <td className={cn(classeCelula, 'max-w-[280px]')}>
                <Link to={`/empreendimentos/${a.empreendimentoId}`} className="text-(--tinta)">
                  {a.empreendimentoNome}
                </Link>
              </td>
              <td className={cn(classeCelula, 'text-(--tinta-2)')}>{a.clienteNome ?? '—'}</td>
              <td className={cn(classeCelula, 'whitespace-nowrap numero')}>{a.licenca ?? '—'}</td>
              <td className={cn(classeCelula, 'whitespace-nowrap')}>{rotuloDoMotivo(a.motivo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Mudanca({
  mudanca,
  aberta,
  aoAlternar,
}: {
  mudanca: MudancaDaNorma
  aberta: boolean
  aoAlternar: () => void
}) {
  const { atual } = useConsultoria()
  const idPainel = useId()
  const publicada = mudanca.publicadaEm
    ? formatarInstanteComoData(mudanca.publicadaEm, atual.fuso)
    : null
  return (
    <li className="flex flex-col border-b border-(--regra-leve) last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={idPainel}
          onClick={aoAlternar}
          className="flex w-full cursor-pointer items-center gap-(--e-3) px-(--e-4) py-(--e-3) text-left transicao-estado hover:bg-(--toque) max-md:min-h-(--controle-toque)"
        >
          <Icone
            nome="chevron-right"
            className={cn('shrink-0 text-(--tinta-2) transicao-estado', aberta && 'rotate-90')}
          />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-(--e-2)">
            <span className="corpo-medio text-(--tinta)">{ROTULO_DA_MUDANCA[mudanca.tipo]}</span>
            {publicada ? (
              <span className="text-xs text-(--tinta-2) numero">publicada em {publicada}</span>
            ) : null}
          </span>
        </button>
      </h3>
      {aberta ? (
        <div id={idPainel} className="flex flex-col gap-(--e-5) px-(--e-4) pt-(--e-1) pb-(--e-5)">
          {mudanca.resumo ? (
            <div className="flex flex-col gap-(--e-2)">
              {publicada ? (
                <span className="rotulo text-(--tinta-2) numero">
                  Resumo por IA · revisado em {publicada}
                </span>
              ) : null}
              {mudanca.resumo.resumo ? (
                <p className="corpo text-(--tinta)">{mudanca.resumo.resumo}</p>
              ) : null}
              {mudanca.resumo.oQueMuda.length > 0 ? (
                <div className="flex flex-col gap-(--e-1)">
                  <h4 className="corpo-medio text-(--tinta)">O que muda</h4>
                  <ul className="flex list-disc flex-col gap-(--e-1) pl-(--e-5) corpo">
                    {mudanca.resumo.oQueMuda.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {mudanca.resumo.prazoDeAdequacao ? (
                <p className="corpo text-(--tinta)">
                  <span className="corpo-medio">Prazo de adequação: </span>
                  {mudanca.resumo.prazoDeAdequacao}
                </p>
              ) : null}
            </div>
          ) : null}
          {mudanca.diferenca ? (
            <div className="flex flex-col gap-(--e-2)">
              <h4 className="titulo-painel text-(--tinta)">Diferença</h4>
              <Diferenca diferenca={mudanca.diferenca} />
            </div>
          ) : null}
          <div className="flex flex-col gap-(--e-2)">
            <h4 className="titulo-painel text-(--tinta)">Afetados</h4>
            <Afetados mudancaId={mudanca.id} />
          </div>
        </div>
      ) : (
        <div id={idPainel} hidden />
      )}
    </li>
  )
}

/** Mudanças publicadas: a pedida na URL (?mudanca=) vem primeiro e aberta; sem ela, a mais recente. */
function Mudancas({ mudancas, pedida }: { mudancas: MudancaDaNorma[]; pedida: string | null }) {
  const temPedida = pedida !== null && mudancas.some((m) => m.id === pedida)
  const ordenadas = temPedida
    ? [...mudancas].sort((a, b) => Number(b.id === pedida) - Number(a.id === pedida))
    : mudancas
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => {
    const primeira = ordenadas[0]?.id
    return new Set(primeira ? [primeira] : [])
  })

  if (mudancas.length === 0) {
    return <p className="corpo text-(--tinta-2)">Nenhuma mudança publicada</p>
  }
  return (
    <ul className="flex flex-col rounded-(--raio-painel) border bg-(--folha)">
      {ordenadas.map((m) => (
        <Mudanca
          key={m.id}
          mudanca={m}
          aberta={abertas.has(m.id)}
          aoAlternar={() => {
            setAbertas((atuais) => {
              const proximas = new Set(atuais)
              if (proximas.has(m.id)) proximas.delete(m.id)
              else proximas.add(m.id)
              return proximas
            })
          }}
        />
      ))}
    </ul>
  )
}

function Versoes({ versoes }: { versoes: VersaoDaNorma[] }) {
  const { atual } = useConsultoria()
  if (versoes.length === 0) return <p className="corpo text-(--tinta-2)">Nenhuma versão coletada</p>
  return (
    <div
      className={classeRegiao}
      role="region"
      aria-label="Versões da norma"
      // Região que rola sozinha: o foco deixa rolar pelo teclado (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className="w-full border-collapse corpo">
        <thead>
          <tr>
            <th scope="col" className={classeCabecalho}>
              Versão
            </th>
            <th scope="col" className={classeCabecalho}>
              Publicada em
            </th>
            <th scope="col" className={classeCabecalho}>
              Coletada em
            </th>
          </tr>
        </thead>
        <tbody>
          {versoes.map((v) => (
            <tr key={v.id} className="last:[&>td]:border-b-0">
              <td className={cn(classeCelula, 'numero')}>{v.numero}</td>
              <td className={cn(classeCelula, 'numero')}>
                {dataCivil(v.publicadaEm) ?? v.publicadaEmTexto ?? '—'}
              </td>
              <td className={cn(classeCelula, 'numero')}>
                {v.coletadaEm ? formatarInstanteComoData(v.coletadaEm, atual.fuso) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Situacao({ norma }: { norma: DetalheDaNorma }) {
  const revogadora = useQuery({
    queryKey: [CHAVES_DE_NORMAS.detalhe, norma.revogadaPor],
    queryFn: () => detalheDaNorma(norma.revogadaPor ?? ''),
    enabled: norma.revogada && norma.revogadaPor !== null,
  })
  if (!norma.revogada) return <Selo tom="sucesso">Vigente</Selo>
  const em = dataCivil(norma.revogadaEm)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-(--e-2)">
      <Selo tom="perigo">Revogada</Selo>
      {em ? <span className="numero">em {em}</span> : null}
      {norma.revogadaPor ? (
        <span>
          por{' '}
          <Link to={`/normas/${norma.revogadaPor}`}>
            {revogadora.data?.titulo ?? 'outra norma'}
          </Link>
        </span>
      ) : null}
    </span>
  )
}

/**
 * /normas/:id (LEG-05; ADR-0050, item 25): fora do menu, para todos os membros. Cabeçalho da norma,
 * mudanças publicadas com a diferença, o resumo revisado e os afetados da carteira, e as versões.
 */
export function PaginaNorma() {
  const { atual } = useConsultoria()
  const { id = '' } = useParams()
  const [parametros] = useSearchParams()
  const pedida = parametros.get('mudanca')
  const consulta = useQuery({
    queryKey: [CHAVES_DE_NORMAS.detalhe, id],
    queryFn: () => detalheDaNorma(id),
  })

  if (consulta.isPending) {
    return (
      <Pagina titulo="Norma" voltar={VOLTAR}>
        <Carregando rotulo="Carregando a norma" linhas={5} />
      </Pagina>
    )
  }
  if (consulta.isError) {
    return (
      <Pagina titulo="Norma" voltar={VOLTAR}>
        {ehSemPermissao(consulta.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar a norma."
            aoTentarDeNovo={() => void consulta.refetch()}
          />
        )}
      </Pagina>
    )
  }
  const norma = consulta.data
  if (!norma) {
    return (
      <Pagina titulo="Norma" voltar={VOLTAR}>
        <EstadoVazio icone="search" titulo="Norma não encontrada" />
      </Pagina>
    )
  }

  return (
    <Pagina
      titulo={norma.titulo}
      voltar={VOLTAR}
      meta={
        <span className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
          <span>
            {norma.orgao} · {rotuloDoTipoDeNorma(norma.tipo)}
          </span>
          <Situacao norma={norma} />
        </span>
      }
      acao={
        norma.urlOficial ? (
          <a
            href={norma.urlOficial}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-(--e-1) corpo-medio max-md:min-h-(--controle-toque)"
          >
            Fonte oficial
            <Icone nome="external-link" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        ) : null
      }
    >
      <div className="flex flex-col gap-(--e-8)">
        {norma.ementa ? <p className="max-w-[72ch] corpo text-(--tinta)">{norma.ementa}</p> : null}
        {norma.fonte === 'planalto' ? (
          <p className="rotulo text-(--tinta-2)">
            Fonte: Planalto
            {norma.versoes[0]?.coletadaEm
              ? `, acesso em ${formatarInstanteComoData(norma.versoes[0].coletadaEm, atual.fuso)}`
              : ''}
            . Conteúdo informativo, não oficial.
          </p>
        ) : null}
        <Secao titulo="Mudanças publicadas">
          <Mudancas key={norma.id} mudancas={norma.mudancas} pedida={pedida} />
        </Secao>
        <Secao titulo="Versões">
          <Versoes versoes={norma.versoes} />
        </Secao>
      </div>
    </Pagina>
  )
}
