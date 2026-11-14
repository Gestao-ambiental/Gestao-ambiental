import {
  CODIGOS_DE_PLANO,
  formatarCentavos,
  formatarDataCivil,
  formatarReais,
  ehDataCivil,
  hojeNoFuso,
  lerReais,
  valorDoCiclo,
  type CatalogoComercial,
  type CodigoPlano,
  type ConfiguracaoComercial,
  type DataCivil,
  type Plano,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Pagina } from '@/app/paginas/Pagina'
import { reaisDigitados } from '@/app/paginas/orcamentos/comum'
import { CHAVE_CATALOGO_COMERCIAL, useCatalogoComercial } from '@/app/plano/catalogo'
import { CHAVE_SITUACAO_COMERCIAL } from '@/app/plano/situacao'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import type { Json } from '@/lib/database.types'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import {
  TAMANHO_PAGINA_HISTORICO_PARAMETROS,
  atualizarConfiguracaoComercial,
  atualizarPlano,
  listarHistoricoDeParametros,
} from '@/lib/api/parametros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCampo, classeCelula } from './comum'

/** Fuso da plataforma (o histórico mostra a hora de quem opera, não de uma consultoria). */
const FUSO_DA_PLATAFORMA = 'America/Sao_Paulo'
const CHAVE_HISTORICO = ['central', 'parametros', 'historico']

// ---------------------------------------------------------------------------
// Rascunho (texto dos campos) ⇄ catálogo
// ---------------------------------------------------------------------------

interface PlanoEditado {
  nome: string
  mensal: string
  pessoas: string
  empreendimentos: string
  orcamentos: boolean
  ia: boolean
}

interface RegrasEditadas {
  adicional: string
  mensalidadesNoAnual: string
  diasDeTeste: string
  tolerancia: string
  fimDoBeta: DataCivil | null
}

interface Rascunho {
  planos: Record<CodigoPlano, PlanoEditado>
  regras: RegrasEditadas
}

function rascunhoDo(catalogo: CatalogoComercial): Rascunho {
  const plano = (p: Plano): PlanoEditado => ({
    nome: p.nome,
    mensal: formatarCentavos(p.mensalCentavos),
    pessoas: String(p.pessoas),
    empreendimentos: String(p.empreendimentos),
    orcamentos: p.orcamentos,
    ia: p.ia,
  })
  const c = catalogo.configuracao
  return {
    planos: {
      essencial: plano(catalogo.planos.essencial),
      equipe: plano(catalogo.planos.equipe),
      escala: plano(catalogo.planos.escala),
    },
    regras: {
      adicional: formatarCentavos(c.adicionalMensalCentavos),
      mensalidadesNoAnual: String(c.mensalidadesNoAnual),
      diasDeTeste: String(c.diasDeTestePadrao),
      tolerancia: String(c.diasUteisDeTolerancia),
      fimDoBeta: c.fimDoBeta,
    },
  }
}

function inteiro(texto: string): number | null {
  return /^\d{1,6}$/.test(texto.trim()) ? Number(texto.trim()) : null
}

/** O rascunho como catálogo, ou nulo quando algum campo não é um valor válido. */
function catalogoDo(rascunho: Rascunho, atual: CatalogoComercial): CatalogoComercial | null {
  const planos: Partial<Record<CodigoPlano, Plano>> = {}
  for (const codigo of CODIGOS_DE_PLANO) {
    const p = rascunho.planos[codigo]
    const mensal = lerReais(p.mensal)
    const pessoas = inteiro(p.pessoas)
    const empreendimentos = inteiro(p.empreendimentos)
    if (!p.nome.trim() || !mensal || !pessoas || !empreendimentos) return null
    planos[codigo] = {
      codigo,
      nome: p.nome.trim(),
      mensalCentavos: mensal,
      pessoas,
      empreendimentos,
      orcamentos: p.orcamentos,
      ia: p.ia,
    }
  }
  const r = rascunho.regras
  const adicional = lerReais(r.adicional)
  const mensalidades = inteiro(r.mensalidadesNoAnual)
  const diasDeTeste = inteiro(r.diasDeTeste)
  const tolerancia = inteiro(r.tolerancia)
  const { essencial, equipe, escala } = planos
  if (
    !essencial ||
    !equipe ||
    !escala ||
    !adicional ||
    !mensalidades ||
    mensalidades > 12 ||
    diasDeTeste === null ||
    diasDeTeste > 365 ||
    tolerancia === null ||
    !r.fimDoBeta
  )
    return null
  return {
    planos: { essencial, equipe, escala },
    configuracao: {
      fimDoBeta: r.fimDoBeta,
      diasDeTestePadrao: diasDeTeste,
      adicionalMensalCentavos: adicional,
      mensalidadesNoAnual: mensalidades,
      diasUteisDeTolerancia: tolerancia,
      moeda: atual.configuracao.moeda,
    },
  }
}

