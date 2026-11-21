// Coletor do Diário Oficial de SC (pacote L2, ADR-0050, LEG-02 e LEG-03). API JSON pública do
// portal (sem documentação, sem token), lida por edição do dia da janela:
//
// 1. GET /apis/jornal/?dtStart=<dia> 00:00:00&dtEnd=<dia> 23:59:59: as edições do dia, inclusive as
//    extras ("22884-A"). Sem edição no dia: 0 itens.
// 2. POST /apis/busca-materia para cada categoria (IMA, SEMAE, JUCESC, Atos do Poder Executivo) e
//    cada termo sem acento (a busca com acento não acha nada). A busca ignora a data e ordena por
//    relevância, então só ficam as matérias cujo jornal (cdJornal ou nrJornal) é uma edição do dia,
//    sem repetir matéria.
// 3. GET /apis/edicao-preview/edicao/0/materia/<id> para cada uma (o texto da busca vem com bytes
//    inválidos; o do preview vem em UTF-8 certo). avaliarAtoDoDiario decide: só o normativo
//    ambiental vira norma (estadual, chave por chaveDaNorma), com fonte 'doe_sc', id externo = id da
//    matéria e versão = texto sem CPF (objeto nulo: nada com CPF vai ao Storage), ato novo.
//
// Ato que já está no catálogo por outra fonte (a lei que veio da ALESC) não é recriado nem ganha
// versão do DOE: a fonte dele continua dona do texto. Portaria e IN do IMA e resolução do CONSEMA
// têm coletor próprio e ficam com ele mesmo quando o DOE sai antes (senão a versão do coletor próprio
// viraria uma "alteração" falsa); se já estão no catálogo, o DOE ainda registra as revogações que
// fazem. Revogação: classificarAto com ação "revoga" e alvo vigente no catálogo vira
// registrar_revogacao com o ato e a data da edição.
//
// Campos de pessoas da resposta (dsUsuarioaprovacao, cdUsuarioaprovacao) nunca são lidos. As
// prévias não contam no `limite` da execução: não há arquivo, e uma matéria pulada não voltaria (a
// coleta da janela fica concluída).

import { avaliarAtoDoDiario } from '../dominio/filtro-de-ato.ts'
import {
  chaveDaNorma,
  type IdentificadorDeNorma,
  type TipoNorma,
  tituloCurtoDaNorma,
} from '../dominio/norma.ts'
import { removerCpf } from '../dominio/sem-cpf.ts'
import {
  type ContextoDaColeta,
  ErroDaColeta,
  gravarVersao,
  sha256Hex,
  tentarItem,
} from './comum.ts'
import {
  type Catalogo,
  catalogoDasFontes,
  diaDaJanela,
  ementaDoTexto,
  lerJson,
  normalizarLinhas,
  numeroParaExibir,
  registrarRevogacoesCitadas,
} from './diarios.ts'

export const FONTE_DOE_SC = 'doe_sc'
export const API_DO_DOE = 'https://portal.doe.sea.sc.gov.br/apis'
export const URL_DA_BUSCA_NO_DOE = `${API_DO_DOE}/busca-materia`
export const urlDasEdicoesDoDia = (dia: string) =>
  `${API_DO_DOE}/jornal/?page=1&perPage=50&dtStart=${dia}%2000:00:00&dtEnd=${dia}%2023:59:59`
export const urlDaPreviaDaMateria = (id: string) =>
  `${API_DO_DOE}/edicao-preview/edicao/0/materia/${id}`

/** HTML estático da matéria no repositório do DOE (com ETag e Last-Modified). */
export function urlOficialDaMateria(id: string, dia: string): string {
  return `https://portal.doe.sea.sc.gov.br/repositorio/${dia.slice(0, 4)}/${dia.replace(/-/g, '')}/Materias/${id}/${id}_final.html`
}

export interface CategoriaDoDoe {
  codigo: number
  /** Nome como o portal lista em /apis/select/categoria/categoria. */
  nome: string
  /** Órgão da norma quando a citação não diz (null nos Atos do Poder Executivo). */
  orgao: string | null
}

