import { ehDataCivil, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { useEffect, useRef, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { conferirArquivoDeEvidencia } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'
import {
  salvarVistoria,
  type Rascunho,
  type VistoriaNoDispositivo,
} from '@/lib/vistoria/dispositivo'
import { enviarVistoria } from '@/lib/vistoria/enviar'
import { registroVistoria, RESULTADOS } from '@/lib/vistoria/registro'

import { ResumoDoRegistro } from './ResumoDoRegistro'

const campo =
  'w-full min-h-11 rounded-(--radius) border border-(--border-input) bg-(--surface) px-3 py-2 text-[16px]'
const cartao = 'flex flex-col gap-4 rounded-(--radius) border bg-(--surface) p-4 sm:p-5'

function FotoDaVistoria({ arquivo }: { arquivo: File }) {
  const imagem = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const elemento = imagem.current
    if (!elemento) return
    const url = URL.createObjectURL(arquivo)
    elemento.src = url
    return () => {
      elemento.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [arquivo])
  return (
    <img
      ref={imagem}
      alt="Foto anexada à vistoria"
      className="max-h-64 w-full rounded-(--radius) bg-(--surface-sunken) object-contain"
    />
  )
}

interface Props {
  inicial: VistoriaNoDispositivo
  usuario: string
  fuso: string
  conectado: boolean
  aoEnviar: (numero: number) => Promise<void>
  aoRemover: () => Promise<void>
}

export function RegistroEmCampo({ inicial, usuario, fuso, conectado, aoEnviar, aoRemover }: Props) {
  const [vistoria, setVistoria] = useState(inicial)
  const rascunho = vistoria.rascunho
  const [erro, setErro] = useState<string>()
  const [erroAoSalvar, setErroAoSalvar] = useState<string>()
  const [gravando, setGravando] = useState(0)
  const [processandoFoto, setProcessandoFoto] = useState(false)
  const [localizando, setLocalizando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmarRemocao, setConfirmarRemocao] = useState(false)
  const resumo = useRef<HTMLHeadingElement>(null)
  const prontoParaRevisar = Boolean(vistoria.envio)
  useEffect(() => {
    if (prontoParaRevisar) resumo.current?.focus()
  }, [prontoParaRevisar])
  const estado = useRef(inicial)
  const revisao = useRef(inicial.revisao)
  const fila = useRef(Promise.resolve())

  async function gravar(proxima: VistoriaNoDispositivo): Promise<boolean> {
    estado.current = proxima
    setVistoria(proxima)
    setGravando((n) => n + 1)
    const tarefa = fila.current.then(async () => {
      const salva = await salvarVistoria({ ...proxima, revisao: revisao.current })
      revisao.current = salva.revisao
    })
    fila.current = tarefa.catch(() => undefined)
    try {
      await tarefa
      setErroAoSalvar(undefined)
      return true
    } catch (falha) {
      setErroAoSalvar(
        falha instanceof Error ? falha.message : 'Não foi possível salvar no aparelho.',
      )
      return false
    } finally {
      setGravando((n) => n - 1)
    }
  }

  useEffect(() => {
    if (!gravando && !erroAoSalvar && !enviando && !processandoFoto && !localizando) return
    function avisar(evento: BeforeUnloadEvent) {
      evento.preventDefault()
    }
    window.addEventListener('beforeunload', avisar)
    return () => {
      window.removeEventListener('beforeunload', avisar)
    }
  }, [gravando, erroAoSalvar, enviando, processandoFoto, localizando])

  function editar(mudanca: Partial<Rascunho>) {
    if (estado.current.envio) return
    setErro(undefined)
    void gravar({ ...estado.current, rascunho: { ...estado.current.rascunho, ...mudanca } })
  }

  async function escolherFoto(arquivo: File | undefined, origem: 'camera' | 'galeria') {
    if (!arquivo) return
    setProcessandoFoto(true)
    try {
      if (
        !['image/png', 'image/jpeg'].includes(arquivo.type) ||
        (await conferirArquivoDeEvidencia(arquivo))
      ) {
        setErro('Escolha uma foto JPG ou PNG de até 25 MB.')
        return
      }
      editar({
        foto: {
          arquivo,
          origem,
          versaoId: crypto.randomUUID(),
          obtidaEm: new Date().toISOString(),
        },
      })
    } finally {
      setProcessandoFoto(false)
    }
  }

  function obterLocalizacao() {
    setErro(undefined)
    if (!('geolocation' in navigator)) {
      setErro('Este navegador não disponibiliza localização. Você pode continuar sem ela.')
      return
    }
    setLocalizando(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        editar({
          localizacao: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            precisao: coords.accuracy,
            obtidaEm: new Date(timestamp).toISOString(),
          },
        })
        setLocalizando(false)
      },
      () => {
        setErro(
          'A localização não pôde ser obtida. Você pode tentar novamente ou continuar sem ela.',
        )
        setLocalizando(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  async function revisar() {
    const { foto, dataExecucao } = rascunho
    const validado = registroVistoria.safeParse({
      ...rascunho,
      registradoEm: new Date().toISOString(),
      fotoEm: foto?.obtidaEm,
      origemFoto: foto?.origem,
    })
    if (!ehDataCivil(dataExecucao) || !validado.success) {
      setErro(
        'Informe a data, a área, o resultado e uma foto. Explique nas observações se o resultado for diferente de Conforme.',
      )
      return
    }
    setErro(undefined)
    const proxima = {
      ...estado.current,
      envio: { registro: validado.data, dataExecucao, tentado: false },
    }
    if (!(await gravar(proxima))) {
      // Volta ao formulário para permitir gravar outra vez.
      estado.current = { ...proxima, envio: null }
      setVistoria(estado.current)
    }
  }

  async function sincronizar() {
    const envio = estado.current.envio
    if (!conectado || !envio || enviando) return
    setErro(undefined)
    setEnviando(true)
    try {
      const tentativa = { ...estado.current, envio: { ...envio, tentado: true } }
      // O snapshot fica congelado antes de qualquer chamada: uma resposta perdida pode ter sido gravada.
      if (!(await gravar(tentativa))) return
      const numero = await enviarVistoria(tentativa, usuario)
      try {
        await salvarVistoria({ ...tentativa, revisao: revisao.current }, true)
      } catch {
        // A confirmação do servidor vale mesmo se o navegador não conseguir liberar o rascunho.
      }
      await aoEnviar(numero)
    } catch (falha) {
      setErro(
        mensagemDoErro(
          falha,
          'O Grama ainda não confirmou o envio. O registro segue neste aparelho. Tente novamente com conexão.',
        ),
      )
    } finally {
      setEnviando(false)
    }
  }

  const parcialmenteOcupada = processandoFoto || localizando
  const salvando = gravando > 0
  const { ocorrencia, envio } = vistoria

  async function removerDoAparelho() {
    setConfirmarRemocao(false)
    try {
      await salvarVistoria({ ...estado.current, revisao: revisao.current }, true)
      await aoRemover()
    } catch {
      setErroAoSalvar('Não foi possível remover a vistoria do aparelho.')
    }
  }

  return (
    <>
      <section className={cartao} aria-labelledby="titulo-condicionante">
        <div>
          <p className="text-xs text-(--text-subtle)">
            {ocorrencia.codigo} · {ocorrencia.licenca ?? 'Licença ambiental'}
          </p>
          <h2 id="titulo-condicionante" className="mt-1 titulo-secao">
            {ocorrencia.empreendimentoNome}
          </h2>
          <p className="text-(--text-subtle)">
            {ocorrencia.unidadeNome} · Prazo {formatarDataCivil(ocorrencia.prazoAtual)}
          </p>
        </div>
        <details>
          <summary className="cursor-pointer corpo-medio">Texto da condicionante</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{ocorrencia.textoLiteral}</p>
        </details>
      </section>

      <div role="status" className="text-sm text-(--text-subtle)">
        {salvando
          ? 'Salvando no aparelho…'
          : erroAoSalvar
            ? 'Alterações ainda sem salvar.'
            : envio
              ? 'Envio pendente · salvo no aparelho'
              : 'Rascunho salvo no aparelho'}
      </div>
      {erroAoSalvar ? (
        <div role="alert">
          <p>{erroAoSalvar}</p>
          <Botao
            className="min-h-11"
            disabled={salvando}
            onClick={() => void gravar(estado.current)}
          >
            Tentar salvar
          </Botao>
        </div>
      ) : null}

      {envio ? (
        <section className={cartao} aria-labelledby="titulo-resumo">
          <h2 id="titulo-resumo" className="titulo-secao" ref={resumo} tabIndex={-1}>
            Conferir envio
          </h2>
          <p>Vistoria realizada em {formatarDataCivil(envio.dataExecucao)}</p>
          {rascunho.foto ? <FotoDaVistoria arquivo={rascunho.foto.arquivo} /> : null}
          <ResumoDoRegistro registro={envio.registro} fuso={fuso} />
          <p className="text-(--text-subtle)">
            {conectado
              ? 'O Grama vai encaminhar a evidência para conferência técnica.'
              : 'A vistoria está na fila deste aparelho. Abra esta tela com internet para enviar.'}
          </p>
          {erro ? (
            <p role="alert" className="text-(--text-danger)">
              {erro}
            </p>
          ) : null}
          <Botao
            aparencia="primario"
            className="min-h-11"
            iconeAntes="send"
            disabled={!conectado || enviando || salvando || Boolean(erroAoSalvar)}
            onClick={() => void sincronizar()}
          >
            {enviando ? 'Enviando…' : 'Enviar para conferência'}
          </Botao>
          {!envio.tentado ? (
            <Botao
              className="min-h-11"
              disabled={enviando || salvando}
              onClick={() => void gravar({ ...estado.current, envio: null })}
            >
              Editar rascunho
            </Botao>
          ) : null}
        </section>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            void revisar()
          }}
        >
          <section className={cartao} aria-labelledby="titulo-checklist">
            <h2 id="titulo-checklist" className="titulo-secao">
              Checklist
            </h2>
            <label className="flex flex-col gap-1">
              <span className="corpo-medio">Data da vistoria</span>
              <input
                className={campo}
                type="date"
                required
                value={rascunho.dataExecucao}
                max={hojeNoFuso(new Date(), fuso)}
                onChange={(e) => {
                  const valor = e.target.value
                  editar({ dataExecucao: ehDataCivil(valor) ? valor : '' })
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="corpo-medio">Área visitada</span>
              <input
                className={campo}
                required
                maxLength={200}
                value={rascunho.area}
                onChange={(e) => {
                  editar({ area: e.target.value })
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="corpo-medio">Resultado da verificação</span>
              <select
                className={campo}
                required
                value={rascunho.resultado}
                onChange={(e) => {
                  editar({ resultado: e.target.value as Rascunho['resultado'] })
                }}
              >
                <option value="">Selecione o resultado</option>
                {Object.entries(RESULTADOS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="corpo-medio">
                Acompanhante <span className="text-(--text-subtle)">(opcional)</span>
              </span>
              <input
                className={campo}
                maxLength={160}
                value={rascunho.acompanhante}
                onChange={(e) => {
                  editar({ acompanhante: e.target.value })
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="corpo-medio">Observações</span>
              <textarea
                className={campo}
                rows={3}
                maxLength={2000}
                value={rascunho.observacao}
                required={Boolean(rascunho.resultado && rascunho.resultado !== 'conforme')}
                onChange={(e) => {
                  editar({ observacao: e.target.value })
                }}
              />
            </label>
          </section>

          <section className={cartao} aria-labelledby="titulo-foto">
            <h2 id="titulo-foto" className="titulo-secao">
              Foto e localização
            </h2>
            {rascunho.foto ? (
              <FotoDaVistoria arquivo={rascunho.foto.arquivo} />
            ) : (
              <p>Anexe uma foto da área vistoriada.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-(--radius) border px-3 focus-within:outline-2">
                Tirar foto
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  disabled={processandoFoto}
                  onChange={(e) => {
                    void escolherFoto(e.target.files?.[0], 'camera')
                    e.target.value = ''
                  }}
                />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-(--radius) border px-3 focus-within:outline-2">
                Escolher da galeria
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png"
                  disabled={processandoFoto}
                  onChange={(e) => {
                    void escolherFoto(e.target.files?.[0], 'galeria')
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {rascunho.localizacao ? (
              <p className="text-(--text-subtle)">
                Localização registrada · precisão de ±{Math.ceil(rascunho.localizacao.precisao)} m
              </p>
            ) : (
              <p className="text-(--text-subtle)">Localização opcional.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Botao className="min-h-11" disabled={localizando} onClick={obterLocalizacao}>
                {localizando
                  ? 'Buscando localização…'
                  : rascunho.localizacao
                    ? 'Atualizar localização'
                    : 'Registrar localização'}
              </Botao>
              {rascunho.localizacao ? (
                <Botao
                  className="min-h-11"
                  disabled={localizando}
                  onClick={() => {
                    editar({ localizacao: null })
                  }}
                >
                  Remover localização
                </Botao>
              ) : null}
            </div>
          </section>
          {erro ? (
            <p role="alert" className="text-(--text-danger)">
              {erro}
            </p>
          ) : null}
          <Botao
            type="submit"
            className="min-h-11"
            aparencia="primario"
            iconeDepois="arrow-right"
            disabled={parcialmenteOcupada || salvando || Boolean(erroAoSalvar)}
          >
            Revisar vistoria
          </Botao>
        </form>
      )}
      <Botao
        className="min-h-11 self-start"
        aparencia="sutil"
        disabled={salvando || enviando || parcialmenteOcupada}
        onClick={() => {
          setConfirmarRemocao(true)
        }}
      >
        Remover deste aparelho
      </Botao>
      <Dialogo
        aberto={confirmarRemocao}
        aoMudar={setConfirmarRemocao}
        titulo="Remover vistoria deste aparelho?"
        descricao="O rascunho e a foto serão apagados deste aparelho. Evidências recebidas pelo Grama continuam disponíveis na ocorrência."
        acoes={
          <>
            <Botao
              onClick={() => {
                setConfirmarRemocao(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao aparencia="perigo" onClick={() => void removerDoAparelho()}>
              Remover
            </Botao>
          </>
        }
      />
    </>
  )
}
