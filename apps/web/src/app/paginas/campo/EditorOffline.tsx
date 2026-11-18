import {
  LIMITES_DA_VISTORIA,
  RESULTADOS_DO_ITEM,
  ROTULO_DA_PENDENCIA,
  ROTULO_DO_RESULTADO,
  SEM_LOCAL,
  exigeComentario,
  formatarDataCivil,
  localDoAparelho,
  pendenciasDoEnvio,
  type ResultadoDoItem,
} from '@gestao-ambiental/domain'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirArquivoDaFoto, type ItemDaVistoriaGravado } from '@/lib/api/vistorias'
import { mensagemDoErroDaVistoria } from '@/lib/erros'
import { sincronizarVistoria } from '@/lib/vistoria-offline/enviar'
import {
  gravarRascunho,
  LIMITE_FOTOS_OFFLINE,
  type FotoOffline,
  type RascunhoOffline,
} from '@/lib/vistoria-offline/rascunho'

import { recarregarVistoria } from './consultas'
import { classeAreaTexto, classeCampoBase, classeCartao } from './estilos'

function Miniatura({ arquivo }: { arquivo: File }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const imagem = ref.current
    if (!imagem) return
    const url = URL.createObjectURL(arquivo)
    imagem.src = url
    return () => {
      imagem.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [arquivo])
  return (
    <img
      ref={ref}
      alt="Foto registrada em campo"
      className="max-h-52 w-full rounded-(--radius) bg-(--surface-sunken) object-contain"
    />
  )
}

const cartao = `${classeCartao} grid min-w-0 gap-3 p-4`
const campo = `${classeCampoBase} min-h-11 text-[16px]`

