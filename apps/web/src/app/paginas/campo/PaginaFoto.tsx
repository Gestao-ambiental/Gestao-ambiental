import {
  LIMITES_DA_VISTORIA,
  SEM_LOCAL,
  aceitaRegistro,
  conferirLocalizacao,
  descreverLocal,
  localDoAparelho,
  localManual,
  rotuloDaPrecisao,
  type LocalDaFoto,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  adicionarFotoDaVistoria,
  conferirArquivoDaFoto,
  type ItemDaVistoriaGravado,
  type ProblemaDaFoto,
  type Vistoria,
} from '@/lib/api/vistorias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErroDaVistoria } from '@/lib/erros'

import { recarregarVistoria, useItensDaVistoria, useVistoria } from './consultas'
import { classeAlvo, classeCartao } from './estilos'
import { BarraDeAcao, ColunaCampo, ComVistoria, VoltarPara } from './pecas'

const PROBLEMA_DA_FOTO: Record<ProblemaDaFoto, string> = {
  tipo: 'Use uma foto JPEG ou PNG.',
  vazia: 'A foto veio vazia. Tire de novo.',
  grande_demais: 'A foto passa de 25 MB.',
}

type EstadoDoLocal =
  | { tipo: 'pedindo' }
  | { tipo: 'obtido'; local: LocalDaFoto }
  | { tipo: 'falhou'; negada: boolean }
  | { tipo: 'manual' }
  | { tipo: 'nenhum' }

/** Localização do aparelho (alta precisão, opcional); negada ou falha oferece descrever o local. */
function temGeolocalizacao(): boolean {
  return 'geolocation' in navigator
}

function useLocalizacao() {
  const [estado, setEstado] = useState<EstadoDoLocal>(() =>
    temGeolocalizacao() ? { tipo: 'pedindo' } : { tipo: 'falhou', negada: false },
  )
  const consultar = useCallback(() => {
    if (!temGeolocalizacao()) return
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setEstado({ tipo: 'obtido', local: localDoAparelho(posicao.coords) })
      },
      (erro) => {
        setEstado({ tipo: 'falhou', negada: erro.code === erro.PERMISSION_DENIED })
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }, [])
  useEffect(() => {
    consultar()
  }, [consultar])
  const pedir = useCallback(() => {
    setEstado(temGeolocalizacao() ? { tipo: 'pedindo' } : { tipo: 'falhou', negada: false })
    consultar()
  }, [consultar])
  return { estado, setEstado, pedir }
}

function SecaoLocal({
  estado,
  descricao,
  erroDescricao,
  aoDescrever,
  aoMudarDescricao,
  aoSeguirSemLocal,
  aoTentarDeNovo,
}: {
  estado: EstadoDoLocal
  descricao: string
  erroDescricao: string | null
  aoDescrever: () => void
  aoMudarDescricao: (texto: string) => void
  aoSeguirSemLocal: () => void
  aoTentarDeNovo: () => void
}) {
  const alternativas = (
    <>
      <Botao tamanho="compacto" onClick={aoDescrever}>
        Descrever o local
      </Botao>
      <Botao tamanho="compacto" onClick={aoSeguirSemLocal}>
        Seguir sem local
      </Botao>
      <Botao tamanho="compacto" iconeAntes="refresh-cw" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Botao>
    </>
  )
  return (
    <section
      aria-labelledby="titulo-local"
      className={`${classeCartao} flex flex-col gap-(--space-100) p-(--space-150)`}
    >
      <h2 id="titulo-local" className="corpo-medio">
        Localização
      </h2>
      <div role="status" aria-live="polite">
        {estado.tipo === 'pedindo' ? (
          <p className="corpo text-(--text-subtle)">Obtendo localização…</p>
        ) : estado.tipo === 'obtido' ? (
          <p className="corpo">
            {descreverLocal({ ...estado.local, precisaoM: null })}
            {estado.local.precisaoM === null ? null : (
              <span className="block text-xs text-(--text-subtle)">
                Precisão {rotuloDaPrecisao(estado.local.precisaoM)}
              </span>
            )}
          </p>
        ) : estado.tipo === 'nenhum' ? (
          <p className="corpo">Sem localização</p>
        ) : null}
      </div>
      {estado.tipo === 'falhou' ? (
        <MensagemSecao
          tom="atencao"
          titulo={estado.negada ? 'Localização negada' : 'Localização indisponível'}
          acoes={<div className="flex flex-wrap gap-(--space-100)">{alternativas}</div>}
        />
      ) : null}
      {estado.tipo === 'manual' ? (
        <CampoTexto
          rotulo="Descrição do local"
          value={descricao}
          maxLength={LIMITES_DA_VISTORIA.localManual}
          erro={erroDescricao ?? undefined}
          onChange={(evento) => {
            aoMudarDescricao(evento.target.value)
          }}
        />
      ) : null}
      {estado.tipo === 'obtido' ? (
        <div className="flex flex-wrap gap-(--space-100)">
          <Botao tamanho="compacto" iconeAntes="refresh-cw" onClick={aoTentarDeNovo}>
            Atualizar
          </Botao>
        </div>
      ) : estado.tipo === 'manual' || estado.tipo === 'nenhum' ? (
        <div className="flex flex-wrap gap-(--space-100)">
          {estado.tipo === 'nenhum' ? (
            <Botao tamanho="compacto" onClick={aoDescrever}>
              Descrever o local
            </Botao>
          ) : null}
          <Botao tamanho="compacto" iconeAntes="refresh-cw" onClick={aoTentarDeNovo}>
            Usar a localização do aparelho
          </Botao>
        </div>
      ) : null}
    </section>
  )
}

