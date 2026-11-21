// Modelo de documento da consultoria (ADR-0036): texto padrão com campos que puxam dados do
// empreendimento, da licença e da condicionante. O conteúdo é a árvore do editor (formato JSON do
// ProseMirror/TipTap). Um campo é o nó inline `campo` com attrs.chave; preencher troca cada campo
// pelo valor, ou por "[Rótulo]" quando o cadastro não tem o dado. Um bloco repetível (nó
// `bloco_repetido`, ADR-0052) repete o seu conteúdo para cada item de uma lista (licenças, entregas
// do mês…); dentro dele, o nó `campo_do_item` puxa um dado do item.
import { formatarCnpj } from './cnpj'
import { ehDataCivil, formatarDataCivil } from './data-civil'

export interface MarcaDoTexto {
  type: string
  attrs?: Record<string, unknown>
}

export interface NoDoDocumento {
  type: string
  attrs?: Record<string, unknown>
  content?: NoDoDocumento[]
  text?: string
  marks?: MarcaDoTexto[]
}

export const GRUPOS_DE_CAMPO = ['Empreendimento', 'Licença', 'Condicionante', 'Relatório'] as const
export type GrupoDeCampo = (typeof GRUPOS_DE_CAMPO)[number]

export const CAMPOS_DO_MODELO = [
  { chave: 'empreendimento.nome', rotulo: 'Nome do empreendimento', grupo: 'Empreendimento' },
  { chave: 'empreendimento.cliente', rotulo: 'Cliente', grupo: 'Empreendimento' },
  { chave: 'empreendimento.cnpj', rotulo: 'CNPJ', grupo: 'Empreendimento' },
  { chave: 'empreendimento.unidade', rotulo: 'Unidade', grupo: 'Empreendimento' },
  { chave: 'empreendimento.endereco', rotulo: 'Endereço da unidade', grupo: 'Empreendimento' },
  { chave: 'licenca.tipo', rotulo: 'Tipo da licença', grupo: 'Licença' },
  { chave: 'licenca.numero', rotulo: 'Número da licença', grupo: 'Licença' },
  { chave: 'licenca.orgao', rotulo: 'Órgão emissor', grupo: 'Licença' },
  { chave: 'licenca.emissao', rotulo: 'Emissão da licença', grupo: 'Licença' },
  { chave: 'licenca.validade', rotulo: 'Validade da licença', grupo: 'Licença' },
  { chave: 'condicionante.codigo', rotulo: 'Código da condicionante', grupo: 'Condicionante' },
  { chave: 'condicionante.titulo', rotulo: 'Título da condicionante', grupo: 'Condicionante' },
  { chave: 'condicionante.texto', rotulo: 'Texto da condicionante', grupo: 'Condicionante' },
  { chave: 'condicionante.prazo', rotulo: 'Prazo da entrega', grupo: 'Condicionante' },
  {
    chave: 'condicionante.responsavel',
    rotulo: 'Responsável pela entrega',
    grupo: 'Condicionante',
  },
  { chave: 'relatorio.consultoria', rotulo: 'Nome da consultoria', grupo: 'Relatório' },
  { chave: 'relatorio.autor', rotulo: 'Quem gerou', grupo: 'Relatório' },
  { chave: 'relatorio.data', rotulo: 'Data de hoje', grupo: 'Relatório' },
  { chave: 'relatorio.mes', rotulo: 'Mês do relatório', grupo: 'Relatório' },
] as const satisfies readonly { chave: string; rotulo: string; grupo: GrupoDeCampo }[]

export type ChaveDoCampo = (typeof CAMPOS_DO_MODELO)[number]['chave']
export type ValoresDosCampos = Partial<Record<ChaveDoCampo, string>>

const ROTULOS = new Map<string, string>(CAMPOS_DO_MODELO.map((c) => [c.chave, c.rotulo]))

export function ehChaveDoCampo(chave: unknown): chave is ChaveDoCampo {
  return typeof chave === 'string' && ROTULOS.has(chave)
}

export function rotuloDoCampo(chave: string): string {
  return ROTULOS.get(chave) ?? chave
}

/** Listas que um bloco repetível percorre, com os dados de cada item. */
export const LISTAS_DO_MODELO = [
  { chave: 'licencas', rotulo: 'Licenças e validades', campos: ['titulo', 'orgao', 'validade'] },
  { chave: 'entregas', rotulo: 'Entregas do mês', campos: ['codigo', 'titulo', 'licenca', 'data'] },
  {
    chave: 'protocolos',
    rotulo: 'Protocolos e respostas a exigências',
    campos: ['data', 'titulo', 'detalhe'],
  },
  {
    chave: 'proximos',
    rotulo: 'Próximos 90 dias',
    campos: ['data', 'codigo', 'titulo', 'licenca'],
  },
] as const satisfies readonly { chave: string; rotulo: string; campos: readonly string[] }[]

