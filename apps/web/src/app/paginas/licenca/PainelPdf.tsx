import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'

import { EstadoErro, EstadoVazio } from '@/components/estados'
import { VisualizadorPdf, type PedidoDePagina } from '@/components/pdf/VisualizadorPdf'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { urlDoPdf, type Instrumento } from '@/lib/api/licencas'
import { cn } from '@/lib/utils'

/** PDF da licença ao lado do formulário (Protótipos 11 e 12). Sem PDF, diz como anexar. */
export function PainelPdf({
  instrumento,
  className,
  style,
  paginaPedida = null,
  aoFechar,
  oculto = false,
}: {
  instrumento: Instrumento
  className?: string
  style?: CSSProperties
  /** Página a mostrar (fonte de um campo ou item proposto pela IA). */
  paginaPedida?: PedidoDePagina | null
  /** Com ele, o painel ganha o botão "Fechar documento" (Protótipo 12). */
  aoFechar?: () => void
  /** Fechado pela pessoa: some da tela, mas fica montado (não recarrega o PDF). */
  oculto?: boolean
}) {
  const caminho = instrumento.pdf?.caminho
  const url = useQuery({
    queryKey: ['pdf-url', caminho],
    queryFn: () => urlDoPdf(caminho ?? ''),
    enabled: Boolean(caminho),
    staleTime: 4 * 60 * 1000,
  })

  const fechar = aoFechar ? (
    <BotaoIcone icone="x" rotulo="Fechar documento" tamanho="compacto" onClick={aoFechar} />
  ) : null

  return (
    <aside
      aria-label="Documento"
      hidden={oculto}
      style={style}
      className={cn('flex min-h-0 flex-col border-l bg-(--surface-sunken)', className)}
    >
      {url.data && instrumento.pdf ? (
        <VisualizadorPdf
          url={url.data}
          nome={instrumento.pdf.nome}
          className="h-full"
          paginaPedida={paginaPedida}
          acoes={fechar}
        />
      ) : (
        <>
          {fechar ? (
            <div className="flex h-12 shrink-0 items-center justify-end border-b bg-(--surface) px-(--space-150)">
              {fechar}
            </div>
          ) : null}
          {!instrumento.pdf ? (
            <EstadoVazio
              icone="file-text"
              titulo="Sem PDF anexado"
              descricao="Anexe o PDF para conferir o texto da licença enquanto preenche."
              acaoPrincipal={
                <Botao asChild>
                  <Link to={`/licencas/${instrumento.id}/documento`}>Anexar PDF</Link>
                </Botao>
              }
              className="m-(--space-200)"
            />
          ) : url.isError ? (
            <EstadoErro
              titulo="Não foi possível abrir o PDF."
              aoTentarDeNovo={() => void url.refetch()}
              className="m-(--space-200)"
            />
          ) : null}
        </>
      )}
    </aside>
  )
}
