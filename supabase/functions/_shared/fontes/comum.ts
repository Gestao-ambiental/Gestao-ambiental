// Peças comuns dos coletores de normas (pacotes L1 e L2, ADR-0050): acesso educado às fontes, erro
// com código curto, contexto de uma execução e o fluxo de gravar uma versão (SHA-256, texto sem CPF,
// diferença, Storage e registrar_versao_de_norma). Os adaptadores de cada fonte (ima-in.ts,
// ima-portaria.ts, consema.ts, doe-sc.ts, alesc.ts, joinville-doem.ts) e o tratador
// (../coleta-de-normas.ts) usam daqui; o que só os diários usam fica em diarios.ts.
//
// Storage: bucket privado 'normas'. O caminho dentro do bucket é '<norma_id>/<uuid>' e a coluna
// norma_versao.objeto guarda 'normas/<norma_id>/<uuid>' (bucket + caminho), o formato do check
// norma_versao_objeto_formato do L0.

import { compararVersoes, type DiferencaDeNorma } from '../dominio/diferenca-de-norma.ts'
import { removerCpf } from '../dominio/sem-cpf.ts'

export const USER_AGENT = 'Grama-coletor/1.0 (+https://gramaapp.com.br)'
export const INTERVALO_ENTRE_PEDIDOS_MS = 1_000
export const TEMPO_LIMITE_MS = 20_000
export const MAXIMO_DE_REDIRECIONAMENTOS = 3
/** Maior arquivo aceito (a 250/2024 compilada tem 1,65 MB). */
export const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024
export const BUCKET_DE_NORMAS = 'normas'

/** Únicos domínios que a coleta visita. Redirecionamento para fora deles é recusado. */
export const HOSTS_DAS_FONTES = [
  'in.ima.sc.gov.br',
  'consultas.ima.sc.gov.br',
  'www.semae.sc.gov.br',
  'portal.doe.sea.sc.gov.br',
  'leis.alesc.sc.gov.br',
  'sei.joinville.sc.gov.br',
  'inlabs.in.gov.br',
  'www.planalto.gov.br',
  'dados.ciga.sc.gov.br',
] as const

export const TIPOS_PDF = [
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
  'application/force-download',
  'application/x-download',
] as const

/** Falha com código curto, sem dado pessoal: vai para coleta.erro e fonte_legal.ultimo_erro. */
export class ErroDaColeta extends Error {
  constructor(readonly codigo: string) {
    super(codigo)
    this.name = 'ErroDaColeta'
  }
}

export function codigoDoErro(erro: unknown): string {
  return erro instanceof ErroDaColeta ? erro.codigo : 'erro_interno'
}

// ---------------------------------------------------------------------------
// Acesso educado
// ---------------------------------------------------------------------------
export interface PedidoDeBusca {
  metodo?: 'GET' | 'HEAD' | 'POST'
  /** Corpo do POST (formulário já codificado). */
  corpo?: string
  tipoDoCorpo?: string
  /** Content-Types aceitos (sem parâmetros). Outro tipo vira erro 'conteudo_inesperado'. */
  tipos: readonly string[]
  /** Cabeçalhos extras (If-None-Match, Cookie). User-Agent e Accept não são trocados. */
  cabecalhos?: Readonly<Record<string, string>>
  /** Devolve o 304 (pedido condicional) em vez de tratá-lo como erro. */
  aceitarNaoModificado?: boolean
  /** Devolve o redirecionamento como veio (para ler o Set-Cookie do login), sem segui-lo. */
  naoSeguir?: boolean
}

export type Buscador = (url: string, pedido: PedidoDeBusca) => Promise<Response>

export interface OpcoesDoBuscador {
  /** Espera entre pedidos (no teste, falsa). */
  esperar?: (ms: number) => Promise<void>
  /** Relógio em milissegundos (no teste, falso). */
  agora?: () => number
  intervaloMs?: number
  tempoLimiteMs?: number
  hosts?: readonly string[]
}