export const CATEGORIAS_DO_DOE: readonly CategoriaDoDoe[] = [
  { codigo: 4704300, nome: 'IMA – Instituto do Meio Ambiente', orgao: 'IMA' },
  { codigo: 4704921, nome: 'Meio Ambiente e da Economia Verde', orgao: 'SEMAE' },
  { codigo: 4704303, nome: 'JUCESC – Junta Comercial', orgao: 'JUCESC' },
  { codigo: 4704258, nome: 'Atos do Poder Executivo', orgao: null },
]

/** Termos sem acento: a busca com acento volta vazia. */
export const TERMOS_DA_BUSCA_NO_DOE = [
  'CONSEMA',
  'licenciamento',
  'Instrucao Normativa',
  'Portaria',
  'Resolucao',
  '14.675',
  'CGSIM',
] as const

export const TAMANHO_DA_PAGINA_DA_BUSCA = 50
const TIPOS_JSON = ['application/json', 'text/json'] as const

export function corpoDaBusca(termo: string, categoria: number): string {
  return JSON.stringify({
    busca: termo,
    tipoBusca: 2,
    pagination: { from: 0, size: TAMANHO_DA_PAGINA_DA_BUSCA },
    resumo: false,
    aCdAssunto: [],
    aCdCategoria: [categoria],
  })
}

// ---------------------------------------------------------------------------
// Leitura das respostas (só os campos usados)
// ---------------------------------------------------------------------------
function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function dataIso(valor: unknown): string | null {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor) ? valor.slice(0, 10) : null
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : ''
}

export interface EdicaoDoDoe {
  cdJornal: number
  /** "22885", "22884-A" */
  numero: string
  /** aaaa-mm-dd */
  data: string
  cancelada: boolean
}

/** Lista de edições (records.data). Formato diferente lança 'formato_inesperado'. */
export function lerEdicoesDoDoe(json: unknown): EdicaoDoDoe[] {
  const dados = objeto(objeto(json)?.records)?.data
  if (!Array.isArray(dados)) throw new ErroDaColeta('formato_inesperado')
  return dados.map((bruto) => {
    const edicao = objeto(bruto)
    const cdJornal = edicao?.cdJornal
    const numero = textoDe(edicao?.vlNumero).trim()
    const data = dataIso(edicao?.dtPublicacao)
    if (typeof cdJornal !== 'number' || numero === '' || data === null) {
      throw new ErroDaColeta('formato_inesperado')
    }
    return { cdJornal, numero, data, cancelada: edicao?.stCancelado === true }
  })
}

export interface MateriaNaBusca {
  id: string
  cdJornal: number | null
  nrJornal: string
  cancelada: boolean
}

export function lerBuscaDoDoe(json: unknown): MateriaNaBusca[] {
  const materias = objeto(json)?.materias
  if (!Array.isArray(materias)) throw new ErroDaColeta('formato_inesperado')
  return materias.map((bruto) => {
    const materia = objeto(bruto)
    const id = textoDe(materia?.id)
    if (!/^\d+$/.test(id)) throw new ErroDaColeta('formato_inesperado')
    return {
      id,
      cdJornal: typeof materia?.cdJornal === 'number' ? materia.cdJornal : null,
      nrJornal: textoDe(materia?.nrJornal).trim(),
      cancelada: materia?.cancelada === true,
    }
  })
}

export interface MateriaDoDoe {
  id: string
  /** Primeira linha do texto ("PORTARIA Nº 120, DE 18 DE NOVEMBRO DE 2026"). */
  titulo: string
  /** dsTexto com as linhas normalizadas (ainda com CPF: sai em removerCpf antes de gravar). */
  texto: string
  /** aaaa-mm-dd da edição */
  data: string | null
  numeroDaEdicao: string
  /** "PORTARIA", "RESOLUÇÃO", "EDITAL" */
  assunto: string
}

/** Prévia da matéria (item). Sem texto ou com erro lança 'formato_inesperado'. */
export function lerMateriaDoDoe(json: unknown): MateriaDoDoe {
  const raiz = objeto(json)
  const item = objeto(raiz?.item)
  if (raiz?.error === true || item === null) throw new ErroDaColeta('formato_inesperado')
  const id = textoDe(item.cdMateria)
  const texto = normalizarLinhas(textoDe(item.dsTexto))
  if (!/^\d+$/.test(id) || texto === '') throw new ErroDaColeta('formato_inesperado')
  return {
    id,
    titulo: texto.split('\n')[0] ?? '',
    texto,
    data: dataIso(item.dtPublicacaoJornal) ?? dataIso(item.dtPublicacao),
    numeroDaEdicao: textoDe(item.vlNumero).trim(),
    assunto: textoDe(item.dsAssunto).trim(),
  }
}