// ---------------------------------------------------------------------------
// Antes → depois (o mesmo formato do histórico do banco)
// ---------------------------------------------------------------------------

type Valores = Record<string, Json | undefined>

function valoresDoPlano(p: Plano): Valores {
  return {
    nome: p.nome,
    mensal_centavos: p.mensalCentavos,
    pessoas: p.pessoas,
    empreendimentos: p.empreendimentos,
    orcamentos: p.orcamentos,
    ia: p.ia,
  }
}

function valoresDasRegras(c: ConfiguracaoComercial): Valores {
  return {
    fim_do_beta: c.fimDoBeta,
    dias_de_teste_padrao: c.diasDeTestePadrao,
    adicional_mensal_centavos: c.adicionalMensalCentavos,
    mensalidades_no_anual: c.mensalidadesNoAnual,
    dias_uteis_de_tolerancia: c.diasUteisDeTolerancia,
  }
}

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  mensal_centavos: 'Preço mensal',
  pessoas: 'Pessoas',
  empreendimentos: 'Empreendimentos',
  orcamentos: 'Orçamentos',
  ia: 'IA',
  adicional_mensal_centavos: 'Adicional por mês',
  mensalidades_no_anual: 'Mensalidades no anual',
  dias_de_teste_padrao: 'Dias úteis de teste',
  dias_uteis_de_tolerancia: 'Dias úteis de tolerância',
  fim_do_beta: 'Fim do beta',
}

function formatarValor(campo: string, valor: Json | undefined): string {
  if (valor === undefined || valor === null) return '—'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (typeof valor === 'number' && campo.endsWith('_centavos')) return formatarReais(valor)
  if (typeof valor === 'string' && ehDataCivil(valor)) return formatarDataCivil(valor)
  return typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
}

interface Mudanca {
  campo: string
  antes: string
  depois: string
}

function mudancasEntre(antes: Valores, depois: Valores): Mudanca[] {
  return Object.keys(ROTULO_DO_CAMPO)
    .filter(
      (campo) => campo in depois && JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
    )
    .map((campo) => ({
      campo: ROTULO_DO_CAMPO[campo] ?? campo,
      antes: formatarValor(campo, antes[campo]),
      depois: formatarValor(campo, depois[campo]),
    }))
}

interface GrupoDeMudancas {
  alvo: 'configuracao' | CodigoPlano
  titulo: string
  mudancas: Mudanca[]
}

function gruposDeMudancas(atual: CatalogoComercial, novo: CatalogoComercial): GrupoDeMudancas[] {
  const grupos: GrupoDeMudancas[] = CODIGOS_DE_PLANO.map((codigo) => ({
    alvo: codigo,
    titulo: `Plano ${atual.planos[codigo].nome}`,
    mudancas: mudancasEntre(
      valoresDoPlano(atual.planos[codigo]),
      valoresDoPlano(novo.planos[codigo]),
    ),
  }))
  grupos.push({
    alvo: 'configuracao',
    titulo: 'Regras',
    mudancas: mudancasEntre(
      valoresDasRegras(atual.configuracao),
      valoresDasRegras(novo.configuracao),
    ),
  })
  return grupos.filter((g) => g.mudancas.length > 0)
}

