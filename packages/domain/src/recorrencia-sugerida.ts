// Recorrência sugerida a partir da periodicidade lida pela IA (épico 9, decisão de 19/10/2026).
// É só sugestão: o prazo continua pendente até uma pessoa confirmar (LIC-03). Quando a leitura não
// é clara (mais de uma frequência, "anual e na renovação", texto sem frequência), não sugere nada.

import type { Prazo } from './prazo'

export type RecorrenciaSugerida = Omit<Prazo, 'primeiraData'>

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

const PRESETS_EM_MESES: Record<number, RecorrenciaSugerida['recorrencia']> = {
  12: 'anual',
  6: 'semestral',
  3: 'trimestral',
  2: 'bimestral',
  1: 'mensal',
}

const PALAVRAS: { padrao: RegExp; recorrencia: RecorrenciaSugerida['recorrencia'] }[] = [
  { padrao: /\banual(mente)?\b|\bpor ano\b|\ba cada ano\b/, recorrencia: 'anual' },
  { padrao: /\bsemestral(mente)?\b|\bpor semestre\b/, recorrencia: 'semestral' },
  { padrao: /\btrimestral(mente)?\b|\bpor trimestre\b/, recorrencia: 'trimestral' },
  { padrao: /\bbimestral(mente)?\b/, recorrencia: 'bimestral' },
  { padrao: /\bmensal(mente)?\b|\bpor mes\b|\ba cada mes\b/, recorrencia: 'mensal' },
]

/**
 * "anual", "semestralmente", "a cada 90 dias", "a cada 2 anos", "na renovação"… viram recorrência.
 * Mais de uma frequência no mesmo texto (inclusive periódica + renovação) não vira nada.
 */
export function recorrenciaSugerida(
  periodicidade: string | null | undefined,
): RecorrenciaSugerida | null {
  if (!periodicidade) return null
  const texto = normalizar(periodicidade)
  const achadas = new Map<string, RecorrenciaSugerida>()

  for (const { padrao, recorrencia } of PALAVRAS) {
    if (padrao.test(texto)) achadas.set(recorrencia, { recorrencia })
  }
  for (const [, numero, unidade] of texto.matchAll(
    /\ba cada (\d{1,4}) (dias?|mes(?:es)?|anos?)\b/g,
  )) {
    const n = Number(numero)
    if (!n) continue
    const meses = unidade?.startsWith('ano') ? n * 12 : unidade?.startsWith('mes') ? n : null
    if (meses !== null) {
      const preset = PRESETS_EM_MESES[meses]
      const sugestao: RecorrenciaSugerida = preset
        ? { recorrencia: preset }
        : { recorrencia: 'personalizada', unidade: 'mes', intervalo: meses }
      achadas.set(`m${String(meses)}`, sugestao)
    } else {
      achadas.set(`d${String(n)}`, { recorrencia: 'personalizada', unidade: 'dia', intervalo: n })
    }
  }
  if (/\brenovacao\b/.test(texto)) achadas.set('na_renovacao', { recorrencia: 'na_renovacao' })

  // "anual" e "a cada 12 meses" são a mesma coisa: compara pelo resultado.
  const distintas = new Map(
    [...achadas.values()].map((s) => [
      `${s.recorrencia}:${s.unidade ?? ''}:${String(s.intervalo ?? '')}`,
      s,
    ]),
  )
  return distintas.size === 1 ? ([...distintas.values()][0] ?? null) : null
}
