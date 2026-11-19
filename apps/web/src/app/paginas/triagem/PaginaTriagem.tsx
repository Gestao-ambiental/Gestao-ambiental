// Triagem de licenciamento (enquadramento) pela Resolução CONSEMA 250/2024 consolidada.
// docs/estudos/triagem-licenciamento-consema-250.md. Protótipo para revisão.
//
// Tudo é cálculo local sobre o catálogo do domínio: sem banco nem rede, então não há estados de
// carregando, erro ou sem permissão. O resultado orienta a proposta; quem enquadra é o órgão.

import {
  CATALOGO_CONSEMA_250,
  CATALOGO_CONSEMA_251,
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_ESTUDO,
  ROTULO_DO_PORTE,
  buscarAtividades,
  concluirTriagem,
  definirCompetencia,
  descreverCondicao,
  enquadrarAtividade,
  lerNumeroDigitado,
  parametrosDaAtividade,
  type AtividadeLicenciavel,
  type Competencia,
  type ConclusaoDaTriagem,
  type Medidas,
  type NivelMunicipal,
  type ResultadoDoEnquadramento,
} from '@gestao-ambiental/domain'
import { useId, useMemo, useState } from 'react'

import { Pagina } from '@/app/paginas/Pagina'
import { EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'

const { atividades: CATALOGO, parametros: PARAMETROS, fonte: FONTE } = CATALOGO_CONSEMA_250
const POR_CODIGO = new Map(CATALOGO.map((a) => [a.codigo, a]))

const TOM_DO_POTENCIAL: Record<'P' | 'M' | 'G', TomSelo> = {
  P: 'sucesso',
  M: 'atencao',
  G: 'perigo',
}
const ROTULO_DO_POTENCIAL = { P: 'pequeno', M: 'médio', G: 'grande' } as const

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

const ROTULO_DO_NIVEL: Record<NivelMunicipal, string> = { 1: 'I', 2: 'II', 3: 'III' }

const MOTIVO_ESTADUAL: Record<Extract<Competencia, { orgao: 'estadual' }>['motivo'], string> = {
  municipio_nao_habilitado: 'município sem habilitação informada',
  fora_da_lista_local: 'atividade fora da lista de impacto local (CONSEMA 251/2024)',
  fora_das_faixas_locais: 'porte fora das faixas que o município pode licenciar',
  sempre_estadual: 'licenciamento municipal suspenso para antenas (251/2024, Art. 3º, §6º)',
  falta_medida: 'informe o parâmetro para saber se cabe no município',
}

function QuemLicencia({ competencia }: { competencia: Competencia }) {
  if (competencia.orgao === 'municipal') {
    return (
      <p className="corpo text-(--text)">
        <span className="corpo-medio">Quem licencia: município</span>, pela lista do nível{' '}
        {ROTULO_DO_NIVEL[competencia.nivel]} da CONSEMA 251/2024.
      </p>
    )
  }
  if (competencia.orgao === 'estadual') {
    return (
      <p className="corpo text-(--text)">
        <span className="corpo-medio">Quem licencia: Estado (IMA)</span>:{' '}
        {MOTIVO_ESTADUAL[competencia.motivo]}.
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
    <section aria-label="Buscar atividade" className="flex flex-col gap-(--space-100)">
      <CampoTexto
        rotulo="Atividade"
        ajuda="Digite o código da CONSEMA (ex.: 12.80.10) ou palavras da descrição (ex.: pintura)."
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
          <p className="corpo text-(--text-subtle)" role="status">
            Nenhuma atividade do Anexo VI encontrada para "{termo.trim()}".
          </p>
        ) : null}
        {resultados.length > 0 ? (
          <ul
            aria-label="Atividades encontradas"
            className="flex max-h-[320px] flex-col overflow-y-auto rounded-(--radius-large) border bg-(--surface) shadow-cartao"
          >
            {resultados.map((a) => {
              const incluida = jaIncluidas.has(a.codigo)
              return (
                <li
                  key={a.codigo}
                  className="flex items-start gap-(--space-100) border-b px-(--space-150) py-(--space-100) last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="corpo-medio text-(--text)">{a.codigo}</span>
                    <span className="corpo text-(--text)">{a.descricao}</span>
                    <span className="corpo text-(--text-subtle)">{a.grupo}</span>
                  </div>
                  <Botao
                    tamanho="compacto"
                    aparencia={incluida ? 'padrao' : 'primario'}
                    disabled={incluida}
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
    </section>
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
        <p className="corpo text-(--text-subtle)">
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
        <p className="corpo text-(--text-subtle)">
          {resultado.parametro} acima de{' '}
          {resultado.limite.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}: fora das faixas
          desta lista.
        </p>
      )
    case 'enquadrada': {
      const { faixa } = resultado
      return (
        <div className="flex flex-col gap-(--space-100)">
          <dl className="grid grid-cols-1 gap-x-(--space-200) gap-y-(--space-050) sm:grid-cols-3">
            <div>
              <dt className="rotulo text-(--text-subtle)">Porte</dt>
              <dd className="corpo-medio text-(--text)">{ROTULO_DO_PORTE[faixa.porte]}</dd>
            </div>
            <div>
              <dt className="rotulo text-(--text-subtle)">Modalidade</dt>
              <dd className="corpo-medio text-(--text)">
                {ROTULO_DA_MODALIDADE[faixa.modalidade]}
              </dd>
            </div>
            <div>
              <dt className="rotulo text-(--text-subtle)">Estudo</dt>
              <dd className="corpo-medio text-(--text)">
                {faixa.estudo ? ROTULO_DO_ESTUDO[faixa.estudo] : 'Dispensado (Art. 22)'}
              </dd>
            </div>
          </dl>
          <p className="corpo text-(--text-subtle)">
            Na resolução: <q>{faixa.textoOriginal}</q>
          </p>
          {resultado.avisos.length > 0 ? (
            <ul
              aria-label={`Observações de ${atividade.codigo}`}
              className="flex flex-col gap-(--space-050)"
            >
              {resultado.avisos.map((aviso) => (
                <li key={aviso} className="corpo text-(--text)">
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

function CartaoDaAtividade({
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
      className="flex flex-col gap-(--space-150) rounded-(--radius-large) border bg-(--surface) p-(--space-150) shadow-cartao"
    >
      <header className="flex items-start gap-(--space-100)">
        <div className="flex min-w-0 flex-1 flex-col gap-(--space-050)">
          <h3 className="titulo-secao text-(--text)">
            {atividade.codigo} · {atividade.descricao}
          </h3>
          <div className="flex flex-wrap items-center gap-(--space-050)">
            <Selo tom={TOM_DO_POTENCIAL[atividade.potencial.geral]}>
              Potencial poluidor geral {ROTULO_DO_POTENCIAL[atividade.potencial.geral]} (
              {atividade.potencial.geral})
            </Selo>
            {atividade.redacaoDada ? (
              <span className="corpo text-(--text-subtle)">
                Redação dada pela CONSEMA {atividade.redacaoDada}
              </span>
            ) : null}
          </div>
        </div>
        <BotaoIcone icone="trash-2" rotulo={`Remover ${atividade.codigo}`} onClick={aoRemover} />
      </header>

      {parametros.length > 0 ? (
        <div className="grid grid-cols-1 gap-(--space-100) sm:grid-cols-2">
          {parametros.map((sigla) => (
            <CampoTexto
              key={sigla}
              rotulo={`${sigla}: ${PARAMETROS[sigla] ?? ''}`}
              ajuda={`Faixas: ${faixasPorParametro(sigla)}`}
              inputMode="decimal"
              autoComplete="off"
              value={item.medidas[sigla] ?? ''}
              onChange={(e) => {
                aoMudarMedida(sigla, e.target.value)
              }}
            />
          ))}
        </div>
      ) : null}

      <QuemLicencia competencia={competencia} />
      {competencia.orgao !== 'fora_da_lista' && competencia.avisos.length > 0 ? (
        <p className="corpo text-(--text)">{competencia.avisos.join(' ')}</p>
      ) : null}
      <DescricaoDoResultado atividade={atividade} resultado={resultado} />
    </article>
  )
}

function Conclusao({
  conclusao,
  orgao,
}: {
  conclusao: ConclusaoDaTriagem
  orgao: 'municipal' | 'estadual' | null
}) {
  if (conclusao.modalidade === null && conclusao.abaixoDoLimite.length === 0) {
    return (
      <p className="corpo text-(--text-subtle)">
        Informe os parâmetros das atividades para ver a conclusão.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-(--space-100)">
      {orgao ? (
        <p className="corpo text-(--text)">
          <span className="corpo-medio">
            Órgão licenciador: {orgao === 'municipal' ? 'município' : 'Estado (IMA)'}
          </span>
          {orgao === 'estadual'
            ? '. Pelo menos uma atividade é estadual, e o licenciamento do empreendimento fica num órgão só.'
            : '. Todas as atividades cabem na lista de impacto local do município.'}
        </p>
      ) : null}
      {conclusao.modalidade ? (
        <dl className="grid grid-cols-1 gap-x-(--space-200) gap-y-(--space-050) sm:grid-cols-3">
          <div>
            <dt className="rotulo text-(--text-subtle)">Modalidade</dt>
            <dd className="corpo-medio text-(--text)">
              {ROTULO_DA_MODALIDADE[conclusao.modalidade]}
            </dd>
          </div>
          <div>
            <dt className="rotulo text-(--text-subtle)">Estudo do empreendimento</dt>
            <dd className="corpo-medio text-(--text)">
              {conclusao.estudo
                ? `${ROTULO_DO_ESTUDO[conclusao.estudo]}, pela atividade ${conclusao.atividadeDoEstudo ?? ''}`
                : 'Dispensado (Art. 22)'}
            </dd>
          </div>
          <div>
            <dt className="rotulo text-(--text-subtle)">Maior potencial poluidor</dt>
            <dd className="corpo-medio text-(--text)">{conclusao.potencialGeral}</dd>
          </div>
        </dl>
      ) : null}
      {conclusao.podeAvaliarLac ? (
        <p className="corpo text-(--text)">
          Todas as atividades preveem Licença Ambiental por Compromisso (LAC): avalie se o
          empreendimento atende às condições do item, como não depender de supressão de vegetação.
        </p>
      ) : null}
      {conclusao.abaixoDoLimite.length > 0 ? (
        <p className="corpo text-(--text)">
          Abaixo do limite de licenciamento: {conclusao.abaixoDoLimite.join(', ')}.
        </p>
      ) : null}
      {conclusao.pendentes.length > 0 ? (
        <p className="corpo text-(--text)">
          Faltam parâmetros de: {conclusao.pendentes.join(', ')}. A conclusão pode mudar.
        </p>
      ) : null}
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
  const idAjuda = `${id}-ajuda`
  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo text-(--text)">
        Habilitação do município para licenciar (CONSEMA 251/2024)
      </label>
      <select
        id={id}
        aria-describedby={idAjuda}
        className="h-(--size-control) w-full max-w-[320px] rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-b-(--border-input-active) focus:shadow-[inset_0_-1px_0_0_var(--border-input-active)]"
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
      <p id={idAjuda} className="corpo text-(--text-subtle)">
        O nível em que o município do empreendimento está habilitado define o que ele licencia.
        Confirme na resolução CONSEMA de habilitação do município.
      </p>
    </div>
  )
}

/** /triagem: enquadramento das atividades de um empreendimento pelas CONSEMA 250 e 251/2024. */
export function PaginaTriagem() {
  const [itens, setItens] = useState<ItemEmEdicao[]>([])
  const [nivel, setNivel] = useState<NivelMunicipal | null>(null)
  const jaIncluidas = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens])

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

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Pagina titulo="Triagem de licenciamento">{null}</Pagina>

      <MensagemSecao tom="atencao" titulo="Triagem, não enquadramento oficial">
        Resultado calculado pela {FONTE} (estadual) e pela {CATALOGO_CONSEMA_251.fonte} (impacto
        local), em Santa Catarina. Confira no Simulador do IMA e com o órgão licenciador. Taxas
        ainda não entram aqui.
      </MensagemSecao>

      <SeletorDoNivel nivel={nivel} aoMudar={setNivel} />

      <BuscaDeAtividade
        jaIncluidas={jaIncluidas}
        aoIncluir={(codigo) => {
          setItens((atual) =>
            atual.some((i) => i.codigo === codigo) ? atual : [...atual, { codigo, medidas: {} }],
          )
        }}
      />

      <section
        aria-label="Atividades do empreendimento"
        className="flex flex-col gap-(--space-100)"
      >
        <h2 className="titulo-secao text-(--text)">Atividades do empreendimento</h2>
        {itens.length === 0 ? (
          <EstadoVazio
            icone="search"
            titulo="Nenhuma atividade incluída"
            descricao="Busque e inclua todas as atividades licenciáveis do empreendimento (Art. 10)."
          />
        ) : (
          calculados.map((calculado) => (
            <CartaoDaAtividade
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
          ))
        )}
      </section>

      {itens.length > 0 ? (
        <section aria-label="Conclusão da triagem" className="flex flex-col gap-(--space-100)">
          <h2 className="titulo-secao text-(--text)">Conclusão</h2>
          <Conclusao conclusao={conclusao} orgao={orgao} />
        </section>
      ) : null}
    </div>
  )
}
