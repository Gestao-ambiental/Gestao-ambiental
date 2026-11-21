// Peças comuns dos coletores de diários e leis (pacote L2, ADR-0050): DOE-SC (doe-sc.ts), ALESC
// (alesc.ts) e DOEM de Joinville (joinville-doem.ts). O fluxo de gravar versão continua em comum.ts.
//
// - O dia da janela: o DOE e o DOEM são lidos por edição do dia; a janela vem do tratador
//   (aaaa-mm-dd ou aaaa-mm-ddTHH) e, sem ela, é o dia de hoje em Brasília.
// - O catálogo de várias fontes: versoes_conhecidas é por fonte, e um ato do diário pode já estar no
//   catálogo por outro coletor (a portaria do IMA, a lei da ALESC). O mapa junta as fontes com
//   coletor; normas da carga sem fonte não aparecem nele.
// - Revogação citada no ato: classificarAto com ação "revoga" e alvo no catálogo vira
//   registrar_revogacao com o próprio ato.

import { classificarAto } from '../dominio/classificar-ato.ts'
import type { IdentificadorDeNorma, TipoNorma } from '../dominio/norma.ts'
import {
  type ContextoDaColeta,
  codigoDoErro,
  dataEmSaoPaulo,
  ErroDaColeta,
  htmlParaTexto,
  lerBytes,
  lerTexto,
  type VersaoConhecida,
} from './comum.ts'

/** Fontes com coletor, na ordem em que o catálogo é montado. */
export const FONTES_COM_COLETOR = [
  'ima_in',
  'ima_portaria',
  'consema',
  'doe_sc',
  'alesc',
  'joinville_doem',
] as const

/** Dia (aaaa-mm-dd) da janela da coleta; sem janela, hoje em Brasília. */
export function diaDaJanela(ctx: Pick<ContextoDaColeta, 'janela' | 'agora'>): string {
  return (ctx.janela ?? dataEmSaoPaulo(ctx.agora)).slice(0, 10)
}

/** dd/mm/aaaa → aaaa-mm-dd (null quando não é data). */
export function dataBrasileiraParaIso(texto: string): string | null {
  const achado = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim())
  if (!achado) return null
  return `${achado[3] as string}-${achado[2] as string}-${achado[1] as string}`
}

/** Corpo JSON da resposta; texto que não é JSON vira 'formato_inesperado'. */
export async function lerJson(resposta: Response): Promise<unknown> {
  const texto = await lerTexto(resposta)
  try {
    return JSON.parse(texto)
  } catch {
    throw new ErroDaColeta('formato_inesperado')
  }
}

/**
 * HTML no charset certo: o do Content-Type, senão o do <meta>, senão UTF-8 quando os bytes são
 * UTF-8 válido e Windows-1252 quando não são. O SEI de Joinville serve ISO-8859-1 e nem toda página
 * declara o charset.
 */
