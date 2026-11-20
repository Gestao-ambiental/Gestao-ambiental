// Mapa para marcar o local do empreendimento na triagem. Carregado sob demanda (React.lazy) para o
// Leaflet não pesar no resto do app. Blocos do OpenStreetMap, com a atribuição exigida. Clicar
// marca o ponto; quem não usa mouse digita as coordenadas no campo ao lado (mesmo efeito).

import type { Coordenadas } from '@gestao-ambiental/domain'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './mapa-do-local.css'
import { useEffect, useRef } from 'react'

/** Centro de Joinville (piloto). */
const CENTRO_INICIAL: L.LatLngTuple = [-26.3044, -48.8487]

interface Props {
  ponto: Coordenadas | null
  aoEscolher: (c: Coordenadas) => void
}

export default function MapaDoLocal({ ponto, aoEscolher }: Props) {
  const elemento = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const marcador = useRef<L.CircleMarker | null>(null)
  const aoEscolherAtual = useRef(aoEscolher)

  useEffect(() => {
    aoEscolherAtual.current = aoEscolher
  }, [aoEscolher])

  useEffect(() => {
    if (!elemento.current || mapa.current) return
    const m = L.map(elemento.current, { center: CENTRO_INICIAL, zoom: 14 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
    }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      aoEscolherAtual.current({ latitude: e.latlng.lat, longitude: e.latlng.lng })
    })
    mapa.current = m
    return () => {
      m.remove()
      mapa.current = null
      marcador.current = null
    }
  }, [])

  useEffect(() => {
    const m = mapa.current
    if (!m) return
    if (!ponto) {
      marcador.current?.remove()
      marcador.current = null
      return
    }
    const latlng: L.LatLngTuple = [ponto.latitude, ponto.longitude]
    if (marcador.current) {
      marcador.current.setLatLng(latlng)
    } else {
      // Cor pelo CSS (mapa-do-local.css), com os tokens do tema.
      marcador.current = L.circleMarker(latlng, {
        radius: 9,
        weight: 3,
        fillOpacity: 1,
        className: 'marcador-do-local',
      }).addTo(m)
    }
    if (!m.getBounds().contains(latlng)) m.setView(latlng, Math.max(m.getZoom(), 16))
  }, [ponto])

  return (
    <div
      ref={elemento}
      role="region"
      aria-label="Mapa: clique para marcar o local do empreendimento"
      className="mapa-do-local h-[240px] w-full overflow-hidden rounded-(--raio-painel) border md:h-[320px]"
    />
  )
}
