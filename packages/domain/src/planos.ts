// Planos, limites, teste grátis, atraso e só leitura (ADR-0026; decisões do Eduardo de 14/11/2026).
// Situação e atraso são CALCULADOS, nunca gravados: esta é a regra pura. O banco tem a função
// equivalente (private.situacao_comercial_calculada) para as triggers e as RPCs; os testes pgTAP
// conferem os mesmos casos (paridade).

import { adicionarDias, type DataCivil } from './data-civil'
import { ehDiaUtil } from './dias-uteis'

export type CodigoPlano = 'essencial' | 'equipe' | 'escala'
export type CicloDoPlano = 'mensal' | 'anual'
export type FormaDePagamento = 'pix' | 'cartao'

export interface Plano {
  codigo: CodigoPlano
  nome: string
  /** Mensalidade em centavos (BRL). */
  mensalCentavos: number
  /** Pessoas ativas incluídas. */
  pessoas: number
  /** Empreendimentos ativos incluídos. */
  empreendimentos: number
  orcamentos: boolean
  ia: boolean
  /** Recursos ligados neste plano (ADR-0030), além de orçamentos e IA. */
  recursos: readonly RecursoDoPlano[]
}

/** Recursos que a central liga por plano (ADR-0030). Os que ainda não existem já nascem presos. */
export type RecursoDoPlano = 'capacidade' | 'integracao_ima' | 'financeiro' | 'analise_lotes'

export const RECURSOS_DO_PLANO: readonly RecursoDoPlano[] = [
  'capacidade',
  'integracao_ima',
  'financeiro',
  'analise_lotes',
]

export const ROTULO_DO_RECURSO: Readonly<Record<RecursoDoPlano, string>> = {
  capacidade: 'Capacidade e carga da equipe',
  integracao_ima: 'Integração com o MTR do IMA',
  financeiro: 'Financeiro da consultoria',
  analise_lotes: 'Análise de lotes',
}

export function ehRecursoDoPlano(valor: unknown): valor is RecursoDoPlano {
  return RECURSOS_DO_PLANO.some((r) => r === valor)
}

export const CODIGOS_DE_PLANO: readonly CodigoPlano[] = ['essencial', 'equipe', 'escala']

/** Mesmo catálogo de private.plano_catalogo (migration 20261114150000). */
export const PLANOS: Readonly<Record<CodigoPlano, Plano>> = {
  essencial: {
    codigo: 'essencial',
    nome: 'Essencial',
    mensalCentavos: 99_000,
    pessoas: 3,
    empreendimentos: 10,
    orcamentos: false,
    ia: false,
    recursos: [],
  },
  equipe: {
    codigo: 'equipe',
    nome: 'Equipe',
    mensalCentavos: 129_000,
    pessoas: 10,
    empreendimentos: 30,
    orcamentos: true,
    ia: true,
    recursos: ['capacidade'],
  },
  escala: {
    codigo: 'escala',
    nome: 'Escala',
    mensalCentavos: 299_000,
    pessoas: 25,
    empreendimentos: 100,
    orcamentos: true,
    ia: true,
    recursos: ['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes'],
  },
}

export const MOEDA = 'BRL'
/** Cada pessoa ou empreendimento além do limite: R$ 20 por mês. */
export const ADICIONAL_MENSAL_CENTAVOS = 2_000
/** O anual custa 10 mensalidades, pago de uma vez. */
export const MENSALIDADES_NO_ANUAL = 10
export const DIAS_DE_TESTE_PADRAO = 10
/** Bloqueio depois de 2 dias úteis de atraso. */
export const DIAS_UTEIS_DE_TOLERANCIA = 2
/** "Teste acabando" na central: acaba nos próximos 3 dias úteis. */
export const DIAS_UTEIS_TESTE_ACABANDO = 3
/** Último dia do beta na migration 20261114150000 (a central pode mudar). */
export const FIM_DO_BETA_PADRAO = '2027-01-31' as DataCivil

/** Configuração comercial da plataforma (private.configuracao_comercial). */
export interface ConfiguracaoComercial {
  fimDoBeta: DataCivil
  diasDeTestePadrao: number
  adicionalMensalCentavos: number
  mensalidadesNoAnual: number
  diasUteisDeTolerancia: number
  moeda: string
}

/**
 * Catálogo e configuração vigentes. A fonte é o banco (RPC catalogo_comercial; a central edita);
 * as constantes acima são o padrão de quem ainda não leu o banco.
 */
