// Local do empreendimento na triagem (docs/estudos/enquadramento-automatico.md): a pessoa marca o
// ponto no mapa ou digita as coordenadas, e a Edge Function consultar-local devolve município,
// lote e inscrição imobiliária (Joinville), zoneamento e restrições do terreno. Com unidades do
// empreendimento, a consulta leva a unidade e a função grava nela o município achado (ADR-0050).

import {
  dentroDeSantaCatarina,
  formatarCoordenadas,
  lerCoordenadas,
  metrosQuadradosParaHectares,
  type Coordenadas,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useId, useState, type ReactNode } from 'react'

import { Carregando } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  consultarLocal,
  type ResultadoDoLocal,
  type UnidadeDaConsulta,
} from '@/lib/api/consulta-de-local'
import type { Unidade } from '@/lib/api/empreendimentos'
import { cn } from '@/lib/utils'

const MapaDoLocal = lazy(() => import('./MapaDoLocal'))

const formatarNumero = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas })

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-(--e-05)">
      <dt className="rotulo text-(--tinta-2)">{rotulo}</dt>
      <dd className="corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

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
    <div className="flex flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) sm:p-(--e-5)">
      <dl className="grid grid-cols-1 gap-x-(--e-6) gap-y-(--e-3) sm:grid-cols-3">
        <Dado rotulo="Município">
          {resultado.municipio
            ? `${resultado.municipio.nome} (IBGE ${resultado.municipio.codigoIbge})`
            : 'Não identificado'}
          {resultado.municipio && resultado.municipioGravado ? (
            <>
              {' '}
              <Selo tom="sucesso">Gravado na unidade</Selo>
            </>
          ) : null}
        </Dado>
        {resultado.lote ? (
          <Dado rotulo="Inscrição imobiliária">
            <span className="numero">
              {resultado.lote.inscricaoImobiliaria ?? 'Sem inscrição'}
              {areaHa !== null && resultado.lote.areaM2 !== null
                ? ` · lote de ${formatarNumero(resultado.lote.areaM2)} m² (${formatarNumero(areaHa, 4)} ha)`
                : ''}
            </span>
          </Dado>
        ) : null}
        {resultado.zoneamento || resultado.bairro ? (
          <Dado rotulo="Zoneamento">
            {[
              resultado.zoneamento
                ? `Setor ${resultado.zoneamento.setor}${resultado.zoneamento.macrozona ? `, ${resultado.zoneamento.macrozona}` : ''}`
                : null,
              resultado.bairro ? `bairro ${resultado.bairro}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Dado>
        ) : null}
      </dl>

      {areaHa !== null ? (
        <div>
          <Botao
            tamanho="compacto"
            iconeAntes="arrow-right"
            onClick={() => {
              aoUsarArea(areaHa)
            }}
          >
            Usar a área do lote como AU(3)
          </Botao>
        </div>
      ) : null}

      <section
        aria-label="Restrições do terreno"
        className="flex flex-col gap-(--e-2) border-t border-(--regra-leve) pt-(--e-3)"
      >
        <h3 className="titulo-secao text-(--tinta)">Restrições do terreno</h3>
        {resultado.restricoes.length === 0 ? (
          <p className="corpo text-(--tinta)">
            Nenhuma restrição encontrada nas camadas consultadas.
          </p>
        ) : (
          <ul className="flex flex-col gap-(--e-1)">
            {resultado.restricoes.map((r) => (
              <li
                key={`${r.tipo}-${r.descricao}`}
                className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-05) corpo text-(--tinta)"
              >
                <Selo tom="atencao">{r.descricao}</Selo>
                <span className="text-xs text-(--tinta-2)">{r.fonte}</span>
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
        <p className="corpo text-(--tinta-2)">
          Lote, zoneamento, APP e inundação por enquanto só em Joinville (SIMGeo).
        </p>
      ) : null}
    </div>
  )
}

/** Seletor da unidade onde gravar o município, quando o empreendimento tem mais de uma. */
function SeletorDaUnidade({
  unidades,
  valor,
  erro,
  aoMudar,
}: {
  unidades: readonly Unidade[]
  valor: string
  erro: string | null
  aoMudar: (id: string) => void
}) {
  const id = useId()
  const erroId = `${id}-erro`
  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={id} className="rotulo text-(--tinta)">
        Unidade
      </label>
      <select
        id={id}
        className={cn(classeCampo, 'max-w-[360px] cursor-pointer')}
        value={valor}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        onChange={(e) => {
          aoMudar(e.target.value)
        }}
      >
        <option value="">Escolha a unidade</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
      </select>
      {erro ? (
        <span id={erroId} className="text-xs font-[650] text-(--atraso-texto)">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

export function LocalDoEmpreendimento({
  consultoriaId,
  unidades = [],
  aoUsarArea,
}: {
  consultoriaId?: string
  /** Unidades do empreendimento: com uma, a consulta grava nela; com várias, pede para escolher. */
  unidades?: readonly Unidade[]
  aoUsarArea: (hectares: number) => void
}) {
  const [texto, setTexto] = useState('')
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null)
  const [ponto, setPonto] = useState<Coordenadas | null>(null)
  const [unidadeEscolhida, setUnidadeEscolhida] = useState('')
  const [erroDaUnidade, setErroDaUnidade] = useState<string | null>(null)
  const consulta = useMutation({
    mutationFn: ({ c, unidade }: { c: Coordenadas; unidade?: UnidadeDaConsulta }) =>
      consultarLocal(c, unidade),
  })

  const varias = unidades.length > 1
  const unidadeId =
    unidades.length === 1
      ? unidades[0]?.id
      : unidades.some((u) => u.id === unidadeEscolhida)
        ? unidadeEscolhida
        : undefined

  const consultar = (c: Coordenadas) => {
    setPonto(c)
    setTexto(formatarCoordenadas(c))
    if (!dentroDeSantaCatarina(c)) {
      setErroDoCampo('O ponto está fora de Santa Catarina.')
      consulta.reset()
      return
    }
    setErroDoCampo(null)
    if (varias && !unidadeId) {
      setErroDaUnidade('Escolha a unidade.')
      consulta.reset()
      return
    }
    setErroDaUnidade(null)
    consulta.mutate({
      c,
      unidade: consultoriaId && unidadeId ? { consultoriaId, unidadeId } : undefined,
    })
  }

  return (
    <section aria-label="Local do empreendimento" className="flex flex-col gap-(--e-4)">
      <div className="grid grid-cols-1 gap-(--e-4) lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Suspense
          fallback={
            <Carregando rotulo="Carregando o mapa" linhas={4} className="h-[240px] md:h-[320px]" />
          }
        >
          <MapaDoLocal ponto={ponto} aoEscolher={consultar} />
        </Suspense>
        <form
          className="flex flex-col gap-(--e-2) lg:pt-(--e-1)"
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
          {varias ? (
            <SeletorDaUnidade
              unidades={unidades}
              valor={unidadeId ?? ''}
              erro={erroDaUnidade}
              aoMudar={(id) => {
                setUnidadeEscolhida(id)
                if (id) setErroDaUnidade(null)
              }}
            />
          ) : null}
          <CampoTexto
            rotulo="Coordenadas (latitude, longitude)"
            placeholder="-26.3044, -48.8487"
            value={texto}
            erro={erroDoCampo ?? undefined}
            autoComplete="off"
            inputMode="text"
            onChange={(e) => {
              setTexto(e.target.value)
            }}
          />
          <div>
            <Botao
              type="submit"
              aparencia="primario"
              iconeAntes="map-pin"
              disabled={consulta.isPending}
              className="max-md:w-full"
            >
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
