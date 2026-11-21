// Coletor do Diário Oficial Eletrônico de Joinville (pacote L2, ADR-0050, LEG-02 e LEG-03). O DOEM
// fica no SEI da prefeitura (sei.joinville.sc.gov.br, sem robots.txt e sem CAPTCHA), em HTML
// ISO-8859-1, e cada documento vem com tipo e unidade:
//
// 1. Lista de edições (acao=md_pmj_doem_jornal_externo, primeira página, as mais recentes): ficam
//    as edições com a data da janela, inclusive as extraordinárias.
// 2. Para cada uma, a lista de documentos (acao=md_pmj_doem_jornal_externo_individual): ficam os de
//    unidade SAMA.* (Secretaria de Meio Ambiente) ou do COMDEMA e tipo normativo (Instrução
//    Normativa, Resolução, Portaria, Lei, Lei Complementar, Decreto, Resumo da Ata de Deliberação).
//    Licenças, autorizações (LAP, LAI, LAO, AuA), editais e extratos ficam de fora sem baixar.
// 3. Cada documento (acao=publicacao_visualizar) vira texto e passa por avaliarAtoDoDiario (portaria
//    de pessoal e ato individual saem aqui). O normativo ambiental vira norma municipal (IBGE
//    4209102, órgão SAMA ou COMDEMA), fonte 'joinville_doem', id externo = id_documento, versão =
//    texto sem CPF (objeto nulo), ato novo. Revogação citada de norma do catálogo é registrada.
//
// Os documentos não contam no `limite` da execução: um documento pulado não voltaria, porque a
// coleta da janela fica concluída.

import { avaliarAtoDoDiario } from '../dominio/filtro-de-ato.ts'
import { chaveDaNorma, type IdentificadorDeNorma, tituloCurtoDaNorma } from '../dominio/norma.ts'
import { removerCpf } from '../dominio/sem-cpf.ts'
import {
  type ContextoDaColeta,
  decodificarEntidades,
  ErroDaColeta,
  gravarVersao,
  sha256Hex,
  tentarItem,
} from './comum.ts'
import {
  type Catalogo,
  catalogoDasFontes,
  dataBrasileiraParaIso,
  diaDaJanela,
  ementaDoTexto,
  htmlParaTextoCorrido,
  lerHtml,
  numeroParaExibir,
  registrarRevogacoesCitadas,
} from './diarios.ts'

export const FONTE_JOINVILLE_DOEM = 'joinville_doem'
export const MUNICIPIO_JOINVILLE = '4209102'
export const CONTROLADOR_DO_DOEM =
  'https://sei.joinville.sc.gov.br/sei/publicacoes/controlador_publicacoes.php'
export const URL_DAS_EDICOES_DO_DOEM = `${CONTROLADOR_DO_DOEM}?acao=md_pmj_doem_jornal_externo&id_orgao_publicacao=0&filtro=0`
export const urlDaEdicaoDoDoem = (numero: string) =>
  `${CONTROLADOR_DO_DOEM}?acao=md_pmj_doem_jornal_externo_individual&num_edicao=${numero}&id_orgao_publicacao=0`
export const urlDoDocumentoDoDoem = (id: string) =>
  `${CONTROLADOR_DO_DOEM}?acao=publicacao_visualizar&id_documento=${id}&id_orgao_publicacao=0`

const TIPOS_HTML = ['text/html'] as const

/** Tipos do DOEM que podem ser norma (comparados sem acento e em minúsculas). */
export const TIPOS_NORMATIVOS_DO_DOEM = [
  'instrucao normativa',
  'resolucao',
  'portaria',
  'lei',
  'lei ordinaria',
  'lei complementar',
  'decreto',
  'resumo da ata de deliberacao',
] as const

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '')
}

// ---------------------------------------------------------------------------
// Leitura das páginas
// ---------------------------------------------------------------------------
export interface EdicaoDoDoem {
  numero: string
  /** aaaa-mm-dd */
  data: string
  extraordinaria: boolean
}

