// Resíduos, fase 1 (sem integração com o IMA; docs/estudos/integracao-ima-mtr.md, seções 3b e 5).
// Protótipo para revisão.
//
// 1. Prazos das obrigações de resíduos do empreendimento (DMR trimestral, DMRSU mensal, Inventário
//    Nacional e RAPP do IBAMA). Os prazos nunca são gravados: saem daqui (e do espelho em SQL,
//    private.prazos_da_obrigacao_residuo, testado com os mesmos casos no pgTAP 470).
// 2. Conferência CDF x MTR: MTR sem CDF depois de DIAS_PARA_COBRAR_CDF e quantidade do CDF
//    diferente da do MTR (tolerância zero, item a item, com conversão só entre unidades do mesmo
//    tipo). Espelho em SQL: private.pendencias_de_residuo.
//
// Só datas civis (ADR-0009): nada de Date, então o fuso do aparelho não entra. "Hoje" vem de fora,
// já no fuso da consultoria.

import { nomeDoMes } from './calendario'
import { diferencaEmDias, ultimoDiaDoMes, type DataCivil } from './data-civil'

// ---------------------------------------------------------------------------
// Obrigações e prazos
// ---------------------------------------------------------------------------

export const TIPOS_DE_OBRIGACAO_RESIDUO = [
  'dmr_trimestral',
  'dmrsu_mensal',
  'inventario_nacional',
  'rapp_ibama',
] as const
export type TipoObrigacaoResiduo = (typeof TIPOS_DE_OBRIGACAO_RESIDUO)[number]

export const ROTULO_DA_OBRIGACAO_RESIDUO: Record<TipoObrigacaoResiduo, string> = {
  dmr_trimestral: 'DMR trimestral',
  dmrsu_mensal: 'DMRSU mensal',
  inventario_nacional: 'Inventário Nacional de Resíduos Sólidos',
  rapp_ibama: 'RAPP do IBAMA',
}

export function ehTipoObrigacaoResiduo(valor: unknown): valor is TipoObrigacaoResiduo {
  return (TIPOS_DE_OBRIGACAO_RESIDUO as readonly unknown[]).includes(valor)
}

export interface PrazoDeObrigacaoResiduo {
  tipo: TipoObrigacaoResiduo
  /** Período a que a entrega se refere: "3º trimestre de 2026", "outubro de 2026", "entrega de 2027". */
  referencia: string
  /** Primeiro dia da janela de entrega, quando a regra tem janela (DMR, DMRSU, RAPP). */
  inicio: DataCivil | null
  /** Último dia para entregar. */
  prazo: DataCivil
}

/** Primeiro ano da DMR trimestral (Portaria IMA 9/2026, art. 7º). Antes disso não há prazo aqui. */
export const ANO_INICIAL_DA_DMR_TRIMESTRAL = 2026

