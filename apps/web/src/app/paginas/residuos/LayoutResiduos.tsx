// Resíduos, fase 1 (sem integração com o IMA; ADR-0028): as abas da área /residuos. Cada aba é uma
// rota (dá para mandar o link); a página de cada aba tem o próprio título e põe as abas logo
// abaixo dele (<AbasResiduos /> como primeiro filho da <Pagina>).

import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { AbasDeRota } from '@/components/ui/abas'
import { conferenciaDeResiduos } from '@/lib/api/residuos'

const ABAS = [
  { para: '/residuos', rotulo: 'MTRs e CDFs', exato: true },
  { para: '/residuos/conferencia', rotulo: 'Conferência CDF x MTR', exato: false },
  { para: '/residuos/painel', rotulo: 'Painel', exato: false },
  { para: '/residuos/prazos', rotulo: 'Prazos', exato: false },
] as const

export function LayoutResiduos() {
  return <Outlet />
}

/** Abas da área, abaixo do título; a conferência leva a quantidade de pendências. */
export function AbasResiduos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  // Mesma chave da conferência sem filtro: a aba e a página dividem a consulta.
  const pendencias = useQuery({
    queryKey: ['residuos', 'conferencia', cid, null],
    queryFn: () => conferenciaDeResiduos(cid, null),
  })
  const quantas = pendencias.data?.length ?? 0

  return (
    <AbasDeRota
      rotulo="Resíduos"
      abas={ABAS.map((aba) => ({
        para: aba.para,
        rotulo: aba.rotulo,
        exata: aba.exato,
        ...(aba.para === '/residuos/conferencia'
          ? {
              contagem: quantas,
              alerta: true,
              lerContagem: (n: number) => `${String(n)} ${n === 1 ? 'pendência' : 'pendências'}`,
            }
          : {}),
      }))}
    />
  )
}
