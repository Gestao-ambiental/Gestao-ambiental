import {
  ROTULO_DA_PENDENCIA_DE_RESIDUO,
  ROTULO_DA_UNIDADE_DE_RESIDUO,
  formatarDataCivil,
  formatarQuantidade,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { AbasResiduos } from '@/app/paginas/residuos/LayoutResiduos'
import {
  Contador,
  Placar,
  classeCabecalho,
  classeCelula,
  classeItemCelular,
  classeLinha,
  classePainel,
  classeRegiao,
} from '@/app/paginas/residuos/quadro'
import { caminhoDosMtrs, caminhoParaRegistrarCdf } from '@/app/paginas/residuos/registro/comum'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import {
  TAMANHO_PAGINA_RESIDUOS,
  conferenciaDeResiduos,
  type PendenciaDaConferencia,
  type TipoDePendenciaDeResiduo,
} from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { useEmpreendimentoDaUrl } from './comum'
import { FiltroEmpreendimento, Paginacao } from './PecasDoPainel'

const TIPOS: readonly TipoDePendenciaDeResiduo[] = [
  'mtr_sem_cdf',
  'quantidade_diferente',
  'unidades_diferentes',
]

const TOM_DO_CONTADOR: Record<TipoDePendenciaDeResiduo, 'atraso' | 'alerta' | undefined> = {
  mtr_sem_cdf: 'alerta',
  quantidade_diferente: 'atraso',
  unidades_diferentes: undefined,
}

function comSinal(diferenca: number, unidade: PendenciaDaConferencia['unidade']): string {
  const texto = formatarQuantidade(Math.abs(diferenca), unidade ?? 'un')
  if (diferenca > 0) return `+${texto}`
  if (diferenca < 0) return `−${texto}`
  return texto
}

function detalhe(p: PendenciaDaConferencia): string {
  if (p.tipo === 'mtr_sem_cdf') {
    const dias = p.dias ?? 0
    return `${String(dias)} ${dias === 1 ? 'dia' : 'dias'} sem CDF`
  }
  const unidade = p.unidade ?? 'un'
  if (p.tipo === 'quantidade_diferente') {
    const mtr = p.quantidadeMtr === null ? '—' : formatarQuantidade(p.quantidadeMtr, unidade)
    const cdf = p.quantidadeCdf === null ? '—' : formatarQuantidade(p.quantidadeCdf, unidade)
    const dif = p.diferenca === null ? '' : ` (${comSinal(p.diferenca, unidade)})`
    return `MTR ${mtr} · CDF ${cdf}${dif}`
  }
  const nosCdfs = p.unidadesCdf.map((u) => ROTULO_DA_UNIDADE_DE_RESIDUO[u]).join(', ')
  return `MTR em ${ROTULO_DA_UNIDADE_DE_RESIDUO[unidade]} · CDF em ${nosCdfs || '—'}`
}

function residuo(p: PendenciaDaConferencia): string {
  return p.residuoCodigo ? `${p.residuoCodigo} · ${p.residuoDescricao ?? ''}` : '—'
}

function chave(p: PendenciaDaConferencia): string {
  return `${p.tipo}:${p.mtrId}:${p.mtrItemId ?? ''}`
}

/** O que fazer com a pendência: sem CDF, registrar; diferença, abrir o empreendimento e revisar. */
function OQueFazer({ p }: { p: PendenciaDaConferencia }) {
  if (p.tipo === 'mtr_sem_cdf') {
    return (
      <Botao tamanho="compacto" asChild>
        <Link
          to={caminhoParaRegistrarCdf(p.empreendimentoId)}
          aria-label={`Registrar CDF do MTR ${p.numero}`}
        >
          Registrar CDF
        </Link>
      </Botao>
    )
  }
  return (
    <Botao tamanho="compacto" aparencia="sutil" asChild>
      <Link to={caminhoDosMtrs(p.empreendimentoId)} aria-label={`Revisar o MTR ${p.numero}`}>
        Revisar
      </Link>
    </Botao>
  )
}

function Quadro({
  itens,
  comEmpreendimento,
}: {
  itens: readonly PendenciaDaConferencia[]
  comEmpreendimento: boolean
}) {
  return (
    <>
      <div className={cn(classeRegiao, 'hidden md:block')}>
        <table className="w-full border-collapse corpo">
          <caption className="sr-only">Pendências da conferência CDF x MTR</caption>
          <thead className="sticky top-0 z-10 bg-(--folha)">
            <tr>
              <th scope="col" className={classeCabecalho}>
                MTR
              </th>
              <th scope="col" className={classeCabecalho}>
                Emissão
              </th>
              <th scope="col" className={classeCabecalho}>
                Pendência
              </th>
              <th scope="col" className={classeCabecalho}>
                Detalhe
              </th>
              {comEmpreendimento ? (
                <th scope="col" className={classeCabecalho}>
                  Empreendimento
                </th>
              ) : null}
              <th scope="col" className={cn(classeCabecalho, 'hidden 2xl:table-cell')}>
                Resíduo
              </th>
              <th scope="col" className={classeCabecalho}>
                CDF
              </th>
              <th scope="col" className={classeCabecalho}>
                <span className="sr-only">O que fazer</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((p) => (
              <tr key={chave(p)} className={classeLinha}>
                <td className={`${classeCelula} whitespace-nowrap corpo-medio numero`}>
                  <Link to={caminhoDosMtrs(p.empreendimentoId)} className="text-(--tinta)">
                    {p.numero}
                  </Link>
                </td>
                <td className={`${classeCelula} whitespace-nowrap numero`}>
                  {formatarDataCivil(p.emitidoEm)}
                </td>
                <td className={`${classeCelula} whitespace-nowrap corpo-medio`}>
                  {ROTULO_DA_PENDENCIA_DE_RESIDUO[p.tipo]}
                </td>
                <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}>
                  {detalhe(p)}
                </td>
                {comEmpreendimento ? (
                  <td className={classeCelula}>
                    <span className="block max-w-[200px] truncate" title={p.empreendimentoNome}>
                      {p.empreendimentoNome}
                    </span>
                  </td>
                ) : null}
                <td className={cn(classeCelula, 'hidden 2xl:table-cell')}>
                  <span className="block max-w-[260px] truncate numero" title={residuo(p)}>
                    {residuo(p)}
                  </span>
                </td>
                <td className={`${classeCelula} whitespace-nowrap numero`}>
                  {p.cdfs.length > 0 ? p.cdfs.map((c) => c.numero).join(', ') : '—'}
                </td>
                <td className={`${classeCelula} w-px whitespace-nowrap text-right`}>
                  <OQueFazer p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label="Pendências" className="flex flex-col md:hidden">
        {itens.map((p) => (
          <li key={chave(p)} className={classeItemCelular}>
            <span className="flex items-start justify-between gap-(--e-2)">
              <span className="flex min-w-0 flex-col">
                <span className="corpo-medio numero">MTR {p.numero}</span>
                <span className="rotulo numero">{formatarDataCivil(p.emitidoEm)}</span>
              </span>
              <OQueFazer p={p} />
            </span>
            <span className="corpo-medio">{ROTULO_DA_PENDENCIA_DE_RESIDUO[p.tipo]}</span>
            <span className="text-(--tinta-2) numero">{detalhe(p)}</span>
            <span className="truncate text-xs text-(--tinta-2)">
              {comEmpreendimento ? `${p.empreendimentoNome} · ` : ''}
              {residuo(p)}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Conferência CDF x MTR (resíduos, fase 1): MTR sem CDF há mais de 30 dias e CDF com quantidade
 * (ou unidade) diferente da do MTR. As pendências vêm calculadas do banco; a tela conta por tipo
 * no placar (que filtra), filtra por empreendimento (?empreendimento=), pagina e leva cada linha
 * ao que fazer.
 */
export function PaginaConferenciaResiduos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [empreendimentoId, mudarEmpreendimento] = useEmpreendimentoDaUrl()
  const [tipo, setTipo] = useState<TipoDePendenciaDeResiduo | null>(null)
  const [pagina, setPagina] = useState(0)

  const consulta = useQuery({
    queryKey: ['residuos', 'conferencia', cid, empreendimentoId],
    queryFn: () => conferenciaDeResiduos(cid, empreendimentoId),
  })

  const todas = consulta.data ?? []
  const filtradas = tipo ? todas.filter((p) => p.tipo === tipo) : todas
  const inicio = pagina * TAMANHO_PAGINA_RESIDUOS
  const visiveis = filtradas.slice(inicio, inicio + TAMANHO_PAGINA_RESIDUOS)
  const contagem = (t: TipoDePendenciaDeResiduo) => todas.filter((p) => p.tipo === t).length

  function limpar() {
    mudarEmpreendimento(null)
    setTipo(null)
    setPagina(0)
  }
  function escolherTipo(novo: TipoDePendenciaDeResiduo | null) {
    setTipo((antes) => (antes === novo ? null : novo))
    setPagina(0)
  }

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando a conferência" linhas={6} />
  } else if (consulta.isError) {
    conteudo = ehSemPermissao(consulta.error) ? (
      <SemPermissao descricao={null} />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar a conferência."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (filtradas.length === 0) {
    conteudo =
      empreendimentoId || tipo ? (
        <EstadoVazio
          icone="search"
          titulo="Nenhuma pendência com estes filtros"
          acaoPrincipal={<Botao onClick={limpar}>Limpar filtros</Botao>}
          className={classePainel}
        />
      ) : (
        <EstadoVazio icone="circle-check" titulo="Nenhuma pendência" className={classePainel} />
      )
  } else {
    conteudo = (
      <div className={classePainel}>
        <Quadro itens={visiveis} comEmpreendimento={empreendimentoId === null} />
        <Paginacao
          pagina={pagina}
          tamanho={TAMANHO_PAGINA_RESIDUOS}
          total={filtradas.length}
          aoMudar={setPagina}
        />
      </div>
    )
  }

  return (
    <Pagina titulo="Conferência CDF x MTR">
      <AbasResiduos />

      {consulta.isSuccess && todas.length > 0 ? (
        <Placar rotulo="Pendências por tipo">
          <Contador
            rotulo="Pendências"
            valor={todas.length}
            ativo={tipo === null}
            aoClicar={() => {
              escolherTipo(null)
            }}
          />
          {TIPOS.map((t) => (
            <Contador
              key={t}
              rotulo={ROTULO_DA_PENDENCIA_DE_RESIDUO[t]}
              valor={contagem(t)}
              tom={TOM_DO_CONTADOR[t]}
              ativo={tipo === t}
              aoClicar={() => {
                escolherTipo(t)
              }}
            />
          ))}
        </Placar>
      ) : null}

      <div className="flex flex-col gap-(--e-3)">
        <div className="flex flex-wrap items-center gap-(--e-2)">
          <FiltroEmpreendimento
            consultoriaId={cid}
            valor={empreendimentoId}
            aoMudar={(id) => {
              mudarEmpreendimento(id)
              setPagina(0)
            }}
            rotuloTodos="Todos os empreendimentos"
          />
        </div>
        {conteudo}
      </div>
    </Pagina>
  )
}
