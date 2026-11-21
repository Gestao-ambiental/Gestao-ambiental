import { formatarDataCivil, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Dialogo } from '@/components/ui/dialogo'
import { classeAreaTexto, classeCampo, classeSelecao } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_SITUACAO_DA_MUDANCA,
  ROTULO_TIPO_DE_CRITERIO,
  ROTULO_TIPO_DE_MUDANCA,
  TIPOS_DE_CRITERIO,
  VALORES_DO_CRITERIO,
  descartarMudancaDeNorma,
  detalheDaMudancaDeNorma,
  ehTipoDeCriterio,
  gerarResumoDaMudanca,
  mensagemDoErroDaNorma,
  publicarMudancaDeNorma,
  type CriterioDeNorma,
  type DetalheDaMudanca,
  type DiferencaDaMudanca,
  type TipoDeCriterio,
  type VersaoNaRevisao,
} from '@/lib/api/central-normas'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCelula, classeLinha, classePainel } from './comum'
import { FUSO_DA_CENTRAL, TOM_DA_SITUACAO_DA_MUDANCA, formatarDolar } from './normas'

const VOLTAR = { para: '/admin/normas', rotulo: 'Normas' }
const LIMITE_RESUMO = 1200
const LIMITE_MOTIVO = 500

type Aviso = { tom: 'sucesso' | 'perigo'; texto: string } | null

function dataDaVersao(versao: VersaoNaRevisao | null): string {
  return versao?.publicadaEm ? formatarDataCivil(versao.publicadaEm as DataCivil) : ''
}

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

