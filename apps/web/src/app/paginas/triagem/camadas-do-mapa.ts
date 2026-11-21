// Camadas do mapa da triagem, fora do componente para testar sem Leaflet nem WebGL.
//
// - Ortofoto oficial de SC: SIGSC/SDE, aerolevantamento 2010-2012 (0,39 m). Metadado oficial:
//   "O acesso ao dado é livre"; sem chave. O servidor só tem cache em EPSG:31982, então vai por WMS.
// - Nomes: estilo vetorial "positron" do OpenFreeMap (uso comercial liberado, sem chave), só com as
//   camadas de nome, em branco com contorno escuro para ler sobre a foto.

export const ORTOFOTO_SC = {
  url: 'https://sigsc.sc.gov.br/sigserver/SIGSC/wms',
  camada: 'OrtoRGB-Landsat-2012',
  atribuicao: 'Ortofoto: Governo de Santa Catarina/SDE, 2010-2012',
}

export const ESTILO_DOS_NOMES = 'https://tiles.openfreemap.org/styles/positron'

/** Só os nomes que ajudam a se achar: ruas, bairros, localidades e cidades. */
export const NOMES_MANTIDOS: ReadonlySet<string> = new Set([
  'highway-name-minor',
  'highway-name-major',
  'label_other',
  'label_village',
  'label_town',
  'label_city',
  'label_city_capital',
])

export interface CamadaDoEstilo {
  id: string
  type: string
  paint?: Record<string, unknown>
  [chave: string]: unknown
}

/** O estilo do OpenFreeMap só com as camadas de nome, em branco com contorno escuro. */
export function estiloSoDeNomes<E extends { layers: CamadaDoEstilo[] }>(estilo: E): E {
  const camadas = estilo.layers
    .filter((c) => c.type === 'symbol' && NOMES_MANTIDOS.has(c.id))
    .map((c) => ({
      ...c,
      paint: {
        ...c.paint,
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(8, 9, 11, 0.85)',
        'text-halo-width': 1.4,
      },
    }))
  return { ...estilo, layers: camadas }
}
