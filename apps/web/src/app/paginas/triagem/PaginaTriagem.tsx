// Triagem de licenciamento (enquadramento) pela Resolução CONSEMA 250/2024 consolidada.
// docs/estudos/triagem-licenciamento-consema-250.md. Protótipo para revisão.
//
// O enquadramento é cálculo local sobre o catálogo do domínio. Só a consulta do local (mapa) vai à
// rede, pela Edge Function consultar-local, com seus estados de carregando e erro. O resultado
// orienta a proposta; quem enquadra é o órgão.
//
// A tela é um passo a passo numa página só: 1 local e município, 2 atividades e porte,
// 3 resultado (quem licencia, modalidade, estudo e taxa), grande no fim. As fontes legais ficam
// num detalhe recolhível depois do resultado.
//
// Com ?empreendimento= (e, do plano de renovação, &licenca=), a Gestão grava as atividades
// enquadradas numa licença do empreendimento (ADR-0044), para sugerir a taxa da renovação.

import {
  CATALOGO_CONSEMA_250,
  CATALOGO_CONSEMA_251,
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_ESTUDO,
  ROTULO_DO_PORTE,
  FONTE_DA_TAXA_IMA,
  buscarAtividades,
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
  type ConclusaoDaTriagem,
  type Medidas,
  type NivelMunicipal,
  type ResultadoDoEnquadramento,
  type TaxaDoIma,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
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
import {
  gravarAtividadesNaLicenca,
  type AtividadeParaGravar,
} from '@/lib/api/atividades-da-licenca'
import { obterEmpreendimento } from '@/lib/api/empreendimentos'
import { ehUuid } from '@/lib/texto'
import { cn } from '@/lib/utils'

import { AcaoGravarNaLicenca, RetornoDaGravacao, type LicencaParaGravar } from './GravarNaLicenca'
import { LocalDoEmpreendimento } from './LocalDoEmpreendimento'

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
 * O que "Gravar na licença" grava: as atividades enquadradas, com o porte da faixa, o potencial
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

/** Um passo da triagem: estação numerada à esquerda, ligada à próxima por uma linha. */
function Passo({
  numero,
  titulo,
  rotulo,
  aceso = false,
  ultimo = false,
  children,
}: {
  numero: number
  titulo: string
  /** Nome da região (aria-label), quando difere do título. */
  rotulo?: string
  /** Passo com resultado: estação lima (o "agora" do design system). */
  aceso?: boolean
  ultimo?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label={rotulo ?? titulo}
      className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-(--e-3) sm:gap-x-(--e-4)"
    >
      <div aria-hidden className="flex flex-col items-center">
        <span
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-(--raio-redondo) text-xs font-[800] numero',
            aceso
              ? 'bg-(--sinal) text-(--sinal-texto) shadow-[0_0_0_2px_var(--chao),0_0_0_4px_var(--marca-linha)]'
              : 'bg-(--marca-linha) text-(--folha)',
          )}
        >
          {numero}
        </span>
        {ultimo ? null : <span className="mt-(--e-2) w-[3px] flex-1 rounded-full bg-(--regra)" />}
      </div>
      <div className={cn('flex min-w-0 flex-col gap-(--e-4)', !ultimo && 'pb-(--e-10)')}>
        <h2 className="pt-(--e-05) titulo-painel text-(--tinta)">{titulo}</h2>
        {children}
      </div>
    </section>
  )
}