interface Captura {
  fotoId: string
  arquivo: File
  previa: string | null
  capturadaEm: string
}

function Foto({ vistoria, item }: { vistoria: Vistoria; item: ItemDaVistoriaGravado }) {
  const { atual } = useConsultoria()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const { estado, setEstado, pedir } = useLocalizacao()
  const [captura, setCaptura] = useState<Captura | null>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [erroDescricao, setErroDescricao] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const checklist = `/campo/${vistoria.id}/checklist`

  const previa = captura?.previa
  useEffect(
    () => () => {
      if (previa && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previa)
    },
    [previa],
  )

  const vincular = useMutation({
    mutationFn: (local: LocalDaFoto) => {
      if (!captura) throw new Error('sem_foto')
      return adicionarFotoDaVistoria({
        consultoriaId: vistoria.consultoriaId,
        fotoId: captura.fotoId,
        itemId: item.id,
        arquivo: captura.arquivo,
        legenda: legenda.trim() || null,
        capturadaEm: captura.capturadaEm,
        local,
      })
    },
    onSuccess: async () => {
      await recarregarVistoria(queryClient, vistoria.id)
      await navigate(`${checklist}#item-${item.id}`)
    },
  })

  function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    const problema = conferirArquivoDaFoto(arquivo)
    if (problema) {
      setErroArquivo(PROBLEMA_DA_FOTO[problema])
      return
    }
    setErroArquivo(null)
    vincular.reset()
    setCaptura({
      // Um id por foto escolhida: tentar de novo não duplica nem o objeto nem a linha.
      fotoId: crypto.randomUUID(),
      arquivo,
      previa: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(arquivo) : null,
      capturadaEm: new Date().toISOString(),
    })
  }

  function localEscolhido(): LocalDaFoto | null {
    switch (estado.tipo) {
      case 'obtido':
        return estado.local
      case 'manual':
        return localManual(descricao)
      case 'nenhum':
        return SEM_LOCAL
      default:
        return null
    }
  }

  function confirmar() {
    const local = localEscolhido()
    if (!local) {
      setErroLocal('Escolha como registrar o local.')
      return
    }
    const problema = conferirLocalizacao(local)
    if (problema === 'descricao_obrigatoria') {
      setErroDescricao('Descreva o local')
      return
    }
    if (problema) {
      setErroLocal('Confira a localização da foto.')
      return
    }
    setErroLocal(null)
    vincular.mutate(local)
  }

  const secaoLocal = (
    <SecaoLocal
      estado={estado}
      descricao={descricao}
      erroDescricao={erroDescricao}
      aoDescrever={() => {
        setEstado({ tipo: 'manual' })
        setErroLocal(null)
      }}
      aoMudarDescricao={(texto) => {
        setDescricao(texto)
        if (texto.trim()) setErroDescricao(null)
      }}
      aoSeguirSemLocal={() => {
        setEstado({ tipo: 'nenhum' })
        setErroLocal(null)
      }}
      aoTentarDeNovo={pedir}
    />
  )

  const contexto = (
    <header className="flex flex-col gap-(--space-050)">
      <p className="text-xs text-(--text-subtle)">Checklist · {item.titulo}</p>
      <h1 className="titulo-tela text-(--text)">
        {captura ? 'Revisar evidência' : 'Foto e localização'}
      </h1>
    </header>
  )

  const campoArquivo = (
    <input
      ref={entrada}
      type="file"
      accept="image/jpeg,image/png"
      capture="environment"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(evento) => {
        escolher(evento.target.files?.[0])
        evento.target.value = ''
      }}
    />
  )

  if (!captura) {
    return (
      <ColunaCampo>
        <VoltarPara para={checklist} rotulo="Checklist" />
        {contexto}
        {campoArquivo}
        {erroArquivo ? (
          <MensagemSecao role="alert" tom="perigo">
            {erroArquivo}
          </MensagemSecao>
        ) : null}
        <button
          type="button"
          onClick={() => {
            entrada.current?.click()
          }}
          className={`${classeCartao} flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-(--space-100) border-dashed text-(--text-subtle) transicao-estado hover:bg-(--surface-hover)`}
        >
          <Icone nome="image" tamanho={24} />
          <span className="corpo-medio text-(--text)">Tirar foto</span>
        </button>
        {secaoLocal}
        <BarraDeAcao>
          <Botao asChild className={`${classeAlvo} flex-1`}>
            <Link to={checklist}>Cancelar</Link>
          </Botao>
        </BarraDeAcao>
      </ColunaCampo>
    )
  }

  return (
    <ColunaCampo>
      <VoltarPara para={checklist} rotulo="Checklist" />
      {contexto}
      {captura.previa ? (
        <img
          src={captura.previa}
          alt={`Prévia da foto de ${item.titulo}`}
          className={`${classeCartao} max-h-[50vh] w-full object-contain`}
        />
      ) : null}
      <dl className={`${classeCartao} px-(--space-150)`}>
        <div className="flex justify-between gap-(--space-200) border-b py-(--space-100)">
          <dt className="corpo text-(--text-subtle)">Item</dt>
          <dd className="text-right corpo-medio">{item.titulo}</dd>
        </div>
        <div className="flex justify-between gap-(--space-200) py-(--space-100)">
          <dt className="corpo text-(--text-subtle)">Data e hora</dt>
          <dd className="text-right corpo-medio">
            {formatarInstanteComHora(captura.capturadaEm, atual.fuso)}
          </dd>
        </div>
      </dl>
      {secaoLocal}
      {erroLocal ? (
        <MensagemSecao role="alert" tom="atencao">
          {erroLocal}
        </MensagemSecao>
      ) : null}
      <CampoTexto
        rotulo="Legenda (opcional)"
        value={legenda}
        maxLength={LIMITES_DA_VISTORIA.legenda}
        onChange={(evento) => {
          setLegenda(evento.target.value)
        }}
      />
      {vincular.isError ? (
        <MensagemSecao role="alert" tom="perigo" titulo="Não salvou">
          {mensagemDoErroDaVistoria(vincular.error)}
        </MensagemSecao>
      ) : null}
      <BarraDeAcao>
        <Botao
          className={`${classeAlvo} flex-1`}
          disabled={vincular.isPending}
          onClick={() => {
            setCaptura(null)
            vincular.reset()
          }}
        >
          Refazer
        </Botao>
        <Botao
          aparencia="primario"
          iconeDepois="check"
          className={`${classeAlvo} flex-[2]`}
          disabled={vincular.isPending || estado.tipo === 'pedindo'}
          onClick={confirmar}
        >
          {vincular.isPending ? 'Salvando…' : vincular.isError ? 'Tentar de novo' : 'Vincular foto'}
        </Botao>
      </BarraDeAcao>
    </ColunaCampo>
  )
}

