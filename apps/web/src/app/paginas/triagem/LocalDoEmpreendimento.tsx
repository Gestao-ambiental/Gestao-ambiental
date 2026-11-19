// Local do empreendimento na triagem (docs/estudos/enquadramento-automatico.md): a pessoa marca o
// ponto no mapa ou digita as coordenadas, e a Edge Function consultar-local devolve município,
// lote e inscrição imobiliária (Joinville), zoneamento e restrições do terreno.

import {
  dentroDeSantaCatarina,
  formatarCoordenadas,
  lerCoordenadas,
  metrosQuadradosParaHectares,
  type Coordenadas,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'

import { Carregando } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { consultarLocal, type ResultadoDoLocal } from '@/lib/api/consulta-de-local'

const MapaDoLocal = lazy(() => import('./MapaDoLocal'))

const formatarNumero = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas })

function Resultado({
  resultado,
  aoUsarArea,
}: {
  resultado: ResultadoDoLocal
  aoUsarArea: (hectares: number) => void
}) {
  const areaHa =
    resultado.lote?.areaM2 != null ? metrosQuadradosParaHectares(resultado.lote.areaM2) : null
  return (
    <div className="flex flex-col gap-(--space-100)">
      <dl className="grid grid-cols-1 gap-x-(--space-200) gap-y-(--space-050) sm:grid-cols-3">
        <div>
          <dt className="rotulo text-(--text-subtle)">Município</dt>
          <dd className="corpo-medio text-(--text)">
            {resultado.municipio
              ? `${resultado.municipio.nome} (IBGE ${resultado.municipio.codigoIbge})`
              : 'Não identificado'}
          </dd>
        </div>
        {resultado.lote ? (
          <div>
            <dt className="rotulo text-(--text-subtle)">Inscrição imobiliária</dt>
            <dd className="corpo-medio text-(--text)">
              {resultado.lote.inscricaoImobiliaria ?? 'Sem inscrição'}
              {areaHa !== null && resultado.lote.areaM2 !== null
                ? ` · lote de ${formatarNumero(resultado.lote.areaM2)} m² (${formatarNumero(areaHa, 4)} ha)`
                : ''}
            </dd>
          </div>
        ) : null}
        {resultado.zoneamento || resultado.bairro ? (
          <div>
            <dt className="rotulo text-(--text-subtle)">Zoneamento</dt>
            <dd className="corpo-medio text-(--text)">
              {[
                resultado.zoneamento
                  ? `Setor ${resultado.zoneamento.setor}${resultado.zoneamento.macrozona ? `, ${resultado.zoneamento.macrozona}` : ''}`
                  : null,
                resultado.bairro ? `bairro ${resultado.bairro}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        ) : null}
      </dl>

      {areaHa !== null ? (
        <div>
          <Botao
            tamanho="compacto"
            onClick={() => {
              aoUsarArea(areaHa)
            }}
          >
            Usar a área do lote como AU(3)
          </Botao>
          <p className="corpo text-(--text-subtle)">
            Ponto de partida: a área útil da atividade pode ser menor que o lote.
          </p>
        </div>
      ) : null}

      <section aria-label="Restrições do terreno" className="flex flex-col gap-(--space-050)">
        <h3 className="rotulo text-(--text)">Restrições do terreno</h3>
        {resultado.restricoes.length === 0 ? (
          <p className="corpo text-(--text)">
            Nenhuma restrição encontrada nas camadas consultadas.
          </p>
        ) : (
          <ul className="flex flex-col gap-(--space-050)">
            {resultado.restricoes.map((r) => (
              <li
                key={`${r.tipo}-${r.descricao}`}
                className="flex flex-wrap items-center gap-(--space-050) corpo text-(--text)"
              >
                <Selo tom="atencao">{r.descricao}</Selo>
                <span className="text-(--text-subtle)">{r.fonte}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resultado.falhas.length > 0 ? (
        <MensagemSecao tom="atencao" titulo="Consulta incompleta">
          Não responderam: {resultado.falhas.join('; ')}. Tente de novo mais tarde ou confira no
          geoportal.
        </MensagemSecao>
      ) : null}
      {resultado.lote === null && resultado.municipio?.codigoIbge !== '4209102' ? (
        <p className="corpo text-(--text-subtle)">
          Lote, zoneamento, APP e inundação por enquanto só em Joinville (SIMGeo).
        </p>
      ) : null}
    </div>
  )
}

export function LocalDoEmpreendimento({ aoUsarArea }: { aoUsarArea: (hectares: number) => void }) {
  const [texto, setTexto] = useState('')
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null)
  const [ponto, setPonto] = useState<Coordenadas | null>(null)
  const consulta = useMutation({ mutationFn: consultarLocal })

  const consultar = (c: Coordenadas) => {
    setPonto(c)
    setTexto(formatarCoordenadas(c))
    if (!dentroDeSantaCatarina(c)) {
      setErroDoCampo('O ponto está fora de Santa Catarina.')
      consulta.reset()
      return
    }
    setErroDoCampo(null)
    consulta.mutate(c)
  }

  return (
    <section aria-label="Local do empreendimento" className="flex flex-col gap-(--space-100)">
      <h2 className="titulo-secao text-(--text)">Local do empreendimento</h2>
      <div className="grid grid-cols-1 gap-(--space-150) lg:grid-cols-2">
        <Suspense fallback={<Carregando rotulo="Carregando o mapa" linhas={3} />}>
          <MapaDoLocal ponto={ponto} aoEscolher={consultar} />
        </Suspense>
        <form
          className="flex flex-col gap-(--space-100)"
          onSubmit={(e) => {
            e.preventDefault()
            const c = lerCoordenadas(texto)
            if (!c) {
              setErroDoCampo('Use latitude e longitude em graus, como -26.3044, -48.8487.')
              return
            }
            consultar(c)
          }}
        >
          <CampoTexto
            rotulo="Coordenadas (latitude, longitude)"
            ajuda="Clique no mapa ou cole do Google Maps, como -26.3044, -48.8487."
            value={texto}
            erro={erroDoCampo ?? undefined}
            autoComplete="off"
            onChange={(e) => {
              setTexto(e.target.value)
            }}
          />
          <div>
            <Botao type="submit" aparencia="primario" disabled={consulta.isPending}>
              {consulta.isPending ? 'Consultando' : 'Consultar local'}
            </Botao>
          </div>
        </form>
      </div>
      {consulta.isPending ? <Carregando rotulo="Consultando o local" linhas={3} /> : null}
      {consulta.isError ? (
        <MensagemSecao role="alert" tom="perigo" titulo="Não foi possível consultar o local">
          {consulta.error.message}
        </MensagemSecao>
      ) : null}
      {consulta.isSuccess ? <Resultado resultado={consulta.data} aoUsarArea={aoUsarArea} /> : null}
    </section>
  )
}
