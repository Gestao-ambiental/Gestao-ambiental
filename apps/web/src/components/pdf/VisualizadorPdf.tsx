// PDF desenhado em canvas pelo pdf.js, sem executar scripts do documento (RNF 6), com camada de
// texto para a pessoa selecionar e copiar o texto literal das condicionantes (Protótipos 11 e 12).
import 'pdfjs-dist/web/pdf_viewer.css'

import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

import { Carregando, EstadoErro } from '@/components/estados'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Icone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

const ZOOM_MINIMO = 50
const ZOOM_MAXIMO = 200
const PASSO_ZOOM = 25

async function carregarPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** Pedido para ir a uma página (ex.: a fonte de um campo proposto pela IA). `vez` repete o pedido. */
export interface PedidoDePagina {
  numero: number
  vez: number
}

interface Props {
  /** URL assinada de curta duração do Storage. */
  url: string
  nome: string
  className?: string
  paginaPedida?: PedidoDePagina | null
}

export function VisualizadorPdf({ url, nome, className, paginaPedida = null }: Props) {
  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [zoom, setZoom] = useState(100)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textoRef = useRef<HTMLDivElement>(null)
  const paginaRef = useRef<HTMLDivElement>(null)
  const [pedidoVisto, setPedidoVisto] = useState<PedidoDePagina | null>(null)

  // Pedido novo de página: muda durante a renderização (sem efeito), como o React recomenda.
  if (paginaPedida !== pedidoVisto) {
    setPedidoVisto(paginaPedida)
    if (paginaPedida) setPagina(Math.max(1, paginaPedida.numero))
  }

  useEffect(() => {
    const estado = { cancelado: false }
    let carregamento: PDFDocumentLoadingTask | null = null
    void carregarPdfjs()
      .then((pdfjs) => {
        if (estado.cancelado) return null
        carregamento = pdfjs.getDocument({ url, enableXfa: false })
        return carregamento.promise
      })
      .then((doc) => {
        if (!doc || estado.cancelado) return
        setFalhou(false)
        setPagina(1)
        setDocumento(doc)
      })
      .catch(() => {
        if (!estado.cancelado) setFalhou(true)
      })
    return () => {
      estado.cancelado = true
      void carregamento?.destroy()
    }
  }, [url, tentativa])

  useEffect(() => {
    if (!documento) return
    const estado = { cancelado: false }
    // Função, e não leitura direta: o TypeScript não sabe que o valor muda entre os awaits.
    const cancelado = () => estado.cancelado
    let tarefa: RenderTask | null = null
    void (async () => {
      const pdfjs = await carregarPdfjs()
      const pag = await documento.getPage(Math.min(pagina, documento.numPages))
      if (cancelado() || !canvasRef.current || !textoRef.current || !paginaRef.current) return
      const viewport = pag.getViewport({ scale: (zoom / 100) * 1.25 })
      const canvas = canvasRef.current
      const escala = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * escala)
      canvas.height = Math.floor(viewport.height * escala)
      canvas.style.width = `${String(Math.floor(viewport.width))}px`
      canvas.style.height = `${String(Math.floor(viewport.height))}px`
      paginaRef.current.style.setProperty('--scale-factor', String(viewport.scale))
      tarefa = pag.render({
        canvas,
        viewport,
        transform: escala === 1 ? undefined : [escala, 0, 0, escala, 0, 0],
      })
      await tarefa.promise
      if (cancelado()) return
      textoRef.current.replaceChildren()
      const camada = new pdfjs.TextLayer({
        textContentSource: pag.streamTextContent(),
        container: textoRef.current,
        viewport,
      })
      await camada.render()
    })().catch(() => {
      // Render cancelado ao trocar de página ou zoom: a próxima rodada desenha.
    })
    return () => {
      estado.cancelado = true
      tarefa?.cancel()
    }
  }, [documento, pagina, zoom])

  const total = documento?.numPages ?? 0

  return (
    <section
      aria-label={`PDF ${nome}`}
      className={cn('flex min-h-0 flex-col bg-(--surface-sunken)', className)}
    >
      <div className="flex h-12 shrink-0 items-center gap-(--space-100) border-b bg-(--surface) px-(--space-150)">
        <Icone nome="file-text" className="text-(--icon)" />
        <span className="min-w-0 flex-1 truncate corpo-medio" title={nome}>
          {nome}
        </span>
        {documento ? (
          <>
            <BotaoIcone
              icone="chevron-left"
              rotulo="Página anterior"
              tamanho="compacto"
              disabled={pagina <= 1}
              onClick={() => {
                setPagina((p) => Math.max(1, p - 1))
              }}
            />
            <span className="corpo whitespace-nowrap" aria-live="polite">
              Página {Math.min(pagina, total)} de {total}
            </span>
            <BotaoIcone
              icone="chevron-right"
              rotulo="Próxima página"
              tamanho="compacto"
              disabled={pagina >= total}
              onClick={() => {
                setPagina((p) => Math.min(total, p + 1))
              }}
            />
            <span aria-hidden="true" className="mx-(--space-050) h-5 border-l" />
            <BotaoIcone
              icone="chevron-down"
              rotulo="Diminuir zoom"
              tamanho="compacto"
              disabled={zoom <= ZOOM_MINIMO}
              onClick={() => {
                setZoom((z) => Math.max(ZOOM_MINIMO, z - PASSO_ZOOM))
              }}
            />
            <span className="w-10 text-center text-xs text-(--text-subtle)">{zoom}%</span>
            <BotaoIcone
              icone="chevron-up"
              rotulo="Aumentar zoom"
              tamanho="compacto"
              disabled={zoom >= ZOOM_MAXIMO}
              onClick={() => {
                setZoom((z) => Math.min(ZOOM_MAXIMO, z + PASSO_ZOOM))
              }}
            />
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-(--space-200)">
        {falhou ? (
          <EstadoErro
            titulo="Não foi possível abrir o PDF."
            descricao="O link pode ter expirado. Tente de novo."
            aoTentarDeNovo={() => {
              setTentativa((t) => t + 1)
            }}
          />
        ) : !documento ? (
          <Carregando rotulo="Abrindo o PDF" linhas={6} />
        ) : (
          <div
            ref={paginaRef}
            className="relative mx-auto w-fit border bg-white shadow-sobreposicao"
          >
            {/* O desenho é decorativo para leitor de tela: o texto da página está na camada abaixo. */}
            <canvas ref={canvasRef} aria-hidden="true" />
            <div ref={textoRef} className="textLayer" />
          </div>
        )}
      </div>
    </section>
  )
}
