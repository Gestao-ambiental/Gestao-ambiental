// Banco e rede falsos dos testes da coleta de normas. O banco imita as RPCs da migration
// 20261120234000_coleta_de_normas.sql no que a coleta depende: unique (norma_id, sha256), número
// da versão, mudança 'alterada' a partir da segunda versão e 'nova' só com ato novo depois de uma
// coleta concluída da fonte (regra 4 do ADR-0050).

import type { DiferencaDeNorma } from '../../dominio/diferenca-de-norma.ts'
import type {
  BancoDaColeta,
  NormaParaGarantir,
  VersaoConhecida,
  VersaoParaRegistrar,
  VersaoRegistrada,
} from '../comum.ts'
import { ErroDaColeta } from '../comum.ts'

export interface NormaFalsa {
  id: string
  chave: string
  fonte: string
  id_externo: string | null
  situacao_na_fonte: string
  revogada_em: string | null
  revogada_por: string | null
  dados: Partial<NormaParaGarantir>
}

export interface VersaoFalsa extends VersaoParaRegistrar {
  id: string
  norma_id: string
  numero: number
  coleta_id: string
}

export interface MudancaFalsa {
  id: string
  norma_id: string
  tipo: 'nova' | 'alterada' | 'revogada'
  versao_nova_id: string | null
  ato_id: string | null
  diferenca: DiferencaDeNorma | Record<string, never>
}

export interface ColetaFalsa {
  id: string
  fonte: string
  janela: string
  situacao: 'em_andamento' | 'concluida' | 'falhou'
  itens: number
  erro: string | null
}

let sequencia = 0
const novoId = (prefixo: string) => {
  sequencia++
  return `${prefixo}-${String(sequencia).padStart(4, '0')}`
}

export class BancoFalso implements BancoDaColeta {
  normas: NormaFalsa[] = []
  versoes: VersaoFalsa[] = []
  mudancas: MudancaFalsa[] = []
  coletas: ColetaFalsa[] = []
  arquivos = new Map<string, { bytes: Uint8Array; mime: string }>()
  chamadas: string[] = []
  desligadas = new Set<string>()

  /** Norma da carga (sem versão). */
  carregar(norma: Partial<NormaFalsa> & { chave: string; fonte: string }): NormaFalsa {
    const nova: NormaFalsa = {
      id: novoId('norma'),
      id_externo: null,
      situacao_na_fonte: 'vigente',
      revogada_em: null,
      revogada_por: null,
      dados: {},
      ...norma,
    }
    this.normas.push(nova)
    return nova
  }

  norma(chave: string): NormaFalsa | undefined {
    return this.normas.find((n) => n.chave === chave)
  }

  versoesDa(chave: string): VersaoFalsa[] {
    const norma = this.norma(chave)
    return this.versoes.filter((v) => v.norma_id === norma?.id)
  }

  iniciarColeta(fonte: string, janela: string, forcar: boolean): Promise<string | null> {
    this.chamadas.push('iniciar_coleta')
    if (this.desligadas.has(fonte) && !forcar) {
      return Promise.reject(new ErroDaColeta('fonte_desligada'))
    }
    const existente = this.coletas.find((c) => c.fonte === fonte && c.janela === janela)
    if (existente?.situacao === 'concluida' || existente?.situacao === 'em_andamento') {
      return Promise.resolve(null)
    }
    if (existente) {
      existente.situacao = 'em_andamento'
      existente.erro = null
      return Promise.resolve(existente.id)
    }
    const coleta: ColetaFalsa = {
      id: novoId('coleta'),
      fonte,
      janela,
      situacao: 'em_andamento',
      itens: 0,
      erro: null,
    }
    this.coletas.push(coleta)
    return Promise.resolve(coleta.id)
  }

  garantirNorma(norma: NormaParaGarantir): Promise<string> {
    this.chamadas.push(`garantir_norma:${norma.chave}`)
    const existente = this.norma(norma.chave)
    if (existente) {
      if (norma.situacao_na_fonte) existente.situacao_na_fonte = norma.situacao_na_fonte
      existente.dados = { ...existente.dados, ...norma }
      return Promise.resolve(existente.id)
    }
    return Promise.resolve(
      this.carregar({
        chave: norma.chave,
        fonte: norma.fonte,
        id_externo: norma.id_externo ?? null,
        situacao_na_fonte: norma.situacao_na_fonte ?? 'vigente',
        dados: norma,
      }).id,
    )
  }

  versoesConhecidas(fonte: string): Promise<VersaoConhecida[]> {
    this.chamadas.push(`versoes_conhecidas:${fonte}`)
    return Promise.resolve(
      this.normas
        .filter((n) => n.fonte === fonte)
        .map((n) => {
          const ultima = this.versoes
            .filter((v) => v.norma_id === n.id)
            .sort((a, b) => b.numero - a.numero)[0]
          return {
            norma_id: n.id,
            chave: n.chave,
            id_externo: n.id_externo,
            situacao_na_fonte: n.situacao_na_fonte,
            ultima_versao_id_externo: ultima?.id_externo ?? null,
            ultimo_sha256: ultima?.sha256 ?? null,
            ultima_versao_numero: ultima?.numero ?? null,
          }
        }),
    )
  }

  textoDaUltimaVersao(normaId: string): Promise<string | null> {
    const ultima = this.versoes
      .filter((v) => v.norma_id === normaId)
      .sort((a, b) => b.numero - a.numero)[0]
    return Promise.resolve(ultima?.texto ?? null)
  }

