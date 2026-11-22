// Triagem de licenciamento (enquadramento) pela Resolução CONSEMA 250/2024 consolidada.
// docs/estudos/triagem-licenciamento-consema-250.md. Protótipo para revisão.
//
// O enquadramento é cálculo local sobre o catálogo do domínio. Só a consulta do local (mapa) vai à
// rede, pela Edge Function consultar-local, com seus estados de carregando e erro. O resultado
// orienta a proposta; quem enquadra é o órgão.
//
// Etapas como no editor de orçamento (pedido do Eduardo, 20/11/2026): a trilha no alto, uma etapa
// por vez (1 Local, 2 Atividades e porte, 3 Resultado), "Continuar" verde para a próxima e "Voltar".
// O resumo ao lado (embaixo, no celular) mostra o que já se sabe: município e habilitação, lote,
// restrições e enquadramento. A etapa fica na URL (?etapa=atividades): recarregar não perde o lugar.
//
// Com ?empreendimento= (e, do plano de renovação, &licenca=), a Gestão grava as atividades
// enquadradas numa licença do empreendimento (ADR-0044), para sugerir a taxa da renovação, ou no
// próprio empreendimento (ADR-0050, LEG-05). Com unidades, a consulta do local grava o município
// na unidade.

import {
  CATALOGO_CONSEMA_250,
  CATALOGO_CONSEMA_251,
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_ESTUDO,
  ROTULO_DO_PORTE,
  FONTE_DA_TAXA_IMA,
  buscarAtividades,
  dentroDeSantaCatarina,
  formatarCoordenadas,
  metrosQuadradosParaHectares,
  calcularTaxaDoIma,
  concluirTriagem,
  definirCompetencia,
  descreverCondicao,
  enquadrarAtividade,
  formatarReais,
  informacoesDoIma,
  lerNumeroDigitado,
  parametrosDaAtividade,
  type AtividadeLicenciavel,
  type Competencia,
  type Coordenadas,
  type ConclusaoDaTriagem,
  type Medidas,
  type NivelMunicipal,
  type ResultadoDoEnquadramento,
  type TaxaDoIma,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoTexto } from '@/components/ui/campo-texto'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import { Selo } from '@/components/ui/selo'
import { Trilha } from '@/components/ui/trilha'
import {
  consultarLocal,
  type ResultadoDoLocal,
  type UnidadeDaConsulta,
} from '@/lib/api/consulta-de-local'
import {
  gravarAtividadesNaLicenca,
  type AtividadeParaGravar,
} from '@/lib/api/atividades-da-licenca'
import { gravarAtividadesNoEmpreendimento } from '@/lib/api/atividades-do-empreendimento'
import { listarUnidades, obterEmpreendimento } from '@/lib/api/empreendimentos'
import { ehUuid } from '@/lib/texto'
import { cn } from '@/lib/utils'

import { AcaoGravar, RetornoDaGravacao, type DestinoDaGravacao } from './GravarNaLicenca'
import { LocalDoEmpreendimento, type PontoMarcado } from './LocalDoEmpreendimento'
import { OrcarDaTriagem } from './OrcarDaTriagem'

const { atividades: CATALOGO, parametros: PARAMETROS, fonte: FONTE } = CATALOGO_CONSEMA_250
const POR_CODIGO = new Map(CATALOGO.map((a) => [a.codigo, a]))
/** Área útil geral (ha), o parâmetro que a área do lote ajuda a preencher. */
const AREA_UTIL = 'AU(3)'

const ROTULO_DO_POTENCIAL = { P: 'pequeno', M: 'médio', G: 'grande' } as const

/** "RAP (Relatório Ambiental Prévio)" → ["RAP", "Relatório Ambiental Prévio"]. */
function separarSigla(rotulo: string): [string, string] {
  const i = rotulo.indexOf(' (')
  return i < 0 ? [rotulo, ''] : [rotulo.slice(0, i), rotulo.slice(i + 2, -1)]
}

interface ItemEmEdicao {
  codigo: string
  /** Texto digitado por parâmetro, como a pessoa escreveu. */
  medidas: Record<string, string>
}

function medidasLidas(item: ItemEmEdicao): Medidas {
  const lidas: Record<string, number | null> = {}
  for (const [sigla, texto] of Object.entries(item.medidas)) lidas[sigla] = lerNumeroDigitado(texto)
  return lidas
}

interface ItemCalculado {
  item: ItemEmEdicao
  /** A atividade da 250/2024 (descrição, parâmetros e potencial). */
  atividade: AtividadeLicenciavel
  competencia: Competencia
  /** O enquadramento pela lista do órgão competente. */
  resultado: ResultadoDoEnquadramento
}

function calcular(item: ItemEmEdicao, nivel: NivelMunicipal | null): ItemCalculado | null {
  const atividade = POR_CODIGO.get(item.codigo)
  if (!atividade) return null
  const medidas = medidasLidas(item)
  const competencia = definirCompetencia(
    item.codigo,
    medidas,
    nivel,
    CATALOGO_CONSEMA_250,
    CATALOGO_CONSEMA_251,
  )
  const resultado =
    competencia.orgao === 'fora_da_lista'
      ? enquadrarAtividade(atividade, medidas)
      : competencia.resultado
  return { item, atividade, competencia, resultado }
}

/**
 * O que "Gravar" (na licença ou no empreendimento) grava: as atividades enquadradas, com o porte da faixa, o potencial
 * geral e as medidas lidas (as pendentes e as abaixo do limite ficam de fora).
 */
function atividadesParaGravar(calculados: readonly ItemCalculado[]): AtividadeParaGravar[] {
  return calculados.flatMap((c) => {
    if (c.resultado.tipo !== 'enquadrada') return []
    const medidas: Record<string, number> = {}
    for (const [sigla, valor] of Object.entries(medidasLidas(c.item))) {
      if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) medidas[sigla] = valor
    }
    return [
      {
        codigo: c.atividade.codigo,
        descricao: c.atividade.descricao,
        porte: c.resultado.faixa.porte,
        potencial: c.atividade.potencial.geral,
        medidas,
        fonte: FONTE,
      },
    ]
  })
}

