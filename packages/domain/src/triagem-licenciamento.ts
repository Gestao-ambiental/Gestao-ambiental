// Triagem de licenciamento ambiental em Santa Catarina (enquadramento), pela Resolução CONSEMA
// 250/2024 consolidada até a 314/2026 (docs/estudos/triagem-licenciamento-consema-250.md).
//
// Mesma pergunta que o Simulador de Licenciamento do IMA responde: dada a atividade (código do
// Anexo VI) e o parâmetro técnico (Anexo VII), qual é o porte, a modalidade (trifásica, AuA, LAC)
// e o estudo ambiental (RAP, EAS, EIA). Aqui a lógica sai do texto da resolução, não do simulador.
//
// O resultado é uma triagem para orientar a proposta, não um enquadramento oficial: quem enquadra
// é o órgão licenciador. A interface diz isso em toda resposta.

export type Potencial = 'P' | 'M' | 'G'
export type Porte = 'minimo' | 'pequeno' | 'medio' | 'grande' | 'unico'
export type EstudoAmbiental = 'RAP' | 'EAS' | 'EIA'
/** Art. 9º: trifásica (LAP, LAI e LAO) ou simplificada (AuA). "LAO" = só LAO, quando o item diz. */
export type Modalidade = 'trifasica' | 'AuA' | 'LAO'

/** Uma condição sobre um parâmetro técnico: min (<|≤) valor (<|≤) max. Limite nulo = aberto. */
export interface CondicaoDePorte {
  parametro: string
  min: number | null
  minIncl: boolean
  max: number | null
  maxIncl: boolean
}

export interface FaixaDePorte {
  porte: Porte
  /** Alternativas ("AU(1) ≤ 80 ou PM ≤ 2.000"); vazia no porte único. */
  condicoes: readonly CondicaoDePorte[]
  /** Nulo = sem estudo indicado (Art. 22: dispensa de estudo). */
  estudo: EstudoAmbiental | null
  /** Texto que acompanha o estudo, por exemplo "ou EIA, se AI ≥ 100". */
  ressalvaDoEstudo: string | null
  modalidade: Modalidade
  /** A linha da resolução, para mostrar a fonte junto do resultado. */
  textoOriginal: string
}

export interface AtividadeLicenciavel {
  codigo: string
  grupo: string
  descricao: string
  potencial: {
    ar: Potencial | null
    agua: Potencial | null
    solo: Potencial | null
    geral: Potencial
  }
  faixas: readonly FaixaDePorte[]
  /** Observações do item (em geral a possibilidade de LAC), transcritas. */
  observacoes: readonly string[]
  /** Resolução que deu a redação atual do item, quando não é a 250/2024 original. */
  redacaoDada: string | null
}

export interface CatalogoDeAtividades {
  fonte: string
  atividades: readonly AtividadeLicenciavel[]
  /** Anexo VII: sigla do parâmetro técnico → descrição com unidade. */
  parametros: Readonly<Record<string, string>>
}

export const ROTULO_DO_PORTE: Record<Porte, string> = {
  minimo: 'Mínimo',
  pequeno: 'Pequeno',
  medio: 'Médio',
  grande: 'Grande',
  unico: 'Único',
}

export const ROTULO_DO_ESTUDO: Record<EstudoAmbiental, string> = {
  RAP: 'RAP (Relatório Ambiental Prévio)',
  EAS: 'EAS (Estudo Ambiental Simplificado)',
  EIA: 'EIA/RIMA (Estudo de Impacto Ambiental)',
}

export const ROTULO_DA_MODALIDADE: Record<Modalidade, string> = {
  trifasica: 'Licenciamento trifásico (LAP, LAI e LAO)',
  AuA: 'Autorização Ambiental (AuA)',
  LAO: 'Somente Licença Ambiental de Operação (LAO)',
}

const PESO_DO_ESTUDO: Record<EstudoAmbiental, number> = { RAP: 1, EAS: 2, EIA: 3 }
const PESO_DO_PORTE: Record<Porte, number> = {
  minimo: 0,
  pequeno: 1,
  medio: 2,
  grande: 3,
  unico: 0,
}

/** Parâmetros técnicos que a atividade usa, na ordem em que aparecem nas faixas. */
export function parametrosDaAtividade(atividade: AtividadeLicenciavel): string[] {
  const vistos: string[] = []
  for (const faixa of atividade.faixas) {
    for (const c of faixa.condicoes) if (!vistos.includes(c.parametro)) vistos.push(c.parametro)
  }
  return vistos
}

export function atendeCondicao(c: CondicaoDePorte, valor: number): boolean {
  if (c.min !== null && (c.minIncl ? valor < c.min : valor <= c.min)) return false
  if (c.max !== null && (c.maxIncl ? valor > c.max : valor >= c.max)) return false
  return true
}

