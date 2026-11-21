// Coletor dos diários municipais de SC pelos dados abertos do CIGA (pacote L9, ADR-0050, LEG-02). O
// DOM-SC publica cerca de 250 municípios; o CIGA posta os atos em dados.ciga.sc.gov.br (CKAN), um
// dataset por mês e um ZIP com JSON por janela do dia (00:00–11:59, 12:00–15:59, 16:00–23:59).
//
// - O robots.txt do CIGA permite /dataset e bloqueia /api/: a lista de ZIPs sai da página HTML do
//   dataset do mês (domsc-publicacoes-de-MM-AAAA), nunca da API do CKAN. O aceite formal do uso fica
//   com o Eduardo (docs/contatos-com-orgaos.md); até lá a fonte fica desligada.
// - Só os municípios onde a consultoria tem unidade interessam (municipios_vigiados, pelo nome
//   normalizado; o JSON traz o nome do município, não o código IBGE).
// - Filtro barato (categoria normativa) e depois avaliarAtoDoDiario (ato individual, pessoal e
//   compras ficam fora). Vira norma municipal (chave sc;<ibge>;<órgão>;<tipo>;<número>[;ano]),
//   versão = texto sem CPF, ato novo; revogação de norma do catálogo é registrada.
// - Cada ZIP baixado conta no `limite`. As três execuções do dia leem os ZIPs do dia de novo e
//   pulam os atos que já estão no catálogo.

import { classificarAto } from '../dominio/classificar-ato.ts'
import { avaliarAtoDoDiario } from '../dominio/filtro-de-ato.ts'
import { chaveDaNorma, tituloCurtoDaNorma } from '../dominio/norma.ts'
import {
  type ContextoDaColeta,
  ErroDaColeta,
  gravarVersao,
  htmlParaTexto,
  lerBytes,
  reservarDownload,
  sha256Hex,
  tentarItem,
} from './comum.ts'
import { acharNoCatalogo, catalogoDasFontes, diaDaJanela, lerHtml } from './diarios.ts'
import { arquivosDoZip } from './inlabs.ts'

export const FONTE_CIGA = 'ciga'
export const BASE_DO_CIGA = 'https://dados.ciga.sc.gov.br'

const TIPOS_HTML = ['text/html'] as const
const TIPOS_ZIP = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
] as const

/** Categorias do DOM-SC que podem trazer norma (o resto é contrato, ata de preço, edital). */
export const CATEGORIAS_NORMATIVAS = [
  'leis',
  'leis complementares',
  'decretos',
  'instrucao normativa',
  'instrucoes normativas',
  'resolucoes',
  'portarias',
  'deliberacoes',
  'licenciamento ambiental',
] as const

/** Sigla do órgão pela entidade: fundações de meio ambiente conhecidas; senão a prefeitura. */
const ORGAOS_DA_ENTIDADE: readonly { padrao: RegExp; sigla: string }[] = [
  { padrao: /FLORAM|Funda[çc][ãa]o Municipal do Meio Ambiente de Florian/i, sigla: 'FLORAM' },
  { padrao: /FUJAMA/i, sigla: 'FUJAMA' },
  { padrao: /FAEMA|Funda[çc][ãa]o do Meio Ambiente de Blumenau/i, sigla: 'FAEMA' },
  { padrao: /Conselho Municipal (de|do) Meio Ambiente|COMDEMA|CONDEMA/i, sigla: 'COMDEMA' },
]

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function urlDoDatasetDoMes(dia: string): string {
  const [ano, mes] = dia.split('-')
  return `${BASE_DO_CIGA}/dataset/domsc-publicacoes-de-${mes as string}-${ano as string}`
}

/** URLs dos ZIPs do dia na página do dataset (cigadados_publicacoes_AAAA_MM_DD_HHMM_HHMM.zip). */
export function zipsDoDia(html: string, dia: string): string[] {
  const [ano, mes, d] = dia.split('-')
  const padrao = new RegExp(
    `https://dados\\.ciga\\.sc\\.gov\\.br/dataset/[\\w-]+/resource/[\\w-]+/download/cigadados_publicacoes_${ano as string}_${mes as string}_${d as string}_\\d{4}_\\d{4}\\.zip`,
    'g',
  )
  return [...new Set(html.match(padrao) ?? [])].sort()
}

export interface AtoDoCiga {
  codigo: string
  titulo: string
  /** aaaa-mm-dd */
  data: string | null
  municipio: string
  entidade: string
  categoria: string
  link: string | null
  texto: string
}

function lerAto(valor: unknown): AtoDoCiga | null {
  if (valor === null || typeof valor !== 'object') return null
  const v = valor as Record<string, unknown>
  const texto = (campo: string) => (typeof v[campo] === 'string' ? (v[campo] as string) : '')
  const codigo = typeof v.codigo === 'number' ? String(v.codigo) : texto('codigo')
  if (!codigo || !texto('titulo') || !texto('municipio')) return null
  return {
    codigo,
    titulo: texto('titulo').trim(),
    data: /^\d{4}-\d{2}-\d{2}/.exec(texto('data'))?.[0] ?? null,
    municipio: texto('municipio').trim(),
    entidade: texto('entidade').trim(),
    categoria: texto('categoria').trim(),
    link: texto('link') || null,
    texto: htmlParaTexto(texto('texto')),
  }
}

