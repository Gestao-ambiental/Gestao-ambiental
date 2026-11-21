// Coletor das Instruções Normativas do IMA (pacote L1, ADR-0050, LEG-02). Um GET na página única
// https://in.ima.sc.gov.br/ traz as 82 INs; cada card tem o número, o título, "(REVOGADA)" e o link
// downloadPDF/<idVersao>. O id é da versão, não da IN: id novo = versão nova. "Atualizada em" não
// é confiável (a IN 01 diz que foi atualizada antes de criada), então só o id e o SHA-256 contam.
//
// Ordem dentro do limite de downloads: primeiro as versões que mudaram, depois as INs novas, depois
// a versão-base das vigentes e por último a das revogadas. A versão-base das 82 INs leva alguns
// dias úteis (15 por execução), como diz o ADR-0050.
//
// "(REVOGADA)" novo numa IN vigente vira registrar_revogacao sem ato (a revogação com ato vem das
// portarias). IN que o catálogo já tem como revogada e a página não marca (caso da IN 84) fica
// revogada: a página não desfaz a portaria.

import { chaveDaNorma } from '../dominio/norma.ts'
import {
  baixarPdf,
  type ContextoDaColeta,
  decodificarEntidades,
  ErroDaColeta,
  gravarVersao,
  lerTexto,
  nomeDoArquivo,
  reservarDownload,
  sha256Hex,
  tentarItem,
  textoDoPdf,
  type VersaoConhecida,
} from './comum.ts'

export const FONTE_IMA_IN = 'ima_in'
export const URL_DAS_INS = 'https://in.ima.sc.gov.br/'
export const urlDoPdfDaIn = (idVersao: string) =>
  `https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/${idVersao}`
export const urlDaIn = (idVersao: string) =>
  `https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/${idVersao}`

export interface CardDeIn {
  /** Número da IN como o catálogo guarda em id_externo ("00" vira "0"). */
  numero: string
  /** Título como a página publica, sem "(REVOGADA)". */
  titulo: string
  revogada: boolean
  /** Id da versão no link downloadPDF (ou visualizar). */
  idVersao: string
  /** "dd/mm/aaaa" do card (só informativo). */
  atualizadaEm: string | null
}

const TITULO_DA_IN = /<h3 class="card-title[^>]*>\s*IN\s*(\d+)\s*-\s*([^<]+?)\s*<\/h3>/g

/**
 * Lê os cards de IN da página. O trecho de cada card vai até o próximo título de IN, para um card
 * sem link não pegar o id do seguinte; os subcards (LAP, LAI...) não começam com "IN nn -".
 */