// ---------------------------------------------------------------------------
// Órgão e chave
// ---------------------------------------------------------------------------
export interface OrgaoDoAto {
  /** Parte da chave ("ima", "alesc", "executivo"). */
  chave: string
  /** Coluna norma.orgao, como na carga ("IMA", "ALESC", "Governo de SC"). */
  nome: string
  /** Sigla no título curto ("Portaria SEMAE 92/2026"); null em lei e decreto. */
  noTitulo: string | null
}

const ALESC: OrgaoDoAto = { chave: 'alesc', nome: 'ALESC', noTitulo: null }
const EXECUTIVO: OrgaoDoAto = { chave: 'executivo', nome: 'Governo de SC', noTitulo: null }
const CGSIM = /(?<![\p{L}\p{N}])CGSIM(?![\p{L}\p{N}])/u

function sigla(orgao: string): OrgaoDoAto {
  return { chave: orgao.toLowerCase(), nome: orgao, noTitulo: orgao }
}

/**
 * Órgão da norma: lei estadual é da ALESC e decreto é do Executivo (as chaves da carga); nos outros
 * tipos, o órgão citado, senão o da categoria (na JUCESC, o CGSIM-SC quando o texto o cita).
 */
export function orgaoDoAto(
  id: Pick<IdentificadorDeNorma, 'tipo' | 'orgao'>,
  categoria: CategoriaDoDoe,
  texto: string,
): OrgaoDoAto {
  if (id.tipo === 'lei' || id.tipo === 'lei_complementar') return ALESC
  if (id.tipo === 'decreto') return EXECUTIVO
  if (id.orgao !== undefined) return sigla(id.orgao)
  if (categoria.orgao === 'JUCESC' && CGSIM.test(texto)) return sigla('CGSIM')
  return categoria.orgao === null ? EXECUTIVO : sigla(categoria.orgao)
}

/** Portaria e IN do IMA e resolução do CONSEMA têm coletor próprio (ima_portaria, ima_in, consema). */
export function temColetorProprio(tipo: TipoNorma, orgao: string): boolean {
  return (
    (orgao === 'ima' && (tipo === 'portaria' || tipo === 'instrucao_normativa')) ||
    (orgao === 'consema' && tipo === 'resolucao')
  )
}

