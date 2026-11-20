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
import { caminhoDosMtrs } from '@/app/paginas/residuos/registro/comum'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_RESIDUOS,
  conferenciaDeResiduos,
  type PendenciaDaConferencia,
  type TipoDePendenciaDeResiduo,
} from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'

import { classeCabecalho, classeCelula, classeSelect, useEmpreendimentoDaUrl } from './comum'
import { FiltroEmpreendimento, Paginacao } from './PecasDoPainel'

const TIPOS: readonly TipoDePendenciaDeResiduo[] = [
  'mtr_sem_cdf',
  'quantidade_diferente',
  'unidades_diferentes',
]

const TOM: Record<TipoDePendenciaDeResiduo, TomSelo> = {
  mtr_sem_cdf: 'atencao',
  quantidade_diferente: 'perigo',
  unidades_diferentes: 'revisao',
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

function chave(p: PendenciaDaConferencia): string {
  return `${p.tipo}:${p.mtrId}:${p.mtrItemId ?? ''}`
}

function Tabela({ itens }: { itens: readonly PendenciaDaConferencia[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse corpo">
        <caption className="sr-only">Pendências da conferência CDF x MTR</caption>
        <thead>
          <tr>
            <th scope="col" className={classeCabecalho}>
              Pendência
            </th>
            <th scope="col" className={classeCabecalho}>
              MTR
            </th>
            <th scope="col" className={classeCabecalho}>
              Emissão
            </th>
            <th scope="col" className={classeCabecalho}>
              Empreendimento
            </th>
            <th scope="col" className={classeCabecalho}>
              Resíduo
            </th>
            <th scope="col" className={classeCabecalho}>
              Situação
            </th>
            <th scope="col" className={classeCabecalho}>
              CDF
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((p) => (
            <tr key={chave(p)}>
              <td className={classeCelula}>
                <Selo tom={TOM[p.tipo]}>{ROTULO_DA_PENDENCIA_DE_RESIDUO[p.tipo]}</Selo>
              </td>
              <td className={`${classeCelula} corpo-medio whitespace-nowrap`}>
                <Link to={caminhoDosMtrs(p.empreendimentoId)} className="text-(--link)">
                  {p.numero}
                </Link>
              </td>
              <td className={`${classeCelula} whitespace-nowrap tabular-nums`}>
                {formatarDataCivil(p.emitidoEm)}
              </td>
              <td className={classeCelula}>{p.empreendimentoNome}</td>
              <td className={classeCelula}>
                {p.residuoCodigo ? `${p.residuoCodigo} · ${p.residuoDescricao ?? ''}` : '—'}
              </td>
              <td className={`${classeCelula} whitespace-nowrap tabular-nums`}>{detalhe(p)}</td>
              <td className={`${classeCelula} whitespace-nowrap`}>
                {p.cdfs.length > 0 ? p.cdfs.map((c) => c.numero).join(', ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Conferência CDF x MTR (resíduos, fase 1): MTR sem CDF há mais de 30 dias e CDF com quantidade
 * (ou unidade) diferente da do MTR. As pendências vêm calculadas do banco; a tela só filtra por
 * empreendimento (?empreendimento=) e por tipo, e pagina.
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
        />
      ) : (
        <EstadoVazio icone="circle-check" titulo="Nenhuma pendência" />
      )
  } else {
    conteudo = (
      <div className="min-w-0 rounded-(--raio-painel) border bg-(--folha) shadow-cartao">
        <Tabela itens={visiveis} />
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
      <div className="flex flex-col gap-(--e-3) sm:flex-row sm:flex-wrap sm:items-end">
        <FiltroEmpreendimento
          consultoriaId={cid}
          valor={empreendimentoId}
          aoMudar={(id) => {
            mudarEmpreendimento(id)
            setPagina(0)
          }}
          rotuloTodos="Todos os empreendimentos"
        />
        <label className="flex min-w-0 flex-col gap-(--e-1)">
          <span className="rotulo">Pendência</span>
          <select
            className={classeSelect}
            value={tipo ?? ''}
            onChange={(evento) => {
              const valor = evento.target.value
              setTipo(TIPOS.find((t) => t === valor) ?? null)
              setPagina(0)
            }}
          >
            <option value="">{`Todas (${String(todas.length)})`}</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {`${ROTULO_DA_PENDENCIA_DE_RESIDUO[t]} (${String(contagem(t))})`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {conteudo}
    </Pagina>
  )
}