export function decodificarHtml(bytes: Uint8Array, tipoDaResposta: string | null): string {
  const declarado = /charset=([^;]+)/i
    .exec(tipoDaResposta ?? '')?.[1]
    ?.trim()
    .replace(/"/g, '')
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  const doMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(inicio)?.[1]
  for (const rotulo of [declarado, doMeta]) {
    if (!rotulo) continue
    try {
      return new TextDecoder(rotulo).decode(bytes)
    } catch {
      // rótulo desconhecido: tenta o próximo
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Corpo HTML da resposta, decodificado por decodificarHtml. */
export async function lerHtml(resposta: Response): Promise<string> {
  const bytes = await lerBytes(resposta)
  return decodificarHtml(bytes, resposta.headers.get('content-type'))
}

/**
 * Texto de HTML em que a quebra de linha do código-fonte é só espaço (como no navegador): as linhas
 * do texto saem dos blocos (<p>, <div>, <br>), não da largura com que o documento foi salvo.
 */
export function htmlParaTextoCorrido(html: string): string {
  return htmlParaTexto(
    html
      .replace(/[\r\n]+/g, ' ')
      // O bloco também começa linha nova (o link solto antes de um <div> não gruda nele).
      .replace(/<(?=(?:p|div|li|tr|h[1-6]|table|ul|ol)\b)/gi, '\n<'),
  )
}

/** Linhas do texto, sem espaços repetidos e sem linhas vazias. */
export function normalizarLinhas(texto: string): string {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.replace(/[\s ]+/g, ' ').trim())
    .filter((linha) => linha !== '')
    .join('\n')
}

const AUTORIDADE = /^(?:O|A|OS|AS)\s+[A-ZÀ-Ú]{3,}/u
const ABERTURA_DO_ATO =
  /^(?:considerando|resolve|o\s+prefeito|o\s+governador|o\s+presidente|o\s+secret[áa]rio|art\.)/iu
const TAMANHO_MAXIMO_DA_EMENTA = 300

/**
 * Ementa: a primeira frase da linha logo depois do título, quando ela não é a autoridade que assina
 * ("O SECRETÁRIO...", "O PREFEITO...") nem um "Considerando". Null quando o ato não tem ementa.
 */
export function ementaDoTexto(texto: string): string | null {
  const segunda = normalizarLinhas(texto).split('\n')[1]
  if (segunda === undefined || AUTORIDADE.test(segunda) || ABERTURA_DO_ATO.test(segunda)) {
    return null
  }
  const frase = /^(.+?[.;])(?=\s+\p{Lu}|\s*$)/u.exec(segunda)?.[1] ?? segunda
  return frase.length > TAMANHO_MAXIMO_DA_EMENTA
    ? `${frase.slice(0, TAMANHO_MAXIMO_DA_EMENTA - 1).trimEnd()}…`
    : frase
}

const TIPOS_COM_MILHAR: readonly TipoNorma[] = ['lei', 'lei_complementar', 'decreto']

/** Número para a coluna norma.numero: leis e decretos com ponto de milhar, como na carga. */
export function numeroParaExibir(id: Pick<IdentificadorDeNorma, 'tipo' | 'numero'>): string {
  if (TIPOS_COM_MILHAR.includes(id.tipo) && /^\d{4,}$/.test(id.numero)) {
    return id.numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }
  return id.numero
}

// ---------------------------------------------------------------------------
// Catálogo de várias fontes
// ---------------------------------------------------------------------------
export interface NoCatalogo {
  fonte: string
  conhecida: VersaoConhecida
}

export type Catalogo = Map<string, NoCatalogo>

/** Normas das fontes com coletor, pela chave. A primeira fonte que traz a chave fica com ela. */
export async function catalogoDasFontes(
  ctx: ContextoDaColeta,
  fontes: readonly string[] = FONTES_COM_COLETOR,
): Promise<Catalogo> {
  const catalogo: Catalogo = new Map()
  for (const fonte of fontes) {
    for (const conhecida of await ctx.banco.versoesConhecidas(fonte)) {
      if (!catalogo.has(conhecida.chave)) catalogo.set(conhecida.chave, { fonte, conhecida })
    }
  }
  return catalogo
}

/**
 * Procura a chave no catálogo. Citação sem ano ("Lei nº 14.675") acha a norma com ano quando só uma
 * chave do catálogo começa por ela.
 */
export function acharNoCatalogo(
  catalogo: Catalogo,
  chave: string,
  temAno: boolean,
): [string, NoCatalogo] | null {
  const exata = catalogo.get(chave)
  if (exata) return [chave, exata]
  if (temAno) return null
  const prefixo = `${chave};`
  const candidatas = [...catalogo].filter(([outra]) => outra.startsWith(prefixo))
  return candidatas.length === 1 ? (candidatas[0] as [string, NoCatalogo]) : null
}

export interface RevogacaoCitada {
  /** Título e texto do ato (já sem CPF). */
  texto: string
  chaveDoAto: string
  /** aaaa-mm-dd da publicação do ato. */
  revogadaEm: string | null
  catalogo: Catalogo
  /** Chave do catálogo para a norma citada; null ou erro quando a citação não forma chave. */
  chaveDoAlvo: (alvo: IdentificadorDeNorma) => string | null
}

/**
 * Registra as revogações que o ato faz. Só conta a norma vigente no catálogo das fontes com coletor;
 * norma fora dele (carga sem fonte) é tentada, e 'norma_inexistente' é ignorada. Devolve as chaves
 * revogadas.
 */
export async function registrarRevogacoesCitadas(
  ctx: ContextoDaColeta,
  revogacao: RevogacaoCitada,
): Promise<string[]> {
  const { acao, alvos } = classificarAto(revogacao.texto)
  if (acao !== 'revoga') return []
  const revogadas: string[] = []
  for (const alvo of alvos) {
    let chave: string | null
    try {
      chave = revogacao.chaveDoAlvo(alvo)
    } catch {
      continue
    }
    if (chave === null || chave === revogacao.chaveDoAto) continue
    const achada = acharNoCatalogo(revogacao.catalogo, chave, alvo.ano !== undefined)
    if (achada !== null) {
      const [chaveAchada, no] = achada
      if (no.conhecida.situacao_na_fonte !== 'vigente') continue
      await ctx.banco.registrarRevogacao(
        ctx.coletaId,
        chaveAchada,
        revogacao.chaveDoAto,
        revogacao.revogadaEm,
      )
      no.conhecida.situacao_na_fonte = 'revogada'
      ctx.contagem.itensNovos++
      revogadas.push(chaveAchada)
      continue
    }
    try {
      await ctx.banco.registrarRevogacao(
        ctx.coletaId,
        chave,
        revogacao.chaveDoAto,
        revogacao.revogadaEm,
      )
      ctx.contagem.itensNovos++
      revogadas.push(chave)
    } catch (erro) {
      if (codigoDoErro(erro) !== 'norma_inexistente') throw erro
    }
  }
  return revogadas
}
