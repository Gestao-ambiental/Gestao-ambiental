// Local do empreendimento na triagem (docs/estudos/enquadramento-automatico.md): leitura das
// coordenadas digitadas ou coladas do Google Maps e o limite de Santa Catarina. A consulta às
// camadas fica na Edge Function consultar-local, que repete o mesmo limite.

export interface Coordenadas {
  latitude: number
  longitude: number
}

/** Retângulo que contém Santa Catarina, com folga (igual ao da Edge Function). */
export function dentroDeSantaCatarina(c: Coordenadas): boolean {
  return c.latitude >= -29.5 && c.latitude <= -25.8 && c.longitude >= -54 && c.longitude <= -48.2
}

/**
 * Lê "latitude, longitude" em graus decimais: "-26.3044, -48.8487" (como o Google Maps copia),
 * "-26,3044; -48,8487" ou separados por espaço. Null se não for um par válido.
 */
export function lerCoordenadas(texto: string): Coordenadas | null {
  const t = texto.trim()
  if (!t) return null
  let partes: string[]
  if (t.includes(';')) {
    partes = t.split(';')
  } else if (/^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(t)) {
    partes = t.split(',')
  } else {
    partes = t.split(/\s+/)
  }
  if (partes.length !== 2) return null
  const [lat, lng] = partes.map((p) => {
    const s = p.trim().replace(',', '.')
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN
  })
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { latitude: lat, longitude: lng }
}

/** "-26.30440, -48.84870": como mostramos e como o campo aceita de volta. */
export function formatarCoordenadas(c: Coordenadas): string {
  return `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`
}

/** m² → ha, para sugerir a área útil AU(3), que a CONSEMA pede em hectares. */
export function metrosQuadradosParaHectares(m2: number): number {
  return Math.round((m2 / 10_000) * 10_000) / 10_000
}