export interface CatalogoComercial {
  planos: Readonly<Record<CodigoPlano, Plano>>
  configuracao: ConfiguracaoComercial
}

export const CATALOGO_PADRAO: CatalogoComercial = {
  planos: PLANOS,
  configuracao: {
    fimDoBeta: FIM_DO_BETA_PADRAO,
    diasDeTestePadrao: DIAS_DE_TESTE_PADRAO,
    adicionalMensalCentavos: ADICIONAL_MENSAL_CENTAVOS,
    mensalidadesNoAnual: MENSALIDADES_NO_ANUAL,
    diasUteisDeTolerancia: DIAS_UTEIS_DE_TOLERANCIA,
    moeda: MOEDA,
  },
}

export function ehCodigoPlano(valor: unknown): valor is CodigoPlano {
  return valor === 'essencial' || valor === 'equipe' || valor === 'escala'
}

export function ehCicloDoPlano(valor: unknown): valor is CicloDoPlano {
  return valor === 'mensal' || valor === 'anual'
}

export function ehFormaDePagamento(valor: unknown): valor is FormaDePagamento {
  return valor === 'pix' || valor === 'cartao'
}

export const ROTULO_DO_CICLO: Readonly<Record<CicloDoPlano, string>> = {
  mensal: 'Mensal',
  anual: 'Anual',
}

export const ROTULO_DA_FORMA: Readonly<Record<FormaDePagamento, string>> = {
  pix: 'Pix',
  cartao: 'Cartão de crédito',
}

// ---------------------------------------------------------------------------
// Dias úteis: segunda a sexta, menos os feriados nacionais. Carnaval e Corpus Christi são ponto
// facultativo e contam como dia útil.
// ---------------------------------------------------------------------------