function tipoDaResposta(resposta: Response): string {
  return (resposta.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * fetch com boa vizinhança: User-Agent identificado, no máximo 1 pedido por segundo (cada salto de
 * redirecionamento conta), 20 s de tempo limite, só nos domínios das fontes (redirecionamento para
 * outro domínio é recusado) e Content-Type conferido: o cache da SEMAE já devolveu o RSS no lugar
 * da página, e isso não pode virar versão nova.
 */
export function buscarComEducacao(fetchFn: typeof fetch, opcoes: OpcoesDoBuscador = {}): Buscador {
  const esperar =
    opcoes.esperar ?? ((ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)))
  const agora = opcoes.agora ?? (() => Date.now())
  const intervalo = opcoes.intervaloMs ?? INTERVALO_ENTRE_PEDIDOS_MS
  const tempoLimite = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS
  const hosts = opcoes.hosts ?? HOSTS_DAS_FONTES
  let ultimo: number | null = null

  async function umPedido(url: URL, pedido: PedidoDeBusca): Promise<Response> {
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) {
      throw new ErroDaColeta('dominio_nao_permitido')
    }
    if (ultimo !== null) {
      const falta = ultimo + intervalo - agora()
      if (falta > 0) await esperar(falta)
    }
    ultimo = agora()
    const cabecalhos: Record<string, string> = {
      ...pedido.cabecalhos,
      'User-Agent': USER_AGENT,
      Accept: pedido.tipos.join(', '),
    }
    if (pedido.corpo !== undefined) {
      cabecalhos['Content-Type'] = pedido.tipoDoCorpo ?? 'application/x-www-form-urlencoded'
    }
    try {
      return await fetchFn(url.href, {
        method: pedido.metodo ?? 'GET',
        headers: cabecalhos,
        body: pedido.corpo,
        redirect: 'manual',
        signal: AbortSignal.timeout(tempoLimite),
      })
    } catch (erro) {
      if (erro instanceof DOMException && ['TimeoutError', 'AbortError'].includes(erro.name)) {
        throw new ErroDaColeta('tempo_esgotado')
      }
      throw new ErroDaColeta('falha_de_rede')
    }
  }

  return async (endereco, pedido) => {
    let url = new URL(endereco)
    let atual = pedido
    for (let saltos = 0; ; saltos++) {
      const resposta = await umPedido(url, atual)
      if (resposta.status === 304 && pedido.aceitarNaoModificado) return resposta
      if (resposta.status >= 300 && resposta.status < 400 && pedido.naoSeguir) return resposta
      if (resposta.status >= 300 && resposta.status < 400) {
        await resposta.body?.cancel()
        const destino = resposta.headers.get('location')
        if (!destino || saltos >= MAXIMO_DE_REDIRECIONAMENTOS) {
          throw new ErroDaColeta('redirecionamento_invalido')
        }
        const proximo = new URL(destino, url)
        if (proximo.hostname !== url.hostname) throw new ErroDaColeta('redirecionamento_externo')
        url = proximo
        // 303 (e 301/302 depois de POST) seguem com GET, como o navegador.
        if (resposta.status === 303 || atual.metodo === 'POST') {
          atual = { tipos: atual.tipos, metodo: 'GET', cabecalhos: atual.cabecalhos }
        }
        continue
      }
      if (!resposta.ok) {
        await resposta.body?.cancel()
        throw new ErroDaColeta(`http_${String(resposta.status)}`)
      }
      if (!pedido.tipos.includes(tipoDaResposta(resposta))) {
        await resposta.body?.cancel()
        throw new ErroDaColeta('conteudo_inesperado')
      }
      return resposta
    }
  }
}

