import {
  LIMITES_DA_VISTORIA,
  SEM_LOCAL,
  aceitaRegistro,
  conferirLocalizacao,
  descreverLocal,
  fotoRepetida,
  localDoAparelho,
  localManual,
  rotuloDaPrecisao,
  type LocalDaFoto,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  conferirArquivoDaFoto,
  type ItemDaVistoriaGravado,
  type ProblemaDaFoto,
  type Vistoria,
} from '@/lib/api/vistorias'
import { formatarInstanteComHora } from '@/lib/datas'
import { sha256 } from '@/lib/api/ocorrencias'
import { filaDeCampo } from '@/lib/campo/fila'

import { useFotosDaVistoria, useItensDaVistoria, useVistoria } from './consultas'
import { classeAcaoPrincipal, classeAcaoSecundaria } from './estilos'
import { BarraDeAcao, ColunaCampo, ComVistoria, VoltarPara } from './pecas'
import { useRascunhoDaVistoria } from './rascunho'

const FOTO_REPETIDA = 'foto_repetida'

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
    <section aria-labelledby="titulo-local" className="flex flex-col gap-(--e-3)">
      <h2 id="titulo-local" className="titulo-secao text-(--tinta)">
        Localização
      </h2>
      <div role="status" aria-live="polite">
        {estado.tipo === 'pedindo' ? (
          <p className="inline-flex items-center gap-(--e-2) corpo text-(--tinta-2)">
            <Icone nome="map-pin" />
            Obtendo localização…
          </p>
        ) : estado.tipo === 'obtido' ? (
          <p className="flex items-start gap-(--e-2) corpo-medio text-(--tinta)">
            <Icone nome="map-pin" className="mt-(--e-05) text-(--ok-texto)" />
            <span className="numero">
              {descreverLocal({ ...estado.local, precisaoM: null })}
              {estado.local.precisaoM === null ? null : (
                <span className="block corpo text-(--tinta-2)">
                  Precisão {rotuloDaPrecisao(estado.local.precisaoM)}
                </span>
              )}
            </span>
          </p>
        ) : estado.tipo === 'nenhum' ? (
          <p className="corpo-medio text-(--tinta)">Sem localização</p>
        ) : null}
      </div>
      {estado.tipo === 'falhou' ? (
        <MensagemSecao
          tom="atencao"
          titulo={estado.negada ? 'Localização negada' : 'Localização indisponível'}
          acoes={<div className="flex flex-wrap gap-(--e-2)">{alternativas}</div>}
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
        <div className="flex flex-wrap gap-(--e-2)">
          <Botao tamanho="compacto" iconeAntes="refresh-cw" onClick={aoTentarDeNovo}>
            Atualizar
          </Botao>
        </div>
      ) : estado.tipo === 'manual' || estado.tipo === 'nenhum' ? (
        <div className="flex flex-wrap gap-(--e-2)">
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

function Foto({
  vistoria,
  item,
  fotosDoItem,
}: {
  vistoria: Vistoria
  item: ItemDaVistoriaGravado
  /** Fotos do item no servidor e no aparelho, para recusar a mesma imagem de novo. */
  fotosDoItem: readonly { itemId: string; sha256: string | null }[]
}) {
  const { atual } = useConsultoria()
  const navigate = useNavigate()
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

  // A foto vai primeiro para o aparelho e volta ao checklist na hora; a fila envia quando houver
  // conexão (ADR-0060). `always`: sem sinal, gravar no aparelho não espera a rede.
  const vincular = useMutation({
    networkMode: 'always',
    mutationFn: async (local: LocalDaFoto) => {
      if (!captura) throw new Error('sem_foto')
      const [bytes, hash] = await Promise.all([
        captura.arquivo.arrayBuffer(),
        sha256(captura.arquivo),
      ])
      if (fotoRepetida(fotosDoItem, item.id, hash)) throw new Error(FOTO_REPETIDA)
      await filaDeCampo.registrar({
        tipo: 'foto',
        vistoriaId: vistoria.id,
        itemId: item.id,
        fotoId: captura.fotoId,
        sha256: hash,
        registradoEm: new Date().toISOString(),
        dados: {
          consultoriaId: vistoria.consultoriaId,
          nome: captura.arquivo.name,
          mime: captura.arquivo.type,
          bytes,
          legenda: legenda.trim() || null,
          capturadaEm: captura.capturadaEm,
          local,
        },
      })
    },
    onSuccess: async () => {
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

  const moldura = {
    titulo: captura ? 'Revisar evidência' : 'Foto e localização',
    voltar: { para: checklist, rotulo: 'Checklist' },
    meta: item.titulo,
  }

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
      <ColunaCampo comBarra>
        <Pagina {...moldura}>
          {campoArquivo}
          {erroArquivo ? (
            <MensagemSecao role="alert" tom="perigo">
              {erroArquivo}
            </MensagemSecao>
          ) : null}
          {secaoLocal}
          <BarraDeAcao>
            <Botao aparencia="sutil" asChild className={classeAcaoSecundaria}>
              <Link to={checklist}>Cancelar</Link>
            </Botao>
            <Botao
              aparencia="primario"
              iconeAntes="camera"
              className={classeAcaoPrincipal}
              onClick={() => {
                entrada.current?.click()
              }}
            >
              Tirar foto
            </Botao>
          </BarraDeAcao>
        </Pagina>
      </ColunaCampo>
    )
  }

  return (
    <ColunaCampo comBarra>
      <Pagina {...moldura}>
        {captura.previa ? (
          <img
            src={captura.previa}
            alt={`Prévia da foto de ${item.titulo}`}
            className="max-h-[50vh] w-full rounded-(--raio-painel) border bg-(--folha) object-contain"
          />
        ) : null}
        <dl className="flex flex-col">
          <div className="flex justify-between gap-(--e-4) border-b border-(--regra-leve) py-(--e-3)">
            <dt className="rotulo">Item</dt>
            <dd className="text-right corpo-medio text-(--tinta)">{item.titulo}</dd>
          </div>
          <div className="flex justify-between gap-(--e-4) py-(--e-3)">
            <dt className="rotulo">Data e hora</dt>
            <dd className="text-right corpo-medio text-(--tinta) numero">
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
          vincular.error.message === FOTO_REPETIDA ? (
            <MensagemSecao role="alert" tom="atencao" titulo="Foto repetida">
              Esta imagem já está neste item.
            </MensagemSecao>
          ) : (
            <MensagemSecao role="alert" tom="perigo" titulo="Não salvou no aparelho">
              Libere espaço no celular e tente de novo.
            </MensagemSecao>
          )
        ) : null}
        <BarraDeAcao>
          <Botao
            iconeAntes="camera"
            className={classeAcaoSecundaria}
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
            className={classeAcaoPrincipal}
            disabled={vincular.isPending || estado.tipo === 'pedindo'}
            onClick={confirmar}
          >
            {vincular.isPending
              ? 'Salvando…'
              : vincular.isError
                ? 'Tentar de novo'
                : 'Vincular foto'}
          </Botao>
        </BarraDeAcao>
      </Pagina>
    </ColunaCampo>
  )
}

function FotoDoItem({ vistoria, itemId }: { vistoria: Vistoria; itemId: string }) {
  const itens = useItensDaVistoria(vistoria.id, true)
  const fotos = useFotosDaVistoria(vistoria.id, true)
  const rascunho = useRascunhoDaVistoria(vistoria.id)
  const voltar = <VoltarPara para={`/campo/${vistoria.id}/checklist`} rotulo="Checklist" />
  if (itens.isPending || !rascunho.carregado) {
    return (
      <ColunaCampo>
        {voltar}
        <Carregando rotulo="Carregando o item" linhas={3} />
      </ColunaCampo>
    )
  }
  if (!itens.data) {
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
  const fotosDoItem = [
    ...(fotos.data ?? []),
    ...rascunho
      .doItem(item.id)
      .flatMap((p) =>
        p.registro.tipo === 'foto'
          ? [{ itemId: p.registro.itemId, sha256: p.registro.sha256 }]
          : [],
      ),
  ]
  return <Foto vistoria={vistoria} item={item} fotosDoItem={fotosDoItem} />
}

/**
 * /campo/:id/itens/:itemId/foto (ADR-0033 §5): câmera real, localização opcional e revisão antes
 * de vincular. A foto vai para o aparelho e a fila envia quando houver conexão (ADR-0060).
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
