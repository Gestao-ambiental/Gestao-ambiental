// Coletor das leis estaduais na ALESC (pacote L2, ADR-0050, LEG-02 e LEG-03). O site
// leis.alesc.sc.gov.br gera o HTML no servidor (sem JavaScript) e não tem robots.txt nem API.
//
// 1. Leis vigiadas = normas da fonte 'alesc' (versoes_conhecidas). Para cada uma, GET
//    /ato-normativo/<id> e versão = texto do documento sem CPF (o SHA-256 é desse texto; não vai
//    arquivo ao Storage). O texto inclui o bloco de cabeçalho (procedência, "Alterada pelas Leis",
//    revogações, ADIs, decretos que regulamentam): lei nova que altera a 14.675 muda o cabeçalho e
//    vira versão nova, com a diferença pelo fluxo comum (gravarVersao). A ALESC não publica data de
//    versão: publicada_em fica nula.
// 2. Lei vigiada sem id externo (a 14.262/2007 da carga): busca pelo número com ponto
//    (?search=14.262&sort=data_desc) e fica com o primeiro resultado do mesmo tipo, número e ano.
//    garantir_norma não troca id_externo de norma que já existe (só título, ementa, URL e situação),
//    então o id achado vai para url_oficial e para o id externo da versão; nas próximas execuções
//    ele volta por versoes_conhecidas (ultima_versao_id_externo) e a busca não se repete.
// 3. Leis novas: ?search=meio+ambiente&sort=data_desc; resultado com data posterior à carga do
//    catálogo (DATA_DA_CARGA) e chave fora do catálogo vira norma (sc;alesc;lei;<n>;<ano>) com ato
//    novo. A chave confere todas as fontes com coletor: a lei que o DOE-SC já trouxe não é recriada.
//
// Cada página de lei conta no `limite` da execução (a 14.675 compilada tem cerca de 560 KB). A ordem
// das vigiadas gira a cada dia, para o limite não deixar sempre as mesmas para trás.

import { chaveDaNorma, type TipoNorma, tituloCurtoDaNorma } from '../dominio/norma.ts'
import { removerCpf } from '../dominio/sem-cpf.ts'
import {
  type ContextoDaColeta,
  decodificarEntidades,
  ErroDaColeta,
  gravarVersao,
  lerTexto,
  reservarDownload,
  sha256Hex,
  tentarItem,
  type VersaoConhecida,
} from './comum.ts'
import { DATA_DA_CARGA } from './consema.ts'
import {
  catalogoDasFontes,
  diaDaJanela,
  htmlParaTextoCorrido as htmlParaTexto,
  numeroParaExibir,
} from './diarios.ts'

export { DATA_DA_CARGA }

export const FONTE_ALESC = 'alesc'
export const BASE_DA_ALESC = 'https://leis.alesc.sc.gov.br'
export const urlDoAtoNaAlesc = (id: string) => `${BASE_DA_ALESC}/ato-normativo/${id}`
export const urlDaBuscaNaAlesc = (termo: string) =>
  `${BASE_DA_ALESC}/legislativo?search=${encodeURIComponent(termo).replace(/%20/g, '+')}&sort=data_desc`
export const TERMO_DAS_LEIS_NOVAS = 'meio ambiente'

const TIPOS_HTML = ['text/html'] as const

const MESES: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '')
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------
export interface LeiNaAlesc {
  tipo: Extract<TipoNorma, 'lei' | 'lei_complementar'>
  /** Sem ponto: "14675". */
  numero: string
  ano: number
  /** aaaa-mm-dd da lei (null quando o título não traz o dia). */
  data: string | null
}

const TITULO_DE_LEI =
  /^\s*LEI\s+(COMPLEMENTAR\s+)?N[º°o]?\.?\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*,\s*DE\s+(?:(\d{1,2})\s*[º°o]?\s+DE\s+(\p{L}+)\s+DE\s+)?(\d{4})/iu

/** "LEI Nº 20.059, DE 14 DE AGOSTO DE 2026" → lei 20059/2026 de 14/08/2026. */
export function lerTituloDeLei(titulo: string): LeiNaAlesc | null {
  const achado = TITULO_DE_LEI.exec(titulo)
  if (!achado) return null
  const [, complementar, numero, dia, mes, ano] = achado
  const numeroDoMes = mes === undefined ? undefined : MESES[semAcento(mes).toLowerCase()]
  const data =
    dia !== undefined && numeroDoMes !== undefined
      ? `${ano as string}-${numeroDoMes}-${dia.padStart(2, '0')}`
      : null
  return {
    tipo: complementar ? 'lei_complementar' : 'lei',
    numero: (numero as string).replace(/\./g, ''),
    ano: Number(ano),
    data,
  }
}