function Trecho({ titulo, versao }: { titulo: string; versao: VersaoNaRevisao | null }) {
  const data = dataDaVersao(versao)
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-(--e-2) p-(--e-4) ${classePainel}`}>
      <h3 className="corpo-medio text-(--tinta)">
        {titulo}
        {data ? <span className="numero"> · {data}</span> : null}
      </h3>
      <p className="max-h-[360px] overflow-auto corpo whitespace-pre-wrap break-words">
        {versao && versao.trecho !== '' ? versao.trecho : '—'}
      </p>
    </div>
  )
}

/** Diferença entre as versões: incluídos, alterados (antes riscado, depois destacado) e revogados. */
function DiferencaEntreVersoes({ detalhe }: { detalhe: DetalheDaMudanca }) {
  const diferenca: DiferencaDaMudanca | null = detalhe.diferenca
  if (diferenca?.estruturada !== true) {
    return (
      <div className="flex flex-col gap-(--e-3)">
        <p className="corpo-medio text-(--tinta)">
          {diferenca?.mudou === false ? 'Texto igual' : 'Texto mudou'}
        </p>
        <div className="flex flex-col gap-(--e-3) md:flex-row">
          <Trecho titulo="Versão anterior" versao={detalhe.versaoAnterior} />
          <Trecho titulo="Versão nova" versao={detalhe.versaoNova} />
        </div>
      </div>
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
          <h3 className="corpo-medio text-(--tinta)">Incluídos ({String(incluidos.length)})</h3>
          <ul className="flex flex-col gap-(--e-2)">
            {incluidos.map((d) => (
              <li key={d.caminho} className="flex flex-col gap-(--e-1)">
                <span className="corpo-medio">{d.rotulo}</span>
                <ins className="rounded-(--raio-mini) bg-(--ok-fundo) px-(--e-1) text-(--tinta) no-underline">
                  {d.texto}
                </ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {alterados.length > 0 ? (
        <div className="flex flex-col gap-(--e-2)">
          <h3 className="corpo-medio text-(--tinta)">Alterados ({String(alterados.length)})</h3>
          <ul className="flex flex-col gap-(--e-3)">
            {alterados.map((d) => (
              <li key={d.caminho} className="flex flex-col gap-(--e-1)">
                <span className="corpo-medio">{d.rotulo}</span>
                <span className="rotulo">Antes</span>
                <del className="text-(--tinta-2)">{d.antes}</del>
                <span className="rotulo">Depois</span>
                <ins className="rounded-(--raio-mini) bg-(--ok-fundo) px-(--e-1) text-(--tinta) no-underline">
                  {d.depois}
                </ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {revogados.length > 0 ? (
        <div className="flex flex-col gap-(--e-2)">
          <h3 className="corpo-medio text-(--tinta)">Revogados ({String(revogados.length)})</h3>
          <ul className="flex flex-col gap-(--e-2)">
            {revogados.map((d) => (
              <li key={d.caminho} className="flex flex-col gap-(--e-1)">
                <span className="corpo-medio">{d.rotulo}</span>
                <del className="text-(--tinta-2)">{d.texto}</del>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function DialogoDescartar({
  aberto,
  aoMudarAberto,
  salvando,
  falha,
  aoDescartar,
}: {
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  salvando: boolean
  falha: string | null
  aoDescartar: (motivo: string) => void
}) {
  const idMotivo = useId()
  const idErro = useId()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function mudarAberto(valor: boolean) {
    if (valor) {
      setMotivo('')
      setErro(null)
    }
    aoMudarAberto(valor)
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudarAberto}
      titulo="Descartar mudança"
      acoes={
        <>
          <Botao
            disabled={salvando}
            onClick={() => {
              mudarAberto(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="perigo"
            disabled={salvando}
            aria-busy={salvando || undefined}
            onClick={() => {
              if (motivo.trim() === '') {
                setErro('Informe o motivo')
                return
              }
              aoDescartar(motivo.trim())
            }}
          >
            {salvando ? 'Descartando…' : 'Descartar'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={idMotivo} className="rotulo">
          Motivo
        </label>
        <textarea
          id={idMotivo}
          rows={3}
          maxLength={LIMITE_MOTIVO}
          required
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value)
            if (erro && evento.target.value.trim() !== '') setErro(null)
          }}
          className={classeAreaTexto}
        />
        {erro ? (
          <span id={idErro} className="text-xs font-[650] text-(--atraso-texto)">
            {erro}
          </span>
        ) : null}
      </div>
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
    </Dialogo>
  )
}

/** Critérios como fichas removíveis, com tipo e valor para acrescentar. */
function Criterios({
  criterios,
  editavel,
  aoMudar,
}: {
  criterios: CriterioDeNorma[]
  editavel: boolean
  aoMudar: (criterios: CriterioDeNorma[]) => void
}) {
  const idTipo = useId()
  const idValor = useId()
  const idErro = useId()
  const [tipo, setTipo] = useState<TipoDeCriterio>('atividade')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const opcoes = VALORES_DO_CRITERIO[tipo]

  function acrescentar() {
    const limpo = (valor || (opcoes?.[0] ?? '')).trim()
    if (limpo === '') {
      setErro('Informe o valor')
      return
    }
    setErro(null)
    if (!criterios.some((c) => c.tipo === tipo && c.valor === limpo)) {
      aoMudar([...criterios, { tipo, valor: limpo }])
    }
    setValor('')
  }

  return (
    <div className="flex flex-col gap-(--e-3)">
      <span className="rotulo">Critérios</span>
      {criterios.length === 0 ? (
        <p className="corpo text-(--tinta)">Nenhum critério</p>
      ) : (
        <ul aria-label="Critérios" className="flex flex-wrap gap-(--e-2)">
          {criterios.map((c) => {
            const rotulo = `${ROTULO_TIPO_DE_CRITERIO[c.tipo]}: ${c.valor}`
            return (
              <li
                key={`${c.tipo}:${c.valor}`}
                className="inline-flex items-center gap-(--e-1) rounded-(--raio-redondo) border border-(--regra-forte) bg-(--folha) py-(--e-05) pr-(--e-05) pl-(--e-3) corpo"
              >
                <span>{rotulo}</span>
                {editavel ? (
                  <BotaoIcone
                    icone="x"
                    tamanho="compacto"
                    rotulo={`Remover ${rotulo}`}
                    onClick={() => {
                      aoMudar(criterios.filter((outro) => outro !== c))
                    }}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {editavel ? (
        <div className="flex flex-wrap items-end gap-(--e-2)">
          <div className="flex flex-col gap-(--e-1)">
            <label htmlFor={idTipo} className="rotulo">
              Tipo do critério
            </label>
            <select
              id={idTipo}
              value={tipo}
              onChange={(evento) => {
                if (ehTipoDeCriterio(evento.target.value)) setTipo(evento.target.value)
                setValor('')
                setErro(null)
              }}
              className={classeSelecao}
            >
              {TIPOS_DE_CRITERIO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_DE_CRITERIO[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[160px] flex-1 flex-col gap-(--e-1) md:max-w-[280px]">
            <label htmlFor={idValor} className="rotulo">
              Valor do critério
            </label>
            {opcoes ? (
              <select
                id={idValor}
                value={valor || opcoes[0]}
                onChange={(evento) => {
                  setValor(evento.target.value)
                }}
                className={classeSelecao}
              >
                {opcoes.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={idValor}
                value={valor}
                maxLength={120}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? idErro : undefined}
                onChange={(evento) => {
                  setValor(evento.target.value)
                  if (erro) setErro(null)
                }}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') {
                    evento.preventDefault()
                    acrescentar()
                  }
                }}
                className={classeCampo}
              />
            )}
          </div>
          <Botao iconeAntes="plus" onClick={acrescentar}>
            Acrescentar
          </Botao>
          {erro ? (
            <span id={idErro} className="w-full text-xs font-[650] text-(--atraso-texto)">
              {erro}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Resumo, "o que muda" e critérios editáveis, com Gerar resumo, Publicar (confirmação na própria
 * página) e Descartar (motivo num diálogo). Publicada ou descartada, fica só para leitura.
 */
function Revisao({
  detalhe,
  aoAvisar,
}: {
  detalhe: DetalheDaMudanca
  aoAvisar: (aviso: Aviso) => void
}) {
  const cliente = useQueryClient()
  const idResumo = useId()
  const idErroResumo = useId()
  const idOQueMuda = useId()
  const editavel = detalhe.situacao === 'detectada' || detalhe.situacao === 'resumida'
  const [resumo, setResumo] = useState(detalhe.resumo?.resumo ?? '')
  const [oQueMuda, setOQueMuda] = useState((detalhe.resumo?.oQueMuda ?? []).join('\n'))
  const [criterios, setCriterios] = useState<CriterioDeNorma[]>(detalhe.criteriosSugeridos)
  const [erroResumo, setErroResumo] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [descartando, setDescartando] = useState(false)

  function recarregar() {
    void cliente.invalidateQueries({ queryKey: ['central', 'normas'] })
  }

  const gerar = useMutation({
    mutationFn: () => gerarResumoDaMudanca(detalhe.id),
    onMutate: () => {
      aoAvisar(null)
    },
    onSuccess: () => {
      aoAvisar({ tom: 'sucesso', texto: 'Resumo gerado.' })
      recarregar()
    },
    onError: (erro) => {
      aoAvisar({ tom: 'perigo', texto: mensagemDoErroDaNorma(erro) })
      recarregar()
    },
  })

  const publicar = useMutation({
    mutationFn: () =>
      publicarMudancaDeNorma(
        detalhe.id,
        { resumo, oQueMuda: oQueMuda.split('\n'), original: detalhe.resumo?.original ?? null },
        criterios,
      ),
    onSuccess: () => {
      setConfirmando(false)
      aoAvisar({ tom: 'sucesso', texto: 'Mudança publicada.' })
      recarregar()
    },
    onError: (erro) => {
      setConfirmando(false)
      aoAvisar({ tom: 'perigo', texto: mensagemDoErroDaNorma(erro) })
    },
  })

  const descartar = useMutation({
    mutationFn: (motivo: string) => descartarMudancaDeNorma(detalhe.id, motivo),
    onSuccess: () => {
      setDescartando(false)
      aoAvisar({ tom: 'sucesso', texto: 'Mudança descartada.' })
      recarregar()
    },
  })

  function pedirPublicacao() {
    const limpo = resumo.trim()
    if (limpo === '') {
      setErroResumo('Informe o resumo')
      return
    }
    if (limpo.length > LIMITE_RESUMO) {
      setErroResumo('Use até 1.200 caracteres no resumo')
      return
    }
    setErroResumo(null)
    aoAvisar(null)
    setConfirmando(true)
  }

  const ocupado = gerar.isPending || publicar.isPending || descartar.isPending

  return (
    <div className="flex flex-col gap-(--e-4)">
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={idResumo} className="rotulo">
          Resumo
        </label>
        <textarea
          id={idResumo}
          rows={5}
          maxLength={LIMITE_RESUMO}
          readOnly={!editavel}
          aria-invalid={erroResumo ? true : undefined}
          aria-describedby={erroResumo ? idErroResumo : undefined}
          value={resumo}
          onChange={(evento) => {
            setResumo(evento.target.value)
            if (erroResumo && evento.target.value.trim() !== '') setErroResumo(null)
          }}
          className={classeAreaTexto}
        />
        {erroResumo ? (
          <span id={idErroResumo} className="text-xs font-[650] text-(--atraso-texto)">
            {erroResumo}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={idOQueMuda} className="rotulo">
          O que muda
        </label>
        <textarea
          id={idOQueMuda}
          rows={4}
          readOnly={!editavel}
          value={oQueMuda}
          onChange={(evento) => {
            setOQueMuda(evento.target.value)
          }}
          className={classeAreaTexto}
        />
      </div>
      <Criterios criterios={criterios} editavel={editavel} aoMudar={setCriterios} />
      {detalhe.motivoDescarte ? (
        <dl className="flex flex-col gap-(--e-1)">
          <dt className="rotulo">Motivo do descarte</dt>
          <dd className="corpo whitespace-pre-wrap break-words">{detalhe.motivoDescarte}</dd>
        </dl>
      ) : null}

      {editavel && confirmando ? (
        <MensagemSecao
          tom="atencao"
          titulo="Publicar para as consultorias?"
          acoes={
            <>
              <Botao
                disabled={publicar.isPending}
                onClick={() => {
                  setConfirmando(false)
                }}
              >
                Voltar
              </Botao>
              <Botao
                aparencia="primario"
                disabled={publicar.isPending}
                aria-busy={publicar.isPending || undefined}
                onClick={() => {
                  publicar.mutate()
                }}
              >
                {publicar.isPending ? 'Publicando…' : 'Confirmar publicação'}
              </Botao>
            </>
          }
        />
      ) : null}

      {editavel && !confirmando ? (
        <div className="flex flex-wrap gap-(--e-2) max-md:flex-col max-md:[&>*]:w-full">
          <Botao
            iconeAntes="sparkles"
            disabled={ocupado}
            aria-busy={gerar.isPending || undefined}
            onClick={() => {
              gerar.mutate()
            }}
          >
            {gerar.isPending ? 'Gerando…' : detalhe.resumo ? 'Gerar de novo' : 'Gerar resumo'}
          </Botao>
          <Botao
            aparencia="perigo"
            disabled={ocupado}
            onClick={() => {
              descartar.reset()
              setDescartando(true)
            }}
          >
            Descartar
          </Botao>
          <Botao aparencia="primario" disabled={ocupado} onClick={pedirPublicacao}>
            Publicar
          </Botao>
        </div>
      ) : null}

      <DialogoDescartar
        aberto={descartando}
        aoMudarAberto={setDescartando}
        salvando={descartar.isPending}
        falha={descartar.isError ? mensagemDoErroDaNorma(descartar.error) : null}
        aoDescartar={(motivo) => {
          descartar.mutate(motivo)
        }}
      />
    </div>
  )
}

function ChamadasDeIa({ detalhe }: { detalhe: DetalheDaMudanca }) {
  if (detalhe.chamadas.length === 0) return null
  return (
    <Secao titulo="Chamadas de IA">
      <div className={`overflow-auto ${classePainel}`}>
        <table className="w-full border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Quando
              </th>
              <th scope="col" className={classeCabecalho}>
                Modelo
              </th>
              <th scope="col" className={classeCabecalho}>
                Situação
              </th>
              <th scope="col" className={classeCabecalho}>
                Custo
              </th>
            </tr>
          </thead>
          <tbody>
            {detalhe.chamadas.map((chamada, indice) => (
              <tr key={chamada.id || String(indice)} className={classeLinha}>
                <td className={`${classeCelula} whitespace-nowrap numero`}>
                  {chamada.criadoEm
                    ? formatarInstanteComHora(chamada.criadoEm, FUSO_DA_CENTRAL)
                    : '—'}
                </td>
                <td className={classeCelula}>{chamada.modelo ?? '—'}</td>
                <td className={classeCelula}>{chamada.situacao}</td>
                <td className={`${classeCelula} whitespace-nowrap numero`}>
                  {formatarDolar(chamada.custoMicros)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Secao>
  )
}

/**
 * /admin/normas/:id (LEG-04; ADR-0050, itens 14 a 16): a mudança detectada com a diferença entre
 * versões, o resumo por IA para o operador revisar e as ações de publicar e descartar.
 */
export function PaginaCentralMudancaDeNorma() {
  const { id = '' } = useParams()
  const [aviso, setAviso] = useState<Aviso>(null)
  const consulta = useQuery({
    queryKey: ['central', 'normas', 'mudanca', id],
    queryFn: () => detalheDaMudancaDeNorma(id),
  })

  if (consulta.isPending) {
    return (
      <Pagina titulo="Mudança de norma" voltar={VOLTAR}>
        <Carregando rotulo="Carregando a mudança" linhas={6} />
      </Pagina>
    )
  }
  if (consulta.isError) {
    let estado
    if (ehDoisFatoresNecessarios(consulta.error)) estado = <RelerDoisFatores />
    else if (ehSemPermissao(consulta.error)) estado = <SemPermissao descricao={null} />
    else
      estado = (
        <EstadoErro
          titulo="Não foi possível carregar a mudança."
          descricao="Verifique a conexão e tente de novo."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      )
    return (
      <Pagina titulo="Mudança de norma" voltar={VOLTAR}>
        {estado}
      </Pagina>
    )
  }
  const detalhe = consulta.data
  if (!detalhe) {
    return (
      <Pagina titulo="Mudança de norma" voltar={VOLTAR}>
        <EstadoVazio icone="file-text" titulo="Esta mudança não existe mais" />
      </Pagina>
    )
  }

  const chaveDaRevisao = JSON.stringify([
    detalhe.situacao,
    detalhe.resumo?.original ?? null,
    detalhe.criteriosSugeridos,
  ])

  return (
    <Pagina
      titulo={detalhe.norma.titulo || 'Mudança de norma'}
      voltar={VOLTAR}
      meta={
        <span className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
          <span>{ROTULO_TIPO_DE_MUDANCA[detalhe.tipo]}</span>
          <Selo tom={TOM_DA_SITUACAO_DA_MUDANCA[detalhe.situacao]}>
            {ROTULO_SITUACAO_DA_MUDANCA[detalhe.situacao]}
          </Selo>
          {detalhe.detectadaEm ? (
            <span className="numero">
              Detectada em {formatarInstanteComoData(detalhe.detectadaEm, FUSO_DA_CENTRAL)}
            </span>
          ) : null}
        </span>
      }
      acao={
        detalhe.urlOficial ? (
          <a
            href={detalhe.urlOficial}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-(--e-1) corpo-medio"
          >
            Fonte oficial
            <Icone nome="external-link" />
          </a>
        ) : null
      }
    >
      {aviso ? (
        <MensagemSecao role={aviso.tom === 'perigo' ? 'alert' : 'status'} tom={aviso.tom}>
          {aviso.texto}
        </MensagemSecao>
      ) : null}
      <Secao titulo="Diferença">
        <DiferencaEntreVersoes detalhe={detalhe} />
      </Secao>
      <Secao titulo="Revisão">
        <Revisao key={chaveDaRevisao} detalhe={detalhe} aoAvisar={setAviso} />
      </Secao>
      <ChamadasDeIa detalhe={detalhe} />
    </Pagina>
  )
}