/** Cartões da lista de edições: acaoCard('3094', '19/11/2026', '0', ...). */
export function lerEdicoesDoDoem(html: string): EdicaoDoDoem[] {
  const edicoes: EdicaoDoDoem[] = []
  for (const achado of html.matchAll(/acaoCard\(\s*'(\d+)'\s*,\s*'([\d/]+)'\s*,\s*'(\d)'/g)) {
    const data = dataBrasileiraParaIso(achado[2] ?? '')
    if (data === null) continue
    edicoes.push({ numero: achado[1] as string, data, extraordinaria: achado[3] === '1' })
  }
  if (edicoes.length === 0) throw new ErroDaColeta('formato_inesperado')
  return edicoes
}

export interface DocumentoNaEdicao {
  idDocumento: string
  /** "Instrução Normativa", "Autorização Ambiental - AuA" */
  tipo: string
  /** "SAMA.UNF", "SEGOV.UAD" */
  unidade: string
}

/** Linhas da tabela de documentos da edição (tabelaDocs). */
export function lerDocumentosDaEdicao(html: string): DocumentoNaEdicao[] {
  if (!/id="tabelaDocs"/.test(html)) throw new ErroDaColeta('formato_inesperado')
  const documentos: DocumentoNaEdicao[] = []
  const linha =
    /<tr\b[^>]*?\bdata-tipo="([^"]*)"[^>]*?\bdata-unidade="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g
  for (const achado of html.matchAll(linha)) {
    const id = /id_documento=(\d+)/.exec(achado[3] ?? '')?.[1]
    if (id === undefined) continue
    documentos.push({
      idDocumento: id,
      tipo: decodificarEntidades(achado[1] ?? '').trim(),
      unidade: decodificarEntidades(achado[2] ?? '').trim(),
    })
  }
  return documentos
}

/** Unidade da SAMA ou do COMDEMA e tipo normativo: o resto nem é baixado. */
export function documentoQueInteressa(documento: DocumentoNaEdicao): boolean {
  const unidade = documento.unidade.toUpperCase()
  const daSama = /^SAMA(?:\.|$)/.test(unidade) || unidade.includes('COMDEMA')
  const tipo = semAcento(documento.tipo).toLowerCase().replace(/\s+/g, ' ').trim()
  return daSama && (TIPOS_NORMATIVOS_DO_DOEM as readonly string[]).includes(tipo)
}

export interface DocumentoDoDoem {
  /** Primeira linha do documento ("Instrução Normativa SEI Nº 5/2026 - SAMA.UNF"). */
  titulo: string
  /** Texto do documento, ainda com CPF. */
  texto: string
}

