import { Selo } from '@/components/ui/selo'

/**
 * Marca de campo ou item proposto pela IA (Protótipos 11 e 12): diz de onde veio e leva o PDF à
 * página da fonte. A marca é texto ("IA"), não só cor nem ícone.
 */
export function MarcaIa({
  pagina,
  aoVerPagina,
  texto = 'Proposto pela IA',
}: {
  pagina: number | null
  aoVerPagina: (pagina: number) => void
  texto?: string
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-(--space-050) text-xs text-(--text-subtle)">
      <Selo tom="revisao">IA</Selo>
      {texto}
      {pagina ? (
        <>
          {' · '}
          <button
            type="button"
            onClick={() => {
              aoVerPagina(pagina)
            }}
            className="cursor-pointer text-(--text-link) hover:underline"
          >
            ver página {pagina}
          </button>
        </>
      ) : null}
      . Confira.
    </span>
  )
}

/** A IA procurou e não achou: o campo fica vazio, nunca com valor inventado. */
export function NaoEncontrado() {
  return <span className="text-xs text-(--text-warning)">Não encontrado no documento.</span>
}
