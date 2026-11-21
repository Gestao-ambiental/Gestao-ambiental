// Coletor das leis e decretos federais compilados no Planalto (pacote L8, ADR-0050, LEG-02 e
// LEG-03). Uma página HTML por ato; o servidor manda ETag e Last-Modified e responde 304 ao pedido
// condicional, então conferir uma lei que não mudou custa um pedido sem corpo.
//
// - Leis vigiadas = normas da fonte 'planalto' (versoes_conhecidas). O id externo da norma é o
//   caminho da página ("ccivil_03/leis/l6938.htm"); o da versão é o ETag (ou o Last-Modified) que
//   veio com ela. A próxima execução manda If-None-Match / If-Modified-Since com esse valor.
// - Mudou (200): o texto vigente é o da página sem os trechos riscados (<strike>, <s>, <del>), que a
//   compilação mantém para mostrar a redação revogada. Versão = esse texto sem CPF; a diferença vem
//   do fluxo comum (gravarVersao).
// - O HTML é antigo, gerado pelo Word, em Windows-1252: decodificarHtml cuida do charset.
// - Uso livre pela Portaria Casa Civil 130/2021, citando a URL e a data de acesso e dizendo que o
//   conteúdo tem caráter informativo e não oficial (a tela da norma mostra isso).
//
// Cada página baixada (200) conta no `limite` da execução; o 304 não conta.

import {
  type ContextoDaColeta,
  ErroDaColeta,
  gravarVersao,
  lerBytes,
  reservarDownload,
  sha256Hex,
  tentarItem,
} from './comum.ts'
import { decodificarHtml, htmlParaTextoCorrido, normalizarLinhas } from './diarios.ts'

export const FONTE_PLANALTO = 'planalto'
export const BASE_DO_PLANALTO = 'https://www.planalto.gov.br/'

const TIPOS_HTML = ['text/html'] as const

/** Caminho relativo seguro (sem domínio, sem subir pastas) → URL da página. */
export function urlNoPlanalto(caminho: string): string {
  const limpo = caminho.trim().replace(/^\/+/, '')
  if (!/^ccivil_03\/[\w./-]+\.html?$/i.test(limpo) || limpo.includes('..')) {
    throw new ErroDaColeta('caminho_invalido')
  }
  return BASE_DO_PLANALTO + limpo
}

/** Texto vigente da página compilada: sem os trechos riscados (redação revogada). */
export function textoVigenteDoPlanalto(html: string): string {
  const semRiscados = html.replace(/<(strike|s|del)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const corpo = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(semRiscados)?.[1] ?? semRiscados
  return normalizarLinhas(htmlParaTextoCorrido(corpo))
}

/** Valor que identifica a versão servida: o ETag; sem ele, o Last-Modified. */
export function marcaDaVersao(resposta: Response): string | null {
  return resposta.headers.get('etag') ?? resposta.headers.get('last-modified')
}

function cabecalhosCondicionais(marca: string | null): Record<string, string> {
  if (!marca) return {}
  // ETag vem entre aspas (ou com W/); Last-Modified é uma data HTTP.
  return /^(W\/)?"/.test(marca) ? { 'If-None-Match': marca } : { 'If-Modified-Since': marca }
}

export async function coletarLeisDoPlanalto(ctx: ContextoDaColeta): Promise<void> {
  const vigiadas = await ctx.banco.versoesConhecidas(FONTE_PLANALTO)
  for (const lei of vigiadas) {
    if (!lei.id_externo) continue
    await tentarItem(ctx, lei.chave, async () => {
      const url = urlNoPlanalto(lei.id_externo as string)
      const resposta = await ctx.buscar(url, {
        tipos: TIPOS_HTML,
        cabecalhos: cabecalhosCondicionais(lei.ultima_versao_id_externo),
        aceitarNaoModificado: true,
      })
      if (resposta.status === 304) {
        await resposta.body?.cancel()
        return
      }
      if (!reservarDownload(ctx)) {
        await resposta.body?.cancel()
        return
      }
      const bytes = await lerBytes(resposta)
      const texto = textoVigenteDoPlanalto(
        decodificarHtml(bytes, resposta.headers.get('content-type')),
      )
      if (texto.length < 200) throw new ErroDaColeta('formato_inesperado')
      await gravarVersao(ctx, {
        normaId: lei.norma_id,
        conhecida: lei,
        sha256: await sha256Hex(texto),
        texto,
        idExterno: marcaDaVersao(resposta),
        atoNovo: false,
      })
    })
  }
}