export function EditorOffline({
  inicial,
  conectado,
  aoAtualizar,
}: {
  inicial: RascunhoOffline
  conectado: boolean
  aoAtualizar: () => Promise<void>
}) {
  const [registro, setRegistro] = useState(inicial)
  const revisando = registro.revisado
  const [gravando, setGravando] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [confirmarRemocao, setConfirmarRemocao] = useState(false)
  const [localizando, setLocalizando] = useState<string>()
  const [erro, setErro] = useState<string>()
  const [erroLocal, setErroLocal] = useState<string>()
  const atual = useRef(inicial)
  const versao = useRef(inicial.versaoLocal)
  const fila = useRef(Promise.resolve())
  const enviandoAgora = useRef(false)
  const cliente = useQueryClient()
  const pendencias = pendenciasDoEnvio(registro.itens)
  const tituloDaEtapa = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (revisando) tituloDaEtapa.current?.focus()
  }, [revisando])

  useEffect(() => {
    if (!gravando && !erroLocal && !enviando) return
    function avisar(evento: BeforeUnloadEvent) {
      evento.preventDefault()
    }
    window.addEventListener('beforeunload', avisar)
    return () => {
      window.removeEventListener('beforeunload', avisar)
    }
  }, [gravando, erroLocal, enviando])

  async function gravar(proximo: RascunhoOffline) {
    atual.current = proximo
    setRegistro(proximo)
    setGravando((n) => n + 1)
    const operacao = fila.current.then(async () => {
      const salvo = await gravarRascunho({ ...proximo, versaoLocal: versao.current })
      versao.current = salvo.versaoLocal
    })
    fila.current = operacao.catch(() => undefined)
    try {
      await operacao
      setErroLocal(undefined)
      return true
    } catch (falha) {
      setErroLocal(falha instanceof Error ? falha.message : 'Falha ao salvar no aparelho.')
      return false
    } finally {
      setGravando((n) => n - 1)
    }
  }

  function alterar(alteracao: Partial<Pick<RascunhoOffline, 'itens' | 'observacao' | 'fotos'>>) {
    if (atual.current.envioId) return
    setErro(undefined)
    void gravar({ ...atual.current, ...alteracao })
  }

  function alterarItem(
    id: string,
    mudanca: Partial<Pick<ItemDaVistoriaGravado, 'resultado' | 'comentario'>>,
  ) {
    alterar({
      itens: atual.current.itens.map((item) => (item.id === id ? { ...item, ...mudanca } : item)),
    })
  }

  function alterarFoto(id: string, mudanca: Partial<Pick<FotoOffline, 'legenda' | 'local'>>) {
    alterar({
      fotos: atual.current.fotos.map((foto) => (foto.id === id ? { ...foto, ...mudanca } : foto)),
    })
  }

  function adicionarFoto(itemId: string, arquivo: File | undefined) {
    if (!arquivo) return
    if (conferirArquivoDaFoto(arquivo)) {
      setErro('Escolha uma foto JPG ou PNG de até 25 MB.')
      return
    }
    if (atual.current.fotos.length >= LIMITE_FOTOS_OFFLINE) {
      setErro('Este rascunho já tem 50 fotos. Remova uma para adicionar outra.')
      return
    }
    alterar({
      fotos: [
        ...atual.current.fotos,
        {
          id: crypto.randomUUID(),
          itemId,
          arquivo,
          criadaEm: new Date().toISOString(),
          legenda: '',
          local: SEM_LOCAL,
        },
      ],
    })
  }

  function registrarLocalizacao(id: string) {
    setErro(undefined)
    if (!('geolocation' in navigator)) {
      setErro('O aparelho não disponibilizou a localização. Você pode continuar sem ela.')
      return
    }
    setLocalizando(id)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        alterarFoto(id, { local: localDoAparelho(coords) })
        setLocalizando(undefined)
      },
      () => {
        setErro('O aparelho não disponibilizou a localização. Você pode continuar sem ela.')
        setLocalizando(undefined)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )
  }

  async function enviar() {
    if (!conectado || enviandoAgora.current) return
    enviandoAgora.current = true
    setEnviando(true)
    setErro(undefined)
    try {
      const proximo = { ...atual.current, envioId: atual.current.envioId ?? crypto.randomUUID() }
      if (!(await gravar(proximo))) return
      await sincronizarVistoria(proximo)
      setConfirmado(true)
      await Promise.allSettled([
        gravarRascunho({ ...proximo, versaoLocal: versao.current }, true),
        recarregarVistoria(cliente, proximo.visita.id),
      ])
    } catch (falha) {
      setErro(
        mensagemDoErroDaVistoria(
          falha,
          'O envio ainda não foi confirmado. O registro continua neste aparelho.',
        ),
      )
    } finally {
      enviandoAgora.current = false
      setEnviando(false)
    }
  }

  async function remover() {
    setConfirmarRemocao(false)
    try {
      await gravarRascunho({ ...atual.current, versaoLocal: versao.current }, true)
      await aoAtualizar()
    } catch {
      setErro('Não foi possível remover o rascunho neste aparelho.')
    }
  }

  if (confirmado)
    return (
      <section className={cartao}>
        <h1 className="titulo-tela">Vistoria recebida</h1>
        <p>O Grama recebeu o checklist e as fotos para conferência técnica.</p>
        <Botao asChild className="min-h-11">
          <Link to={`/campo/${registro.visita.id}`}>Acompanhar vistoria</Link>
        </Botao>
      </section>
    )

  return (
    <>
      <header className="grid gap-2">
        <h1 className="titulo-tela break-words">{registro.visita.titulo}</h1>
        <p className="text-(--text-subtle)">
          {registro.visita.empreendimentoNome} · {registro.visita.unidadeNome}
        </p>
        <p className="text-xs text-(--text-subtle)">
          Agendada para {formatarDataCivil(registro.visita.dataPlanejada)}
        </p>
        {registro.visita.objetivo ? (
          <p className="whitespace-pre-line">{registro.visita.objetivo}</p>
        ) : null}
      </header>
      <p role="status" className="text-sm text-(--text-subtle)">
        {gravando
          ? 'Salvando no aparelho…'
          : erroLocal
            ? 'Alterações ainda sem salvar.'
            : 'Rascunho salvo neste aparelho'}
      </p>
      {erroLocal ? (
        <MensagemSecao role="alert" tom="perigo">
          {erroLocal}
          <Botao
            className="ml-2 min-h-11"
            disabled={gravando > 0}
            onClick={() => void gravar(atual.current)}
          >
            Tentar salvar
          </Botao>
        </MensagemSecao>
      ) : null}
      <h2 ref={tituloDaEtapa} tabIndex={-1} className="titulo-secao">
        {revisando ? 'Conferir envio' : 'Checklist'}
      </h2>
      {registro.itens.map((item) => (
        <section key={item.id} className={cartao} aria-labelledby={`item-${item.id}`}>
          <h3 id={`item-${item.id}`} className="corpo-medio">
            {item.titulo}
          </h3>
          {item.descricao ? <p className="text-sm text-(--text-subtle)">{item.descricao}</p> : null}
          {revisando ? (
            <div>
              <p>{ROTULO_DO_RESULTADO[item.resultado]}</p>
              {item.comentario ? <p className="whitespace-pre-line">{item.comentario}</p> : null}
            </div>
          ) : (
            <>
              <label className="grid gap-1">
                Resultado de {item.titulo}
                <select
                  className={campo}
                  value={item.resultado}
                  onChange={(e) => {
                    alterarItem(item.id, { resultado: e.target.value as ResultadoDoItem })
                  }}
                >
                  <option value="pendente">Pendente</option>
                  {RESULTADOS_DO_ITEM.map((valor) => (
                    <option key={valor} value={valor}>
                      {ROTULO_DO_RESULTADO[valor]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                Comentário {exigeComentario(item.resultado) ? '(obrigatório)' : '(opcional)'}
                <textarea
                  className={classeAreaTexto + ' text-[16px]'}
                  maxLength={LIMITES_DA_VISTORIA.comentario}
                  value={item.comentario ?? ''}
                  onChange={(e) => {
                    alterarItem(item.id, { comentario: e.target.value })
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-(--radius) border px-3 focus-within:outline-2">
                  Tirar foto
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png"
                    capture="environment"
                    onChange={(e) => {
                      adicionarFoto(item.id, e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-(--radius) border px-3 focus-within:outline-2">
                  Escolher foto
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png"
                    onChange={(e) => {
                      adicionarFoto(item.id, e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </>
          )}
          {registro.fotos
            .filter((foto) => foto.itemId === item.id)
            .map((foto) => (
              <div key={foto.id} className="grid gap-2 rounded-(--radius) border p-2">
                <Miniatura arquivo={foto.arquivo} />
                {revisando ? (
                  <p>{foto.legenda}</p>
                ) : (
                  <label className="grid gap-1">
                    Legenda (opcional)
                    <input
                      className={campo}
                      maxLength={LIMITES_DA_VISTORIA.legenda}
                      value={foto.legenda}
                      onChange={(e) => {
                        alterarFoto(foto.id, { legenda: e.target.value })
                      }}
                    />
                  </label>
                )}
                {foto.local.origem === 'aparelho' ? (
                  <p className="text-sm text-(--text-subtle)">
                    Localização registrada
                    {foto.local.precisaoM === null
                      ? ''
                      : ` · ±${String(Math.ceil(foto.local.precisaoM))} m`}
                  </p>
                ) : null}
                {!revisando ? (
                  <div className="flex flex-wrap gap-2">
                    <Botao
                      className="min-h-11"
                      disabled={Boolean(localizando)}
                      onClick={() => {
                        registrarLocalizacao(foto.id)
                      }}
                    >
                      {localizando === foto.id ? 'Buscando…' : 'Registrar localização'}
                    </Botao>
                    {foto.local.origem !== 'nenhum' ? (
                      <Botao
                        className="min-h-11"
                        onClick={() => {
                          alterarFoto(foto.id, { local: SEM_LOCAL })
                        }}
                      >
                        Limpar localização
                      </Botao>
                    ) : null}
                    <Botao
                      className="min-h-11"
                      onClick={() => {
                        alterar({ fotos: atual.current.fotos.filter((f) => f.id !== foto.id) })
                      }}
                    >
                      Remover foto
                    </Botao>
                  </div>
                ) : null}
              </div>
            ))}
        </section>
      ))}
      {revisando ? (
        registro.observacao.trim() ? (
          <p className="whitespace-pre-line">{registro.observacao}</p>
        ) : null
      ) : (
        <label className="grid gap-1">
          Observação geral
          <textarea
            className={classeAreaTexto + ' text-[16px]'}
            maxLength={LIMITES_DA_VISTORIA.observacao}
            value={registro.observacao}
            onChange={(e) => {
              alterar({ observacao: e.target.value })
            }}
          />
        </label>
      )}
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {erro}
        </MensagemSecao>
      ) : null}
      {revisando ? (
        <>
          <p>
            {conectado
              ? 'O envio vai para conferência técnica.'
              : 'O registro está salvo. Volte com conexão para confirmar o envio.'}
          </p>
          <Botao
            aparencia="primario"
            className="min-h-11"
            disabled={!conectado || enviando || gravando > 0 || Boolean(erroLocal)}
            onClick={() => void enviar()}
          >
            {enviando ? 'Enviando…' : 'Enviar para conferência'}
          </Botao>
          {!registro.envioId ? (
            <Botao
              className="min-h-11"
              onClick={() => {
                void gravar({ ...atual.current, revisado: false })
              }}
            >
              Editar registro
            </Botao>
          ) : null}
        </>
      ) : (
        <Botao
          aparencia="primario"
          className="min-h-11"
          disabled={gravando > 0 || Boolean(localizando) || Boolean(erroLocal)}
          onClick={() => {
            const primeira = pendencias[0]
            if (primeira)
              setErro(`${ROTULO_DA_PENDENCIA[primeira.motivo]} em “${primeira.titulo}”.`)
            else void gravar({ ...atual.current, revisado: true })
          }}
        >
          Revisar envio
        </Botao>
      )}
      <Botao
        className="min-h-11 justify-self-start"
        aparencia="sutil"
        disabled={gravando > 0 || enviando}
        onClick={() => {
          setConfirmarRemocao(true)
        }}
      >
        Remover deste aparelho
      </Botao>
      <Dialogo
        aberto={confirmarRemocao}
        aoMudar={setConfirmarRemocao}
        titulo="Remover rascunho deste aparelho?"
        descricao="O checklist e as fotos salvas neste aparelho serão apagados. Registros recebidos pelo Grama continuam na vistoria."
        acoes={
          <>
            <Botao
              onClick={() => {
                setConfirmarRemocao(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao aparencia="perigo" onClick={() => void remover()}>
              Remover rascunho
            </Botao>
          </>
        }
      />
    </>
  )
}