export interface ResultadoDaBusca extends LeiNaAlesc {
  id: string
  titulo: string
}

/** Cartões da página de resultados, na ordem da página (só leis). */
export function lerBuscaDaAlesc(html: string): ResultadoDaBusca[] {
  if (!/Resultados da Pesquisa/i.test(html)) throw new ErroDaColeta('formato_inesperado')
  const resultados: ResultadoDaBusca[] = []
  const cartao =
    /<div class="card-title[^"]*">[\s\S]*?<a href="\/ato-normativo\/(?:[a-z]+\/)?(\d+)"[^>]*>([^<]+)<\/a>/g
  for (const achado of html.matchAll(cartao)) {
    const titulo = decodificarEntidades(achado[2] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const lei = lerTituloDeLei(titulo)
    if (lei === null) continue
    resultados.push({ ...lei, id: achado[1] as string, titulo })
  }
  return resultados
}

// ---------------------------------------------------------------------------
// Página da lei
// ---------------------------------------------------------------------------
export interface AtoDaAlesc {
  /** Epígrafe ("LEI Nº 14.675, de 13 de abril de 2009"). */
  titulo: string
  /** Bloco de cabeçalho: procedência, "Alterada pelas Leis", revogações, ADIs, decretos. */
  cabecalho: string
  ementa: string | null
  /** Texto do documento inteiro, na ordem da página (com o cabeçalho), ainda com CPF. */
  texto: string
}

export function lerAtoDaAlesc(html: string): AtoDaAlesc {
  const corpo = /<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(html)?.[1]
  if (corpo === undefined) throw new ErroDaColeta('formato_inesperado')
  const texto = htmlParaTexto(corpo)
  const epigrafe = /<p class="epigrafe"[^>]*>([\s\S]*?)<\/p>/i.exec(corpo)?.[1]
  if (epigrafe === undefined || texto === '') throw new ErroDaColeta('formato_inesperado')
  const inicio = corpo.search(/<div class="procedencia"/i)
  const fim = inicio < 0 ? -1 : corpo.indexOf('</div>', inicio)
  const ementa = /<div class="ementa"[^>]*>([\s\S]*?)<\/div>/i.exec(corpo)?.[1]
  return {
    titulo: htmlParaTexto(epigrafe),
    cabecalho: fim < 0 ? '' : htmlParaTexto(corpo.slice(inicio, fim)),
    ementa: ementa === undefined ? null : htmlParaTexto(ementa).replace(/\n/g, ' ') || null,
    texto,
  }
}

async function baixarAto(ctx: ContextoDaColeta, id: string): Promise<AtoDaAlesc> {
  const resposta = await ctx.buscar(urlDoAtoNaAlesc(id), { tipos: TIPOS_HTML })
  const ato = lerAtoDaAlesc(await lerTexto(resposta))
  return { ...ato, texto: removerCpf(ato.texto) }
}

// ---------------------------------------------------------------------------
// Chave
// ---------------------------------------------------------------------------
export function chaveDaLeiNaAlesc(lei: Pick<LeiNaAlesc, 'tipo' | 'numero' | 'ano'>): string {
  return chaveDaNorma({
    esfera: 'estadual',
    orgao: 'ALESC',
    tipo: lei.tipo,
    numero: lei.numero,
    ano: lei.ano,
  })
}

/** "sc;alesc;lei;14262;2007" → lei 14262/2007 (null para outro formato). */
export function leiDaChave(chave: string): Pick<LeiNaAlesc, 'tipo' | 'numero' | 'ano'> | null {
  const achado = /^sc;alesc;(lei|lei_complementar);(\d+);(\d{4})$/.exec(chave)
  if (!achado) return null
  return {
    tipo: achado[1] as LeiNaAlesc['tipo'],
    numero: achado[2] as string,
    ano: Number(achado[3]),
  }
}

/** Id do ato na ALESC pela busca do número; sem resultado igual, 'lei_nao_encontrada'. */
export async function procurarLeiNaAlesc(
  ctx: ContextoDaColeta,
  lei: Pick<LeiNaAlesc, 'tipo' | 'numero' | 'ano'>,
): Promise<string> {
  const termo = numeroParaExibir({ tipo: lei.tipo, numero: lei.numero })
  const resposta = await ctx.buscar(urlDaBuscaNaAlesc(termo), { tipos: TIPOS_HTML })
  const achado = lerBuscaDaAlesc(await lerTexto(resposta)).find(
    (r) => r.tipo === lei.tipo && r.numero === lei.numero && r.ano === lei.ano,
  )
  if (achado === undefined) throw new ErroDaColeta('lei_nao_encontrada')
  return achado.id
}

