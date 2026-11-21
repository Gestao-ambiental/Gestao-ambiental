// Local do empreendimento na triagem (docs/estudos/enquadramento-automatico.md). Primeiro o
// endereço, com sugestões enquanto se digita (Edge Function buscar-endereco, só Santa Catarina);
// ao escolher, o mapa de satélite centraliza e marca o ponto. Clicar no mapa também marca, e as
// coordenadas ficam como opção ("Tenho as coordenadas"). Marcado o ponto, a Edge Function
// consultar-local devolve município, lote e inscrição (Joinville), zoneamento e restrições.
// O estado (ponto e consulta) fica na página, para não se perder ao trocar de etapa. Com unidades
// do empreendimento, a consulta leva a unidade e a função grava nela o município achado (ADR-0050).

import {
  formatarCoordenadas,
  lerCoordenadas,
  metrosQuadradosParaHectares,
  type Coordenadas,
} from '@gestao-ambiental/domain'
import { lazy, Suspense, useId, useState, type ReactNode } from 'react'

import { Carregando } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import type { ResultadoDoLocal } from '@/lib/api/consulta-de-local'
import type { Unidade } from '@/lib/api/empreendimentos'
import { cn } from '@/lib/utils'

import { BuscaDeEndereco } from './BuscaDeEndereco'

const MapaDoLocal = lazy(() => import('./MapaDoLocal'))

/**
 * Ponto marcado: as coordenadas e, se veio do endereço, o texto escolhido. Pela inscrição
 * imobiliária, também o contorno do lote ([latitude, longitude]), desenhado no mapa.
 */
export type PontoMarcado = Coordenadas & {
  rotulo?: string | null
  contorno?: [number, number][] | null
}

const formatarNumero = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas })

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-(--e-05)">
      <dt className="rotulo text-(--tinta-2)">{rotulo}</dt>
      <dd className="flex flex-col gap-(--e-1) corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

function Resultado({
  resultado,
  habilitacao,
  aoUsarArea,
}: {
  resultado: ResultadoDoLocal
  habilitacao: ReactNode
  aoUsarArea: (hectares: number) => void
}) {
  const areaHa =
    resultado.lote?.areaM2 != null ? metrosQuadradosParaHectares(resultado.lote.areaM2) : null
  return (
    <div className="flex flex-col gap-(--e-4) rounded-(--raio-painel) border p-(--e-4)">
      <dl className="grid grid-cols-1 gap-x-(--e-6) gap-y-(--e-3) sm:grid-cols-3">
        <Dado rotulo="Município">
          <span>
            {resultado.municipio
              ? `${resultado.municipio.nome} (IBGE ${resultado.municipio.codigoIbge})`
              : 'Não identificado'}
          </span>
          {resultado.municipio && resultado.municipioGravado ? (
            <span>
              <Selo tom="sucesso">Gravado na unidade</Selo>
            </span>
          ) : null}
          <span className="font-normal">{habilitacao}</span>
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

/** "Tenho as coordenadas": a alternativa ao endereço e ao clique no mapa. */
function CampoDeCoordenadas({
  ponto,
  aoMarcar,
  aoFechar,
}: {
  ponto: PontoMarcado | null
  aoMarcar: (c: PontoMarcado) => void
  aoFechar: () => void
}) {
  const [texto, setTexto] = useState(ponto ? formatarCoordenadas(ponto) : '')
  const [erro, setErro] = useState<string | null>(null)
  return (
    <form
      aria-label="Coordenadas"
      noValidate
      className="flex flex-col gap-(--e-2) sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        const c = lerCoordenadas(texto)
        if (!c) {
          setErro('Use latitude e longitude em graus, como -26.3044, -48.8487.')
          return
        }
        setErro(null)
        aoMarcar({ ...c, rotulo: null })
      }}
    >
      <CampoTexto
        rotulo="Coordenadas (latitude, longitude)"
        placeholder="-26.3044, -48.8487"
        value={texto}
        erro={erro ?? undefined}
        autoComplete="off"
        className="sm:flex-1"
        onChange={(e) => {
          setTexto(e.target.value)
        }}
      />
      <div className="flex gap-(--e-2) max-sm:flex-col sm:pt-(--e-6)">
        <Botao type="submit" iconeAntes="map-pin">
          Marcar
        </Botao>
        <Botao aparencia="sutil" onClick={aoFechar}>
          Usar o endereço
        </Botao>
      </div>
    </form>
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
  ponto,
  erroDoPonto,
  consulta,
  habilitacao,
  aoMarcar,
  aoUsarArea,
  unidades = [],
  unidadeId = null,
  erroDaUnidade = null,
  aoEscolherUnidade,
}: {
  /** Unidades do empreendimento: com várias, pede para escolher onde gravar o município. */
  unidades?: readonly Unidade[]
  unidadeId?: string | null
  erroDaUnidade?: string | null
  aoEscolherUnidade?: (id: string) => void
  ponto: PontoMarcado | null
  /** Ponto fora de Santa Catarina (a consulta nem sai). */
  erroDoPonto: string | null
  consulta: { pendente: boolean; erro: string | null; resultado: ResultadoDoLocal | null }
  habilitacao: ReactNode
  aoMarcar: (p: PontoMarcado) => void
  aoUsarArea: (hectares: number) => void
}) {
  const [comCoordenadas, setComCoordenadas] = useState(false)

  return (
    <div className="flex flex-col gap-(--e-4)">
      {unidades.length > 1 ? (
        <SeletorDaUnidade
          unidades={unidades}
          valor={unidadeId ?? ''}
          erro={erroDaUnidade}
          aoMudar={(id) => aoEscolherUnidade?.(id)}
        />
      ) : null}
      {comCoordenadas ? (
        <CampoDeCoordenadas
          ponto={ponto}
          aoMarcar={aoMarcar}
          aoFechar={() => {
            setComCoordenadas(false)
          }}
        />
      ) : (
        <div className="flex flex-col gap-(--e-2) sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <BuscaDeEndereco
              inicial={ponto?.rotulo ?? ''}
              aoEscolher={(sugestao) => {
                aoMarcar({
                  latitude: sugestao.latitude,
                  longitude: sugestao.longitude,
                  rotulo: sugestao.rotulo,
                  contorno: sugestao.contorno ?? null,
                })
              }}
            />
          </div>
          <Botao
            aparencia="sutil"
            iconeAntes="map-pin"
            className="shrink-0"
            onClick={() => {
              setComCoordenadas(true)
            }}
          >
            Tenho as coordenadas
          </Botao>
        </div>
      )}

      {erroDoPonto ? (
        <MensagemSecao role="alert" tom="perigo">
          {erroDoPonto}
        </MensagemSecao>
      ) : null}

      <Suspense
        fallback={
          <Carregando rotulo="Carregando o mapa" linhas={4} className="h-[280px] md:h-[400px]" />
        }
      >
        <MapaDoLocal
          ponto={ponto}
          contorno={ponto?.contorno ?? null}
          aoEscolher={(c) => {
            aoMarcar({ ...c, rotulo: null })
          }}
        />
      </Suspense>

      {consulta.pendente ? <Carregando rotulo="Consultando o local" linhas={3} /> : null}
      {consulta.erro ? (
        <MensagemSecao role="alert" tom="perigo" titulo="Não foi possível consultar o local">
          {consulta.erro}
        </MensagemSecao>
      ) : null}
      {consulta.resultado ? (
        <Resultado
          resultado={consulta.resultado}
          habilitacao={habilitacao}
          aoUsarArea={aoUsarArea}
        />
      ) : null}
    </div>
  )
}