/** Chave estadual da norma citada; as INs do IMA não têm ano na chave (como na carga). */
export function chaveEstadualDoAlvo(alvo: IdentificadorDeNorma, doAto: OrgaoDoAto): string {
  const orgao =
    alvo.tipo === 'lei' || alvo.tipo === 'lei_complementar'
      ? ALESC
      : alvo.tipo === 'decreto'
        ? EXECUTIVO
        : alvo.orgao !== undefined
          ? sigla(alvo.orgao)
          : doAto
  const semAno = alvo.tipo === 'instrucao_normativa' && orgao.chave === 'ima'
  return chaveDaNorma({
    esfera: 'estadual',
    orgao: orgao.chave,
    tipo: alvo.tipo,
    numero: alvo.numero,
    ano: semAno ? undefined : alvo.ano,
  })
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------
interface Encontrada {
  id: string
  categoria: CategoriaDoDoe
}

export async function coletarDoeSc(ctx: ContextoDaColeta): Promise<void> {
  const dia = diaDaJanela(ctx)
  const resposta = await ctx.buscar(urlDasEdicoesDoDia(dia), { tipos: TIPOS_JSON })
  const edicoes = lerEdicoesDoDoe(await lerJson(resposta)).filter(
    (e) => e.data === dia && !e.cancelada,
  )
  if (edicoes.length === 0) return
  const jornais = new Set(edicoes.map((e) => e.cdJornal))
  const numeros = new Set(edicoes.map((e) => e.numero))

  const encontradas = new Map<string, Encontrada>()
  for (const categoria of CATEGORIAS_DO_DOE) {
    for (const termo of TERMOS_DA_BUSCA_NO_DOE) {
      await tentarItem(ctx, `busca_${String(categoria.codigo)}`, async () => {
        const achadas = await ctx.buscar(URL_DA_BUSCA_NO_DOE, {
          metodo: 'POST',
          corpo: corpoDaBusca(termo, categoria.codigo),
          tipoDoCorpo: 'application/json',
          tipos: TIPOS_JSON,
        })
        for (const materia of lerBuscaDoDoe(await lerJson(achadas))) {
          if (materia.cancelada || encontradas.has(materia.id)) continue
          const doDia =
            (materia.cdJornal !== null && jornais.has(materia.cdJornal)) ||
            numeros.has(materia.nrJornal)
          if (doDia) encontradas.set(materia.id, { id: materia.id, categoria })
        }
      })
    }
  }
  if (encontradas.size === 0) return

  const catalogo = await catalogoDasFontes(ctx)
  const ordem = [...encontradas.values()].sort((a, b) => Number(a.id) - Number(b.id))
  for (const { id, categoria } of ordem) {
    await tentarItem(ctx, `materia_${id}`, () => gravarMateria(ctx, id, categoria, dia, catalogo))
  }
}

async function gravarMateria(
  ctx: ContextoDaColeta,
  id: string,
  categoria: CategoriaDoDoe,
  dia: string,
  catalogo: Catalogo,
): Promise<void> {
  const resposta = await ctx.buscar(urlDaPreviaDaMateria(id), { tipos: TIPOS_JSON })
  const materia = lerMateriaDoDoe(await lerJson(resposta))
  const avaliacao = avaliarAtoDoDiario({
    titulo: materia.titulo,
    texto: materia.texto,
    categoria: categoria.nome,
    tipoDocumento: materia.assunto,
  })
  if (!avaliacao.relevante || avaliacao.identificador === null) return

  const ident = avaliacao.identificador
  const orgao = orgaoDoAto(ident, categoria, materia.texto)
  const chave = chaveDaNorma({
    esfera: 'estadual',
    orgao: orgao.chave,
    tipo: ident.tipo,
    numero: ident.numero,
    ano: ident.ano,
  })
  const data = materia.data ?? dia
  const texto = removerCpf(materia.texto)
  const existente = catalogo.get(chave)
  const deOutraFonte = existente !== undefined && existente.fonte !== FONTE_DOE_SC
  const deOutroColetor = temColetorProprio(ident.tipo, orgao.chave)
  if (deOutroColetor && existente === undefined) return

  if (!deOutraFonte && !deOutroColetor) {
    const ementa = ementaDoTexto(texto)
    const normaId = await ctx.banco.garantirNorma({
      chave,
      esfera: 'estadual',
      orgao: orgao.nome,
      tipo: ident.tipo,
      numero: numeroParaExibir(ident),
      ano: ident.ano ?? null,
      titulo: tituloCurtoDaNorma({ ...ident, orgao: orgao.noTitulo ?? undefined }),
      ementa,
      url_oficial: urlOficialDaMateria(id, data),
      fonte: FONTE_DOE_SC,
      id_externo: id,
      situacao_na_fonte: 'vigente',
    })
    const sha256 = await sha256Hex(texto)
    await gravarVersao(ctx, {
      normaId,
      conhecida: existente?.conhecida ?? null,
      sha256,
      texto,
      idExterno: id,
      publicadaEm: data,
      publicadaEmTexto: data,
      atoNovo: true,
    })
    if (existente === undefined) {
      catalogo.set(chave, {
        fonte: FONTE_DOE_SC,
        conhecida: {
          norma_id: normaId,
          chave,
          id_externo: id,
          situacao_na_fonte: 'vigente',
          ultima_versao_id_externo: id,
          ultimo_sha256: sha256,
          ultima_versao_numero: 1,
        },
      })
    }
  }

  await registrarRevogacoesCitadas(ctx, {
    texto,
    chaveDoAto: chave,
    revogadaEm: data,
    catalogo,
    chaveDoAlvo: (alvo) => chaveEstadualDoAlvo(alvo, orgao),
  })
}