/** Gira a lista pelo dia, para o limite não deixar sempre as mesmas para trás. */
function girarPeloDia<T>(lista: T[], dia: string): T[] {
  if (lista.length < 2) return lista
  const dias = Math.floor(Date.parse(`${dia}T00:00:00Z`) / 86_400_000)
  const inicio = (((Number.isFinite(dias) ? dias : 0) % lista.length) + lista.length) % lista.length
  return [...lista.slice(inicio), ...lista.slice(0, inicio)]
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------
export async function coletarLeisDaAlesc(ctx: ContextoDaColeta): Promise<void> {
  const vigiadas = (await ctx.banco.versoesConhecidas(FONTE_ALESC)).sort((a, b) =>
    a.chave.localeCompare(b.chave),
  )
  for (const lei of girarPeloDia(vigiadas, diaDaJanela(ctx))) {
    await tentarItem(ctx, `lei_${lei.chave}`, () => vigiarLei(ctx, lei))
  }
  await tentarItem(ctx, 'leis_novas', () => procurarLeisNovas(ctx))
}

async function vigiarLei(ctx: ContextoDaColeta, lei: VersaoConhecida): Promise<void> {
  const dados = leiDaChave(lei.chave)
  if (dados === null) return
  let id = lei.id_externo ?? lei.ultima_versao_id_externo
  const achadoNaBusca = id === null
  id ??= await procurarLeiNaAlesc(ctx, dados)
  if (!reservarDownload(ctx)) return
  const ato = await baixarAto(ctx, id)
  if (achadoNaBusca) {
    // Sem título nem ementa: a norma da carga mantém os dela e ganha só a URL do ato.
    await ctx.banco.garantirNorma({
      chave: lei.chave,
      esfera: 'estadual',
      orgao: 'ALESC',
      tipo: dados.tipo,
      numero: numeroParaExibir(dados),
      ano: dados.ano,
      url_oficial: urlDoAtoNaAlesc(id),
      fonte: FONTE_ALESC,
      id_externo: id,
    })
  }
  await gravarVersao(ctx, {
    normaId: lei.norma_id,
    conhecida: lei,
    sha256: await sha256Hex(ato.texto),
    texto: ato.texto,
    idExterno: id,
    publicadaEm: null,
    atoNovo: false,
  })
}

async function procurarLeisNovas(ctx: ContextoDaColeta): Promise<void> {
  const resposta = await ctx.buscar(urlDaBuscaNaAlesc(TERMO_DAS_LEIS_NOVAS), { tipos: TIPOS_HTML })
  const resultados = lerBuscaDaAlesc(await lerTexto(resposta)).filter(
    (r) => r.data !== null && r.data > DATA_DA_CARGA,
  )
  if (resultados.length === 0) return
  const catalogo = await catalogoDasFontes(ctx)
  for (const resultado of resultados) {
    const chave = chaveDaLeiNaAlesc(resultado)
    if (catalogo.has(chave)) continue
    await tentarItem(ctx, `lei_nova_${resultado.id}`, async () => {
      if (!reservarDownload(ctx)) return
      const ato = await baixarAto(ctx, resultado.id)
      const normaId = await ctx.banco.garantirNorma({
        chave,
        esfera: 'estadual',
        orgao: 'ALESC',
        tipo: resultado.tipo,
        numero: numeroParaExibir(resultado),
        ano: resultado.ano,
        titulo: tituloCurtoDaNorma(resultado),
        ementa: ato.ementa === null ? null : removerCpf(ato.ementa),
        url_oficial: urlDoAtoNaAlesc(resultado.id),
        fonte: FONTE_ALESC,
        id_externo: resultado.id,
        situacao_na_fonte: 'vigente',
      })
      const sha256 = await sha256Hex(ato.texto)
      await gravarVersao(ctx, {
        normaId,
        conhecida: null,
        sha256,
        texto: ato.texto,
        idExterno: resultado.id,
        publicadaEm: null,
        atoNovo: true,
      })
      catalogo.set(chave, {
        fonte: FONTE_ALESC,
        conhecida: {
          norma_id: normaId,
          chave,
          id_externo: resultado.id,
          situacao_na_fonte: 'vigente',
          ultima_versao_id_externo: resultado.id,
          ultimo_sha256: sha256,
          ultima_versao_numero: 1,
        },
      })
    })
  }
}
