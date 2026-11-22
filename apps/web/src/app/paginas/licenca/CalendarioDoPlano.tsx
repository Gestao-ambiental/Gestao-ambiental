// Prévia consolidada do calendário antes de ativar o plano (LIC-04): todas as condicionantes
// juntas, por mês, com o responsável. As datas e o total vêm de previaDoCalendario (domínio), pela
// mesma regra de ativar_plano. Meses em páginas de seis.
import { formatarDataCivil, mesPorExtenso, type PreviaDoCalendario } from '@gestao-ambiental/domain'
import { useState } from 'react'

import { BotaoIcone } from '@/components/ui/botao-icone'

import { totalDePrazos } from './total-de-prazos'

const MESES_POR_PAGINA = 6

export function CalendarioDoPlano({
  previa,
  nomeDe,
}: {
  previa: PreviaDoCalendario
  nomeDe: (membroId: string | null) => string | undefined
}) {
  const [pagina, setPagina] = useState(0)
  const totalDeMeses = previa.meses.length
  const ultimaPagina = Math.max(0, Math.ceil(totalDeMeses / MESES_POR_PAGINA) - 1)
  const atual = Math.min(pagina, ultimaPagina)
  const inicio = atual * MESES_POR_PAGINA
  const meses = previa.meses.slice(inicio, inicio + MESES_POR_PAGINA)

  return (
    <section aria-labelledby="calendario-do-plano" className="flex flex-col gap-(--e-3)">
      <div className="flex flex-wrap items-baseline gap-x-(--e-3) gap-y-(--e-1)">
        <h2 id="calendario-do-plano" className="titulo-secao">
          Calendário
        </h2>
        <span className="corpo text-(--tinta-2) numero">{totalDePrazos(previa.total)}</span>
      </div>
      {totalDeMeses === 0 ? (
        <p className="rounded-(--raio-painel) border bg-(--folha) px-(--e-4) py-(--e-6) text-center corpo text-(--tinta-2)">
          Nenhum prazo
        </p>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          <ol className="flex flex-col" aria-label="Meses">
            {meses.map((mes) => {
              const idMes = `mes-${mes.mes}`
              return (
                <li key={mes.mes} className="border-b border-(--regra-leve) last:border-b-0">
                  <h3
                    id={idMes}
                    className="flex items-baseline gap-(--e-2) bg-(--chao) px-(--e-4) py-(--e-2) rotulo-maiusculo text-(--tinta-2)"
                  >
                    <span className="flex-1">{mesPorExtenso(mes.mes)}</span>
                    <span className="numero">{totalDePrazos(mes.prazos.length)}</span>
                  </h3>
                  <ul aria-labelledby={idMes}>
                    {mes.prazos.map((p) => (
                      <li
                        key={`${p.itemId}-${String(p.ciclo)}`}
                        className="grid grid-cols-[auto_1fr] items-baseline gap-x-(--e-3) gap-y-(--e-05) border-t border-(--regra-leve) px-(--e-4) py-(--e-2) corpo md:grid-cols-[96px_minmax(0,1fr)_200px]"
                      >
                        <span className="numero">{formatarDataCivil(p.data)}</span>
                        <span className="min-w-0 truncate">
                          {p.codigo ? (
                            <span className="mr-(--e-2) corpo-medio text-(--tinta-2) numero">
                              {p.codigo}
                            </span>
                          ) : null}
                          {p.titulo}
                        </span>
                        <span className="col-start-2 truncate text-(--tinta-2) md:col-start-auto">
                          {nomeDe(p.responsavelId) ?? 'Sem responsável'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
          {totalDeMeses > MESES_POR_PAGINA ? (
            <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
              <span className="flex-1 rotulo numero" aria-live="polite">
                {`Meses ${String(inicio + 1)}–${String(inicio + meses.length)} de ${String(totalDeMeses)}`}
              </span>
              <BotaoIcone
                icone="chevron-left"
                rotulo="Meses anteriores"
                disabled={atual === 0}
                onClick={() => {
                  setPagina(atual - 1)
                }}
              />
              <BotaoIcone
                icone="chevron-right"
                rotulo="Próximos meses"
                disabled={atual >= ultimaPagina}
                onClick={() => {
                  setPagina(atual + 1)
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