/** Atos de um JSON do CIGA: autopublicações, edição ordinária e edições exclusivas. */
export function atosDoJson(json: unknown): AtoDoCiga[] {
  if (json === null || typeof json !== 'object') throw new ErroDaColeta('formato_inesperado')
  const raiz = json as Record<string, unknown>
  const listas: unknown[] = []
  if (Array.isArray(raiz.autopublicacoes)) listas.push(...raiz.autopublicacoes)
  const ordinaria = raiz.edicao_ordinaria as { atos?: unknown[] } | undefined
  if (ordinaria && Array.isArray(ordinaria.atos)) listas.push(...ordinaria.atos)
  if (Array.isArray(raiz.edicoes_ordinarias_exclusivas)) {
    for (const edicao of raiz.edicoes_ordinarias_exclusivas as { atos?: unknown[] }[]) {
      if (Array.isArray(edicao.atos)) listas.push(...edicao.atos)
    }
  }
  return listas.map(lerAto).filter((ato): ato is AtoDoCiga => ato !== null)
}

export function categoriaNormativa(categoria: string): boolean {
  return (CATEGORIAS_NORMATIVAS as readonly string[]).includes(semAcento(categoria))
}

export function orgaoDaEntidade(entidade: string): string {
  for (const orgao of ORGAOS_DA_ENTIDADE) if (orgao.padrao.test(entidade)) return orgao.sigla
  return 'prefeitura'
}

export async function coletarDiariosDoCiga(ctx: ContextoDaColeta): Promise<void> {
  const vigiados = new Map<string, string>()
  for (const m of await ctx.banco.municipiosVigiados()) vigiados.set(semAcento(m.nome), m.ibge)
  if (vigiados.size === 0) return

  const dia = diaDaJanela(ctx)
  const pagina = await ctx.buscar(urlDoDatasetDoMes(dia), { tipos: TIPOS_HTML })
  const zips = zipsDoDia(await lerHtml(pagina), dia)
  if (zips.length === 0) return

  const catalogo = await catalogoDasFontes(ctx)
  const vistos = new Set(
    (await ctx.banco.versoesConhecidas(FONTE_CIGA)).map((v) => v.id_externo).filter(Boolean),
  )

  for (const url of zips) {
    if (!reservarDownload(ctx)) return
    const bytes = await lerBytes(await ctx.buscar(url, { tipos: TIPOS_ZIP }))
    for (const [nome, conteudo] of await arquivosDoZip(bytes)) {
      if (!nome.toLowerCase().endsWith('.json')) continue
      let json: unknown
      try {
        json = JSON.parse(new TextDecoder('utf-8').decode(conteudo))
      } catch {
        throw new ErroDaColeta('formato_inesperado')
      }
      for (const ato of atosDoJson(json)) {
        const ibge = vigiados.get(semAcento(ato.municipio))
        if (!ibge || vistos.has(ato.codigo) || !categoriaNormativa(ato.categoria)) continue
        const avaliacao = avaliarAtoDoDiario({
          titulo: ato.titulo,
          texto: ato.texto,
          categoria: ato.categoria,
          entidade: ato.entidade,
        })
        if (!avaliacao.relevante || avaliacao.identificador === null) continue
        const id = avaliacao.identificador
        vistos.add(ato.codigo)
        await tentarItem(ctx, ato.codigo, async () => {
          const orgao = orgaoDaEntidade(ato.entidade)
          const chave = chaveDaNorma({
            esfera: 'municipal',
            municipioIbge: ibge,
            orgao,
            tipo: id.tipo,
            numero: id.numero,
            ...(id.ano === undefined ? {} : { ano: id.ano }),
          })
          if (acharNoCatalogo(catalogo, chave, id.ano !== undefined) !== null) return
          const normaId = await ctx.banco.garantirNorma({
            chave,
            esfera: 'municipal',
            municipio_ibge: ibge,
            orgao: orgao === 'prefeitura' ? `Prefeitura de ${ato.municipio}` : orgao,
            tipo: id.tipo,
            numero: id.numero,
            ano: id.ano ?? null,
            titulo: `${tituloCurtoDaNorma(id)} · ${ato.municipio}`,
            ementa: null,
            url_oficial: ato.link,
            fonte: FONTE_CIGA,
            id_externo: ato.codigo,
          })
          await gravarVersao(ctx, {
            normaId,
            conhecida: null,
            sha256: await sha256Hex(ato.texto),
            texto: ato.texto,
            idExterno: ato.codigo,
            publicadaEm: ato.data,
            atoNovo: true,
          })
          const classificacao = classificarAto(`${ato.titulo} ${ato.texto.slice(0, 2000)}`)
          if (classificacao.acao !== 'revoga') return
          for (const alvo of classificacao.alvos) {
            if (alvo.ano === undefined) continue
            const chaveDoAlvo = chaveDaNorma({
              esfera: 'municipal',
              municipioIbge: ibge,
              orgao: alvo.orgao ?? orgao,
              tipo: alvo.tipo,
              numero: alvo.numero,
              ano: alvo.ano,
            })
            if (!catalogo.has(chaveDoAlvo)) continue
            await ctx.banco.registrarRevogacao(ctx.coletaId, chaveDoAlvo, chave, ato.data)
            ctx.contagem.itensNovos++
          }
        })
      }
    }
  }
}
