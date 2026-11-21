// Coletor do CONSEMA no site da SEMAE (pacote L1, ADR-0050, LEG-02). Duas partes:
//
// 1. Compilações: HEAD em https://www.semae.sc.gov.br/?wpdmdl=<id> para cada norma da fonte com id
//    numérico (3480 = Resolução 250/2024, 3481 = 251/2024). O id do download não muda; muda o
//    arquivo, e o nome dele no Content-Disposition ("...-compilada-ate-314-2026.pdf") é o id externo
//    da versão. Mudou o nome: GET do PDF e versão nova (o SHA-256 decide).
// 2. Resoluções novas: o sitemap wpdmpro-sitemap.xml lista as páginas de download com lastmod.
//    Página "resolucao-consema-no-<n>" cujo número não está no catálogo e com lastmod a partir da
//    carga do catálogo (DATA_DA_CARGA) vira norma (sc;consema;resolucao;<n>[;<ano>]) com ato novo;
//    a versão é o PDF do link ?wpdmdl= da página, quando há. O corte é a data da carga, não a da
//    última coleta: a resolução criada entra no catálogo e não volta, então dá o mesmo resultado
//    sem ler fonte_legal (que fica em private, fora do PostgREST).
//
// O cache da SEMAE já devolveu o RSS no lugar da página e do sitemap: o Content-Type é conferido
// (application/rss+xml vira 'conteudo_inesperado') e o PDF tem a assinatura conferida.

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
  TIPOS_PDF,
  type VersaoConhecida,
} from './comum.ts'

export const FONTE_CONSEMA = 'consema'
export const URL_DO_SITEMAP = 'https://www.semae.sc.gov.br/wpdmpro-sitemap.xml'
export const urlDoDownload = (id: string) => `https://www.semae.sc.gov.br/?wpdmdl=${id}`
/** Dia da carga inicial do catálogo (20261120230100). Antes dela, o catálogo é a referência. */
export const DATA_DA_CARGA = '2026-11-20'

export interface PaginaNoSitemap {
  loc: string
  /** aaaa-mm-dd do lastmod (null sem lastmod). */
  lastmod: string | null
}

export function lerSitemap(xml: string): PaginaNoSitemap[] {
  const paginas: PaginaNoSitemap[] = []
  for (const url of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const corpo = url[1] ?? ''
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(corpo)?.[1]
    if (!loc) continue
    const lastmod = /<lastmod>\s*(\d{4}-\d{2}-\d{2})/.exec(corpo)?.[1] ?? null
    paginas.push({ loc: decodificarEntidades(loc), lastmod })
  }
  if (paginas.length === 0) throw new ErroDaColeta('formato_inesperado')
  return paginas
}

export interface ResolucaoNoSitemap extends PaginaNoSitemap {
  numero: string
  ano: number | null
}

/** "…/download/resolucao-consema-no-235-2024-que-da-…/" → 235/2024; sem ano no slug, ano nulo. */
export function resolucaoDaPagina(pagina: PaginaNoSitemap): ResolucaoNoSitemap | null {
  const achado = /\/download\/resolucao-consema-no-(\d+)(?:-((?:19|20)\d{2}))?(?=[-/]|$)/.exec(
    pagina.loc,
  )
  if (!achado?.[1]) return null
  const numero = achado[1].replace(/^0+(?=\d)/, '')
  return { ...pagina, numero, ano: achado[2] ? Number(achado[2]) : null }
}

/** Primeiro id de download (?wpdmdl=) da página da resolução. */
export function idDoDownloadNaPagina(html: string): string | null {
  return /[?&](?:amp;)?wpdmdl=(\d+)/.exec(html)?.[1] ?? null
}