function FotoDoItem({ vistoria, itemId }: { vistoria: Vistoria; itemId: string }) {
  const itens = useItensDaVistoria(vistoria.id, true)
  const voltar = <VoltarPara para={`/campo/${vistoria.id}/checklist`} rotulo="Checklist" />
  if (itens.isPending) {
    return (
      <ColunaCampo>
        {voltar}
        <Carregando rotulo="Carregando o item" linhas={3} />
      </ColunaCampo>
    )
  }
  if (itens.isError) {
    return (
      <ColunaCampo>
        {voltar}
        <EstadoErro
          titulo="Não foi possível carregar o item."
          aoTentarDeNovo={() => void itens.refetch()}
        />
      </ColunaCampo>
    )
  }
  const item = itens.data.find((i) => i.id === itemId)
  const aceita = vistoria.podeRegistrar && aceitaRegistro(vistoria.situacao)
  if (!item || !aceita) {
    return (
      <ColunaCampo>
        {voltar}
        <h1 className="sr-only">Foto e localização</h1>
        <EstadoVazio
          icone="image"
          titulo={item ? 'Esta vistoria não aceita fotos agora' : 'Item não encontrado'}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to={`/campo/${vistoria.id}/checklist`}>Voltar ao checklist</Link>
            </Botao>
          }
        />
      </ColunaCampo>
    )
  }
  return <Foto vistoria={vistoria} item={item} />
}

/**
 * /campo/:id/itens/:itemId/foto (ADR-0033 §5): câmera real, localização opcional e revisão antes
 * de vincular. A foto que falhou fica na tela para tentar de novo; nada é guardado no aparelho.
 */
export function PaginaFoto() {
  const { id = '', itemId = '' } = useParams()
  const consulta = useVistoria(id)
  return (
    <ComVistoria
      consulta={consulta}
      voltar={<VoltarPara para={`/campo/${id}/checklist`} rotulo="Checklist" />}
    >
      {(vistoria) => <FotoDoItem vistoria={vistoria} itemId={itemId} />}
    </ComVistoria>
  )
}
