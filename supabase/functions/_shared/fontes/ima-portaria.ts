// Coletor das Portarias do IMA (pacote L1, ADR-0050, LEG-02 e LEG-03). Um POST na consulta pública
// https://consultas.ima.sc.gov.br/portarias/consultar com o ano corrente (em janeiro, também o ano
// anterior) devolve as portarias do ano em JSON, com o texto em HTML. Interessam as categorias 1
// (Licenciamento), 3 (Biodiversidade/UC), 4 (Qualidade Ambiental) e 6 (Fiscalização).
//
// Cada portaria vira norma (sc;ima;portaria;<n>;<ano>) e a versão é o texto de str_conteudo sem
// HTML e sem CPF. O SHA-256 é desse texto e não vai arquivo ao Storage (objeto nulo): o HTML original
// pode trazer CPF, e nada com CPF é gravado. Campos de usuário (id_user_cadastro) são ignorados.
//
// A revogação de IN vem daqui (o site das INs não marca, caso da IN 84): classificarAto(título +
// texto) com ação "revoga" e alvo IN do IMA vira registrar_revogacao com a portaria como ato. Na
// alteração, só a portaria é registrada: a IN muda quando o site publicar a versão nova.

import { classificarAto } from '../dominio/classificar-ato.ts'
import { chaveDaNorma, normalizarNumeroDaNorma } from '../dominio/norma.ts'
import { removerCpf } from '../dominio/sem-cpf.ts'
import {
  type ContextoDaColeta,
  dataEmSaoPaulo,
  ErroDaColeta,
  gravarVersao,
  htmlParaTexto,
  lerTexto,
  sha256Hex,
  tentarItem,
  type VersaoConhecida,
} from './comum.ts'
import { FONTE_IMA_IN } from './ima-in.ts'

export const FONTE_IMA_PORTARIA = 'ima_portaria'
export const URL_DAS_PORTARIAS = 'https://consultas.ima.sc.gov.br/portarias/consultar'
export const urlDaPortaria = (id: string) =>
  `https://consultas.ima.sc.gov.br/portarias/visualizar/${id}`
export const CATEGORIAS_DE_INTERESSE = ['1', '3', '4', '6'] as const

/** Só os campos usados; o resto da resposta (inclusive o usuário que cadastrou) é descartado. */
export interface Portaria {
  id: string
  /** Como o IMA publica ("096"). */
  numero: string
  ano: number
  titulo: string
  conteudoHtml: string
  /** aaaa-mm-dd */
  dataDoe: string | null
  vigente: boolean
  categoria: string
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : ''
}

/** Lê a resposta da consulta. Formato diferente do esperado lança 'formato_inesperado'. */
export function lerPortarias(json: unknown): Portaria[] {
  if (!Array.isArray(json)) throw new ErroDaColeta('formato_inesperado')
  const portarias: Portaria[] = []
  for (const bruto of json as Record<string, unknown>[]) {
    if (bruto === null || typeof bruto !== 'object') throw new ErroDaColeta('formato_inesperado')
    const id = texto(bruto.id_portaria)
    const numero = texto(bruto.num_numero).trim()
    const ano = Number(texto(bruto.num_ano))
    if (!/^\d+$/.test(id) || !/\d/.test(numero) || !Number.isInteger(ano)) {
      throw new ErroDaColeta('formato_inesperado')
    }
    const dataDoe = texto(bruto.dt_data_doe)
    portarias.push({
      id,
      numero,
      ano,
      titulo: texto(bruto.str_titulo).replace(/\s+/g, ' ').trim(),
      conteudoHtml: texto(bruto.str_conteudo),
      dataDoe: /^\d{4}-\d{2}-\d{2}$/.test(dataDoe) ? dataDoe : null,
      vigente: texto(bruto.bool_vigente) !== '0',
      categoria: texto(bruto.id_categoria),
    })
  }
  return portarias
}

export function chaveDaPortaria(portaria: Pick<Portaria, 'numero' | 'ano'>): string {
  return chaveDaNorma({
    esfera: 'estadual',
    orgao: 'IMA',
    tipo: 'portaria',
    numero: portaria.numero,
    ano: portaria.ano,
  })
}

