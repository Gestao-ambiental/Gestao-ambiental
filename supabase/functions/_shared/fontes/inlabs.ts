// Coletor do Diário Oficial da União pelo INLABS (pacote L8, ADR-0050, LEG-02). O INLABS é o canal
// da Imprensa Nacional para download automatizado: conta gratuita (e-mail e senha), um ZIP por dia e
// seção com um XML por matéria. Só a seção 1 (DO1, e a extra DO1E) interessa. O INLABS guarda só os
// últimos 4 meses: o ZIP baixado vai para o Storage (bucket 'normas', pasta diarios/inlabs).
//
// Fluxo (o mesmo do script oficial github.com/Imprensa-Nacional/inlabs):
// 1. POST /logar.php com email e password (formulário); o cookie inlabs_session_cookie volta no
//    Set-Cookie. Credenciais nos segredos INLABS_EMAIL e INLABS_SENHA; sem elas: 'configuracao_ausente'.
// 2. GET /index.php?p=<dia>&dl=<dia>-DO1.zip com o cookie (e a DO1E, que pode não existir: 404 é
//    "sem edição extra").
// 3. Cada XML: atributos do <article> (artType, artCategory, pubDate, name) e o corpo (Identifica,
//    Ementa, Texto). [não confirmado em 20/11/2026: o INLABS estava em manutenção no estudo; os nomes
//    seguem o script oficial e a documentação pública, e o leitor é tolerante a campo ausente.]
// 4. Fica com o ato de órgão ambiental (MMA, CONAMA, IBAMA, ICMBio, ANA) dos tipos normativos, e com
//    lei e decreto da Presidência só quando avaliarAtoDoDiario diz que o tema é ambiental. Vira norma
//    federal (chave br;<órgão>;<tipo>;<número>;<ano>), versão = texto sem CPF, ato novo. Ato que
//    revoga norma do catálogo registra a revogação.
//
// Os XMLs não contam no `limite` (vêm todos no mesmo ZIP); cada ZIP conta como um download.

import { classificarAto } from '../dominio/classificar-ato.ts'
import { avaliarAtoDoDiario } from '../dominio/filtro-de-ato.ts'
import { chaveDaNorma, lerIdentificadorDeNorma, tituloCurtoDaNorma } from '../dominio/norma.ts'
import {
  type ContextoDaColeta,
  decodificarEntidades,
  ErroDaColeta,
  gravarVersao,
  htmlParaTexto,
  lerBytes,
  reservarDownload,
  sha256Hex,
  tentarItem,
} from './comum.ts'
import {
  acharNoCatalogo,
  catalogoDasFontes,
  dataBrasileiraParaIso,
  diaDaJanela,
} from './diarios.ts'

export const FONTE_INLABS = 'inlabs'
export const BASE_DO_INLABS = 'https://inlabs.in.gov.br'
export const SECOES_DO_INLABS = ['DO1', 'DO1E'] as const

const TIPOS_ZIP = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
] as const
const TIPOS_HTML = ['text/html'] as const

/** Órgão do artCategory → sigla usada na chave. A ordem importa: o mais específico primeiro. */
const ORGAOS: readonly { padrao: RegExp; sigla: string }[] = [
  { padrao: /Conselho Nacional do Meio Ambiente/i, sigla: 'CONAMA' },
  { padrao: /Instituto Brasileiro do Meio Ambiente/i, sigla: 'IBAMA' },
  { padrao: /Instituto Chico Mendes/i, sigla: 'ICMBio' },
  { padrao: /Agência Nacional de Águas/i, sigla: 'ANA' },
  { padrao: /Ministério do Meio Ambiente/i, sigla: 'MMA' },
]
const PRESIDENCIA = /Atos do Poder (Legislativo|Executivo)|Presidência da República/i

export interface MateriaDoDou {
  id: string
  tipo: string
  categoria: string
  /** aaaa-mm-dd */
  publicadaEm: string | null
  identifica: string
  ementa: string | null
  texto: string
}

function atributo(xml: string, nome: string): string | null {
  const achado = new RegExp(`\\b${nome}="([^"]*)"`, 'i').exec(xml)
  return achado ? decodificarEntidades(achado[1] as string).trim() : null
}