/** Corpo da resposta como bytes, com teto de tamanho. */
export async function lerBytes(
  resposta: Response,
  maximo = TAMANHO_MAXIMO_BYTES,
): Promise<Uint8Array> {
  const declarado = Number(resposta.headers.get('content-length') ?? '0')
  if (declarado > maximo) {
    await resposta.body?.cancel()
    throw new ErroDaColeta('arquivo_grande')
  }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await resposta.arrayBuffer())
  } catch (erro) {
    if (erro instanceof DOMException && ['TimeoutError', 'AbortError'].includes(erro.name)) {
      throw new ErroDaColeta('tempo_esgotado')
    }
    throw new ErroDaColeta('falha_de_rede')
  }
  if (bytes.length > maximo) throw new ErroDaColeta('arquivo_grande')
  return bytes
}

/** Corpo da resposta como texto, no charset declarado (UTF-8 quando não declarado). */
export async function lerTexto(resposta: Response): Promise<string> {
  const charset = /charset=([^;]+)/i.exec(resposta.headers.get('content-type') ?? '')?.[1]
  const bytes = await lerBytes(resposta)
  try {
    return new TextDecoder(charset?.trim().replace(/"/g, '') || 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Confere a assinatura do PDF: o servidor pode mandar HTML com o tipo de PDF. */
export function ehPdf(bytes: Uint8Array): boolean {
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return inicio.includes('%PDF-')
}

export async function sha256Hex(dados: Uint8Array | string): Promise<string> {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados
  const copia = new Uint8Array(bytes.length)
  copia.set(bytes)
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', copia.buffer))
  return [...resumo].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  sect: '§',
  ndash: '–',
  mdash: '—',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  laquo: '«',
  raquo: '»',
}
const ACENTOS: Record<string, string> = {
  acute: '́',
  grave: '̀',
  circ: '̂',
  tilde: '̃',
  cedil: '̧',
  uml: '̈',
}

/** Decodifica entidades HTML (numéricas, as comuns e as letras acentuadas do português). */
export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (inteiro, nome: string) => {
    if (nome.startsWith('#')) {
      const codigo =
        nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : Number(nome.slice(1))
      return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff
        ? String.fromCodePoint(codigo)
        : inteiro
    }
    const direta = ENTIDADES[nome.toLowerCase()]
    if (direta !== undefined) return direta
    const acento = /^([a-z])(acute|grave|circ|tilde|cedil|uml)$/i.exec(nome)
    if (acento?.[1] && acento[2]) return (acento[1] + ACENTOS[acento[2]]).normalize('NFC')
    return inteiro
  })
}

/** Texto legível de um trecho HTML: blocos viram linhas, tags somem, espaços se juntam. */
export function htmlParaTexto(html: string): string {
  const semScripts = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  const comQuebras = semScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol)>/gi, '\n')
  const texto = decodificarEntidades(comQuebras.replace(/<[^>]*>/g, ''))
  return texto
    .split('\n')
    .map((linha) => linha.replace(/[\s ]+/g, ' ').trim())
    .filter((linha) => linha !== '')
    .join('\n')
}

// ---------------------------------------------------------------------------
// Banco (RPCs da migration 20261120234000_coleta_de_normas.sql, com a service role)
// ---------------------------------------------------------------------------
export interface NormaParaGarantir {
  chave: string
  esfera: 'federal' | 'estadual' | 'municipal'
  municipio_ibge?: string | null
  orgao: string
  tipo: string
  numero: string
  ano?: number | null
  /**
   * Obrigatório quando a norma é criada. Sem ele, a norma que já existe mantém o título (garantir_norma
   * faz coalesce); quem só quer completar a URL de uma norma da carga não manda título.
   */
  titulo?: string
  ementa?: string | null
  url_oficial?: string | null
  fonte: string
  id_externo?: string | null
  situacao_na_fonte?: 'vigente' | 'revogada'
}

/** Uma linha de versoes_conhecidas(fonte): a norma e a última versão (campos nulos sem versão). */
export interface VersaoConhecida {
  norma_id: string
  chave: string
  id_externo: string | null
  situacao_na_fonte: string
  ultima_versao_id_externo: string | null
  ultimo_sha256: string | null
  ultima_versao_numero: number | null
}