/** Título da página sem o nome do site. */
export function tituloDaPagina(html: string): string | null {
  const bruto = /<title>([^<]*)<\/title>/i.exec(html)?.[1]
  if (!bruto) return null
  const titulo = decodificarEntidades(bruto)
    .replace(/\s*[-–|]\s*SEMAE\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return titulo === '' ? null : titulo
}

async function baixarVersao(
  ctx: ContextoDaColeta,
  normaId: string,
  conhecida: VersaoConhecida | null,
  idDownload: string,
  atoNovo: boolean,
): Promise<void> {
  const { bytes, resposta } = await baixarPdf(ctx, urlDoDownload(idDownload))
  await gravarVersao(ctx, {
    normaId,
    conhecida,
    sha256: await sha256Hex(bytes),
    texto: await textoDoPdf(ctx, bytes),
    arquivo: { bytes, mime: 'application/pdf' },
    idExterno: nomeDoArquivo(resposta),
    atoNovo,
  })
}

export async function coletarConsema(ctx: ContextoDaColeta): Promise<void> {
  const conhecidas = await ctx.banco.versoesConhecidas(FONTE_CONSEMA)

  // 1. Compilações (e toda resolução com download conhecido): o nome do arquivo diz se mudou.
  for (const conhecida of conhecidas) {
    const id = conhecida.id_externo
    if (id === null || !/^\d+$/.test(id)) continue
    await tentarItem(ctx, `wpdmdl_${id}`, async () => {
      const cabeca = await ctx.buscar(urlDoDownload(id), { metodo: 'HEAD', tipos: TIPOS_PDF })
      const nome = nomeDoArquivo(cabeca)
      if (nome === null) throw new ErroDaColeta('formato_inesperado')
      if (nome === conhecida.ultima_versao_id_externo) return
      if (!reservarDownload(ctx)) return
      await baixarVersao(ctx, conhecida.norma_id, conhecida, id, false)
    })
  }

  // 2. Resoluções novas pelo sitemap.
  await tentarItem(ctx, 'sitemap', async () => {
    const resposta = await ctx.buscar(URL_DO_SITEMAP, { tipos: ['application/xml', 'text/xml'] })
    const numeros = new Set(conhecidas.map((c) => c.chave.split(';')[3]))
    const novas = lerSitemap(await lerTexto(resposta))
      .map(resolucaoDaPagina)
      .filter(
        (r): r is ResolucaoNoSitemap =>
          r !== null && !numeros.has(r.numero) && r.lastmod !== null && r.lastmod >= DATA_DA_CARGA,
      )
      .sort((a, b) => Number(a.numero) - Number(b.numero))
    const vistas = new Set<string>()
    for (const resolucao of novas) {
      if (vistas.has(resolucao.numero)) continue
      vistas.add(resolucao.numero)
      // A página e o PDF saem juntos: sem espaço no limite, a resolução fica para a próxima.
      if (!reservarDownload(ctx)) continue
      await tentarItem(ctx, `resolucao_${resolucao.numero}`, async () => {
        const pagina = await ctx.buscar(resolucao.loc, { tipos: ['text/html'] })
        const html = await lerTexto(pagina)
        const idDownload = idDoDownloadNaPagina(html)
        const ano = resolucao.ano
        const normaId = await ctx.banco.garantirNorma({
          chave: [
            'sc',
            'consema',
            'resolucao',
            resolucao.numero,
            ...(ano ? [String(ano)] : []),
          ].join(';'),
          esfera: 'estadual',
          orgao: 'CONSEMA',
          tipo: 'resolucao',
          numero: resolucao.numero,
          ano,
          titulo: `Resolução CONSEMA ${resolucao.numero}${ano ? `/${String(ano)}` : ''}`,
          ementa: tituloDaPagina(html),
          url_oficial: resolucao.loc,
          fonte: FONTE_CONSEMA,
          id_externo: idDownload,
          situacao_na_fonte: 'vigente',
        })
        if (idDownload !== null) await baixarVersao(ctx, normaId, null, idDownload, true)
      })
    }
  })
}
