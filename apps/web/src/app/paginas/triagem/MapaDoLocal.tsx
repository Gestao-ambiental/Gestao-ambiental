// Mapa para marcar o local do empreendimento na triagem. Carregado sob demanda (React.lazy) para o
// Leaflet e o MapLibre não pesarem no resto do app.
//
// Base: ortofoto oficial de Santa Catarina (SIGSC/SDE, aerolevantamento 2010-2012, 0,39 m), por WMS,
// acesso livre. Por cima, só os nomes de ruas, bairros e cidades do OpenFreeMap (vetorial, uso
// comercial liberado, sem chave), em branco com contorno escuro para ler sobre a foto. Sem WebGL,
// os nomes não aparecem e o mapa segue funcionando. Clicar marca o ponto; quem não usa mouse busca
// o endereço ou digita as coordenadas (mesmo efeito).

import '@maplibre/maplibre-gl-leaflet'
import type { Coordenadas } from '@gestao-ambiental/domain'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './mapa-do-local.css'
import { useEffect, useRef } from 'react'

import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
// O worker do MapLibre como arquivo do próprio app: o Vite não acha o caminho relativo dele.
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

import {
  ESTILO_DOS_NOMES,
  estiloSoDeNomes,
  ORTOFOTO_SC,
  type CamadaDoEstilo,
} from './camadas-do-mapa'

setWorkerUrl(urlDoWorker)

/** Centro de Joinville (piloto). */
const CENTRO_INICIAL: L.LatLngTuple = [-26.3044, -48.8487]

async function adicionarNomes(m: L.Map): Promise<L.Layer | null> {
  try {
    const resposta = await fetch(ESTILO_DOS_NOMES)
    if (!resposta.ok) return null
    const estilo = estiloSoDeNomes((await resposta.json()) as { layers: CamadaDoEstilo[] })
    // Painel próprio entre a foto (200) e o ponto marcado (400), sem pegar o clique.
    const painel = m.getPane('nomes') ?? m.createPane('nomes')
    painel.style.zIndex = '350'
    painel.style.pointerEvents = 'none'
    // O plugin aceita `pane` (getPaneName), mas o tipo dele não declara.
    const opcoes = {
      style: estilo as unknown as StyleSpecification,
      interactive: false,
      pane: 'nomes',
    }
    const camada = L.maplibreGL(opcoes)
    camada.addTo(m)
    return camada
  } catch {
    // Sem rede para o estilo ou sem WebGL: fica só a foto.
    return null
  }
}

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
    const m = L.map(elemento.current, { center: CENTRO_INICIAL, zoom: 15, maxZoom: 20 })
    // Sem o prefixo do Leaflet: os créditos das fontes já ocupam a linha no celular.
    m.attributionControl.setPrefix(false)
    L.tileLayer
      .wms(ORTOFOTO_SC.url, {
        layers: ORTOFOTO_SC.camada,
        format: 'image/jpeg',
        transparent: false,
        version: '1.1.1',
        maxNativeZoom: 19,
        maxZoom: 20,
        attribution: ORTOFOTO_SC.atribuicao,
      })
      .addTo(m)
    // Os nomes trazem a própria atribuição (OpenFreeMap, OpenMapTiles, OpenStreetMap).
    let nomes: L.Layer | null = null
    let ativo = true
    void adicionarNomes(m).then((camada) => {
      if (ativo) nomes = camada
      else camada?.remove()
    })
    m.on('click', (e: L.LeafletMouseEvent) => {
      aoEscolherAtual.current({ latitude: e.latlng.lat, longitude: e.latlng.lng })
    })
    mapa.current = m
    return () => {
      ativo = false
      nomes?.remove()
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
    // Endereço escolhido ou ponto fora da vista: centraliza perto do lote.
    if (!m.getBounds().contains(latlng) || m.getZoom() < 16) m.setView(latlng, 18)
  }, [ponto])

  return (
    <div
      ref={elemento}
      role="region"
      aria-label="Mapa de satélite: clique para marcar o local do empreendimento"
      className="mapa-do-local h-[300px] w-full overflow-hidden rounded-(--raio-painel) border md:h-[420px]"
    />
  )
}
