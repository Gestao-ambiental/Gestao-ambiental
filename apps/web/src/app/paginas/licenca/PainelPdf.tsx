import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { EstadoErro, EstadoVazio } from '@/components/estados'
import { VisualizadorPdf, type PedidoDePagina } from '@/components/pdf/VisualizadorPdf'
import { Botao } from '@/components/ui/botao'
import { urlDoPdf, type Instrumento } from '@/lib/api/licencas'
import { cn } from '@/lib/utils'

/** PDF da licença ao lado do formulário (Protótipos 11 e 12). Sem PDF, diz como anexar. */
export function PainelPdf({
  instrumento,
  className,
  paginaPedida = null,
}: {
  instrumento: Instrumento
  className?: string
  /** Página a mostrar (fonte de um campo ou item proposto pela IA). */
  paginaPedida?: PedidoDePagina | null
}) {
  const caminho = instrumento.pdf?.caminho
  const url = useQuery({
    queryKey: ['pdf-url', caminho],
    queryFn: () => urlDoPdf(caminho ?? ''),
    enabled: Boolean(caminho),
    staleTime: 4 * 60 * 1000,
  })

  return (
    <aside className={cn('flex min-h-0 flex-col border-l bg-(--surface-sunken)', className)}>
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
      ) : url.data ? (
        <VisualizadorPdf
          url={url.data}
          nome={instrumento.pdf.nome}
          className="h-full"
          paginaPedida={paginaPedida}
        />
      ) : null}
    </aside>
  )
}
