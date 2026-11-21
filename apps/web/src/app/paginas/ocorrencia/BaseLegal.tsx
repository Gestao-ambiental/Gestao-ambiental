// Base legal da condicionante (ADR-0050, LEG-10): as normas citadas no texto literal que estão no
// catálogo, com link para a página da norma. Some quando o texto não cita norma do catálogo.
import { chavesCitadas } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { normasPorChave } from '@/lib/api/relatorio-de-normas'

export function BaseLegal({ texto }: { texto: string }) {
  const chaves = chavesCitadas(texto)
  const normas = useQuery({
    queryKey: ['normas-por-chave', chaves],
    queryFn: () => normasPorChave(chaves),
    enabled: chaves.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const lista = normas.data ?? []
  if (chaves.length === 0 || lista.length === 0) return null

  return (
    <p className="flex flex-wrap items-baseline gap-x-(--e-2) gap-y-(--e-1) rotulo">
      <span className="text-(--tinta-2)">Base legal</span>
      {lista.map((n, indice) => (
        <span key={n.id}>
          <Link to={`/normas/${n.id}`} className="text-(--tinta) hover:underline">
            {n.titulo}
          </Link>
          {n.revogada ? <span className="text-(--tinta-2)"> · revogada</span> : null}
          {indice < lista.length - 1 ? <span aria-hidden> ·</span> : null}
        </span>
      ))}
    </p>
  )
}