/** Texto do documento sem o quadro do módulo SEI e sem imagens (o timbre vem em base64). */
export function lerDocumentoDoDoem(html: string): DocumentoDoDoem {
  const corpo = /<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(html)?.[1]
  if (corpo === undefined) throw new ErroDaColeta('formato_inesperado')
  const limpo = corpo
    .replace(/<div[^>]*>\s*M(?:ó|&oacute;)dulo SEI[\s\S]*?<\/div>/i, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
  const texto = htmlParaTextoCorrido(limpo)
  if (texto === '') throw new ErroDaColeta('formato_inesperado')
  return { titulo: texto.split('\n')[0] ?? '', texto }
}

// ---------------------------------------------------------------------------
// Chave
// ---------------------------------------------------------------------------
/** COMDEMA quando a unidade ou o título dizem; senão SAMA. */
export function orgaoDoDocumento(unidade: string, titulo: string): 'SAMA' | 'COMDEMA' {
  return /COMDEMA/i.test(`${unidade} ${titulo}`) ? 'COMDEMA' : 'SAMA'
}

const SIGLA_COMDEMA = /(?<![\p{L}\p{N}])COMDEMA(?![\p{L}\p{N}])\s*/gu

/**
 * Texto para avaliarAtoDoDiario sem a sigla COMDEMA: a leitura da citação só conhece os órgãos de
 * ORGAOS_RECONHECIDOS e não acha número em "Resolução COMDEMA nº 4/2026". O órgão sai da unidade e
 * do título originais (orgaoDoDocumento).
 */
export function semSiglaDoConselho(texto: string): string {
  return texto.replace(SIGLA_COMDEMA, '')
}

export function chaveMunicipalDeJoinville(
  id: Pick<IdentificadorDeNorma, 'tipo' | 'numero' | 'ano'>,
  orgao: string,
): string {
  return chaveDaNorma({
    esfera: 'municipal',
    municipioIbge: MUNICIPIO_JOINVILLE,
    orgao,
    tipo: id.tipo,
    numero: id.numero,
    ano: id.ano,
  })
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------
export async function coletarDoemDeJoinville(ctx: ContextoDaColeta): Promise<void> {
  const dia = diaDaJanela(ctx)
  const lista = await ctx.buscar(URL_DAS_EDICOES_DO_DOEM, { tipos: TIPOS_HTML })
  // A lista vem da mais nova para a mais antiga; grava na ordem de publicação.
  const edicoes = lerEdicoesDoDoem(await lerHtml(lista))
    .filter((e) => e.data === dia)
    .sort((a, b) => Number(a.numero) - Number(b.numero))
  if (edicoes.length === 0) return

  let catalogo: Catalogo | null = null
  for (const edicao of edicoes) {
    await tentarItem(ctx, `edicao_${edicao.numero}`, async () => {
      const pagina = await ctx.buscar(urlDaEdicaoDoDoem(edicao.numero), { tipos: TIPOS_HTML })
      const documentos = lerDocumentosDaEdicao(await lerHtml(pagina)).filter(documentoQueInteressa)
      for (const documento of documentos) {
        await tentarItem(ctx, `documento_${documento.idDocumento}`, async () => {
          catalogo ??= await catalogoDasFontes(ctx)
          await gravarDocumento(ctx, documento, edicao, catalogo)
        })
      }
    })
  }
}

async function gravarDocumento(
  ctx: ContextoDaColeta,
  documento: DocumentoNaEdicao,
  edicao: EdicaoDoDoem,
  catalogo: Catalogo,
): Promise<void> {
  const resposta = await ctx.buscar(urlDoDocumentoDoDoem(documento.idDocumento), {
    tipos: TIPOS_HTML,
  })
  const lido = lerDocumentoDoDoem(await lerHtml(resposta))
  const avaliacao = avaliarAtoDoDiario({
    titulo: semSiglaDoConselho(lido.titulo),
    texto: semSiglaDoConselho(lido.texto),
    entidade: documento.unidade,
    tipoDocumento: documento.tipo,
  })
  if (!avaliacao.relevante || avaliacao.identificador === null) return

  const ident = avaliacao.identificador
  const orgao = orgaoDoDocumento(documento.unidade, lido.titulo)
  const chave = chaveMunicipalDeJoinville(ident, orgao)
  const texto = removerCpf(lido.texto)
  const sha256 = await sha256Hex(texto)
  const normaId = await ctx.banco.garantirNorma({
    chave,
    esfera: 'municipal',
    municipio_ibge: MUNICIPIO_JOINVILLE,
    orgao,
    tipo: ident.tipo,
    numero: numeroParaExibir(ident),
    ano: ident.ano ?? null,
    titulo: tituloCurtoDaNorma({ ...ident, orgao }),
    ementa: ementaDoTexto(texto),
    url_oficial: urlDoDocumentoDoDoem(documento.idDocumento),
    fonte: FONTE_JOINVILLE_DOEM,
    id_externo: documento.idDocumento,
    situacao_na_fonte: 'vigente',
  })
  const existente = catalogo.get(chave)
  await gravarVersao(ctx, {
    normaId,
    conhecida: existente?.conhecida ?? null,
    sha256,
    texto,
    idExterno: documento.idDocumento,
    publicadaEm: edicao.data,
    publicadaEmTexto: edicao.data,
    atoNovo: true,
  })
  if (existente === undefined) {
    catalogo.set(chave, {
      fonte: FONTE_JOINVILLE_DOEM,
      conhecida: {
        norma_id: normaId,
        chave,
        id_externo: documento.idDocumento,
        situacao_na_fonte: 'vigente',
        ultima_versao_id_externo: documento.idDocumento,
        ultimo_sha256: sha256,
        ultima_versao_numero: 1,
      },
    })
  }

  await registrarRevogacoesCitadas(ctx, {
    texto,
    chaveDoAto: chave,
    revogadaEm: edicao.data,
    catalogo,
    // Só norma do mesmo órgão (citada sem órgão ou como SAMA); lei, decreto e norma de outro órgão
    // citados aqui não são do catálogo municipal da SAMA.
    chaveDoAlvo: (alvo) =>
      alvo.tipo === 'lei' ||
      alvo.tipo === 'lei_complementar' ||
      alvo.tipo === 'decreto' ||
      (alvo.orgao !== undefined && alvo.orgao !== 'SAMA')
        ? null
        : chaveMunicipalDeJoinville(alvo, alvo.orgao ?? orgao),
  })
}
