// Regras puras da extração por IA (IA-01, IA-04): prompt versionado, schema da resposta, validação e
// normalização da proposta. Sem rede, sem Supabase, sem Deno: testado com `deno test`.
// A proposta validada é só rascunho; quem decide é a Gestão (ADR-0006).

export const VERSAO_PROMPT = 'licenca-v1'
export const MODELO_PADRAO = 'openai/gpt-4.1-mini'
export const LIMITE_PDF_BYTES = 10 * 1024 * 1024
export const LIMITE_ITENS = 300
export const LIMITE_TEMPO_MS = 110_000

export const NATUREZAS = [
  'obrigacao',
  'agrupador',
  'informacao_geral',
  'condicao_continua',
] as const
export type Natureza = (typeof NATUREZAS)[number]

export const CAMPOS_DE_DATA = [
  'emitido_em',
  'assinado_em',
  'publicado_em',
  'recebido_em',
  'validade',
] as const
export type CampoDeData = (typeof CAMPOS_DE_DATA)[number]

export interface CampoProposto {
  valor: string | null
  pagina: number | null
}
export interface DataProposta extends CampoProposto {
  /** Como a data está escrita no documento (ADR-0009). */
  texto: string | null
}

export interface CondicionanteProposta {
  codigo: string
  pai_codigo: string | null
  titulo: string
  texto_literal: string
  natureza: Natureza
  pagina: number | null
  periodicidade: string | null
}

export interface Proposta {
  identificacao: {
    tipo: CampoProposto
    numero: CampoProposto
    orgao: CampoProposto
  } & Record<CampoDeData, DataProposta>
  condicionantes: CondicionanteProposta[]
}

export type MotivoDeFalha =
  | 'pdf_sem_texto'
  | 'pdf_grande_demais'
  | 'provedor_indisponivel'
  | 'tempo_esgotado'
  | 'resposta_invalida'
  | 'configuracao_ausente'
  | 'erro_interno'

export const PROMPT_SISTEMA = `Você lê licenças ambientais brasileiras (LAO, LAP, LAI, AuA e outras) e devolve um rascunho estruturado para uma pessoa revisar.

Regras obrigatórias:
- Use só o que está escrito no documento. Nunca invente, deduza ou complete dado ausente: o que não constar fica null.
- Datas: "valor" em aaaa-mm-dd, só quando o dia, o mês e o ano estiverem escritos; "texto" é a data exatamente como aparece. Não calcule datas (ex.: "4 anos a partir da emissão" fica com valor null e o trecho em "texto").
- "pagina" é o número da página indicada no marcador "=== Página N ===" onde o dado aparece.
- "tipo": a sigla do tipo de instrumento, escolhida entre as siglas informadas; se nenhuma servir, null.
- Condicionantes: cada item numerado das condicionantes, na ordem do documento, com o código original ("4.2", "IV", "a"), o texto literal completo copiado sem resumir nem corrigir, e um título curto (até 80 caracteres) que descreva o item.
- "pai_codigo": o código do item que agrupa este (ex.: "4.2" dentro de "4"), ou null.
- "natureza":
  - "obrigacao": exige uma entrega ou ação com prazo ou periodicidade (relatório, laudo, análise, comunicação).
  - "agrupador": só um título que reúne subitens.
  - "informacao_geral": contexto ou cláusula geral (suspensão, cancelamento, referência a norma).
  - "condicao_continua": algo a manter o tempo todo ("manter", "respeitar os limites"), sem entrega periódica.
  Cláusula geral nunca vira obrigação só por estar no documento.
- "periodicidade": a frequência como escrita ("semestral", "a cada 90 dias", "anualmente"), ou null.
- No máximo ${String(LIMITE_ITENS)} condicionantes.`

/** Mensagem do usuário: siglas da consultoria e o texto do PDF com o marcador de página. */
export function mensagemDoUsuario(paginas: readonly string[], tipos: readonly string[]): string {
  const corpo = paginas
    .map((texto, indice) => `=== Página ${String(indice + 1)} ===\n${texto.trim()}`)
    .join('\n\n')
  return `Siglas de tipo de instrumento aceitas: ${tipos.length > 0 ? tipos.join(', ') : '(nenhuma)'}.\n\nDocumento:\n\n${corpo}`
}

/** PDF escaneado (imagem) não tem texto para ler: média de menos de 40 caracteres visíveis por página. */
export function pdfTemTexto(paginas: readonly string[]): boolean {
  if (paginas.length === 0) return false
  const visiveis = paginas.reduce((soma, texto) => soma + texto.replace(/\s/g, '').length, 0)
  return visiveis / paginas.length >= 40
}

