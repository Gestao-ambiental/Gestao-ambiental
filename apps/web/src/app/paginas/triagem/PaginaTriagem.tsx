// Triagem de licenciamento (enquadramento) pela Resolução CONSEMA 250/2024 consolidada.
// docs/estudos/triagem-licenciamento-consema-250.md. Protótipo para revisão.
//
// Tudo é cálculo local sobre o catálogo do domínio: sem banco nem rede, então não há estados de
// carregando, erro ou sem permissão. O resultado orienta a proposta; quem enquadra é o órgão.

import {
  CATALOGO_CONSEMA_250,
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_ESTUDO,
  ROTULO_DO_PORTE,
  buscarAtividades,
  concluirTriagem,
  descreverCondicao,
  enquadrarAtividade,
  lerNumeroDigitado,
  parametrosDaAtividade,
  type AtividadeLicenciavel,
  type ConclusaoDaTriagem,
  type Medidas,
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
          Declaração e Certidão de Conformidade Ambiental (Art. 14).
        </MensagemSecao>
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
  item,
  aoMudarMedida,
  aoRemover,
}: {
  item: ItemEmEdicao
  aoMudarMedida: (sigla: string, texto: string) => void
  aoRemover: () => void
}) {
  const atividade = POR_CODIGO.get(item.codigo)
  if (!atividade) return null
  const parametros = parametrosDaAtividade(atividade)
  const resultado = enquadrarAtividade(atividade, medidasLidas(item))
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

      <DescricaoDoResultado atividade={atividade} resultado={resultado} />
    </article>
  )
}

function Conclusao({ conclusao }: { conclusao: ConclusaoDaTriagem }) {
  if (conclusao.modalidade === null && conclusao.abaixoDoLimite.length === 0) {
    return (
      <p className="corpo text-(--text-subtle)">
        Informe os parâmetros das atividades para ver a conclusão.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-(--space-100)">
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

/** /triagem: enquadramento das atividades de um empreendimento pela CONSEMA 250/2024. */
export function PaginaTriagem() {
  const [itens, setItens] = useState<ItemEmEdicao[]>([])
  const jaIncluidas = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens])

  const conclusao = concluirTriagem(
    itens.flatMap((item) => {
      const atividade = POR_CODIGO.get(item.codigo)
      return atividade
        ? [{ atividade, resultado: enquadrarAtividade(atividade, medidasLidas(item)) }]
        : []
    }),
  )

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Pagina titulo="Triagem de licenciamento">{null}</Pagina>

      <MensagemSecao tom="atencao" titulo="Triagem, não enquadramento oficial">
        Resultado calculado pelo Anexo VI da {FONTE}, só para o licenciamento estadual em Santa
        Catarina. Confira no Simulador do IMA e com o órgão licenciador. Atividades de impacto local
        (CONSEMA 251/2024) e taxas ainda não entram aqui.
      </MensagemSecao>

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
          itens.map((item) => (
            <CartaoDaAtividade
              key={item.codigo}
              item={item}
              aoMudarMedida={(sigla, texto) => {
                setItens((atual) =>
                  atual.map((i) =>
                    i.codigo === item.codigo
                      ? { ...i, medidas: { ...i.medidas, [sigla]: texto } }
                      : i,
                  ),
                )
              }}
              aoRemover={() => {
                setItens((atual) => atual.filter((i) => i.codigo !== item.codigo))
              }}
            />
          ))
        )}
      </section>

      {itens.length > 0 ? (
        <section aria-label="Conclusão da triagem" className="flex flex-col gap-(--space-100)">
          <h2 className="titulo-secao text-(--text)">Conclusão</h2>
          <Conclusao conclusao={conclusao} />
        </section>
      ) : null}
    </div>
  )
}