function ListaDeMudancas({ mudancas }: { mudancas: Mudanca[] }) {
  return (
    <ul className="flex flex-col gap-(--space-025)">
      {mudancas.map((m) => (
        <li key={m.campo} className="tabular-nums">
          {m.campo}: {m.antes} → {m.depois}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

const classeCampoTabela = `${classeCampo} h-(--size-control) min-w-24`

function Formulario({
  catalogo,
  salvo,
  setSalvo,
}: {
  catalogo: CatalogoComercial
  salvo: boolean
  setSalvo: (salvo: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [rascunho, setRascunho] = useState(() => rascunhoDo(catalogo))
  const [confirmar, setConfirmar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [invalido, setInvalido] = useState(false)
  const novo = catalogoDo(rascunho, catalogo)
  const grupos = novo ? gruposDeMudancas(catalogo, novo) : []
  const hoje = hojeNoFuso(new Date(), FUSO_DA_PLATAFORMA)

  const salvar = useMutation({
    mutationFn: async () => {
      if (!novo) return
      for (const g of grupos) {
        if (g.alvo === 'configuracao')
          await atualizarConfiguracaoComercial(novo.configuracao, motivo)
        else await atualizarPlano(novo.planos[g.alvo], motivo)
      }
    },
    // Repetir depois de um erro no meio é seguro: o banco ignora o que já está igual.
    onSuccess: async () => {
      setConfirmar(false)
      setMotivo('')
      setSalvo(true)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE_CATALOGO_COMERCIAL] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE_SITUACAO_COMERCIAL] }),
        queryClient.invalidateQueries({ queryKey: ['central'] }),
      ])
    },
  })

  function mudarPlano(codigo: CodigoPlano, campo: Partial<PlanoEditado>) {
    setSalvo(false)
    setInvalido(false)
    setRascunho((r) => ({
      ...r,
      planos: { ...r.planos, [codigo]: { ...r.planos[codigo], ...campo } },
    }))
  }
  function mudarRegras(campo: Partial<RegrasEditadas>) {
    setSalvo(false)
    setInvalido(false)
    setRascunho((r) => ({ ...r, regras: { ...r.regras, ...campo } }))
  }
  const soDigitos = (texto: string) => texto.replace(/\D/g, '').slice(0, 6)

  return (
    <div className="flex flex-col gap-(--space-200)">
      <section aria-labelledby="parametros-planos" className="flex flex-col gap-(--space-100)">
        <h2 id="parametros-planos" className="titulo-secao text-(--text)">
          Planos
        </h2>
        <div
          role="region"
          aria-label="Planos"
          className="overflow-x-auto rounded-(--radius-large) border bg-(--surface) shadow-cartao"
        >
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Nome
                </th>
                <th scope="col" className={classeCabecalho}>
                  Preço mensal
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Anual
                </th>
                <th scope="col" className={classeCabecalho}>
                  Pessoas
                </th>
                <th scope="col" className={classeCabecalho}>
                  Empreendimentos
                </th>
                <th scope="col" className={classeCabecalho}>
                  Orçamentos
                </th>
                <th scope="col" className={classeCabecalho}>
                  IA
                </th>
              </tr>
            </thead>
            <tbody>
              {CODIGOS_DE_PLANO.map((codigo) => {
                const p = rascunho.planos[codigo]
                const nome = catalogo.planos[codigo].nome
                return (
                  <tr key={codigo} className="last:[&>td]:border-b-0">
                    <td className={`${classeCelula} py-(--space-075)`}>
                      <input
                        aria-label={`Nome do plano ${nome}`}
                        value={p.nome}
                        maxLength={60}
                        className={classeCampoTabela}
                        onChange={(e) => {
                          mudarPlano(codigo, { nome: e.target.value })
                        }}
                      />
                    </td>
                    <td className={classeCelula}>
                      <input
                        aria-label={`Preço mensal do ${nome}`}
                        inputMode="decimal"
                        value={p.mensal}
                        className={`${classeCampoTabela} text-right tabular-nums`}
                        onChange={(e) => {
                          mudarPlano(codigo, { mensal: reaisDigitados(e) })
                        }}
                      />
                    </td>
                    <td className={`${classeCelula} text-right whitespace-nowrap tabular-nums`}>
                      {novo ? formatarReais(valorDoCiclo(codigo, 'anual', novo)) : '—'}
                    </td>
                    <td className={classeCelula}>
                      <input
                        aria-label={`Pessoas no ${nome}`}
                        inputMode="numeric"
                        value={p.pessoas}
                        className={`${classeCampoTabela} tabular-nums`}
                        onChange={(e) => {
                          mudarPlano(codigo, { pessoas: soDigitos(e.target.value) })
                        }}
                      />
                    </td>
                    <td className={classeCelula}>
                      <input
                        aria-label={`Empreendimentos no ${nome}`}
                        inputMode="numeric"
                        value={p.empreendimentos}
                        className={`${classeCampoTabela} tabular-nums`}
                        onChange={(e) => {
                          mudarPlano(codigo, { empreendimentos: soDigitos(e.target.value) })
                        }}
                      />
                    </td>
                    <td className={classeCelula}>
                      <label className="flex items-center gap-(--space-075)">
                        <input
                          type="checkbox"
                          checked={p.orcamentos}
                          className="accent-(--brand)"
                          aria-label={`Orçamentos no ${nome}`}
                          onChange={(e) => {
                            mudarPlano(codigo, { orcamentos: e.target.checked })
                          }}
                        />
                        <span aria-hidden="true">{p.orcamentos ? 'Sim' : 'Não'}</span>
                      </label>
                    </td>
                    <td className={classeCelula}>
                      <label className="flex items-center gap-(--space-075)">
                        <input
                          type="checkbox"
                          checked={p.ia}
                          className="accent-(--brand)"
                          aria-label={`IA no ${nome}`}
                          onChange={(e) => {
                            mudarPlano(codigo, { ia: e.target.checked })
                          }}
                        />
                        <span aria-hidden="true">{p.ia ? 'Sim' : 'Não'}</span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="parametros-regras"
        className="flex flex-col gap-(--space-150) rounded-(--radius-large) border bg-(--surface) p-(--space-200) shadow-cartao"
      >
        <h2 id="parametros-regras" className="titulo-secao text-(--text)">
          Regras
        </h2>
        <div className="grid grid-cols-1 gap-(--space-150) sm:grid-cols-2 lg:grid-cols-3">
          <CampoTexto
            rotulo="Adicional por mês (R$)"
            inputMode="decimal"
            value={rascunho.regras.adicional}
            onChange={(e) => {
              mudarRegras({ adicional: reaisDigitados(e) })
            }}
          />
          <CampoTexto
            rotulo="Mensalidades no anual"
            inputMode="numeric"
            value={rascunho.regras.mensalidadesNoAnual}
            onChange={(e) => {
              mudarRegras({ mensalidadesNoAnual: soDigitos(e.target.value).slice(0, 2) })
            }}
          />
          <CampoTexto
            rotulo="Dias úteis de teste"
            inputMode="numeric"
            value={rascunho.regras.diasDeTeste}
            onChange={(e) => {
              mudarRegras({ diasDeTeste: soDigitos(e.target.value).slice(0, 3) })
            }}
          />
          <CampoTexto
            rotulo="Dias úteis de tolerância do atraso"
            inputMode="numeric"
            value={rascunho.regras.tolerancia}
            onChange={(e) => {
              mudarRegras({ tolerancia: soDigitos(e.target.value).slice(0, 3) })
            }}
          />
          <CampoData
            rotulo="Fim do beta"
            hoje={hoje}
            valor={rascunho.regras.fimDoBeta}
            aoMudar={(data) => {
              mudarRegras({ fimDoBeta: data })
            }}
          />
        </div>
      </section>

      {invalido ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro({ message: 'valores_invalidos' })}
        </MensagemSecao>
      ) : null}
      {salvo ? (
        <MensagemSecao tom="sucesso" role="status">
          Parâmetros salvos.
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap gap-(--space-100)">
        <Botao
          aparencia="primario"
          disabled={novo !== null && grupos.length === 0}
          onClick={() => {
            if (!novo) {
              setInvalido(true)
              return
            }
            salvar.reset()
            setConfirmar(true)
          }}
        >
          Salvar
        </Botao>
        <Botao
          aparencia="sutil"
          onClick={() => {
            setInvalido(false)
            setRascunho(rascunhoDo(catalogo))
          }}
        >
          Desfazer
        </Botao>
      </div>

      <Dialogo
        aberto={confirmar}
        aoMudar={(aberto) => {
          if (!aberto && !salvar.isPending) setConfirmar(false)
        }}
        titulo="Salvar para as próximas cobranças"
        acoes={
          <>
            <Botao
              disabled={salvar.isPending}
              onClick={() => {
                setConfirmar(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={salvar.isPending || motivo.trim() === ''}
              onClick={() => {
                salvar.mutate()
              }}
            >
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-(--space-150)">
          {grupos.map((g) => (
            <section key={g.alvo} aria-label={g.titulo} className="flex flex-col gap-(--space-050)">
              <h3 className="corpo-medio text-(--text)">{g.titulo}</h3>
              <ListaDeMudancas mudancas={g.mudancas} />
            </section>
          ))}
          <CampoTexto
            rotulo="Motivo"
            value={motivo}
            maxLength={500}
            onChange={(e) => {
              setMotivo(e.target.value)
            }}
          />
          {salvar.isError ? (
            <p role="alert" className="text-(--text-danger)">
              {mensagemDoErro(salvar.error)}
            </p>
          ) : null}
        </div>
      </Dialogo>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

function rotuloDoAlvo(alvo: string, catalogo: CatalogoComercial): string {
  if (alvo === 'configuracao') return 'Regras'
  const codigo = alvo.replace(/^plano:/, '')
  const plano = CODIGOS_DE_PLANO.find((c) => c === codigo)
  return `Plano ${plano ? catalogo.planos[plano].nome : codigo}`
}

function Historico({
  consulta,
  catalogo,
}: {
  consulta: ReturnType<typeof useHistorico>
  catalogo: CatalogoComercial
}) {
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  return (
    <section aria-labelledby="parametros-historico" className="flex flex-col gap-(--space-100)">
      <h2 id="parametros-historico" className="titulo-secao text-(--text)">
        Histórico
      </h2>
      {itens.length === 0 ? (
        <EstadoVazio icone="clock" titulo="Nenhuma mudança" />
      ) : (
        <ul
          aria-label="Histórico de parâmetros"
          className="flex flex-col rounded-(--radius-large) border bg-(--surface) shadow-cartao"
        >
          {itens.map((h) => (
            <li
              key={h.id}
              className="flex flex-col gap-(--space-050) border-b p-(--space-150) last:border-b-0"
            >
              <span className="corpo-medio text-(--text)">
                {rotuloDoAlvo(h.alvo, catalogo)} ·{' '}
                {formatarInstanteComHora(h.alteradaEm, FUSO_DA_PLATAFORMA)} · {h.alteradaPorNome}
              </span>
              <ListaDeMudancas mudancas={mudancasEntre(h.antes, h.depois)} />
              <span>Motivo: {h.motivo}</span>
            </li>
          ))}
        </ul>
      )}
      {consulta.hasNextPage ? (
        <Botao
          className="self-start"
          disabled={consulta.isFetchingNextPage}
          onClick={() => void consulta.fetchNextPage()}
        >
          Mostrar mais mudanças
        </Botao>
      ) : null}
    </section>
  )
}

function useHistorico() {
  return useInfiniteQuery({
    queryKey: CHAVE_HISTORICO,
    queryFn: ({ pageParam }) => listarHistoricoDeParametros(pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_HISTORICO_PARAMETROS &&
        carregados < ultima.total
        ? todas.length
        : undefined
    },
  })
}

/**
 * /admin/parametros (ADR-0026): planos (nome, preço mensal, limites, orçamentos e IA) e regras
 * comerciais (adicional, anual, teste padrão, tolerância do atraso e fim do beta), editados pelo
 * operador com dois fatores e motivo; valem para as próximas cobranças. Histórico paginado abaixo.
 */
export function PaginaCentralParametros() {
  const catalogo = useCatalogoComercial()
  const historico = useHistorico()
  const [salvo, setSalvo] = useState(false)

  let conteudo
  if (catalogo.isPending || historico.isPending)
    conteudo = <Carregando rotulo="Carregando os parâmetros" linhas={4} />
  else if (historico.isError && ehDoisFatoresNecessarios(historico.error))
    conteudo = <RelerDoisFatores />
  else if (historico.isError && ehSemPermissao(historico.error))
    conteudo = <SemPermissao descricao={null} />
  else if (catalogo.isError || historico.isError)
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar os parâmetros."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => {
          void catalogo.refetch()
          void historico.refetch()
        }}
      />
    )
  else
    conteudo = (
      <>
        <Formulario
          key={JSON.stringify(catalogo.data)}
          catalogo={catalogo.data}
          salvo={salvo}
          setSalvo={setSalvo}
        />
        <Historico consulta={historico} catalogo={catalogo.data} />
      </>
    )

  return (
    <div className="flex flex-col gap-(--space-300)">
      <Pagina titulo="Planos e parâmetros">{null}</Pagina>
      {conteudo}
    </div>
  )
}