/** Custo em dólares (frações de centavo) para milionésimos inteiros; ausente fica nulo. */
export function custoEmMicros(custoUsd: unknown): number | null {
  return typeof custoUsd === 'number' && Number.isFinite(custoUsd) && custoUsd >= 0
    ? Math.round(custoUsd * 1_000_000)
    : null
}

const campo = {
  type: 'object',
  additionalProperties: false,
  required: ['valor', 'pagina'],
  properties: { valor: { type: ['string', 'null'] }, pagina: { type: ['integer', 'null'] } },
}
const data = {
  type: 'object',
  additionalProperties: false,
  required: ['valor', 'texto', 'pagina'],
  properties: {
    valor: { type: ['string', 'null'] },
    texto: { type: ['string', 'null'] },
    pagina: { type: ['integer', 'null'] },
  },
}

/** JSON Schema (modo estrito) pedido ao provedor. A validação abaixo confere de novo. */
export const SCHEMA_DA_RESPOSTA = {
  type: 'object',
  additionalProperties: false,
  required: ['identificacao', 'condicionantes'],
  properties: {
    identificacao: {
      type: 'object',
      additionalProperties: false,
      required: ['tipo', 'numero', 'orgao', ...CAMPOS_DE_DATA],
      properties: {
        tipo: campo,
        numero: campo,
        orgao: campo,
        ...Object.fromEntries(CAMPOS_DE_DATA.map((nome) => [nome, data])),
      },
    },
    condicionantes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'codigo',
          'pai_codigo',
          'titulo',
          'texto_literal',
          'natureza',
          'pagina',
          'periodicidade',
        ],
        properties: {
          codigo: { type: 'string' },
          pai_codigo: { type: ['string', 'null'] },
          titulo: { type: 'string' },
          texto_literal: { type: 'string' },
          natureza: { type: 'string', enum: [...NATUREZAS] },
          pagina: { type: ['integer', 'null'] },
          periodicidade: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function texto(valor: unknown, maximo = 20_000): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo.slice(0, maximo)
}

function pagina(valor: unknown, total: number): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= total
    ? valor
    : null
}

/** Data civil válida (aaaa-mm-dd que existe no calendário); o resto vira nulo. */
export function dataValida(valor: unknown): string | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number]
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
    ? valor
    : null
}

/**
 * Valida e normaliza a resposta do provedor. Formato errado, natureza fora da lista ou mais de 300
 * itens: resposta inválida (nada é gravado). Campo ausente, data inexistente, página fora do PDF e
 * sigla que não é da consultoria viram nulo — nunca um valor inventado.
 */
export function validarProposta(
  bruto: unknown,
  contexto: { totalPaginas: number; tipos: readonly string[] },
): Proposta | null {
  const raiz = objeto(bruto)
  const ident = objeto(raiz?.identificacao)
  const lista = raiz?.condicionantes
  if (!raiz || !ident || !Array.isArray(lista) || lista.length > LIMITE_ITENS) return null

  const simples = (nome: string): CampoProposto => {
    const c = objeto(ident[nome])
    return { valor: texto(c?.valor, 300), pagina: pagina(c?.pagina, contexto.totalPaginas) }
  }
  const datas = Object.fromEntries(
    CAMPOS_DE_DATA.map((nome) => {
      const c = objeto(ident[nome])
      return [
        nome,
        {
          valor: dataValida(c?.valor),
          texto: texto(c?.texto, 300),
          pagina: pagina(c?.pagina, contexto.totalPaginas),
        },
      ]
    }),
  ) as Record<CampoDeData, DataProposta>

  const tipoBruto = simples('tipo')
  const sigla =
    contexto.tipos.find((t) => t.toUpperCase() === tipoBruto.valor?.toUpperCase()) ?? null

  const condicionantes: CondicionanteProposta[] = []
  for (const item of lista) {
    const c = objeto(item)
    if (!c) return null
    const natureza = c.natureza
    if (typeof natureza !== 'string' || !(NATUREZAS as readonly string[]).includes(natureza))
      return null
    const literal = typeof c.texto_literal === 'string' ? c.texto_literal.trim() : ''
    const titulo = texto(c.titulo, 200) ?? ''
    if (literal === '' && titulo === '') continue
    condicionantes.push({
      codigo: texto(c.codigo, 40) ?? '',
      pai_codigo: texto(c.pai_codigo, 40),
      titulo,
      texto_literal: literal.slice(0, 20_000),
      natureza: natureza as Natureza,
      pagina: pagina(c.pagina, contexto.totalPaginas),
      periodicidade: texto(c.periodicidade, 120),
    })
  }

  return {
    identificacao: {
      tipo: { valor: sigla, pagina: sigla ? tipoBruto.pagina : null },
      numero: simples('numero'),
      orgao: simples('orgao'),
      ...datas,
    },
    condicionantes,
  }
}