function elemento(xml: string, nome: string): string | null {
  const achado = new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`, 'i').exec(xml)
  if (!achado) return null
  const bruto = (achado[1] as string).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  return htmlParaTexto(decodificarEntidades(bruto)).trim() || null
}

/** Uma matéria do XML do INLABS; null quando falta o essencial. */
export function lerMateriaDoInlabs(xml: string): MateriaDoDou | null {
  const artigo = /<article\b[^>]*>/i.exec(xml)?.[0]
  if (!artigo) return null
  const id = atributo(artigo, 'id') ?? atributo(artigo, 'idMateria') ?? atributo(artigo, 'name')
  const tipo = atributo(artigo, 'artType')
  const categoria = atributo(artigo, 'artCategory') ?? ''
  const identifica = elemento(xml, 'Identifica')
  const texto = elemento(xml, 'Texto')
  if (!id || !tipo || !identifica || !texto) return null
  const data = atributo(artigo, 'pubDate')
  return {
    id,
    tipo,
    categoria,
    publicadaEm: data ? dataBrasileiraParaIso(data) : null,
    identifica,
    ementa: elemento(xml, 'Ementa'),
    texto,
  }
}

/** Sigla do órgão ambiental da matéria, 'federal' para a Presidência, ou null quando não interessa. */
export function orgaoDaMateria(materia: Pick<MateriaDoDou, 'categoria'>): string | null {
  for (const orgao of ORGAOS) if (orgao.padrao.test(materia.categoria)) return orgao.sigla
  return PRESIDENCIA.test(materia.categoria) ? 'federal' : null
}

/** Login no INLABS: devolve o valor do cookie de sessão. */
export async function entrarNoInlabs(ctx: ContextoDaColeta): Promise<string> {
  const email = ctx.segredo?.('INLABS_EMAIL') ?? ''
  const senha = ctx.segredo?.('INLABS_SENHA') ?? ''
  if (!email || !senha) throw new ErroDaColeta('configuracao_ausente')
  const resposta = await ctx.buscar(`${BASE_DO_INLABS}/logar.php`, {
    metodo: 'POST',
    corpo: new URLSearchParams({ email, password: senha }).toString(),
    tipos: TIPOS_HTML,
    naoSeguir: true,
  })
  await resposta.body?.cancel()
  const cookies =
    typeof resposta.headers.getSetCookie === 'function'
      ? resposta.headers.getSetCookie()
      : [resposta.headers.get('set-cookie') ?? '']
  for (const cookie of cookies) {
    const valor = /inlabs_session_cookie=([^;]+)/.exec(cookie)?.[1]
    if (valor) return valor
  }
  throw new ErroDaColeta('login_recusado')
}

const ASSINATURA_DO_FIM = 0x06054b50
const ASSINATURA_CENTRAL = 0x02014b50
const ASSINATURA_LOCAL = 0x04034b50

/** Arquivos de um ZIP (sem pacote externo): guardados (método 0) ou deflate (método 8). */
export async function arquivosDoZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fim = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (visao.getUint32(i, true) === ASSINATURA_DO_FIM) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new ErroDaColeta('formato_inesperado')
  const total = visao.getUint16(fim + 10, true)
  let posicao = visao.getUint32(fim + 16, true)
  const arquivos = new Map<string, Uint8Array>()
  for (let n = 0; n < total; n++) {
    if (posicao + 46 > bytes.length || visao.getUint32(posicao, true) !== ASSINATURA_CENTRAL) {
      throw new ErroDaColeta('formato_inesperado')
    }
    const metodo = visao.getUint16(posicao + 10, true)
    const tamanho = visao.getUint32(posicao + 20, true)
    const tamanhoDoNome = visao.getUint16(posicao + 28, true)
    const extra = visao.getUint16(posicao + 30, true)
    const comentario = visao.getUint16(posicao + 32, true)
    const local = visao.getUint32(posicao + 42, true)
    const nome = new TextDecoder().decode(
      bytes.subarray(posicao + 46, posicao + 46 + tamanhoDoNome),
    )
    posicao += 46 + tamanhoDoNome + extra + comentario
    if (local + 30 > bytes.length || visao.getUint32(local, true) !== ASSINATURA_LOCAL) {
      throw new ErroDaColeta('formato_inesperado')
    }
    const inicio =
      local + 30 + visao.getUint16(local + 26, true) + visao.getUint16(local + 28, true)
    const dados = bytes.subarray(inicio, inicio + tamanho)
    if (metodo === 0) {
      arquivos.set(nome, dados)
    } else if (metodo === 8) {
      const copia = new Uint8Array(dados.length)
      copia.set(dados)
      const fluxo = new Blob([copia]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      try {
        arquivos.set(nome, new Uint8Array(await new Response(fluxo).arrayBuffer()))
      } catch {
        throw new ErroDaColeta('formato_inesperado')
      }
    } else {
      throw new ErroDaColeta('formato_inesperado')
    }
  }
  return arquivos
}

/** XMLs (texto) de um ZIP do INLABS. */
export async function xmlsDoZip(bytes: Uint8Array): Promise<string[]> {
  const arquivos = await arquivosDoZip(bytes)
  return [...arquivos.entries()]
    .filter(([nome]) => nome.toLowerCase().endsWith('.xml'))
    .map(([, conteudo]) => new TextDecoder('utf-8').decode(conteudo))
}

export async function coletarDouPeloInlabs(ctx: ContextoDaColeta): Promise<void> {
  const dia = diaDaJanela(ctx)
  const cookie = await entrarNoInlabs(ctx)
  const catalogo = await catalogoDasFontes(ctx, [
    'ima_in',
    'ima_portaria',
    'consema',
    'doe_sc',
    'alesc',
    'joinville_doem',
    FONTE_INLABS,
    'planalto',
  ])

  for (const secao of SECOES_DO_INLABS) {
    if (!reservarDownload(ctx)) return
    let bytes: Uint8Array
    try {
      const resposta = await ctx.buscar(
        `${BASE_DO_INLABS}/index.php?p=${dia}&dl=${dia}-${secao}.zip`,
        { tipos: TIPOS_ZIP, cabecalhos: { Cookie: `inlabs_session_cookie=${cookie}` } },
      )
      bytes = await lerBytes(resposta)
    } catch (erro) {
      // Sem edição extra no dia (ou sem edição: fim de semana) o INLABS responde 404.
      if (erro instanceof ErroDaColeta && erro.codigo === 'http_404') continue
      throw erro
    }
    await ctx.banco.enviarArquivo(`diarios/inlabs/${dia}-${secao}.zip`, bytes, 'application/zip')

    for (const xml of await xmlsDoZip(bytes)) {
      const materia = lerMateriaDoInlabs(xml)
      if (materia === null) continue
      const orgao = orgaoDaMateria(materia)
      if (orgao === null) continue
      const avaliacao = avaliarAtoDoDiario({
        titulo: materia.identifica,
        texto: `${materia.ementa ?? ''}\n${materia.texto}`,
        ...(orgao === 'federal' ? {} : { categoria: orgao }),
        tipoDocumento: materia.tipo,
      })
      if (orgao === 'federal' && !avaliacao.relevante) continue
      const id = avaliacao.identificador ?? lerIdentificadorDeNorma(materia.identifica)
      if (id === null || avaliacao.motivo === 'ato_individual' || avaliacao.motivo === 'pessoal') {
        continue
      }
      await tentarItem(ctx, `${secao}:${materia.id}`, async () => {
        const chave = chaveDaNorma({
          esfera: 'federal',
          orgao: orgao === 'federal' ? 'federal' : orgao,
          tipo: id.tipo,
          numero: id.numero,
          ...(id.ano === undefined ? {} : { ano: id.ano }),
        })
        const existente = acharNoCatalogo(catalogo, chave, id.ano !== undefined)
        const normaId =
          existente?.[1].conhecida.norma_id ??
          (await ctx.banco.garantirNorma({
            chave,
            esfera: 'federal',
            orgao: orgao === 'federal' ? 'Presidência da República' : orgao,
            tipo: id.tipo,
            numero: id.numero,
            ano: id.ano ?? null,
            titulo: tituloCurtoDaNorma({ ...id, orgao: orgao === 'federal' ? undefined : orgao }),
            ementa: materia.ementa,
            url_oficial: null,
            fonte: FONTE_INLABS,
            id_externo: materia.id,
          }))
        if (existente === null) {
          await gravarVersao(ctx, {
            normaId,
            conhecida: null,
            sha256: await sha256Hex(materia.texto),
            texto: materia.texto,
            idExterno: materia.id,
            publicadaEm: materia.publicadaEm,
            atoNovo: true,
          })
        }
        const classificacao = classificarAto(
          `${materia.ementa ?? ''} ${materia.texto.slice(0, 2000)}`,
        )
        if (classificacao.acao !== 'revoga') return
        for (const alvo of classificacao.alvos) {
          if (alvo.ano === undefined) continue
          const chaveDoAlvo = chaveDaNorma({
            esfera: 'federal',
            orgao: alvo.orgao ?? (orgao === 'federal' ? 'federal' : orgao),
            tipo: alvo.tipo,
            numero: alvo.numero,
            ano: alvo.ano,
          })
          if (!catalogo.has(chaveDoAlvo)) continue
          await ctx.banco.registrarRevogacao(ctx.coletaId, chaveDoAlvo, chave, materia.publicadaEm)
          ctx.contagem.itensNovos++
        }
      })
    }
  }
}