function data(ano: number, mes: number, dia: number): DataCivil {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` as DataCivil
}

function anoDe(dataCivil: DataCivil): number {
  return Number(dataCivil.slice(0, 4))
}

/** Janela "mês seguinte": do dia 1 ao último dia do mês (mês de 1 a 12, pode passar de 12). */
function mesSeguinte(ano: number, mes: number): { inicio: DataCivil; prazo: DataCivil } {
  const a = mes === 12 ? ano + 1 : ano
  const m = mes === 12 ? 1 : mes + 1
  return { inicio: data(a, m, 1), prazo: data(a, m, ultimoDiaDoMes(a, m)) }
}

function prazosDoAno(tipo: TipoObrigacaoResiduo, ano: number): PrazoDeObrigacaoResiduo[] {
  switch (tipo) {
    case 'dmr_trimestral': {
      if (ano < ANO_INICIAL_DA_DMR_TRIMESTRAL) return []
      const lista: PrazoDeObrigacaoResiduo[] = []
      if (ano === ANO_INICIAL_DA_DMR_TRIMESTRAL) {
        // Transição (art. 7º): a DMR do 1º semestre de 2026 vai no 3º trimestre de 2026.
        lista.push({
          tipo,
          referencia: '1º semestre de 2026',
          inicio: data(2026, 7, 1),
          prazo: data(2026, 9, 30),
        })
      }
      const primeiro = ano === ANO_INICIAL_DA_DMR_TRIMESTRAL ? 3 : 1
      for (let trimestre = primeiro; trimestre <= 4; trimestre += 1) {
        lista.push({
          tipo,
          referencia: `${String(trimestre)}º trimestre de ${String(ano)}`,
          ...mesSeguinte(ano, trimestre * 3),
        })
      }
      return lista
    }
    case 'dmrsu_mensal':
      return Array.from({ length: 12 }, (_, i) => ({
        tipo,
        referencia: `${nomeDoMes(i + 1)} de ${String(ano)}`,
        ...mesSeguinte(ano, i + 1),
      }))
    case 'inventario_nacional':
      return [
        { tipo, referencia: `entrega de ${String(ano)}`, inicio: null, prazo: data(ano, 3, 31) },
      ]
    case 'rapp_ibama':
      return [
        {
          tipo,
          referencia: `entrega de ${String(ano)}`,
          inicio: data(ano, 2, 1),
          prazo: data(ano, 3, 31),
        },
      ]
  }
}

/**
 * Prazos da obrigação com o último dia entre `de` e `ate` (inclusive), em ordem de prazo.
 * O período de referência da DMRSU e da DMR vem do ano anterior quando a entrega cai em janeiro.
 */
export function prazosDaObrigacaoResiduo(
  tipo: TipoObrigacaoResiduo,
  de: DataCivil,
  ate: DataCivil,
): PrazoDeObrigacaoResiduo[] {
  if (ate < de) return []
  const lista: PrazoDeObrigacaoResiduo[] = []
  for (let ano = anoDe(de) - 1; ano <= anoDe(ate); ano += 1) {
    for (const prazo of prazosDoAno(tipo, ano)) {
      if (prazo.prazo >= de && prazo.prazo <= ate) lista.push(prazo)
    }
  }
  return lista.sort((a, b) => (a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : 0))
}

/** Os próximos `quantidade` prazos com último dia hoje ou depois (hoje no fuso da consultoria). */
export function proximosPrazosDaObrigacaoResiduo(
  tipo: TipoObrigacaoResiduo,
  hoje: DataCivil,
  quantidade = 1,
): PrazoDeObrigacaoResiduo[] {
  const ate = data(anoDe(hoje) + 2, 12, 31)
  return prazosDaObrigacaoResiduo(tipo, hoje, ate).slice(0, Math.max(0, quantidade))
}

// ---------------------------------------------------------------------------
// MTR, unidades e quantidades
// ---------------------------------------------------------------------------

export const SITUACOES_DO_MTR = ['salvo', 'recebido', 'em_armazenamento', 'cancelado'] as const
export type SituacaoMtr = (typeof SITUACOES_DO_MTR)[number]

/** Situação do MTR no Sistema MTR do IMA, digitada pela equipe (fase 1 não consulta o IMA). */
export const ROTULO_DA_SITUACAO_DO_MTR: Record<SituacaoMtr, string> = {
  salvo: 'Salvo',
  recebido: 'Recebido',
  em_armazenamento: 'Em armazenamento temporário',
  cancelado: 'Cancelado',
}

export const UNIDADES_DE_RESIDUO = ['t', 'kg', 'm3', 'l', 'un'] as const
export type UnidadeResiduo = (typeof UNIDADES_DE_RESIDUO)[number]

export const ROTULO_DA_UNIDADE_DE_RESIDUO: Record<UnidadeResiduo, string> = {
  t: 't',
  kg: 'kg',
  m3: 'm³',
  l: 'L',
  un: 'un',
}

export function ehUnidadeResiduo(valor: unknown): valor is UnidadeResiduo {
  return (UNIDADES_DE_RESIDUO as readonly unknown[]).includes(valor)
}

export function ehSituacaoMtr(valor: unknown): valor is SituacaoMtr {
  return (SITUACOES_DO_MTR as readonly unknown[]).includes(valor)
}

type TipoDeUnidade = 'massa' | 'volume' | 'contagem'

const UNIDADE: Record<UnidadeResiduo, { tipo: TipoDeUnidade; fator: number }> = {
  t: { tipo: 'massa', fator: 1000 },
  kg: { tipo: 'massa', fator: 1 },
  m3: { tipo: 'volume', fator: 1000 },
  l: { tipo: 'volume', fator: 1 },
  un: { tipo: 'contagem', fator: 1 },
}

/** Casas decimais aceitas na quantidade (o banco confere a mesma escala). */
export const CASAS_DA_QUANTIDADE = 4
/** Quantidade máxima por item (o banco confere o mesmo limite). */
export const QUANTIDADE_MAXIMA_RESIDUO = 99_999_999

/** t e kg são massa; m³ e L são volume; un só com un. */
export function mesmoTipoDeUnidade(a: UnidadeResiduo, b: UnidadeResiduo): boolean {
  return UNIDADE[a].tipo === UNIDADE[b].tipo
}

/**
 * Unidade em que o painel soma: massa em t, volume em m³ e unidades em un. Assim kg e t do mesmo
 * resíduo viram uma linha só.
 */
export function unidadeDoPainel(unidade: UnidadeResiduo): UnidadeResiduo {
  const tipo = UNIDADE[unidade].tipo
  return tipo === 'massa' ? 't' : tipo === 'volume' ? 'm3' : 'un'
}

// Inteiro em 1/10.000 da unidade base (kg, L ou un). Com no máximo 4 casas e o limite de
// QUANTIDADE_MAXIMA_RESIDUO, cabe em Number.MAX_SAFE_INTEGER e a comparação é exata.
function emInteiro(quantidade: number, unidade: UnidadeResiduo): number {
  return Math.round(quantidade * 10 ** CASAS_DA_QUANTIDADE) * UNIDADE[unidade].fator
}

function deInteiro(valor: number, unidade: UnidadeResiduo): number {
  return valor / UNIDADE[unidade].fator / 10 ** CASAS_DA_QUANTIDADE
}

/** Converte entre unidades do mesmo tipo (t↔kg, m³↔L). Tipos diferentes: nulo. */
export function converterQuantidade(
  quantidade: number,
  de: UnidadeResiduo,
  para: UnidadeResiduo,
): number | null {
  if (!mesmoTipoDeUnidade(de, para)) return null
  return deInteiro(emInteiro(quantidade, de), para)
}

/** Quantidade válida para gravar: maior que zero, até 4 casas e até o limite. */
export function quantidadeValida(quantidade: number): boolean {
  return (
    Number.isFinite(quantidade) &&
    quantidade > 0 &&
    quantidade <= QUANTIDADE_MAXIMA_RESIDUO &&
    Math.abs(
      quantidade * 10 ** CASAS_DA_QUANTIDADE - Math.round(quantidade * 10 ** CASAS_DA_QUANTIDADE),
    ) < 1e-6
  )
}

/**
 * Lê a quantidade digitada no formato brasileiro ("1.234,5" ou "0,25"). Nulo se não for número
 * válido para gravar (zero, negativo, mais de 4 casas ou acima do limite).
 */
export function lerQuantidade(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(limpo)) return null
  const numero = Number(limpo.replace(/\./g, '').replace(',', '.'))
  return quantidadeValida(numero) ? numero : null
}

/** "1.234,5 t", "0,25 m³". Até 4 casas, sem zeros à direita. */
export function formatarQuantidade(quantidade: number, unidade: UnidadeResiduo): string {
  const numero = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: CASAS_DA_QUANTIDADE,
  }).format(quantidade)
  return `${numero} ${ROTULO_DA_UNIDADE_DE_RESIDUO[unidade]}`
}

// ---------------------------------------------------------------------------
// Conferência CDF x MTR
// ---------------------------------------------------------------------------

/** MTR salvo ou recebido há mais que isso (em dias corridos desde a emissão) sem CDF vira pendência. */
export const DIAS_PARA_COBRAR_CDF = 30

export interface RecebidoNoCdf {
  cdfId: string
  quantidade: number
  unidade: UnidadeResiduo
}

export interface ItemParaConferir {
  id: string
  residuoCodigo: string
  residuoDescricao: string
  quantidade: number
  unidade: UnidadeResiduo
  /** Quantidades informadas nos CDFs que cobrem este item (só as informadas). */
  recebido: RecebidoNoCdf[]
}

export interface MtrParaConferir {
  id: string
  numero: string
  emitidoEm: DataCivil
  situacao: SituacaoMtr
  /** CDFs (não excluídos) que cobrem o MTR, com ou sem quantidade. */
  cdfIds: string[]
  itens: ItemParaConferir[]
}

interface PendenciaDoItem {
  mtrId: string
  numero: string
  itemId: string
  residuoCodigo: string
  residuoDescricao: string
  cdfIds: string[]
}

export type PendenciaDeResiduo =
  | {
      tipo: 'mtr_sem_cdf'
      mtrId: string
      numero: string
      emitidoEm: DataCivil
      /** Dias corridos desde a emissão. */
      dias: number
    }
  | (PendenciaDoItem & {
      tipo: 'quantidade_diferente'
      unidade: UnidadeResiduo
      quantidadeMtr: number
      /** Soma do que os CDFs informam, na unidade do item do MTR. */
      quantidadeCdf: number
      /** quantidadeCdf − quantidadeMtr. */
      diferenca: number
    })
  | (PendenciaDoItem & {
      tipo: 'unidades_diferentes'
      unidadeMtr: UnidadeResiduo
      unidadesCdf: UnidadeResiduo[]
    })

export const ROTULO_DA_PENDENCIA_DE_RESIDUO: Record<PendenciaDeResiduo['tipo'], string> = {
  mtr_sem_cdf: 'MTR sem CDF',
  quantidade_diferente: 'Quantidade diferente',
  unidades_diferentes: 'Unidades diferentes',
}

/**
 * Pendências da conferência CDF x MTR, em ordem de emissão do MTR.
 * - MTR cancelado não entra.
 * - "MTR sem CDF": salvo ou recebido, nenhum CDF e mais de DIAS_PARA_COBRAR_CDF dias desde a emissão.
 * - Por item: soma o que os CDFs informam (só quando informam) e compara com o MTR, tolerância zero.
 *   Converte t↔kg e m³↔L; se alguma unidade for de outro tipo, a pendência é "unidades diferentes".
 */
export function conferirCdfMtr(
  mtrs: readonly MtrParaConferir[],
  hoje: DataCivil,
): PendenciaDeResiduo[] {
  const ordenados = [...mtrs].sort((a, b) =>
    a.emitidoEm !== b.emitidoEm
      ? a.emitidoEm < b.emitidoEm
        ? -1
        : 1
      : a.numero.localeCompare(b.numero),
  )
  const pendencias: PendenciaDeResiduo[] = []
  for (const mtr of ordenados) {
    if (mtr.situacao === 'cancelado') continue
    const dias = diferencaEmDias(hoje, mtr.emitidoEm)
    if (
      mtr.cdfIds.length === 0 &&
      (mtr.situacao === 'salvo' || mtr.situacao === 'recebido') &&
      dias > DIAS_PARA_COBRAR_CDF
    ) {
      pendencias.push({
        tipo: 'mtr_sem_cdf',
        mtrId: mtr.id,
        numero: mtr.numero,
        emitidoEm: mtr.emitidoEm,
        dias,
      })
    }
    for (const item of mtr.itens) {
      if (item.recebido.length === 0) continue
      const base: PendenciaDoItem = {
        mtrId: mtr.id,
        numero: mtr.numero,
        itemId: item.id,
        residuoCodigo: item.residuoCodigo,
        residuoDescricao: item.residuoDescricao,
        cdfIds: [...new Set(item.recebido.map((r) => r.cdfId))],
      }
      if (item.recebido.some((r) => !mesmoTipoDeUnidade(r.unidade, item.unidade))) {
        pendencias.push({
          ...base,
          tipo: 'unidades_diferentes',
          unidadeMtr: item.unidade,
          unidadesCdf: [...new Set(item.recebido.map((r) => r.unidade))],
        })
        continue
      }
      const noMtr = emInteiro(item.quantidade, item.unidade)
      const noCdf = item.recebido.reduce((soma, r) => soma + emInteiro(r.quantidade, r.unidade), 0)
      if (noCdf !== noMtr) {
        pendencias.push({
          ...base,
          tipo: 'quantidade_diferente',
          unidade: item.unidade,
          quantidadeMtr: item.quantidade,
          quantidadeCdf: deInteiro(noCdf, item.unidade),
          diferenca: deInteiro(noCdf - noMtr, item.unidade),
        })
      }
    }
  }
  return pendencias
}
