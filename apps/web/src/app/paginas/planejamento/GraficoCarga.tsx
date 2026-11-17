import { formatarHoras, nomeCurtoDoMes } from './formatos'

export interface MesDoGrafico {
  /** `AAAA-MM`. */
  mes: string
  /** Horas com as atividades na posição recomendada. */
  recomendada: number
  /** Horas depois de antecipar. */
  antecipada: number
}

const LARGURA = 720
const ALTURA = 240
const MARGEM = { cima: 16, direita: 12, baixo: 28, esquerda: 52 }

/**
 * Carga mensal em barras: posição recomendada ao lado da carga com antecipação, com a linha da
 * capacidade. O que passa da capacidade fica em tom de perigo; os mesmos números estão numa tabela
 * para leitor de tela (a cor nunca é o único sinal).
 */
export function GraficoCarga({ meses, capacidade }: { meses: MesDoGrafico[]; capacidade: number }) {
  const maior = Math.max(capacidade, ...meses.flatMap((m) => [m.recomendada, m.antecipada]))
  const teto = maior * 1.08
  const areaLargura = LARGURA - MARGEM.esquerda - MARGEM.direita
  const areaAltura = ALTURA - MARGEM.cima - MARGEM.baixo
  const passo = areaLargura / Math.max(meses.length, 1)
  const barra = Math.min(18, passo * 0.36)
  const y = (horas: number) => MARGEM.cima + areaAltura * (1 - horas / teto)
  const base = y(0)
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((fracao) => Math.round((maior * fracao) / 50) * 50)

  return (
    <figure className="flex min-w-0 flex-col gap-(--space-100)">
      <figcaption className="flex flex-wrap gap-x-(--space-200) gap-y-(--space-050) rotulo text-(--text-subtle)">
        <Legenda classe="bg-(--border-input)" texto="Posição recomendada" />
        <Legenda classe="bg-(--brand)" texto="Com antecipação" />
        <Legenda classe="bg-(--danger)" texto="Acima da capacidade" />
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${String(LARGURA)} ${String(ALTURA)}`}
          role="img"
          aria-label="Carga mensal em horas, na posição recomendada e com antecipação"
          className="h-auto w-full min-w-[640px]"
        >
          {marcas.map((horas) => (
            <g key={horas}>
              <line
                x1={MARGEM.esquerda}
                x2={LARGURA - MARGEM.direita}
                y1={y(horas)}
                y2={y(horas)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(horas) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-subtle)"
              >
                {formatarHoras(horas)}
              </text>
            </g>
          ))}
          {meses.map((m, i) => {
            const centro = MARGEM.esquerda + passo * (i + 0.5)
            const acima = Math.max(0, m.antecipada - capacidade)
            return (
              <g key={m.mes}>
                <rect
                  x={centro - barra - 1}
                  y={y(m.recomendada)}
                  width={barra}
                  height={base - y(m.recomendada)}
                  fill="var(--border-input)"
                >
                  <title>{`${m.mes}, posição recomendada: ${formatarHoras(m.recomendada)}`}</title>
                </rect>
                <rect
                  x={centro + 1}
                  y={y(m.antecipada)}
                  width={barra}
                  height={base - y(m.antecipada)}
                  fill="var(--brand)"
                >
                  <title>{`${m.mes}, com antecipação: ${formatarHoras(m.antecipada)}`}</title>
                </rect>
                {acima > 0 ? (
                  <rect
                    x={centro + 1}
                    y={y(m.antecipada)}
                    width={barra}
                    height={y(capacidade) - y(m.antecipada)}
                    fill="var(--danger)"
                  />
                ) : null}
                <text
                  x={centro}
                  y={ALTURA - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--text-subtle)"
                >
                  {nomeCurtoDoMes(m.mes)}
                </text>
              </g>
            )
          })}
          <line
            x1={MARGEM.esquerda}
            x2={LARGURA - MARGEM.direita}
            y1={y(capacidade)}
            y2={y(capacidade)}
            stroke="var(--text)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text
            x={LARGURA - MARGEM.direita}
            y={y(capacidade) - 5}
            textAnchor="end"
            fontSize="11"
            fontWeight="600"
            fill="var(--text)"
          >
            Capacidade
          </text>
        </svg>
      </div>
      <table className="sr-only">
        <caption>Carga mensal em horas</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Posição recomendada</th>
            <th scope="col">Com antecipação</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{m.mes}</th>
              <td>{formatarHoras(m.recomendada)}</td>
              <td>{formatarHoras(m.antecipada)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function Legenda({ classe, texto }: { classe: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-(--space-075)">
      <span aria-hidden="true" className={`size-2.5 rounded-[2px] ${classe}`} />
      {texto}
    </span>
  )
}