function QuemLicencia({ competencia }: { competencia: Competencia }) {
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
      <p className="corpo text-(--tinta)">
        <span className="corpo-medio">Quem licencia: Estado (IMA)</span> ·{' '}
        <span className="text-(--tinta-2)">{MOTIVO_ESTADUAL[competencia.motivo]}</span>
      </p>
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
            <span className="font-[800] numero">{formatarReais(taxa.totalCentavos)}</span>
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

function Atividade({
  calculado,
  aoMudarMedida,
  aoRemover,
}: {
  calculado: ItemCalculado
  aoMudarMedida: (sigla: string, texto: string) => void
  aoRemover: () => void
}) {
  const { item, atividade, competencia, resultado } = calculado
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
        <BotaoIcone icone="trash-2" rotulo={`Remover ${atividade.codigo}`} onClick={aoRemover} />
      </header>

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

      <DescricaoDoResultado atividade={atividade} resultado={resultado} />
      <QuemLicencia competencia={competencia} />
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

function SeletorDoNivel({
  nivel,
  aoMudar,
}: {
  nivel: NivelMunicipal | null
  aoMudar: (nivel: NivelMunicipal | null) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={id} className="rotulo text-(--tinta)">
        Habilitação do município (CONSEMA 251/2024)
      </label>
      <select
        id={id}
        className={cn(classeCampo, 'max-w-[320px] cursor-pointer')}
        value={nivel ?? ''}
        onChange={(e) => {
          const v = e.target.value
          aoMudar(v === '1' || v === '2' || v === '3' ? (Number(v) as NivelMunicipal) : null)
        }}
      >
        <option value="">Não habilitado ou não sei</option>
        <option value="1">Nível I</option>
        <option value="2">Nível II</option>
        <option value="3">Nível III</option>
      </select>
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
 * Com ele, a Gestão tem "Gravar na licença"; `&licenca=<id>` (plano de renovação) grava direto nela.
 */
export function PaginaTriagem() {
  const { atual } = useConsultoria()
  const ehGestao = atual.papel === 'gestao'
  const queryClient = useQueryClient()
  const [parametros] = useSearchParams()
  const parametroEmpreendimento = parametros.get('empreendimento')
  const empreendimentoId = ehUuid(parametroEmpreendimento) ? parametroEmpreendimento : null
  const parametroLicenca = parametros.get('licenca')
  const licencaPedida = ehUuid(parametroLicenca) ? parametroLicenca : null
  const empreendimento = useQuery({
    queryKey: ['empreendimento', empreendimentoId],
    queryFn: () => obterEmpreendimento(empreendimentoId ?? ''),
    enabled: empreendimentoId !== null,
  })
  const voltar = empreendimento.data
    ? { para: `/empreendimentos/${empreendimento.data.id}`, rotulo: empreendimento.data.nome }
    : undefined
  const [itens, setItens] = useState<ItemEmEdicao[]>([])
  const [nivel, setNivel] = useState<NivelMunicipal | null>(null)
  /** Área do lote em ha, já no formato do campo, para preencher o AU(3) das atividades. */
  const [areaDoLote, setAreaDoLote] = useState<string | null>(null)
  const jaIncluidas = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens])

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
  const temResultado = itens.length > 0

  const paraGravar = atividadesParaGravar(calculados)
  const gravar = useMutation({
    mutationFn: ({
      licenca,
      atividades,
    }: {
      licenca: LicencaParaGravar
      atividades: readonly AtividadeParaGravar[]
    }) => gravarAtividadesNaLicenca(atual.consultoriaId, licenca.id, atividades),
    onSuccess: async (_, { licenca }) => {
      await queryClient.invalidateQueries({ queryKey: ['atividades-da-licenca', licenca.id] })
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
          <AcaoGravarNaLicenca
            empreendimentoId={doEmpreendimento.id}
            licencaPedida={licencaPedida}
            gravando={gravar.isPending}
            aoGravar={(licenca) => {
              gravar.mutate({ licenca, atividades: paraGravar })
            }}
          />
        ) : undefined
      }
    >
      <RetornoDaGravacao
        gravada={gravar.isSuccess ? gravar.variables.licenca : null}
        erro={gravar.error}
      />
      <div className="flex max-w-[1120px] flex-col">
        <Passo numero={1} titulo="Onde fica">
          <LocalDoEmpreendimento
            aoUsarArea={(hectares) => {
              const area = hectares.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
              setAreaDoLote(area)
              setItens((atual) => atual.map((i) => comAreaDoLote(i, area)))
            }}
          />
          <SeletorDoNivel nivel={nivel} aoMudar={setNivel} />
        </Passo>

        <Passo
          numero={2}
          titulo="Atividades e porte"
          rotulo="Atividades do empreendimento"
          ultimo={!temResultado}
        >
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
            <div className="flex flex-col rounded-(--raio-painel) border bg-(--folha)">
              {calculados.map((calculado) => (
                <Atividade
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
                    setItens((atual) => atual.filter((i) => i.codigo !== calculado.item.codigo))
                  }}
                />
              ))}
            </div>
          )}
        </Passo>

        {temResultado ? (
          <Passo
            numero={3}
            titulo="Resultado"
            rotulo="Conclusão da triagem"
            aceso={conclusao.modalidade !== null}
            ultimo
          >
            <Conclusao conclusao={conclusao} orgao={orgao} nivel={nivel} calculados={calculados} />
          </Passo>
        ) : null}

        <Fontes />
      </div>
    </Pagina>
  )
}