/** Valor da taxa do IMA da atividade (o mesmo do cartão), quando é estadual e está enquadrada. */
function centavosNoIma(c: ItemCalculado): number | null {
  if (c.resultado.tipo !== 'enquadrada' || c.competencia.orgao === 'municipal') return null
  const taxa = calcularTaxaDoIma(c.atividade, c.resultado.faixa, medidasLidas(c.item))
  if (taxa.tipo === 'autorizacao') return taxa.centavos
  if (taxa.tipo === 'licencas') return taxa.totalCentavos
  return null
}

const ROTULO_DO_NIVEL: Record<NivelMunicipal, string> = { 1: 'I', 2: 'II', 3: 'III' }

const MOTIVO_ESTADUAL: Record<Extract<Competencia, { orgao: 'estadual' }>['motivo'], string> = {
  municipio_nao_habilitado: 'município sem habilitação informada',
  fora_da_lista_local: 'atividade fora da lista de impacto local (CONSEMA 251/2024)',
  fora_das_faixas_locais: 'porte fora das faixas que o município pode licenciar',
  sempre_estadual: 'licenciamento municipal suspenso para antenas (251/2024, Art. 3º, §6º)',
  falta_medida: 'informe o parâmetro para saber se cabe no município',
}

function QuemLicencia({
  competencia,
  habilitacao,
}: {
  competencia: Competencia
  /** Controle da habilitação, mostrado quando a falta dela é o motivo de ir para o Estado. */
  habilitacao?: ReactNode
}) {
  if (competencia.orgao === 'municipal') {
    return (
      <p className="corpo text-(--tinta)">
        <span className="corpo-medio">Quem licencia: município</span> · nível{' '}
        {ROTULO_DO_NIVEL[competencia.nivel]} da CONSEMA 251/2024
      </p>
    )
  }
  if (competencia.orgao === 'estadual') {
    return (
      <div className="flex flex-col gap-(--e-2)">
        <p className="corpo text-(--tinta)">
          <span className="corpo-medio">Quem licencia: Estado (IMA)</span> ·{' '}
          <span className="text-(--tinta-2)">{MOTIVO_ESTADUAL[competencia.motivo]}</span>
        </p>
        {competencia.motivo === 'municipio_nao_habilitado' ? habilitacao : null}
      </div>
    )
  }
  return null
}