export type ChaveDaLista = (typeof LISTAS_DO_MODELO)[number]['chave']
/** Um item da lista, já formatado (datas dd/mm/aaaa). Campo ausente sai como "—". */
export type ItemDoBloco = Readonly<Record<string, string | undefined>>
export type ListasDoModelo = Partial<Record<ChaveDaLista, readonly ItemDoBloco[]>>

const CAMPOS_DA_LISTA = new Map<string, readonly string[]>(
  LISTAS_DO_MODELO.map((l) => [l.chave, l.campos]),
)

export function ehChaveDaLista(chave: unknown): chave is ChaveDaLista {
  return typeof chave === 'string' && CAMPOS_DA_LISTA.has(chave)
}

/** Texto que fica no lugar de um campo sem valor: a pessoa vê o que falta preencher. */
export function marcadorSemValor(chave: string): string {
  return `[${rotuloDoCampo(chave)}]`
}

/** Documento vazio do editor: um parágrafo. */
export function documentoVazio(): NoDoDocumento {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** Limite de tamanho do conteúdo (caracteres do JSON), igual ao do banco. */
export const LIMITE_DO_CONTEUDO = 500_000

export type ProblemaDoConteudo = 'formato' | 'grande_demais' | 'campo_desconhecido'

function percorrer(no: NoDoDocumento, visitar: (no: NoDoDocumento) => void): void {
  visitar(no)
  for (const filho of no.content ?? []) percorrer(filho, visitar)
}

function algum(no: NoDoDocumento, teste: (no: NoDoDocumento) => boolean): boolean {
  return teste(no) || (no.content ?? []).some((filho) => algum(filho, teste))
}

function ehNo(valor: unknown): valor is NoDoDocumento {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false
  const no = valor as Record<string, unknown>
  if (typeof no.type !== 'string') return false
  if (no.content !== undefined && (!Array.isArray(no.content) || !no.content.every(ehNo)))
    return false
  if (no.text !== undefined && typeof no.text !== 'string') return false
  return true
}

/** Confere o conteúdo antes de salvar: raiz `doc`, árvore válida, tamanho e campos conhecidos. */
export function problemaDoConteudo(conteudo: unknown): ProblemaDoConteudo | null {
  if (!ehNo(conteudo) || conteudo.type !== 'doc') return 'formato'
  if (JSON.stringify(conteudo).length > LIMITE_DO_CONTEUDO) return 'grande_demais'
  if (algum(conteudo, (no) => no.type === 'campo' && !ehChaveDoCampo(no.attrs?.chave))) {
    return 'campo_desconhecido'
  }
  return blocoComProblema(conteudo, null) ? 'campo_desconhecido' : null
}

/** Bloco de lista desconhecida, bloco dentro de bloco ou campo do item que a lista não tem. */
function blocoComProblema(no: NoDoDocumento, lista: string | null): boolean {
  if (no.type === 'bloco_repetido') {
    const chave = no.attrs?.lista
    if (lista !== null || !ehChaveDaLista(chave)) return true
    return (no.content ?? []).some((filho) => blocoComProblema(filho, chave))
  }
  if (no.type === 'campo_do_item') {
    const campos = lista === null ? undefined : CAMPOS_DA_LISTA.get(lista)
    const chave = no.attrs?.chave
    return typeof chave !== 'string' || !campos?.includes(chave)
  }
  return (no.content ?? []).some((filho) => blocoComProblema(filho, lista))
}

/** Chaves dos campos usados no modelo, na ordem em que aparecem, sem repetir. */
export function camposUsados(conteudo: NoDoDocumento): ChaveDoCampo[] {
  const vistos: ChaveDoCampo[] = []
  percorrer(conteudo, (no) => {
    const chave = no.attrs?.chave
    if (no.type === 'campo' && ehChaveDoCampo(chave) && !vistos.includes(chave)) vistos.push(chave)
  })
  return vistos
}

export interface ModeloPreenchido {
  documento: NoDoDocumento
  /** Campos do modelo que ficaram sem valor (saem como "[Rótulo]"). */
  semValor: ChaveDoCampo[]
}

/** Texto de um bloco repetível sem itens, quando o bloco não traz o seu (attrs.vazio). */
export const BLOCO_SEM_ITENS = 'Nada no período.'

/**
 * Troca cada campo pelo valor (texto com as mesmas marcas) e repete cada bloco para os itens da
 * lista dele. Bloco sem itens vira um parágrafo com `attrs.vazio`. Não altera o conteúdo recebido.
 */
export function preencherModelo(
  conteudo: NoDoDocumento,
  valores: ValoresDosCampos,
  listas: ListasDoModelo = {},
): ModeloPreenchido {
  const semValor: ChaveDoCampo[] = []
  const texto = (valor: string, no: NoDoDocumento): NoDoDocumento => {
    const novo: NoDoDocumento = { type: 'text', text: valor }
    if (no.marks?.length) novo.marks = no.marks.map((m) => ({ ...m }))
    return novo
  }
  const trocar = (no: NoDoDocumento, item: ItemDoBloco | null): NoDoDocumento[] => {
    if (no.type === 'campo') {
      const chave = no.attrs?.chave
      if (!ehChaveDoCampo(chave)) return []
      const valor = valores[chave]?.trim()
      if (!valor && !semValor.includes(chave)) semValor.push(chave)
      return [texto(valor && valor.length > 0 ? valor : marcadorSemValor(chave), no)]
    }
    if (no.type === 'campo_do_item') {
      if (!item) return []
      const chave = no.attrs?.chave
      const valor = typeof chave === 'string' ? item[chave]?.trim() : undefined
      return [texto(valor && valor.length > 0 ? valor : '—', no)]
    }
    if (no.type === 'bloco_repetido') {
      const lista = no.attrs?.lista
      const itens = ehChaveDaLista(lista) ? (listas[lista] ?? []) : []
      if (itens.length === 0) {
        const vazio = typeof no.attrs?.vazio === 'string' ? no.attrs.vazio : BLOCO_SEM_ITENS
        return [{ type: 'paragraph', content: [{ type: 'text', text: vazio }] }]
      }
      return itens.flatMap((cada) => (no.content ?? []).flatMap((filho) => trocar(filho, cada)))
    }
    const copia: NoDoDocumento = { ...no }
    if (no.attrs) copia.attrs = { ...no.attrs }
    if (no.marks) copia.marks = no.marks.map((m) => ({ ...m }))
    if (no.content) copia.content = no.content.flatMap((filho) => trocar(filho, item))
    return [copia]
  }
  return { documento: trocar(conteudo, null)[0] ?? documentoVazio(), semValor }
}

/** Dados crus que o banco devolve para o relatório (dados_para_relatorio). */
export interface DadosParaRelatorio {
  consultoria: string | null
  autor: string | null
  hoje: string | null
  empreendimento: {
    nome: string | null
    cliente: string | null
    cnpj: string | null
    unidade: string | null
    endereco: string | null
  } | null
  licenca: {
    tipo: string | null
    numero: string | null
    orgao: string | null
    emissao: string | null
    validade: string | null
  } | null
  condicionante: {
    codigo: string | null
    titulo: string | null
    texto: string | null
    prazo: string | null
    responsavel: string | null
  } | null
}

function data(texto: string | null | undefined): string | undefined {
  return texto && ehDataCivil(texto) ? formatarDataCivil(texto) : undefined
}

function texto(valor: string | null | undefined): string | undefined {
  const limpo = valor?.trim() ?? ''
  return limpo.length > 0 ? limpo : undefined
}

/** Valores formatados para o documento: datas dd/mm/aaaa e CNPJ com máscara. */
export function valoresDoRelatorio(dados: DadosParaRelatorio): ValoresDosCampos {
  const e = dados.empreendimento
  const l = dados.licenca
  const c = dados.condicionante
  const pares: [ChaveDoCampo, string | undefined][] = Object.entries({
    'empreendimento.nome': texto(e?.nome),
    'empreendimento.cliente': texto(e?.cliente),
    'empreendimento.cnpj': e?.cnpj ? texto(formatarCnpj(e.cnpj)) : undefined,
    'empreendimento.unidade': texto(e?.unidade),
    'empreendimento.endereco': texto(e?.endereco),
    'licenca.tipo': texto(l?.tipo),
    'licenca.numero': texto(l?.numero),
    'licenca.orgao': texto(l?.orgao),
    'licenca.emissao': data(l?.emissao),
    'licenca.validade': data(l?.validade),
    'condicionante.codigo': texto(c?.codigo),
    'condicionante.titulo': texto(c?.titulo),
    'condicionante.texto': texto(c?.texto),
    'condicionante.prazo': data(c?.prazo),
    'condicionante.responsavel': texto(c?.responsavel),
    'relatorio.consultoria': texto(dados.consultoria),
    'relatorio.autor': texto(dados.autor),
    'relatorio.data': data(dados.hoje),
    'relatorio.mes': undefined,
  } satisfies Record<ChaveDoCampo, string | undefined>) as [ChaveDoCampo, string | undefined][]
  const valores: ValoresDosCampos = {}
  for (const [chave, valor] of pares) {
    if (valor !== undefined) valores[chave] = valor
  }
  return valores
}

/** Nome do arquivo .docx: "<modelo> - <empreendimento>.docx", sem caracteres proibidos no Windows. */
export function nomeDoArquivoDoRelatorio(modelo: string, empreendimento: string | null): string {
  const partes = [modelo, empreendimento].map((p) => p?.trim()).filter(Boolean)
  const base = partes
    .join(' - ')
    .replace(/[\\/:*?"<>|]|\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
  return `${base || 'Relatório'}.docx`
}