function data(ano: number, mes: number, dia: number): DataCivil {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` as DataCivil
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): DataCivil {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return data(ano, mes, dia)
}

/** Feriados nacionais do ano, em ordem: os fixos e a Sexta-feira Santa (Páscoa − 2). */
export function feriadosNacionais(ano: number): DataCivil[] {
  const fixos: [number, number][] = [
    [1, 1],
    [4, 21],
    [5, 1],
    [9, 7],
    [10, 12],
    [11, 2],
    [11, 15],
    [11, 20],
    [12, 25],
  ]
  return [adicionarDias(pascoa(ano), -2), ...fixos.map(([mes, dia]) => data(ano, mes, dia))].sort()
}

/** Segunda a sexta e fora dos feriados nacionais. */
export function ehDiaUtilNacional(dia: DataCivil): boolean {
  return ehDiaUtil(dia, feriadosNacionais(Number(dia.slice(0, 4))))
}

/** O n-ésimo dia útil depois de `dia` (sem contar o próprio). Com n = 0, o próprio dia. */
export function somarDiasUteis(dia: DataCivil, n: number): DataCivil {
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`Quantidade de dias úteis inválida: ${String(n)}.`)
  let atual = dia
  for (let contados = 0; contados < n;) {
    atual = adicionarDias(atual, 1)
    if (ehDiaUtilNacional(atual)) contados++
  }
  return atual
}

/**
 * Último dia do teste: o teste dura `dias` dias úteis, contados a partir do dia de início
 * (o próprio início conta, se for útil). Com 0 dias, o teste acabou na véspera do início.
 */
export function fimDoTeste(inicio: DataCivil, dias: number): DataCivil {
  return somarDiasUteis(adicionarDias(inicio, -1), dias)
}

/**
 * Primeiro dia do teste. Consultoria criada até o fim do beta começa o teste no dia seguinte ao
 * fim do beta; criada depois, no dia da criação.
 */
export function inicioDoTeste(criadaEm: DataCivil, fimDoBeta: DataCivil): DataCivil {
  return criadaEm <= fimDoBeta ? adicionarDias(fimDoBeta, 1) : criadaEm
}

/**
 * Primeiro vencimento de uma assinatura nova: no dia seguinte ao fim do teste (ou do beta, cujo
 * teste começa depois dele), para quem assina antes de acabar; senão, hoje.
 */
export function primeiroVencimento(hoje: DataCivil, testeAte: DataCivil): DataCivil {
  const depoisDoTeste = adicionarDias(testeAte, 1)
  return hoje < depoisDoTeste ? depoisDoTeste : hoje
}

/** O teste acaba hoje ou nos próximos 3 dias úteis (alerta da central). */
export function testeAcabando(testeAte: DataCivil, hoje: DataCivil): boolean {
  return hoje <= testeAte && testeAte <= somarDiasUteis(hoje, DIAS_UTEIS_TESTE_ACABANDO)
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

/** Valor cobrado por ciclo: a mensalidade, ou 10 mensalidades (configuração) no anual. */
export function valorDoCiclo(
  plano: CodigoPlano,
  ciclo: CicloDoPlano,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): number {
  const mensal = catalogo.planos[plano].mensalCentavos
  return ciclo === 'anual' ? mensal * catalogo.configuracao.mensalidadesNoAnual : mensal
}

/** Receita mensal equivalente (MRR): no anual, o valor do ano dividido por 12, arredondado. */
export function equivalenteMensal(
  plano: CodigoPlano,
  ciclo: CicloDoPlano,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): number {
  return ciclo === 'anual'
    ? Math.round(valorDoCiclo(plano, 'anual', catalogo) / 12)
    : valorDoCiclo(plano, ciclo, catalogo)
}

/** Economia do anual frente a 12 mensalidades. */
export function economiaDoAnual(
  plano: CodigoPlano,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): number {
  return catalogo.planos[plano].mensalCentavos * 12 - valorDoCiclo(plano, 'anual', catalogo)
}

export interface Uso {
  pessoas: number
  empreendimentos: number
}

export interface Limites {
  pessoas: number
  empreendimentos: number
}

export interface Adicionais {
  pessoas: number
  empreendimentos: number
  quantidade: number
  /** Valor mensal dos adicionais em centavos. */
  valorCentavos: number
}

/** Pessoas e empreendimentos além do limite, a R$ 20 por mês cada. Sem limite: zero. */
export function adicionaisDoUso(
  uso: Uso,
  limites: Limites | null,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): Adicionais {
  if (!limites) return { pessoas: 0, empreendimentos: 0, quantidade: 0, valorCentavos: 0 }
  const pessoas = Math.max(0, uso.pessoas - limites.pessoas)
  const empreendimentos = Math.max(0, uso.empreendimentos - limites.empreendimentos)
  const quantidade = pessoas + empreendimentos
  return {
    pessoas,
    empreendimentos,
    quantidade,
    valorCentavos: quantidade * catalogo.configuracao.adicionalMensalCentavos,
  }
}

export function limitesDoPlano(
  plano: CodigoPlano,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): Limites {
  const p = catalogo.planos[plano]
  return { pessoas: p.pessoas, empreendimentos: p.empreendimentos }
}

/** Valor por mês do plano (equivalente mensal) mais os adicionais. */
export function valorMensalComAdicionais(
  plano: CodigoPlano,
  ciclo: CicloDoPlano,
  uso: Uso,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): number {
  return (
    equivalenteMensal(plano, ciclo, catalogo) +
    adicionaisDoUso(uso, limitesDoPlano(plano, catalogo), catalogo).valorCentavos
  )
}

export type RecursoDoLimite = 'pessoas' | 'empreendimentos'

export interface PassagemDoLimite {
  recurso: RecursoDoLimite
  /** Quantidade depois da ação. */
  quantidade: number
  limite: number
  /** Adicionais por mês depois da ação (todos os recursos). */
  adicionaisDepois: number
  /** Valor por mês do plano com os adicionais depois da ação. */
  mensalDepois: number
}

/**
 * A ação soma 1 ao recurso: passa do limite? Devolve o que o diálogo mostra, ou nulo quando cabe
 * (ou quando não há limite: teste, beta, conta interna).
 */
export function passagemDoLimite(
  recurso: RecursoDoLimite,
  uso: Uso,
  plano: CodigoPlano | null,
  ciclo: CicloDoPlano | null,
  limites: Limites | null,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): PassagemDoLimite | null {
  if (!limites || !plano || !ciclo) return null
  const depois: Uso = { ...uso, [recurso]: uso[recurso] + 1 }
  if (depois[recurso] <= limites[recurso]) return null
  const adicionais = adicionaisDoUso(depois, limites, catalogo).valorCentavos
  return {
    recurso,
    quantidade: depois[recurso],
    limite: limites[recurso],
    adicionaisDepois: adicionais,
    mensalDepois: equivalenteMensal(plano, ciclo, catalogo) + adicionais,
  }
}

// ---------------------------------------------------------------------------
// Situação comercial
// ---------------------------------------------------------------------------

export type SituacaoComercialCodigo =
  | 'interna'
  | 'contrato'
  | 'beta'
  | 'teste'
  | 'ativa'
  | 'em_atraso'
  | 'bloqueada'
  | 'teste_encerrado'
  | 'cancelada'

export const SITUACOES_COMERCIAIS: readonly SituacaoComercialCodigo[] = [
  'interna',
  'contrato',
  'beta',
  'teste',
  'ativa',
  'em_atraso',
  'bloqueada',
  'teste_encerrado',
  'cancelada',
]

export const ROTULO_DA_SITUACAO_COMERCIAL: Readonly<Record<SituacaoComercialCodigo, string>> = {
  interna: 'Conta interna',
  contrato: 'Plano por contrato',
  beta: 'Beta',
  teste: 'Em teste',
  ativa: 'Ativa',
  em_atraso: 'Em atraso',
  bloqueada: 'Somente leitura',
  teste_encerrado: 'Teste encerrado',
  cancelada: 'Cancelada',
}

export function ehSituacaoComercial(valor: unknown): valor is SituacaoComercialCodigo {
  return SITUACOES_COMERCIAIS.some((s) => s === valor)
}

export interface AssinaturaParaSituacao {
  plano: CodigoPlano
  ciclo: CicloDoPlano
  /** Plano que vale a partir de `mudancaEm` (troca de plano: vale no próximo ciclo). */
  planoAgendado: CodigoPlano | null
  /** Ciclo que vale a partir de `mudancaEm` (troca de mensal para anual ou o contrário). */
  cicloAgendado: CicloDoPlano | null
  mudancaEm: DataCivil | null
  /** Cancelada: vale até este dia (fim do período pago). Nula enquanto não cancelada. */
  validaAte: DataCivil | null
}

export interface EntradaDaSituacao {
  /** Hoje no fuso da consultoria. */
  hoje: DataCivil
  /** Dia da criação da consultoria, no fuso dela. */
  criadaEm: DataCivil
  /** Último dia do beta (configuração da plataforma). */
  fimDoBeta: DataCivil
  diasDeTeste: number
  interna: boolean
  /** Plano definido pela central sem cobrança pelo Grama (ADR-0030); `ate` nulo = sem prazo. */
  contrato?: { plano: CodigoPlano; ate: DataCivil | null } | null
  assinatura: AssinaturaParaSituacao | null
  /** Vencimentos das cobranças não pagas (nem estornadas nem removidas). */
  vencimentosEmAberto: readonly DataCivil[]
}

export interface SituacaoComercial {
  situacao: SituacaoComercialCodigo
  somenteLeitura: boolean
  orcamentosLiberados: boolean
  /** Plano que vale hoje (nulo sem assinatura). */
  planoVigente: CodigoPlano | null
  /** Ciclo que vale hoje (nulo sem assinatura). */
  cicloVigente: CicloDoPlano | null
  /** Limites que valem hoje; nulos no teste, no beta e na conta interna (sem limite). */
  limites: Limites | null
  testeAte: DataCivil
  /** Último dia do beta para quem foi criada até lá; nulo para as outras. */
  betaAte: DataCivil | null
  /** Vencimento mais antigo em aberto e já passado. */
  emAtrasoDesde: DataCivil | null
  /** Primeiro dia em só leitura por atraso. */
  bloqueioEm: DataCivil | null
  /** Há cobrança em aberto que vence hoje (a faixa da Gestão avisa no próprio dia). */
  venceHoje: boolean
}

/** Plano que vale hoje: a troca de plano só vale a partir do próximo ciclo (`mudancaEm`). */
export function planoVigente(assinatura: AssinaturaParaSituacao, hoje: DataCivil): CodigoPlano {
  if (assinatura.planoAgendado && assinatura.mudancaEm && hoje >= assinatura.mudancaEm)
    return assinatura.planoAgendado
  return assinatura.plano
}

/** Ciclo que vale hoje: a troca de ciclo também só vale a partir do próximo ciclo. */
export function cicloVigente(assinatura: AssinaturaParaSituacao, hoje: DataCivil): CicloDoPlano {
  if (assinatura.cicloAgendado && assinatura.mudancaEm && hoje >= assinatura.mudancaEm)
    return assinatura.cicloAgendado
  return assinatura.ciclo
}

/** O plano de destino é mais caro que o de origem (mostrado como "subir de plano"). */
export function ehPlanoMaior(
  de: CodigoPlano,
  para: CodigoPlano,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): boolean {
  return catalogo.planos[para].mensalCentavos > catalogo.planos[de].mensalCentavos
}

export function situacaoComercial(
  entrada: EntradaDaSituacao,
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): SituacaoComercial {
  const { hoje, assinatura } = entrada
  const testeAte = fimDoTeste(
    inicioDoTeste(entrada.criadaEm, entrada.fimDoBeta),
    entrada.diasDeTeste,
  )
  const betaAte = entrada.criadaEm <= entrada.fimDoBeta ? entrada.fimDoBeta : null
  const venceHoje = entrada.vencimentosEmAberto.includes(hoje)
  const base = { testeAte, betaAte, emAtrasoDesde: null, bloqueioEm: null, venceHoje }
  const liberada = (
    situacao: 'interna' | 'beta' | 'teste',
    plano: CodigoPlano | null,
    ciclo: CicloDoPlano | null,
  ) => ({
    ...base,
    situacao,
    somenteLeitura: false,
    orcamentosLiberados: true,
    planoVigente: plano,
    cicloVigente: ciclo,
    limites: null,
  })

  if (entrada.interna) return { ...liberada('interna', null, null), venceHoje: false }
  const contrato = entrada.contrato ?? null
  if (contrato && (contrato.ate === null || hoje <= contrato.ate))
    return {
      ...base,
      situacao: 'contrato',
      somenteLeitura: false,
      orcamentosLiberados: catalogo.planos[contrato.plano].orcamentos,
      planoVigente: contrato.plano,
      cicloVigente: null,
      limites: limitesDoPlano(contrato.plano, catalogo),
      venceHoje: false,
    }
  if (betaAte && hoje <= betaAte)
    return liberada(
      'beta',
      assinatura ? planoVigente(assinatura, hoje) : null,
      assinatura ? cicloVigente(assinatura, hoje) : null,
    )

  const vigente = assinatura && (assinatura.validaAte === null || hoje <= assinatura.validaAte)
  if (assinatura && vigente) {
    const plano = planoVigente(assinatura, hoje)
    const ciclo = cicloVigente(assinatura, hoje)
    const limites = limitesDoPlano(plano, catalogo)
    const vencidos = entrada.vencimentosEmAberto.filter((v) => v < hoje).sort()
    const maisAntigo = vencidos[0]
    if (maisAntigo) {
      const ultimoDiaDeTolerancia = somarDiasUteis(
        maisAntigo,
        catalogo.configuracao.diasUteisDeTolerancia,
      )
      const bloqueada = hoje > ultimoDiaDeTolerancia
      return {
        ...base,
        situacao: bloqueada ? 'bloqueada' : 'em_atraso',
        somenteLeitura: bloqueada,
        orcamentosLiberados: !bloqueada && catalogo.planos[plano].orcamentos,
        planoVigente: plano,
        cicloVigente: ciclo,
        limites,
        emAtrasoDesde: maisAntigo,
        bloqueioEm: adicionarDias(ultimoDiaDeTolerancia, 1),
      }
    }
    if (hoje <= testeAte) return liberada('teste', plano, ciclo)
    return {
      ...base,
      situacao: 'ativa',
      somenteLeitura: false,
      orcamentosLiberados: catalogo.planos[plano].orcamentos,
      planoVigente: plano,
      cicloVigente: ciclo,
      limites,
    }
  }

  if (hoje <= testeAte) return liberada('teste', null, null)
  return {
    ...base,
    situacao: assinatura ? 'cancelada' : 'teste_encerrado',
    somenteLeitura: true,
    orcamentosLiberados: false,
    planoVigente: null,
    cicloVigente: null,
    limites: null,
    venceHoje: false,
  }
}

/**
 * A consultoria pode usar o recurso hoje? Teste, beta e conta interna liberam tudo; só leitura não
 * libera nada; nos outros casos vale o plano vigente (o mesmo de private.recurso_liberado).
 */
export function recursoLiberado(
  situacao: Pick<
    SituacaoComercial,
    'situacao' | 'somenteLeitura' | 'orcamentosLiberados' | 'planoVigente'
  >,
  recurso: RecursoDoPlano | 'orcamentos' | 'ia',
  catalogo: CatalogoComercial = CATALOGO_PADRAO,
): boolean {
  if (situacao.somenteLeitura) return false
  if (
    situacao.situacao === 'interna' ||
    situacao.situacao === 'beta' ||
    situacao.situacao === 'teste'
  )
    return true
  if (recurso === 'orcamentos') return situacao.orcamentosLiberados
  if (situacao.planoVigente === null) return false
  const plano = catalogo.planos[situacao.planoVigente]
  return recurso === 'ia' ? plano.ia : plano.recursos.includes(recurso)
}