function BuscaDeAtividade({
  jaIncluidas,
  aoIncluir,
}: {
  jaIncluidas: ReadonlySet<string>
  aoIncluir: (codigo: string) => void
}) {
  const [termo, setTermo] = useState('')
  const resultados = useMemo(() => buscarAtividades(CATALOGO, termo, 12), [termo])
  const idLista = useId()

  return (
    <div role="search" aria-label="Buscar atividade" className="flex flex-col gap-(--e-2)">
      <CampoTexto
        rotulo="Atividade"
        placeholder="Código ou palavra: 12.80.10, pintura"
        value={termo}
        type="search"
        autoComplete="off"
        aria-controls={idLista}
        onChange={(e) => {
          setTermo(e.target.value)
        }}
      />
      <div id={idLista}>
        {termo.trim() && resultados.length === 0 ? (
          <p className="corpo text-(--tinta-2)" role="status">
            Nenhuma atividade do Anexo VI encontrada para "{termo.trim()}".
          </p>
        ) : null}
        {resultados.length > 0 ? (
          <ul
            aria-label="Atividades encontradas"
            className="flex max-h-[336px] flex-col overflow-y-auto rounded-(--raio-painel) border bg-(--folha)"
          >
            {resultados.map((a) => {
              const incluida = jaIncluidas.has(a.codigo)
              return (
                <li
                  key={a.codigo}
                  className="flex min-h-(--linha) items-center gap-(--e-3) border-b border-(--regra-leve) px-(--e-3) py-(--e-2) last:border-b-0 hover:bg-(--toque) max-sm:flex-wrap"
                >
                  <span className="w-[76px] shrink-0 corpo-medio text-(--tinta) numero">
                    {a.codigo}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col max-sm:order-last max-sm:basis-full">
                    <span className="corpo text-(--tinta)">{a.descricao}</span>
                    <span className="text-xs text-(--tinta-2)">{a.grupo}</span>
                  </span>
                  <Botao
                    tamanho="compacto"
                    iconeAntes={incluida ? 'check' : 'plus'}
                    aparencia={incluida ? 'sutil' : 'padrao'}
                    disabled={incluida}
                    className="max-sm:ml-auto"
                    aria-label={incluida ? `${a.codigo} já incluída` : `Incluir ${a.codigo}`}
                    onClick={() => {
                      aoIncluir(a.codigo)
                    }}
                  >
                    {incluida ? 'Incluída' : 'Incluir'}
                  </Botao>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

/** Um par rótulo/valor do resultado de uma atividade. */
function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-(--e-05)">
      <dt className="rotulo text-(--tinta-2)">{rotulo}</dt>
      <dd className="corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

function DescricaoDoResultado({
  atividade,
  resultado,
}: {
  atividade: AtividadeLicenciavel
  resultado: ResultadoDoEnquadramento
}) {
  switch (resultado.tipo) {
    case 'falta_medida':
      return (
        <p className="corpo-medio text-(--alerta-texto)">
          Informe {resultado.parametros.join(' ou ')} para enquadrar.
        </p>
      )
    case 'medida_invalida':
      return (
        <MensagemSecao tom="perigo" titulo="Valor inválido">
          O valor de {resultado.parametro} precisa ser um número maior ou igual a zero, como 0,2 ou
          48.000.
        </MensagemSecao>
      )
    case 'abaixo_do_limite':
      return (
        <MensagemSecao tom="informacao" titulo="Abaixo do limite de licenciamento">
          Com {resultado.parametro} abaixo de{' '}
          {resultado.limite.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}, a atividade não
          é licenciável pelo Estado. Se o município também não licencia, cabe cadastro com
          Declaração e Certidão de Conformidade Ambiental, a CCA (Art. 14).
        </MensagemSecao>
      )
    case 'acima_do_limite':
      return (
        <p className="corpo-medio text-(--alerta-texto)">
          {resultado.parametro} acima de{' '}
          {resultado.limite.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}: fora das faixas
          desta lista.
        </p>
      )
    case 'enquadrada': {
      const { faixa } = resultado
      return (
        <div className="flex flex-col gap-(--e-2)">
          <dl className="grid grid-cols-1 gap-x-(--e-6) gap-y-(--e-3) sm:grid-cols-[auto_auto_minmax(0,1fr)]">
            <Dado rotulo="Porte">{ROTULO_DO_PORTE[faixa.porte]}</Dado>
            <Dado rotulo="Modalidade">{ROTULO_DA_MODALIDADE[faixa.modalidade]}</Dado>
            <Dado rotulo="Estudo">
              {faixa.estudo ? ROTULO_DO_ESTUDO[faixa.estudo] : 'Dispensado (Art. 22)'}
            </Dado>
          </dl>
          <q className="text-xs text-(--tinta-2)">{faixa.textoOriginal}</q>
          {resultado.avisos.length > 0 ? (
            <ul
              aria-label={`Observações de ${atividade.codigo}`}
              className="flex flex-col gap-(--e-1)"
            >
              {resultado.avisos.map((aviso) => (
                <li key={aviso} className="corpo text-(--tinta)">
                  {aviso}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )
    }
  }
}

function ValorDaTaxa({ taxa }: { taxa: TaxaDoIma }) {
  if (taxa.tipo === 'autorizacao') {
    return (
      <p className="corpo text-(--tinta)">
        <span className="corpo-medio numero">Taxa da AuA: {formatarReais(taxa.centavos)}</span>{' '}
        <span className="text-(--tinta-2)">· item {taxa.item} do anexo</span>
      </p>
    )
  }
  if (taxa.tipo === 'sem_valor') {
    return (
      <p className="corpo text-(--tinta-2)">
        {taxa.motivo === 'falta_medida'
          ? `Informe ${taxa.parametro ?? 'o parâmetro'} para calcular a taxa.`
          : 'O decreto não traz valor de taxa para esta atividade: consulte o IMA.'}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-(--e-2)">
      <dl className="flex flex-wrap gap-x-(--e-6) gap-y-(--e-2)">
        {taxa.fases.map((v) => (
          <Dado key={v.fase} rotulo={v.fase}>
            <span className="numero">{formatarReais(v.centavos)}</span>
          </Dado>
        ))}
        {taxa.fases.length > 1 ? (
          <Dado rotulo="Total">
            <span className="font-semibold numero">{formatarReais(taxa.totalCentavos)}</span>
          </Dado>
        ) : null}
      </dl>
      <p className="text-xs text-(--tinta-2)">
        {taxa.formula
          ? `Fórmula: ${taxa.formula}, com fator 1 (LAP), 1,5 (LAI) e 1,25 (LAO).`
          : `Classe ${taxa.classe ?? ''} (porte, potencial). Na renovação, paga-se de novo a LAO.`}
      </p>
      {taxa.avisos.map((aviso) => (
        <p key={aviso} className="corpo text-(--tinta)">
          {aviso}
        </p>
      ))}
    </div>
  )
}

/** O que o Simulador de Licenciamento do IMA mostra para a atividade: taxa, IN e TFASC. */
function NoIma({
  atividade,
  resultado,
  medidas,
  municipal,
}: {
  atividade: AtividadeLicenciavel
  resultado: ResultadoDoEnquadramento
  medidas: Medidas
  municipal: boolean
}) {
  const info = informacoesDoIma(atividade)
  const instrucao = info.instrucaoNormativa
  return (
    <section
      aria-label={`No IMA: ${atividade.codigo}`}
      className="flex flex-col gap-(--e-2) border-t border-(--regra-leve) pt-(--e-3)"
    >
      <h4 className="titulo-secao text-(--tinta)">No IMA</h4>
      {resultado.tipo === 'enquadrada' ? (
        municipal ? (
          <p className="corpo text-(--tinta-2)">
            Licenciamento no município: a taxa é a do município.
          </p>
        ) : (
          <ValorDaTaxa taxa={calcularTaxaDoIma(atividade, resultado.faixa, medidas)} />
        )
      ) : null}
      <div className="flex flex-wrap items-center gap-x-(--e-4) gap-y-(--e-1) corpo text-(--tinta)">
        {instrucao ? (
          <span className="flex flex-wrap items-center gap-(--e-2)">
            <a href={instrucao.url} target="_blank" rel="noopener noreferrer">
              IN {String(instrucao.numero).padStart(2, '0')} · {instrucao.titulo}
            </a>
            {instrucao.revogada ? <Selo tom="atencao">Revogada no site do IMA</Selo> : null}
          </span>
        ) : null}
        {info.tfasc !== null ? (
          <span>
            {info.tfasc ? 'Paga TFASC (taxa anual de fiscalização ambiental).' : 'Não paga TFASC.'}
          </span>
        ) : null}
      </div>
      {info.potencialDivergente ? (
        <p className="corpo text-(--alerta-texto)">
          O simulador do IMA ainda usa potencial poluidor {info.potencialDivergente}; a resolução
          vigente diz {atividade.potencial.geral}.
        </p>
      ) : null}
    </section>
  )
}

function CabecalhoDaAtividade({
  atividade,
  acao,
}: {
  atividade: AtividadeLicenciavel
  acao?: ReactNode
}) {
  return (
    <header className="flex items-start gap-(--e-3)">
      <div className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
        <h3 className="titulo-secao text-(--tinta)">
          <span className="numero">{atividade.codigo}</span>
          <span className="text-(--tinta-3)"> · </span>
          {atividade.descricao}
        </h3>
        <p className="text-xs text-(--tinta-2)">
          Potencial poluidor {ROTULO_DO_POTENCIAL[atividade.potencial.geral]} (
          {atividade.potencial.geral})
          {atividade.redacaoDada ? ` · redação dada pela CONSEMA ${atividade.redacaoDada}` : ''}
        </p>
      </div>
      {acao}
    </header>
  )
}

/** Uma linha com o enquadramento enquanto se digita (o detalhe fica na etapa Resultado). */
function EnquadramentoEmUmaLinha({ resultado }: { resultado: ResultadoDoEnquadramento }) {
  switch (resultado.tipo) {
    case 'enquadrada': {
      const [sigla] = separarSigla(ROTULO_DA_MODALIDADE[resultado.faixa.modalidade])
      return (
        <p className="flex flex-wrap items-center gap-(--e-2) corpo text-(--tinta)">
          <Selo tom="sucesso">Enquadrada</Selo>
          <span>
            Porte {ROTULO_DO_PORTE[resultado.faixa.porte].toLowerCase()} ·{' '}
            <span className="corpo-medio">{sigla}</span>
          </span>
        </p>
      )
    }
    case 'falta_medida':
      return (
        <p className="corpo-medio text-(--alerta-texto)">
          Informe {resultado.parametros.join(' ou ')} para enquadrar.
        </p>
      )
    case 'medida_invalida':
      return (
        <p className="corpo-medio text-(--atraso-texto)">
          {resultado.parametro}: use um número maior ou igual a zero, como 0,2 ou 48.000.
        </p>
      )
    case 'abaixo_do_limite':
      return (
        <p className="corpo-medio text-(--tinta)">Abaixo do limite de licenciamento estadual.</p>
      )
    case 'acima_do_limite':
      return (
        <p className="corpo-medio text-(--alerta-texto)">
          {resultado.parametro} acima das faixas desta lista.
        </p>
      )
  }
}

/** Etapa 2: a atividade com os parâmetros de porte. */
function AtividadeEmEdicao({
  calculado,
  aoMudarMedida,
  aoRemover,
}: {
  calculado: ItemCalculado
  aoMudarMedida: (sigla: string, texto: string) => void
  aoRemover: () => void
}) {
  const { item, atividade, resultado } = calculado
  const parametros = parametrosDaAtividade(atividade)
  const faixasPorParametro = (sigla: string) =>
    atividade.faixas
      .flatMap((f) => f.condicoes)
      .filter((c) => c.parametro === sigla)
      .map(descreverCondicao)
      .join('; ')

  return (
    <article
      aria-label={`${atividade.codigo} ${atividade.descricao}`}
      className="flex flex-col gap-(--e-4) border-b px-(--e-4) py-(--e-5) last:border-b-0 sm:px-(--e-5)"
    >
      <CabecalhoDaAtividade
        atividade={atividade}
        acao={
          <BotaoIcone icone="trash-2" rotulo={`Remover ${atividade.codigo}`} onClick={aoRemover} />
        }
      />
      {parametros.length > 0 ? (
        <div className="grid grid-cols-1 gap-(--e-3) sm:grid-cols-2">
          {parametros.map((sigla) => (
            <CampoTexto
              key={sigla}
              rotulo={`${sigla}: ${PARAMETROS[sigla] ?? ''}`}
              ajuda={`Faixas: ${faixasPorParametro(sigla)}`}
              inputMode="decimal"
              autoComplete="off"
              className="max-w-[360px]"
              value={item.medidas[sigla] ?? ''}
              onChange={(e) => {
                aoMudarMedida(sigla, e.target.value)
              }}
            />
          ))}
        </div>
      ) : null}
      <EnquadramentoEmUmaLinha resultado={resultado} />
    </article>
  )
}

/** Etapa 3: o enquadramento completo da atividade, quem licencia e o que o IMA cobra. */
function AtividadeNoResultado({
  calculado,
  habilitacao,
}: {
  calculado: ItemCalculado
  habilitacao: ReactNode
}) {
  const { item, atividade, competencia, resultado } = calculado
  return (
    <article
      aria-label={`${atividade.codigo} ${atividade.descricao}`}
      className="flex flex-col gap-(--e-4) border-b px-(--e-4) py-(--e-5) last:border-b-0 sm:px-(--e-5)"
    >
      <CabecalhoDaAtividade atividade={atividade} />
      <DescricaoDoResultado atividade={atividade} resultado={resultado} />
      <QuemLicencia competencia={competencia} habilitacao={habilitacao} />
      {competencia.orgao !== 'fora_da_lista' && competencia.avisos.length > 0 ? (
        <p className="corpo text-(--tinta)">{competencia.avisos.join(' ')}</p>
      ) : null}
      <NoIma
        atividade={atividade}
        resultado={resultado}
        medidas={medidasLidas(item)}
        municipal={competencia.orgao === 'municipal'}
      />
    </article>
  )
}

function Conclusao({
  conclusao,
  orgao,
  nivel,
  calculados,
}: {
  conclusao: ConclusaoDaTriagem
  orgao: 'municipal' | 'estadual' | null
  nivel: NivelMunicipal | null
  calculados: readonly ItemCalculado[]
}) {
  if (conclusao.modalidade === null && conclusao.abaixoDoLimite.length === 0) {
    return (
      <p className="corpo-medio text-(--alerta-texto)">
        Informe os parâmetros das atividades para ver a conclusão.
      </p>
    )
  }

  const taxas = calculados.flatMap((c) => {
    const centavos = centavosNoIma(c)
    return centavos === null ? [] : [{ codigo: c.atividade.codigo, centavos }]
  })

  let casas: ReactNode = null
  if (conclusao.modalidade) {
    const modalidade = ROTULO_DA_MODALIDADE[conclusao.modalidade]
    const [, siglaDaModalidade] = separarSigla(modalidade)
    const [siglaDoEstudo, nomeDoEstudo] = conclusao.estudo
      ? separarSigla(ROTULO_DO_ESTUDO[conclusao.estudo])
      : ['Dispensado', 'Art. 22']

    let taxa: { valor: ReactNode; detalhe?: ReactNode }
    if (orgao === 'municipal') {
      taxa = { valor: 'Do município' }
    } else if (taxas.length === 1 && taxas[0]) {
      taxa = { valor: <span className="numero">{formatarReais(taxas[0].centavos)}</span> }
    } else if (taxas.length > 1) {
      taxa = {
        valor: (
          <span className="flex flex-col gap-(--e-05)">
            {taxas.map((t) => (
              <span key={t.codigo} className="numero">
                {formatarReais(t.centavos)}
                <span className="corpo text-(--tinta-2)"> · {t.codigo}</span>
              </span>
            ))}
          </span>
        ),
      }
    } else {
      taxa = { valor: '—', detalhe: 'Sem valor calculado' }
    }

    casas = (
      <Placar rotulo="Resultado" tamanho="compacto">
        <ItemDoPlacar
          rotulo="Quem licencia"
          valor={orgao === 'municipal' ? 'Município' : orgao === 'estadual' ? 'Estado (IMA)' : '—'}
          detalhe={
            orgao === 'municipal' && nivel
              ? `Nível ${ROTULO_DO_NIVEL[nivel]}, impacto local`
              : orgao === 'estadual'
                ? 'Pelo menos uma atividade é estadual'
                : undefined
          }
        />
        <ItemDoPlacar
          rotulo="Modalidade"
          valor={siglaDaModalidade || modalidade}
          detalhe={modalidade}
        />
        <ItemDoPlacar
          rotulo="Estudo"
          valor={siglaDoEstudo}
          detalhe={
            conclusao.estudo
              ? `${nomeDoEstudo}, pela atividade ${conclusao.atividadeDoEstudo ?? ''}`
              : nomeDoEstudo
          }
        />
        <ItemDoPlacar rotulo="Taxa no IMA" valor={taxa.valor} detalhe={taxa.detalhe} />
      </Placar>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-4)">
      {casas}
      <ul className="flex flex-col gap-(--e-1) corpo text-(--tinta)">
        {conclusao.potencialGeral ? (
          <li>
            Maior potencial poluidor:{' '}
            <span className="corpo-medio">{conclusao.potencialGeral}</span>
          </li>
        ) : null}
        {conclusao.podeAvaliarLac ? (
          <li>
            Todas as atividades preveem Licença Ambiental por Compromisso (LAC): avalie se o
            empreendimento atende às condições do item, como não depender de supressão de vegetação.
          </li>
        ) : null}
        {conclusao.abaixoDoLimite.length > 0 ? (
          <li>Abaixo do limite de licenciamento: {conclusao.abaixoDoLimite.join(', ')}.</li>
        ) : null}
        {conclusao.pendentes.length > 0 ? (
          <li className="corpo-medio text-(--alerta-texto)">
            Faltam parâmetros de: {conclusao.pendentes.join(', ')}. A conclusão pode mudar.
          </li>
        ) : null}
      </ul>
    </div>
  )
}

const ROTULO_DA_HABILITACAO = (nivel: NivelMunicipal | null) =>
  nivel === null ? 'Não habilitado ou não sei' : `Nível ${ROTULO_DO_NIVEL[nivel]}`

/**
 * Habilitação do município (CONSEMA 251/2024): o valor e um "Trocar" discreto que abre a escolha.
 * Fica junto do município (no resumo) e no resultado, quando a falta dela manda para o Estado.
 */
function HabilitacaoDoMunicipio({
  nivel,
  aoMudar,
}: {
  nivel: NivelMunicipal | null
  aoMudar: (nivel: NivelMunicipal | null) => void
}) {
  const id = useId()
  const [trocando, setTrocando] = useState(false)
  const lista = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (trocando) lista.current?.focus()
  }, [trocando])

  if (!trocando) {
    return (
      <span className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-05) corpo text-(--tinta)">
        <span>
          Habilitação: <span className="corpo-medio">{ROTULO_DA_HABILITACAO(nivel)}</span>
        </span>
        <button
          type="button"
          className="cursor-pointer rounded-(--raio-mini) corpo-medio text-(--link) underline underline-offset-2 hover:text-(--tinta) max-md:min-h-(--controle-toque)"
          aria-label={`Trocar a habilitação do município (${ROTULO_DA_HABILITACAO(nivel)})`}
          onClick={() => {
            setTrocando(true)
          }}
        >
          Trocar
        </button>
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-(--e-1)">
      <label htmlFor={id} className="rotulo text-(--tinta)">
        Habilitação do município (CONSEMA 251/2024)
      </label>
      <select
        id={id}
        ref={lista}
        className={cn(classeCampo, 'max-w-[320px] cursor-pointer')}
        value={nivel ?? ''}
        onChange={(e) => {
          const v = e.target.value
          aoMudar(v === '1' || v === '2' || v === '3' ? (Number(v) as NivelMunicipal) : null)
          setTrocando(false)
        }}
        onBlur={() => {
          setTrocando(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setTrocando(false)
        }}
      >
        <option value="">Não habilitado ou não sei</option>
        <option value="1">Nível I</option>
        <option value="2">Nível II</option>
        <option value="3">Nível III</option>
      </select>
    </span>
  )
}

const formatarNumero = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas })

/** O que a triagem já sabe, como o card de preço do orçamento: ao lado no desktop, embaixo no celular. */
function ResumoDaTriagem({
  ponto,
  local,
  consultando,
  habilitacao,
  atividades,
  enquadramento,
}: {
  ponto: PontoMarcado | null
  local: ResultadoDoLocal | null
  consultando: boolean
  habilitacao: ReactNode
  atividades: number
  enquadramento: { valor: string; detalhe: string | null } | null
}) {
  const areaHa = local?.lote?.areaM2 != null ? metrosQuadradosParaHectares(local.lote.areaM2) : null
  return (
    <section
      aria-label="Resumo da triagem"
      className="flex flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) xl:sticky xl:top-(--e-4) xl:p-(--e-5)"
    >
      <dl className="flex flex-col gap-(--e-4)">
        <div className="flex flex-col gap-(--e-05) border-b pb-(--e-4)">
          <dt className="rotulo">Enquadramento</dt>
          <dd className="text-(--tinta)">
            {enquadramento ? (
              <span className="flex flex-col">
                <span className="numero-contagem">{enquadramento.valor}</span>
                {enquadramento.detalhe ? (
                  <span className="corpo text-(--tinta-2)">{enquadramento.detalhe}</span>
                ) : null}
              </span>
            ) : (
              <span className="corpo text-(--tinta-3)">pendente</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-(--e-05)">
          <dt className="rotulo">Local</dt>
          <dd className="corpo text-(--tinta)">
            {ponto ? (
              <span className="flex flex-col">
                <span className="corpo-medio">{ponto.rotulo ?? formatarCoordenadas(ponto)}</span>
                {ponto.rotulo ? (
                  <span className="text-xs text-(--tinta-2) numero">
                    {formatarCoordenadas(ponto)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-(--tinta-3)">não marcado</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-(--e-05)">
          <dt className="rotulo">Município</dt>
          <dd className="flex flex-col gap-(--e-1) corpo text-(--tinta)">
            {consultando ? (
              <span className="text-(--tinta-3)">consultando…</span>
            ) : local?.municipio ? (
              <span className="corpo-medio">{local.municipio.nome}</span>
            ) : (
              <span className="text-(--tinta-3)">não identificado</span>
            )}
            {habilitacao}
          </dd>
        </div>
        {local?.lote ? (
          <div className="flex flex-col gap-(--e-05)">
            <dt className="rotulo">Lote</dt>
            <dd className="corpo text-(--tinta) numero">
              {local.lote.inscricaoImobiliaria ?? 'Sem inscrição'}
              {areaHa !== null && local.lote.areaM2 !== null ? (
                <span className="block text-xs text-(--tinta-2)">
                  {formatarNumero(local.lote.areaM2)} m² ({formatarNumero(areaHa, 4)} ha)
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {local ? (
          <div className="flex flex-col gap-(--e-05)">
            <dt className="rotulo">Restrições</dt>
            <dd className="corpo text-(--tinta)">
              {local.restricoes.length === 0 ? (
                'Nenhuma encontrada'
              ) : (
                <ul className="flex flex-col gap-(--e-1)">
                  {local.restricoes.map((r) => (
                    <li key={`${r.tipo}-${r.descricao}`}>
                      <Selo tom="atencao">{r.descricao}</Selo>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-(--e-05)">
          <dt className="rotulo">Atividades</dt>
          <dd className="corpo text-(--tinta) numero">
            {atividades === 0 ? (
              <span className="text-(--tinta-3)">nenhuma</span>
            ) : (
              `${String(atividades)} ${atividades === 1 ? 'atividade' : 'atividades'}`
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}

const ETAPAS = [
  { id: 'local', titulo: 'Local' },
  { id: 'atividades', titulo: 'Atividades e porte' },
  { id: 'resultado', titulo: 'Resultado' },
] as const
type IdDaEtapa = (typeof ETAPAS)[number]['id']

/** Habilitação lembrada por município (só neste navegador): na próxima triagem, já vem marcada. */
const chaveDaHabilitacao = (codigoIbge: string) => `grama.triagem.habilitacao.${codigoIbge}`

function lerHabilitacaoLembrada(codigoIbge: string): NivelMunicipal | null | undefined {
  try {
    const v = window.localStorage.getItem(chaveDaHabilitacao(codigoIbge))
    if (v === '1' || v === '2' || v === '3') return Number(v) as NivelMunicipal
    if (v === '0') return null
  } catch {
    // Sem armazenamento (aba privada): fica como está.
  }
  return undefined
}

function lembrarHabilitacao(codigoIbge: string, nivel: NivelMunicipal | null) {
  try {
    window.localStorage.setItem(chaveDaHabilitacao(codigoIbge), String(nivel ?? 0))
  } catch {
    // Sem armazenamento: só não lembra.
  }
}

/** Voltar e Continuar no pé da etapa, como no editor de orçamento. */
function NavegacaoDaEtapa({
  etapa,
  aoIr,
  podeContinuar,
}: {
  etapa: number
  aoIr: (indice: number) => void
  podeContinuar: boolean
}) {
  const anterior = ETAPAS[etapa - 1]
  const proxima = ETAPAS[etapa + 1]
  return (
    <div className="flex flex-wrap items-center justify-between gap-(--e-2) border-t p-(--e-3) max-sm:flex-col-reverse max-sm:items-stretch sm:p-(--e-4)">
      {anterior ? (
        <Botao
          iconeAntes="arrow-left"
          onClick={() => {
            aoIr(etapa - 1)
          }}
        >
          {anterior.titulo}
        </Botao>
      ) : (
        <span />
      )}
      {proxima ? (
        <Botao
          aparencia="primario"
          iconeDepois="arrow-right"
          disabled={!podeContinuar}
          onClick={() => {
            aoIr(etapa + 1)
          }}
        >
          Continuar para {proxima.titulo.toLowerCase()}
        </Botao>
      ) : null}
    </div>
  )
}

/** Fontes legais da triagem: obrigatórias, mas depois do resultado e recolhidas. */
function Fontes() {
  return (
    <details className="group mt-(--e-8) border-t pt-(--e-3)">
      <summary className="inline-flex cursor-pointer list-none items-center gap-(--e-1) rounded-(--raio-mini) corpo-medio text-(--tinta-2) hover:text-(--tinta) max-md:min-h-(--controle-toque) [&::-webkit-details-marker]:hidden">
        <Icone
          nome="chevron-right"
          className="transition-transform duration-(--dur-rapida) group-open:rotate-90"
        />
        Sobre as fontes
      </summary>
      <p className="mt-(--e-2) max-w-[72ch] corpo text-(--tinta-2)">
        Resultado calculado pela {FONTE} (estadual) e pela {CATALOGO_CONSEMA_251.fonte} (impacto
        local), em Santa Catarina, com as taxas do IMA pela {FONTE_DA_TAXA_IMA}. Confira com o órgão
        licenciador.
      </p>
    </details>
  )
}

/**
 * /triagem: enquadramento das atividades de um empreendimento pelas CONSEMA 250 e 251/2024.
 * `?empreendimento=<id>` (Empreendimento, plano de renovação, orçamento) põe o nome dele no link de
 * volta, acima do título. Id inválido, de outra consultoria ou que falhou: a triagem abre sem ele.
 * Com ele, a Gestão tem "Gravar" (no empreendimento ou numa licença dele); `&licenca=<id>` (plano
 * de renovação) grava direto nela. As unidades dele vão para a consulta do local, que grava nelas o
 * município achado.
 */
export function PaginaTriagem() {
  const { atual } = useConsultoria()
  const ehGestao = atual.papel === 'gestao'
  const queryClient = useQueryClient()
  // A etapa fica na URL (?etapa=atividades), como no orçamento; o empreendimento também.
  const [parametros, setParametros] = useSearchParams()
  const parametroEmpreendimento = parametros.get('empreendimento')
  const empreendimentoId = ehUuid(parametroEmpreendimento) ? parametroEmpreendimento : null
  const parametroLicenca = parametros.get('licenca')
  const licencaPedida = ehUuid(parametroLicenca) ? parametroLicenca : null
  const empreendimento = useQuery({
    queryKey: ['empreendimento', empreendimentoId],
    queryFn: () => obterEmpreendimento(empreendimentoId ?? ''),
    enabled: empreendimentoId !== null,
  })
  const unidades = useQuery({
    queryKey: ['unidades', empreendimento.data?.id],
    queryFn: () => listarUnidades(empreendimento.data?.id ?? ''),
    enabled: Boolean(empreendimento.data),
  })
  const voltar = empreendimento.data
    ? { para: `/empreendimentos/${empreendimento.data.id}`, rotulo: empreendimento.data.nome }
    : undefined
  const [itens, setItens] = useState<ItemEmEdicao[]>([])
  const [nivel, setNivel] = useState<NivelMunicipal | null>(null)
  /** Área do lote em ha, já no formato do campo, para preencher o AU(3) das atividades. */
  const [areaDoLote, setAreaDoLote] = useState<string | null>(null)
  const jaIncluidas = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens])

  // Local: fica na página para não se perder ao trocar de etapa.
  const [ponto, setPonto] = useState<PontoMarcado | null>(null)
  const [erroDoPonto, setErroDoPonto] = useState<string | null>(null)
  // Unidade onde gravar o município achado (ADR-0050): com uma, ela; com várias, a escolhida.
  const listaDeUnidades = unidades.data ?? []
  const variasUnidades = listaDeUnidades.length > 1
  const [unidadeEscolhida, setUnidadeEscolhida] = useState('')
  const [erroDaUnidade, setErroDaUnidade] = useState<string | null>(null)
  const unidadeId =
    listaDeUnidades.length === 1
      ? listaDeUnidades[0]?.id
      : listaDeUnidades.some((u) => u.id === unidadeEscolhida)
        ? unidadeEscolhida
        : undefined
  const consulta = useMutation({
    mutationFn: ({ c, unidade }: { c: Coordenadas; unidade?: UnidadeDaConsulta }) =>
      consultarLocal(c, unidade),
    onSuccess: (resultado) => {
      const codigo = resultado.municipio?.codigoIbge
      if (!codigo) return
      const lembrada = lerHabilitacaoLembrada(codigo)
      if (lembrada !== undefined) setNivel(lembrada)
    },
  })
  const local = consulta.isSuccess ? consulta.data : null

  function marcar(novo: PontoMarcado) {
    setPonto(novo)
    if (!dentroDeSantaCatarina(novo)) {
      setErroDoPonto('O ponto está fora de Santa Catarina.')
      consulta.reset()
      return
    }
    setErroDoPonto(null)
    if (variasUnidades && !unidadeId) {
      setErroDaUnidade('Escolha a unidade.')
      consulta.reset()
      return
    }
    setErroDaUnidade(null)
    consulta.mutate({
      c: { latitude: novo.latitude, longitude: novo.longitude },
      unidade: unidadeId ? { consultoriaId: atual.consultoriaId, unidadeId } : undefined,
    })
  }

  function mudarNivel(novo: NivelMunicipal | null) {
    setNivel(novo)
    const codigo = local?.municipio?.codigoIbge
    if (codigo) lembrarHabilitacao(codigo, novo)
  }

  const indiceDaUrl = ETAPAS.findIndex((e) => e.id === parametros.get('etapa'))
  const pedida = indiceDaUrl < 0 ? 0 : indiceDaUrl
  // Sem atividade, o resultado não tem o que mostrar: fica nas atividades.
  const etapa = pedida === 2 && itens.length === 0 ? 1 : pedida
  // E a URL acompanha: incluir a primeira atividade não pula sozinho para o resultado.
  useEffect(() => {
    if (pedida !== 2 || itens.length > 0) return
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        novos.set('etapa', 'atividades')
        return novos
      },
      { replace: true },
    )
  }, [pedida, itens.length, setParametros])
  const areaDaEtapa = useRef<HTMLHeadingElement>(null)
  const trocou = useRef(false)

  function irPara(indice: number) {
    const id: IdDaEtapa = ETAPAS[indice]?.id ?? 'local'
    trocou.current = true
    setParametros((atuais) => {
      const novos = new URLSearchParams(atuais)
      if (id === 'local') novos.delete('etapa')
      else novos.set('etapa', id)
      return novos
    })
  }

  // Ao trocar de etapa, o foco vai para o título da etapa nova, sem ficar no botão que sumiu.
  useEffect(() => {
    if (!trocou.current) return
    trocou.current = false
    areaDaEtapa.current?.focus()
  }, [etapa])

  const comAreaDoLote = (item: ItemEmEdicao, area: string | null): ItemEmEdicao => {
    const atividade = POR_CODIGO.get(item.codigo)
    if (!area || !atividade || !parametrosDaAtividade(atividade).includes(AREA_UTIL)) return item
    if (item.medidas[AREA_UTIL]?.trim()) return item
    return { ...item, medidas: { ...item.medidas, [AREA_UTIL]: area } }
  }

  const calculados = itens.flatMap((item) => {
    const c = calcular(item, nivel)
    return c ? [c] : []
  })
  const conclusao = concluirTriagem(
    calculados.map((c) => ({ atividade: c.atividade, resultado: c.resultado })),
  )
  const orgaos = calculados
    .map((c) => c.competencia.orgao)
    .filter((o): o is 'municipal' | 'estadual' => o !== 'fora_da_lista')
  const orgao =
    conclusao.modalidade === null || orgaos.length === 0
      ? null
      : orgaos.includes('estadual')
        ? 'estadual'
        : 'municipal'

  // No resumo, a sigla (curta) grande e o nome por extenso embaixo, com quem licencia.
  const [nomeDaModalidade, siglaDaModalidade] = conclusao.modalidade
    ? separarSigla(ROTULO_DA_MODALIDADE[conclusao.modalidade])
    : ['', '']
  const enquadramento = conclusao.modalidade
    ? {
        valor: siglaDaModalidade || nomeDaModalidade,
        detalhe:
          [
            siglaDaModalidade ? nomeDaModalidade : null,
            orgao === 'municipal'
              ? 'Licencia o município'
              : orgao === 'estadual'
                ? 'Licencia o Estado (IMA)'
                : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
      }
    : null

  const habilitacao = <HabilitacaoDoMunicipio nivel={nivel} aoMudar={mudarNivel} />
  const titulo = ETAPAS[etapa]?.titulo ?? ''

  const paraGravar = atividadesParaGravar(calculados)
  const gravar = useMutation({
    mutationFn: ({
      destino,
      atividades,
    }: {
      destino: DestinoDaGravacao
      atividades: readonly AtividadeParaGravar[]
    }) =>
      destino.tipo === 'licenca'
        ? gravarAtividadesNaLicenca(atual.consultoriaId, destino.licenca.id, atividades)
        : gravarAtividadesNoEmpreendimento(
            atual.consultoriaId,
            destino.empreendimento.id,
            atividades,
          ),
    onSuccess: async (_, { destino }) => {
      await queryClient.invalidateQueries({
        queryKey:
          destino.tipo === 'licenca'
            ? ['atividades-da-licenca', destino.licenca.id]
            : ['atividades-do-empreendimento', destino.empreendimento.id],
      })
    },
  })
  // Mudou a triagem depois de gravar: o aviso de gravado (ou o erro) já não vale.
  const { reset: limparGravacao } = gravar
  useEffect(() => {
    limparGravacao()
  }, [itens, limparGravacao])
  const doEmpreendimento = ehGestao && paraGravar.length > 0 ? empreendimento.data : undefined

  return (
    <Pagina
      titulo="Triagem de licenciamento"
      meta={<span>Triagem, não enquadramento oficial</span>}
      voltar={voltar}
      acao={
        doEmpreendimento ? (
          <AcaoGravar
            empreendimento={doEmpreendimento}
            licencaPedida={licencaPedida}
            gravando={gravar.isPending}
            aoGravar={(destino) => {
              gravar.mutate({ destino, atividades: paraGravar })
            }}
          />
        ) : undefined
      }
    >
      <RetornoDaGravacao
        gravada={gravar.isSuccess ? gravar.variables.destino : null}
        erro={gravar.error}
      />
      <div className="grid max-w-[1280px] gap-(--e-4) xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-(--e-6)">
        <div className="flex min-w-0 flex-col gap-(--e-4)">
          <Trilha
            compactaNoCelular
            rotulo="Etapas da triagem"
            atual={etapa}
            aoEscolher={irPara}
            podeEscolher={(indice) => indice < 2 || itens.length > 0}
            passos={[
              {
                id: 'local',
                titulo: 'Local',
                detalhe: local?.municipio?.nome ?? (ponto ? 'marcado' : 'opcional'),
              },
              {
                id: 'atividades',
                titulo: 'Atividades e porte',
                detalhe: `${String(itens.length)} ${itens.length === 1 ? 'atividade' : 'atividades'}`,
              },
              {
                id: 'resultado',
                titulo: 'Resultado',
                detalhe: enquadramento?.valor ?? 'pendente',
              },
            ]}
          />

          <section
            aria-labelledby="titulo-da-etapa"
            className="flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
          >
            <h2
              id="titulo-da-etapa"
              ref={areaDaEtapa}
              tabIndex={-1}
              className="px-(--e-4) pt-(--e-4) titulo-painel text-(--tinta) outline-none sm:px-(--e-5) sm:pt-(--e-5)"
            >
              {titulo}
            </h2>

            {etapa === 0 ? (
              <div className="entrar p-(--e-4) sm:p-(--e-5)">
                <LocalDoEmpreendimento
                  unidades={listaDeUnidades}
                  unidadeId={unidadeId ?? null}
                  erroDaUnidade={erroDaUnidade}
                  aoEscolherUnidade={(id) => {
                    setUnidadeEscolhida(id)
                    if (id) setErroDaUnidade(null)
                  }}
                  ponto={ponto}
                  erroDoPonto={erroDoPonto}
                  consulta={{
                    pendente: consulta.isPending,
                    erro: consulta.isError ? consulta.error.message : null,
                    resultado: local,
                  }}
                  aoMarcar={marcar}
                  habilitacao={habilitacao}
                  aoUsarArea={(hectares) => {
                    const area = hectares.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
                    setAreaDoLote(area)
                    setItens((atual) => atual.map((i) => comAreaDoLote(i, area)))
                  }}
                />
              </div>
            ) : null}

            {etapa === 1 ? (
              <div className="entrar flex flex-col gap-(--e-4) p-(--e-4) sm:p-(--e-5)">
                <BuscaDeAtividade
                  jaIncluidas={jaIncluidas}
                  aoIncluir={(codigo) => {
                    setItens((atual) =>
                      atual.some((i) => i.codigo === codigo)
                        ? atual
                        : [...atual, comAreaDoLote({ codigo, medidas: {} }, areaDoLote)],
                    )
                  }}
                />
                {itens.length === 0 ? (
                  <EstadoVazio
                    icone="search"
                    titulo="Nenhuma atividade incluída"
                    className="rounded-(--raio-painel) border border-dashed border-(--regra-forte) py-(--e-8)"
                  />
                ) : (
                  <div
                    role="group"
                    aria-label="Atividades do empreendimento"
                    className="flex flex-col rounded-(--raio-painel) border"
                  >
                    {calculados.map((calculado) => (
                      <AtividadeEmEdicao
                        key={calculado.item.codigo}
                        calculado={calculado}
                        aoMudarMedida={(sigla, texto) => {
                          setItens((atual) =>
                            atual.map((i) =>
                              i.codigo === calculado.item.codigo
                                ? { ...i, medidas: { ...i.medidas, [sigla]: texto } }
                                : i,
                            ),
                          )
                        }}
                        aoRemover={() => {
                          setItens((atual) =>
                            atual.filter((i) => i.codigo !== calculado.item.codigo),
                          )
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {etapa === 2 ? (
              <div className="entrar flex flex-col gap-(--e-5) p-(--e-4) sm:p-(--e-5)">
                <section aria-label="Conclusão da triagem">
                  <Conclusao
                    conclusao={conclusao}
                    orgao={orgao}
                    nivel={nivel}
                    calculados={calculados}
                  />
                  {ehGestao &&
                  conclusao.modalidade &&
                  (parametroEmpreendimento === null || empreendimento.data) ? (
                    <OrcarDaTriagem
                      key={atual.consultoriaId + ':' + (empreendimento.data?.id ?? '')}
                      consultoriaId={atual.consultoriaId}
                      empreendimento={empreendimento.data ?? null}
                      modalidade={conclusao.modalidade}
                      orgao={orgao}
                      taxas={calculados.flatMap((c) => {
                        const centavos = centavosNoIma(c)
                        return centavos === null ? [] : [{ codigo: c.atividade.codigo, centavos }]
                      })}
                    />
                  ) : null}
                </section>
                <div
                  role="group"
                  aria-label="Resultado por atividade"
                  className="flex flex-col rounded-(--raio-painel) border"
                >
                  {calculados.map((calculado) => (
                    <AtividadeNoResultado
                      key={calculado.item.codigo}
                      calculado={calculado}
                      habilitacao={habilitacao}
                    />
                  ))}
                </div>
                <Fontes />
              </div>
            ) : null}

            <NavegacaoDaEtapa
              etapa={etapa}
              aoIr={irPara}
              podeContinuar={etapa !== 1 || itens.length > 0}
            />
          </section>
        </div>

        <ResumoDaTriagem
          ponto={ponto}
          local={local}
          consultando={consulta.isPending}
          habilitacao={habilitacao}
          atividades={itens.length}
          enquadramento={enquadramento}
        />
      </div>
    </Pagina>
  )
}