/** INs do IMA que a portaria revoga (vazio quando ela não revoga IN). */
export function insRevogadas(
  portaria: Pick<Portaria, 'titulo'>,
  textoDaPortaria: string,
): string[] {
  const { acao, alvos } = classificarAto(`${portaria.titulo}\n${textoDaPortaria}`)
  if (acao !== 'revoga') return []
  return alvos
    .filter((a) => a.tipo === 'instrucao_normativa' && (a.orgao ?? 'IMA') === 'IMA')
    .map((a) =>
      chaveDaNorma({
        esfera: 'estadual',
        orgao: 'IMA',
        tipo: 'instrucao_normativa',
        numero: a.numero,
      }),
    )
}

export async function coletarPortariasDoIma(ctx: ContextoDaColeta): Promise<void> {
  const hoje = dataEmSaoPaulo(ctx.agora)
  const ano = Number(hoje.slice(0, 4))
  // Em janeiro ainda saem no DOE portarias numeradas no ano anterior.
  const anos = hoje.slice(5, 7) === '01' ? [ano - 1, ano] : [ano]
  const portarias: Portaria[] = []
  for (const umAno of anos) {
    const resposta = await ctx.buscar(URL_DAS_PORTARIAS, {
      metodo: 'POST',
      corpo: new URLSearchParams({
        conteudo: '',
        numero: '',
        ano: String(umAno),
        categoria: '',
      }).toString(),
      // O Content-Type desta consulta não foi registrado no estudo: aceita JSON e os tipos de texto
      // do PHP, e o corpo precisa ser uma lista JSON (o RSS ou uma página de erro não passam).
      tipos: ['application/json', 'text/json', 'text/html', 'text/plain'],
    })
    let json: unknown
    try {
      json = JSON.parse(await lerTexto(resposta))
    } catch (erro) {
      if (erro instanceof ErroDaColeta) throw erro
      throw new ErroDaColeta('formato_inesperado')
    }
    portarias.push(...lerPortarias(json))
  }

  const conhecidas = new Map(
    (await ctx.banco.versoesConhecidas(FONTE_IMA_PORTARIA)).map((c) => [c.chave, c]),
  )
  let ins: Map<string, VersaoConhecida> | null = null
  const interessantes = portarias
    .filter((p) => (CATEGORIAS_DE_INTERESSE as readonly string[]).includes(p.categoria))
    .sort((a, b) => Number(a.id) - Number(b.id))

  for (const portaria of interessantes) {
    await tentarItem(ctx, `portaria_${portaria.id}`, async () => {
      const chave = chaveDaPortaria(portaria)
      const conhecida = conhecidas.get(chave) ?? null
      const textoDaPortaria = removerCpf(htmlParaTexto(portaria.conteudoHtml))
      const sha256 = await sha256Hex(textoDaPortaria)
      const situacao = portaria.vigente ? 'vigente' : 'revogada'
      if (conhecida?.ultimo_sha256 !== sha256 || conhecida.situacao_na_fonte !== situacao) {
        const normaId = await ctx.banco.garantirNorma({
          chave,
          esfera: 'estadual',
          orgao: 'IMA',
          tipo: 'portaria',
          numero: normalizarNumeroDaNorma(portaria.numero),
          ano: portaria.ano,
          titulo: `Portaria IMA ${portaria.numero}/${String(portaria.ano)}`,
          ementa: portaria.titulo === '' ? null : removerCpf(portaria.titulo),
          url_oficial: urlDaPortaria(portaria.id),
          fonte: FONTE_IMA_PORTARIA,
          id_externo: portaria.id,
          situacao_na_fonte: situacao,
        })
        await gravarVersao(ctx, {
          normaId,
          conhecida,
          sha256,
          texto: textoDaPortaria,
          idExterno: portaria.id,
          publicadaEm: portaria.dataDoe,
          publicadaEmTexto: portaria.dataDoe,
          atoNovo: true,
        })
      }

      // Conferida em toda execução (não só na versão nova): se a revogação falhou ontem, sai hoje.
      const revogadas = insRevogadas(portaria, textoDaPortaria)
      if (revogadas.length === 0) return
      ins ??= new Map((await ctx.banco.versoesConhecidas(FONTE_IMA_IN)).map((c) => [c.chave, c]))
      for (const chaveDaIn of revogadas) {
        const instrucao = ins.get(chaveDaIn)
        // IN fora do catálogo ou já revogada: nada a registrar.
        if (instrucao === undefined || instrucao.situacao_na_fonte !== 'vigente') continue
        await ctx.banco.registrarRevogacao(ctx.coletaId, chaveDaIn, chave, portaria.dataDoe)
        instrucao.situacao_na_fonte = 'revogada'
        ctx.contagem.itensNovos++
      }
    })
  }
}