/** Menor valor licenciável do parâmetro (o limite inferior da primeira faixa), se houver. */
function limiteInferior(
  atividade: AtividadeLicenciavel,
  parametro: string,
): { valor: number; incluso: boolean } | null {
  let menor: { valor: number; incluso: boolean } | null = null
  for (const faixa of atividade.faixas) {
    for (const c of faixa.condicoes) {
      if (c.parametro !== parametro) continue
      if (c.min === null) return null // a primeira faixa começa em zero: tudo é licenciável
      if (menor === null || c.min < menor.valor) menor = { valor: c.min, incluso: c.minIncl }
    }
  }
  return menor
}

export type Medidas = Readonly<Record<string, number | null | undefined>>

export type ResultadoDoEnquadramento =
  | {
      tipo: 'enquadrada'
      faixa: FaixaDePorte
      /** Parâmetro que decidiu a faixa. */
      parametro: string | null
      avisos: string[]
    }
  | {
      /** Art. 14: abaixo do limite, cabe cadastro e Certidão de Conformidade Ambiental. */
      tipo: 'abaixo_do_limite'
      parametro: string
      limite: number
      avisos: string[]
    }
  | { tipo: 'falta_medida'; parametros: string[] }
  | { tipo: 'medida_invalida'; parametro: string }

function avisosDaAtividade(atividade: AtividadeLicenciavel, faixa: FaixaDePorte | null): string[] {
  const avisos: string[] = []
  if (faixa?.ressalvaDoEstudo) {
    avisos.push(`O estudo indicado tem ressalva na resolução: "${faixa.ressalvaDoEstudo}".`)
  }
  for (const obs of atividade.observacoes) avisos.push(obs)
  return avisos
}

/**
 * Enquadra uma atividade pelas medidas informadas (sigla do parâmetro → valor na unidade do
 * Anexo VII). Quando o item aceita mais de um parâmetro ("ou") e cada um cai num porte, vale o
 * maior porte, e o aviso diz isso: é a leitura conservadora, a confirmar com o órgão.
 */
export function enquadrarAtividade(
  atividade: AtividadeLicenciavel,
  medidas: Medidas,
): ResultadoDoEnquadramento {
  const parametros = parametrosDaAtividade(atividade)
  const unica = atividade.faixas.find((f) => f.porte === 'unico')
  if (unica || parametros.length === 0) {
    const faixa = unica ?? atividade.faixas[0]
    if (!faixa) return { tipo: 'falta_medida', parametros: [] }
    return {
      tipo: 'enquadrada',
      faixa,
      parametro: null,
      avisos: avisosDaAtividade(atividade, faixa),
    }
  }

  const informados: { parametro: string; valor: number }[] = []
  for (const p of parametros) {
    const v = medidas[p]
    if (v === null || v === undefined) continue
    if (!Number.isFinite(v) || v < 0) return { tipo: 'medida_invalida', parametro: p }
    informados.push({ parametro: p, valor: v })
  }
  if (informados.length === 0) return { tipo: 'falta_medida', parametros }

  const encontrados: { faixa: FaixaDePorte; parametro: string }[] = []
  const abaixo: { parametro: string; limite: number }[] = []
  for (const { parametro: p, valor } of informados) {
    const faixa = atividade.faixas.find((f) =>
      f.condicoes.some((c) => c.parametro === p && atendeCondicao(c, valor)),
    )
    if (faixa) {
      encontrados.push({ faixa, parametro: p })
      continue
    }
    const limite = limiteInferior(atividade, p)
    if (limite && (limite.incluso ? valor < limite.valor : valor <= limite.valor)) {
      abaixo.push({ parametro: p, limite: limite.valor })
    }
  }

  if (encontrados.length === 0) {
    const primeiro = abaixo[0]
    if (primeiro) {
      return {
        tipo: 'abaixo_do_limite',
        parametro: primeiro.parametro,
        limite: primeiro.limite,
        avisos: [],
      }
    }
    // Sem faixa nem limite inferior: o texto da resolução tem um buraco nesse valor.
    return { tipo: 'medida_invalida', parametro: informados[0]?.parametro ?? '' }
  }

  encontrados.sort((a, b) => PESO_DO_PORTE[b.faixa.porte] - PESO_DO_PORTE[a.faixa.porte])
  const escolhido = encontrados[0] as { faixa: FaixaDePorte; parametro: string }
  const avisos = avisosDaAtividade(atividade, escolhido.faixa)
  const portes = new Set(encontrados.map((e) => e.faixa.porte))
  if (portes.size > 1) {
    avisos.unshift(
      'Os parâmetros informados caem em portes diferentes. A triagem considerou o maior; confirme com o órgão licenciador.',
    )
  }
  return { tipo: 'enquadrada', faixa: escolhido.faixa, parametro: escolhido.parametro, avisos }
}

export interface ItemDaTriagem {
  atividade: AtividadeLicenciavel
  resultado: ResultadoDoEnquadramento
}