export function lerCardsDeIn(html: string): CardDeIn[] {
  const titulos = [...html.matchAll(TITULO_DA_IN)]
  const cards = new Map<string, CardDeIn>()
  titulos.forEach((achado, i) => {
    const fim = titulos[i + 1]?.index ?? html.length
    const card = html.slice(achado.index, fim)
    const numero = String(Number(achado[1]))
    const bruto = decodificarEntidades(achado[2] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const revogada = /\(\s*REVOGADA\s*\)/i.test(bruto)
    const titulo = bruto.replace(/\s*\(\s*REVOGADA\s*\)\s*/gi, ' ').trim()
    const idVersao = /instrucaoNormativa\/(?:downloadPDF|visualizar)\/(\d+)/.exec(card)?.[1]
    if (idVersao === undefined || cards.has(numero)) return
    const atualizadaEm = /Atualizada em:\s*([0-9/]+)/.exec(card)?.[1] ?? null
    cards.set(numero, { numero, titulo, revogada, idVersao, atualizadaEm })
  })
  return [...cards.values()]
}

// O site publica quase tudo em maiúsculas. Caixa de frase, mantendo siglas e romanos (mesma regra
// de scripts/normas/gerar-carga-inicial.mjs, que montou os títulos da carga).
const SIGLAS = new Set([
  'IMA',
  'LAO',
  'LAP',
  'LAI',
  'AUA',
  'APP',
  'ETE',
  'EIA',
  'RAP',
  'RIMA',
  'TAC',
  'RPPN',
  'CONSEMA',
  'SC',
  'GLP',
  'I',
  'II',
  'III',
  'IIA',
  'IIB',
])

export function caixaDeFrase(titulo: string): string {
  const letras = titulo.replace(/[^\p{L}]/gu, '')
  const maiusculas = letras.replace(/[^\p{Lu}]/gu, '')
  if (letras.length === 0 || maiusculas.length / letras.length < 0.8) return titulo
  const frase = titulo.replace(/[\p{L}\p{N}]+/gu, (palavra) => {
    if (SIGLAS.has(palavra.toUpperCase()) && palavra === palavra.toUpperCase()) return palavra
    if (palavra !== palavra.toUpperCase()) return palavra
    return palavra.toLowerCase()
  })
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

/** "in2_344_20251010.pdf" → { data: '2025-10-10', texto: '20251010' }. */
export function dataDoNomeDoPdf(nome: string | null): { data: string; texto: string } | null {
  const achado = /_(\d{4})(\d{2})(\d{2})\.pdf$/i.exec(nome ?? '')
  if (!achado) return null
  const [, ano, mes, dia] = achado
  return { data: `${ano}-${mes}-${dia}`, texto: `${ano}${mes}${dia}` }
}

/** "04/12/2024" → "2024-12-04". */
function dataDoCard(texto: string | null): string | null {
  const achado = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto ?? '')
  return achado ? `${achado[3]}-${achado[2]}-${achado[1]}` : null
}

interface Tarefa {
  prioridade: number
  card: CardDeIn
  conhecida: VersaoConhecida | null
}

export async function coletarInsDoIma(ctx: ContextoDaColeta): Promise<void> {
  const pagina = await ctx.buscar(URL_DAS_INS, { tipos: ['text/html'] })
  const cards = lerCardsDeIn(await lerTexto(pagina))
  const conhecidas = await ctx.banco.versoesConhecidas(FONTE_IMA_IN)
  // Página sem cards, ou com bem menos INs que o catálogo: o formato mudou. Alerta, nunca aviso.
  if (cards.length === 0 || cards.length < conhecidas.length / 2) {
    throw new ErroDaColeta('formato_inesperado')
  }
  const porNumero = new Map(
    conhecidas.filter((c) => c.id_externo !== null).map((c) => [c.id_externo as string, c]),
  )

  const tarefas: Tarefa[] = []
  for (const card of cards) {
    const conhecida = porNumero.get(card.numero) ?? null
    if (conhecida === null) {
      tarefas.push({ prioridade: 1, card, conhecida })
      continue
    }
    if (card.revogada && conhecida.situacao_na_fonte === 'vigente') {
      await tentarItem(ctx, `in_${card.numero}_revogacao`, async () => {
        await ctx.banco.registrarRevogacao(ctx.coletaId, conhecida.chave, null, null)
        ctx.contagem.itensNovos++
      })
    }
    if (conhecida.ultima_versao_id_externo === card.idVersao) continue
    const prioridade =
      conhecida.ultima_versao_id_externo !== null
        ? 0
        : conhecida.situacao_na_fonte === 'vigente'
          ? 2
          : 3
    tarefas.push({ prioridade, card, conhecida })
  }
  tarefas.sort(
    (a, b) => a.prioridade - b.prioridade || Number(a.card.numero) - Number(b.card.numero),
  )

  for (const { card, conhecida } of tarefas) {
    if (!reservarDownload(ctx)) continue
    await tentarItem(ctx, `in_${card.numero}`, async () => {
      const { bytes, resposta } = await baixarPdf(ctx, urlDoPdfDaIn(card.idVersao))
      let normaId = conhecida?.norma_id
      if (normaId === undefined) {
        normaId = await ctx.banco.garantirNorma({
          chave: chaveDaNorma({
            esfera: 'estadual',
            orgao: 'IMA',
            tipo: 'instrucao_normativa',
            numero: card.numero,
          }),
          esfera: 'estadual',
          orgao: 'IMA',
          tipo: 'instrucao_normativa',
          numero: card.numero,
          ano: null,
          titulo: `IN ${card.numero} · ${caixaDeFrase(card.titulo)}`,
          url_oficial: urlDaIn(card.idVersao),
          fonte: FONTE_IMA_IN,
          id_externo: card.numero,
          situacao_na_fonte: card.revogada ? 'revogada' : 'vigente',
        })
      }
      const doNome = dataDoNomeDoPdf(nomeDoArquivo(resposta))
      await gravarVersao(ctx, {
        normaId,
        conhecida,
        sha256: await sha256Hex(bytes),
        texto: await textoDoPdf(ctx, bytes),
        arquivo: { bytes, mime: 'application/pdf' },
        idExterno: card.idVersao,
        publicadaEm: doNome?.data ?? dataDoCard(card.atualizadaEm),
        publicadaEmTexto: doNome?.texto ?? card.atualizadaEm,
        atoNovo: conhecida === null,
      })
    })
  }
}
