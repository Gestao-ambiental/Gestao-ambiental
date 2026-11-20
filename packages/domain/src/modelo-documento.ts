// Modelo de documento da consultoria (ADR-0036): texto padrão com campos que puxam dados do
// empreendimento, da licença e da condicionante. O conteúdo é a árvore do editor (formato JSON do
// ProseMirror/TipTap). Um campo é o nó inline `campo` com attrs.chave; preencher troca cada campo
// pelo valor, ou por "[Rótulo]" quando o cadastro não tem o dado.
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
  return algum(conteudo, (no) => no.type === 'campo' && !ehChaveDoCampo(no.attrs?.chave))
    ? 'campo_desconhecido'
    : null
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

/** Troca cada campo pelo valor (texto com as mesmas marcas). Não altera o conteúdo recebido. */
export function preencherModelo(
  conteudo: NoDoDocumento,
  valores: ValoresDosCampos,
): ModeloPreenchido {
  const semValor: ChaveDoCampo[] = []
  const trocar = (no: NoDoDocumento): NoDoDocumento | null => {
    if (no.type === 'campo') {
      const chave = no.attrs?.chave
      if (!ehChaveDoCampo(chave)) return null
      const valor = valores[chave]?.trim()
      if (!valor && !semValor.includes(chave)) semValor.push(chave)
      const texto: NoDoDocumento = {
        type: 'text',
        text: valor && valor.length > 0 ? valor : marcadorSemValor(chave),
      }
      if (no.marks?.length) texto.marks = no.marks.map((m) => ({ ...m }))
      return texto
    }
    const copia: NoDoDocumento = { ...no }
    if (no.attrs) copia.attrs = { ...no.attrs }
    if (no.marks) copia.marks = no.marks.map((m) => ({ ...m }))
    if (no.content) {
      copia.content = no.content.map(trocar).filter((n): n is NoDoDocumento => n !== null)
    }
    return copia
  }
  return { documento: trocar(conteudo) ?? documentoVazio(), semValor }
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