  registrarVersao(
    coletaId: string,
    normaId: string,
    versao: VersaoParaRegistrar,
    diferenca: DiferencaDeNorma | null,
    atoNovo: boolean,
  ): Promise<VersaoRegistrada> {
    this.chamadas.push('registrar_versao_de_norma')
    const daNorma = this.versoes.filter((v) => v.norma_id === normaId)
    const igual = daNorma.find((v) => v.sha256 === versao.sha256)
    if (igual) return Promise.resolve({ versao_id: igual.id, versao_nova: false, mudanca_id: null })
    const nova: VersaoFalsa = {
      ...versao,
      id: novoId('versao'),
      norma_id: normaId,
      numero: daNorma.length + 1,
      coleta_id: coletaId,
    }
    this.versoes.push(nova)
    const norma = this.normas.find((n) => n.id === normaId)
    let tipo: MudancaFalsa['tipo'] | null = null
    if (daNorma.length > 0) tipo = 'alterada'
    else if (
      atoNovo &&
      this.coletas.some(
        (c) => c.fonte === norma?.fonte && c.situacao === 'concluida' && c.id !== coletaId,
      )
    ) {
      tipo = 'nova'
    }
    let mudancaId: string | null = null
    if (tipo !== null) {
      mudancaId = novoId('mudanca')
      this.mudancas.push({
        id: mudancaId,
        norma_id: normaId,
        tipo,
        versao_nova_id: nova.id,
        ato_id: null,
        diferenca: diferenca ?? {},
      })
    }
    return Promise.resolve({ versao_id: nova.id, versao_nova: true, mudanca_id: mudancaId })
  }

  registrarRevogacao(
    _coletaId: string,
    chaveRevogada: string,
    chaveAto: string | null,
    revogadaEm: string | null,
  ): Promise<string> {
    this.chamadas.push(`registrar_revogacao:${chaveRevogada}:${chaveAto ?? '-'}`)
    const norma = this.norma(chaveRevogada)
    if (!norma) return Promise.reject(new ErroDaColeta('norma_inexistente'))
    const ato = chaveAto === null ? null : (this.norma(chaveAto)?.id ?? null)
    const existente = this.mudancas.find(
      (m) => m.norma_id === norma.id && m.tipo === 'revogada' && m.ato_id === ato,
    )
    if (existente) return Promise.resolve(existente.id)
    norma.situacao_na_fonte = 'revogada'
    norma.revogada_em = revogadaEm
    norma.revogada_por = ato
    const id = novoId('mudanca')
    this.mudancas.push({
      id,
      norma_id: norma.id,
      tipo: 'revogada',
      versao_nova_id: null,
      ato_id: ato,
      diferenca: {},
    })
    return Promise.resolve(id)
  }

  concluirColeta(coletaId: string, itensNovos: number, erro: string | null): Promise<void> {
    this.chamadas.push('concluir_coleta')
    const coleta = this.coletas.find((c) => c.id === coletaId)
    if (!coleta) return Promise.reject(new Error('coleta'))
    coleta.situacao = erro === null ? 'concluida' : 'falhou'
    coleta.itens = itensNovos
    coleta.erro = erro === null ? null : erro.slice(0, 500)
    return Promise.resolve()
  }

  enviarArquivo(caminho: string, bytes: Uint8Array, mime: string): Promise<void> {
    if (this.arquivos.has(caminho)) return Promise.reject(new ErroDaColeta('falha_no_storage'))
    this.arquivos.set(caminho, { bytes, mime })
    return Promise.resolve()
  }
}

// ---------------------------------------------------------------------------
// Rede falsa
// ---------------------------------------------------------------------------
export interface ChamadaDeRede {
  metodo: string
  url: string
  cabecalhos: Headers
  corpo: string | null
}

export type Rota = (chamada: ChamadaDeRede) => Response | Promise<Response>

/** fetch falso: rota por "MÉTODO url"; sem rota, 404. Guarda as chamadas. */
export function redeFalsa(rotas: Record<string, Rota>) {
  const chamadas: ChamadaDeRede[] = []
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada)
    const metodo = (init?.method ?? 'GET').toUpperCase()
    const chamada: ChamadaDeRede = {
      metodo,
      url,
      cabecalhos: new Headers(init?.headers),
      corpo: typeof init?.body === 'string' ? init.body : null,
    }
    chamadas.push(chamada)
    const rota = rotas[`${metodo} ${url}`]
    if (!rota) return new Response('nao encontrado', { status: 404 })
    return await rota(chamada)
  }) as typeof fetch
  return { fetch: fetchFalso, chamadas }
}

export function html(corpo: string, status = 200): Response {
  return new Response(corpo, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
}

/** PDF falso: a assinatura e um texto que o leitor falso devolve. */
export function pdf(texto: string, nome?: string): Response {
  const cabecalhos: Record<string, string> = { 'Content-Type': 'application/pdf' }
  if (nome) cabecalhos['Content-Disposition'] = `attachment; filename="${nome}"`
  return new Response(new TextEncoder().encode(`%PDF-1.7\n${texto}`), { headers: cabecalhos })
}

/** Leitor de PDF falso: devolve o texto depois da assinatura. */
export function lerPdfFalso(bytes: Uint8Array): Promise<string> {
  const texto = new TextDecoder().decode(bytes)
  if (texto.includes('ilegivel')) return Promise.reject(new Error('pdf quebrado'))
  return Promise.resolve(texto.replace(/^%PDF-1\.7\n/, ''))
}