export interface ConclusaoDaTriagem {
  /** Há pelo menos uma atividade enquadrada e nenhuma pendente. */
  completa: boolean
  /** Art. 10, §1º: o estudo é o da atividade de maior complexidade. Nulo = dispensa (Art. 22). */
  estudo: EstudoAmbiental | null
  /** Atividade que define o estudo. */
  atividadeDoEstudo: string | null
  /** Trifásica se alguma atividade exige; AuA só se todas forem AuA. */
  modalidade: Modalidade | null
  /** Códigos abaixo do limite (Art. 14): cadastro e Certidão de Conformidade Ambiental. */
  abaixoDoLimite: string[]
  /** Códigos sem medida ou com medida inválida. */
  pendentes: string[]
  /** Maior potencial poluidor geral entre as atividades enquadradas. */
  potencialGeral: Potencial | null
  /** Pode-se avaliar LAC: todas as enquadradas trazem a observação de LAC no item. */
  podeAvaliarLac: boolean
}

const PESO_DO_POTENCIAL: Record<Potencial, number> = { P: 1, M: 2, G: 3 }

/** Consolida a triagem de um empreendimento com várias atividades (Art. 10). */
export function concluirTriagem(itens: readonly ItemDaTriagem[]): ConclusaoDaTriagem {
  const enquadrados = itens.filter(
    (i): i is ItemDaTriagem & { resultado: { tipo: 'enquadrada' } } =>
      i.resultado.tipo === 'enquadrada',
  )
  const abaixoDoLimite = itens
    .filter((i) => i.resultado.tipo === 'abaixo_do_limite')
    .map((i) => i.atividade.codigo)
  const pendentes = itens
    .filter((i) => i.resultado.tipo === 'falta_medida' || i.resultado.tipo === 'medida_invalida')
    .map((i) => i.atividade.codigo)

  let estudo: EstudoAmbiental | null = null
  let atividadeDoEstudo: string | null = null
  let potencialGeral: Potencial | null = null
  for (const i of enquadrados) {
    const e = i.resultado.faixa.estudo
    if (e && (estudo === null || PESO_DO_ESTUDO[e] > PESO_DO_ESTUDO[estudo])) {
      estudo = e
      atividadeDoEstudo = i.atividade.codigo
    }
    const p = i.atividade.potencial.geral
    if (potencialGeral === null || PESO_DO_POTENCIAL[p] > PESO_DO_POTENCIAL[potencialGeral]) {
      potencialGeral = p
    }
  }

  let modalidade: Modalidade | null = null
  if (enquadrados.length > 0) {
    const modalidades = new Set(enquadrados.map((i) => i.resultado.faixa.modalidade))
    modalidade = modalidades.has('trifasica') ? 'trifasica' : modalidades.has('LAO') ? 'LAO' : 'AuA'
  }

  const podeAvaliarLac =
    enquadrados.length > 0 &&
    enquadrados.every((i) =>
      i.atividade.observacoes.some((o) => /Compromisso\s*[–—-]\s*LAC/.test(o)),
    )

  return {
    completa: enquadrados.length > 0 && pendentes.length === 0,
    estudo,
    atividadeDoEstudo,
    modalidade,
    abaixoDoLimite,
    pendentes,
    potencialGeral,
    podeAvaliarLac,
  }
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Busca por código ("26.50", "2650") ou por palavras da descrição, sem acento. */
export function buscarAtividades(
  catalogo: readonly AtividadeLicenciavel[],
  termo: string,
  limite = 20,
): AtividadeLicenciavel[] {
  const t = semAcento(termo.trim())
  if (!t) return []
  const soDigitos = t.replace(/[.\s-]/g, '')
  if (/^\d+$/.test(soDigitos)) {
    return catalogo
      .filter((a) => a.codigo.replace(/\./g, '').startsWith(soDigitos))
      .slice(0, limite)
  }
  const palavras = t.split(/\s+/).filter(Boolean)
  return catalogo
    .filter((a) => {
      const alvo = semAcento(`${a.descricao} ${a.grupo}`)
      return palavras.every((p) => alvo.includes(p))
    })
    .slice(0, limite)
}

/** "≤ 0,2", "0,2 < x < 1", "≥ 1": a faixa escrita como na resolução, com a sigla. */
export function descreverCondicao(c: CondicaoDePorte): string {
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  if (c.min !== null && c.max !== null) {
    return `${n(c.min)} ${c.minIncl ? '≤' : '<'} ${c.parametro} ${c.maxIncl ? '≤' : '<'} ${n(c.max)}`
  }
  if (c.max !== null) return `${c.parametro} ${c.maxIncl ? '≤' : '<'} ${n(c.max)}`
  if (c.min !== null) return `${c.parametro} ${c.minIncl ? '≥' : '>'} ${n(c.min)}`
  return c.parametro
}

/**
 * Lê o número digitado como no Brasil: "1.234,5", "0,2", "48.000" (milhar) ou "0.2" (ponto como
 * decimal quando não tem cara de milhar). Vazio → null; texto que não é número → NaN.
 */
export function lerNumeroDigitado(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '')
  if (!t) return null
  let normal: string
  if (t.includes(',')) {
    normal = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, '')
  } else {
    normal = t
  }
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN
}