export interface VersaoParaRegistrar {
  sha256: string
  id_externo?: string | null
  /** aaaa-mm-dd */
  publicada_em?: string | null
  publicada_em_texto?: string | null
  objeto?: string | null
  mime?: string | null
  tamanho?: number | null
  texto?: string | null
}

export interface VersaoRegistrada {
  versao_id: string
  versao_nova: boolean
  mudanca_id: string | null
}

export interface BancoDaColeta {
  /** null quando a coleta (fonte, janela) já está concluída ou em andamento há menos de 30 min. */
  iniciarColeta: (fonte: string, janela: string, forcar: boolean) => Promise<string | null>
  garantirNorma: (norma: NormaParaGarantir) => Promise<string>
  versoesConhecidas: (fonte: string) => Promise<VersaoConhecida[]>
  textoDaUltimaVersao: (normaId: string) => Promise<string | null>
  registrarVersao: (
    coletaId: string,
    normaId: string,
    versao: VersaoParaRegistrar,
    diferenca: DiferencaDeNorma | null,
    atoNovo: boolean,
  ) => Promise<VersaoRegistrada>
  registrarRevogacao: (
    coletaId: string,
    chaveRevogada: string,
    chaveAto: string | null,
    revogadaEm: string | null,
  ) => Promise<string>
  concluirColeta: (coletaId: string, itensNovos: number, erro: string | null) => Promise<void>
  /** Municípios (IBGE e nome) onde alguma consultoria tem unidade: o que a coleta do CIGA olha. */
  municipiosVigiados: () => Promise<{ ibge: string; nome: string }[]>
  /** Upload no bucket privado 'normas', no caminho '<norma_id>/<uuid>', sem sobrescrever. */
  enviarArquivo: (caminho: string, bytes: Uint8Array, mime: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
export interface Contagem {
  /** Versões novas e revogações registradas nesta execução. */
  itensNovos: number
  /** Arquivos baixados (o que o limite conta). */
  baixados: number
  /** Itens deixados para a próxima execução por causa do limite. */
  pendentes: number
  /** Códigos das falhas de itens (a coleta continua com os outros). */
  falhas: string[]
}

export interface ContextoDaColeta {
  coletaId: string
  fonte: string
  /** Janela da coleta (aaaa-mm-dd ou aaaa-mm-ddTHH). Os diários leem as edições desse dia. */
  janela?: string
  banco: BancoDaColeta
  buscar: Buscador
  /** Texto do PDF; pode lançar (a versão fica com texto nulo). */
  lerPdf: (bytes: Uint8Array) => Promise<string>
  /** Máximo de arquivos baixados nesta execução. */
  limite: number
  /** Segredo da função (credencial do INLABS); nunca vai para o log. */
  segredo?: (nome: string) => string | undefined
  agora: Date
  novoUuid: () => string
  registrar: (linha: string) => void
  contagem: Contagem
}

export type Coletor = (ctx: ContextoDaColeta) => Promise<void>

/** Reserva um download dentro do limite; falso quando o limite da execução acabou. */
export function reservarDownload(ctx: ContextoDaColeta): boolean {
  if (ctx.contagem.baixados >= ctx.limite) {
    ctx.contagem.pendentes++
    return false
  }
  ctx.contagem.baixados++
  return true
}

/** Roda um item; falha do item é contada e registrada sem parar os outros. */
export async function tentarItem(
  ctx: ContextoDaColeta,
  item: string,
  passo: () => Promise<void>,
): Promise<void> {
  try {
    await passo()
  } catch (erro) {
    const codigo = codigoDoErro(erro)
    ctx.contagem.falhas.push(codigo)
    ctx.registrar(JSON.stringify({ fonte: ctx.fonte, item, motivo: codigo }))
  }
}

export async function textoDoPdf(ctx: ContextoDaColeta, bytes: Uint8Array): Promise<string | null> {
  try {
    const texto = await ctx.lerPdf(bytes)
    return texto.trim() === '' ? null : texto
  } catch {
    return null
  }
}

export interface NovaVersao {
  normaId: string
  /** Última versão conhecida da norma (null quando a norma acabou de entrar no catálogo). */
  conhecida: VersaoConhecida | null
  sha256: string
  /** Texto extraído, antes de tirar o CPF (sai daqui sem CPF). */
  texto: string | null
  /** Arquivo original para o Storage; sem arquivo, objeto fica nulo. */
  arquivo?: { bytes: Uint8Array; mime: string }
  idExterno: string | null
  publicadaEm?: string | null
  publicadaEmTexto?: string | null
  atoNovo: boolean
}

/**
 * Grava uma versão: tira o CPF do texto, compara com o texto da última versão (quando há), envia o
 * arquivo ao Storage e chama registrar_versao_de_norma. Mesmo SHA-256 da última versão não grava
 * nada. Devolve a versão registrada, ou null quando nada mudou.
 */
export async function gravarVersao(
  ctx: ContextoDaColeta,
  nova: NovaVersao,
): Promise<VersaoRegistrada | null> {
  if (nova.conhecida?.ultimo_sha256 === nova.sha256) return null
  const texto = nova.texto === null ? null : removerCpf(nova.texto)
  let diferenca: DiferencaDeNorma | null = null
  if (texto !== null && nova.conhecida?.ultimo_sha256) {
    const anterior = await ctx.banco.textoDaUltimaVersao(nova.normaId)
    if (anterior !== null) diferenca = compararVersoes(anterior, texto)
  }
  let objeto: string | null = null
  if (nova.arquivo) {
    const caminho = `${nova.normaId}/${ctx.novoUuid()}`
    await ctx.banco.enviarArquivo(caminho, nova.arquivo.bytes, nova.arquivo.mime)
    objeto = `${BUCKET_DE_NORMAS}/${caminho}`
  }
  const registrada = await ctx.banco.registrarVersao(
    ctx.coletaId,
    nova.normaId,
    {
      sha256: nova.sha256,
      id_externo: nova.idExterno,
      publicada_em: nova.publicadaEm ?? null,
      publicada_em_texto: nova.publicadaEmTexto ?? null,
      objeto,
      mime: nova.arquivo?.mime ?? (texto === null ? null : 'text/plain'),
      tamanho: nova.arquivo?.bytes.length ?? null,
      texto,
    },
    diferenca,
    nova.atoNovo,
  )
  if (registrada.versao_nova) ctx.contagem.itensNovos++
  return registrada
}

/** Baixa um PDF (GET, tipo de PDF e assinatura conferidos). */
export async function baixarPdf(
  ctx: ContextoDaColeta,
  url: string,
): Promise<{ bytes: Uint8Array; resposta: Response }> {
  const resposta = await ctx.buscar(url, { tipos: TIPOS_PDF })
  const bytes = await lerBytes(resposta)
  if (!ehPdf(bytes)) throw new ErroDaColeta('conteudo_inesperado')
  return { bytes, resposta }
}

/** Nome do arquivo no Content-Disposition (filename* tem prioridade). */
export function nomeDoArquivo(resposta: Response): string | null {
  const cabecalho = resposta.headers.get('content-disposition') ?? ''
  const estendido = /filename\*\s*=\s*(?:[\w-]+'[\w-]*')?"?([^";]+)"?/i.exec(cabecalho)?.[1]
  if (estendido) {
    try {
      return decodeURIComponent(estendido.trim())
    } catch {
      return estendido.trim()
    }
  }
  const simples = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(cabecalho)
  const nome = (simples?.[1] ?? simples?.[2])?.trim()
  return nome ? nome : null
}

/** Data de hoje (aaaa-mm-dd) no fuso de Brasília. */
export function dataEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}
