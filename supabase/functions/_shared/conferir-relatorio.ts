// Orquestração da Edge Function conferir-relatorio (ADR-0036, fatia 3), com as dependências
// injetadas para testar com `deno test` sem rede. O index.ts só liga as dependências reais.
//
// 1. Com o JWT de quem pediu: iniciar_conferencia_ia confere quem pode pedir, o plano e o tipo do
//    arquivo, e devolve o caminho e o contexto do cadastro. Repetir não chama a IA de novo.
// 2. Baixa o arquivo (PDF ou .docx) e extrai o texto. Roda as regras fixas, que valem mesmo quando
//    a IA não roda (plano sem IA, sem cota, provedor fora).
// 3. Reserva a cota (somada com a extração) e chama o provedor pelo adapter, com tempo limite.
// 4. Com a service role: grava os apontamentos (regras + IA) ou a falha com os das regras.

import {
  type Apontamento,
  type ContextoDaConferencia,
  juntarApontamentos,
  LIMITE_ARQUIVO_BYTES,
  LIMITE_CARACTERES_CONFERENCIA,
  MIME_DOCX,
  MIME_PDF,
  MINIMO_CARACTERES,
  regrasFixas,
  validarConferencia,
  VERSAO_PROMPT_CONFERENCIA,
} from './conferencia.ts'
import { LIMITE_TEMPO_MS, MODELO_PADRAO } from './extracao.ts'
import { type Consumo, FalhaDoProvedor } from '../extrair-licenca/openrouter.ts'
import type { Conferidor } from '../conferir-relatorio/openrouter.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MotivoDaConferencia =
  | 'ia_fora_do_plano'
  | 'arquivo_sem_texto'
  | 'arquivo_grande_demais'
  | 'texto_longo_demais'
  | 'limite_atingido'
  | 'provedor_indisponivel'
  | 'provedor_recusou'
  | 'tempo_esgotado'
  | 'resposta_invalida'
  | 'configuracao_ausente'
  | 'erro_interno'

function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const ERROS_DO_INICIO_DA_CONFERENCIA: Record<string, number> = {
  sem_permissao: 403,
  consultoria_somente_leitura: 403,
}

/** Linha devolvida por iniciar_conferencia_ia. */
export interface InicioDaConferencia {
  conferencia_id: string
  nova: boolean
  situacao: string
  motivo: string | null
  ia_liberada: boolean
  caminho: string | null
  mime: string | null
  tamanho_bytes: number | null
  contexto: ContextoDaConferencia | null
}

export interface RespostaDoBanco<T> {
  dados: T | null
  erro: string | null
}

export interface RegistroDaConferencia {
  modelo: string
  versaoPrompt: string
  tokensEntrada: number | null
  tokensSaida: number | null
  custoMicros: number | null
  duracaoMs: number
}

export interface DependenciasDaConferencia {
  env: (nome: string) => string | undefined
  iniciar: (
    autorizacao: string,
    conferenciaId: string,
    evidenciaId: string,
  ) => Promise<RespostaDoBanco<InicioDaConferencia>>
  baixar: (autorizacao: string, caminho: string) => Promise<RespostaDoBanco<Uint8Array>>
  /** Texto de cada página do PDF; lança se não abre. */
  lerPdf: (pdf: Uint8Array) => Promise<string[]>
  /** Texto do .docx; lança se não abre. */
  lerDocx: (docx: Uint8Array) => Promise<string>
  reservar: (conferenciaId: string) => Promise<RespostaDoBanco<boolean>>
  criarConferidor: (chave: string, modelo: string) => Conferidor
  concluir: (
    conferenciaId: string,
    resumo: string,
    apontamentos: Apontamento[],
    registro: RegistroDaConferencia,
  ) => Promise<RespostaDoBanco<number>>
  falhar: (
    conferenciaId: string,
    motivo: MotivoDaConferencia,
    detalhe: string | null,
    apontamentos: Apontamento[],
    registro: RegistroDaConferencia,
  ) => Promise<{ erro: string | null }>
  agora?: () => number
  tempoLimite?: (ms: number) => AbortSignal
  registrar?: (linha: string) => void
}

function caracteresVisiveis(texto: string): number {
  return texto.replace(/\s/g, '').length
}

export function criarTratadorDaConferencia(deps: DependenciasDaConferencia) {
  const agora = deps.agora ?? (() => Date.now())
  const tempoLimite = deps.tempoLimite ?? ((ms: number) => AbortSignal.timeout(ms))
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const autorizacao = pedido.headers.get('Authorization')
    if (!autorizacao) return responder({ erro: 'sem_permissao' }, 401)

    let conferenciaId = ''
    let evidenciaId = ''
    try {
      const corpo = (await pedido.json()) as { conferenciaId?: unknown; evidenciaId?: unknown }
      conferenciaId = typeof corpo.conferenciaId === 'string' ? corpo.conferenciaId : ''
      evidenciaId = typeof corpo.evidenciaId === 'string' ? corpo.evidenciaId : ''
    } catch {
      // corpo inválido: cai na conferência abaixo
    }
    if (!UUID.test(conferenciaId) || !UUID.test(evidenciaId)) {
      return responder({ erro: 'pedido_invalido' }, 400)
    }

    const inicio = agora()
    let resposta: RespostaDoBanco<InicioDaConferencia>
    try {
      resposta = await deps.iniciar(autorizacao, conferenciaId, evidenciaId)
    } catch {
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (resposta.erro !== null) {
      const codigo = resposta.erro
      return responder(
        { erro: codigo in ERROS_DO_INICIO_DA_CONFERENCIA ? codigo : 'erro_interno' },
        ERROS_DO_INICIO_DA_CONFERENCIA[codigo] ?? 500,
      )
    }
    const alvo = resposta.dados
    if (!alvo) return responder({ erro: 'erro_interno' }, 500)
    const id = alvo.conferencia_id
    if (!alvo.nova) return responder({ situacao: alvo.situacao, motivo: alvo.motivo })
    if (!alvo.caminho || !alvo.mime || !alvo.contexto)
      return responder({ erro: 'erro_interno' }, 500)
    const contexto = alvo.contexto

    const modelo = deps.env('OPENROUTER_MODEL') || MODELO_PADRAO
    let regras: Apontamento[] = []

    async function falhar(
      motivo: MotivoDaConferencia,
      consumo?: Consumo,
      detalhe: string | null = null,
    ): Promise<Response> {
      registrar(JSON.stringify({ conferenciaId: id, evidenciaId, motivo, detalhe, modelo }))
      let erro: string | null
      try {
        const registro = await deps.falhar(id, motivo, detalhe, regras, {
          modelo: consumo?.modelo ?? modelo,
          versaoPrompt: VERSAO_PROMPT_CONFERENCIA,
          tokensEntrada: consumo?.tokensEntrada ?? null,
          tokensSaida: consumo?.tokensSaida ?? null,
          custoMicros: consumo?.custoMicros ?? null,
          duracaoMs: agora() - inicio,
        })
        erro = registro.erro
      } catch (excecao) {
        erro = String(excecao)
      }
      if (erro !== null) {
        registrar(
          JSON.stringify({ conferenciaId: id, etapa: 'registrar_falha', erro: erro.slice(0, 200) }),
        )
        return responder({ erro: 'erro_interno' }, 500)
      }
      return responder({ situacao: 'falhou', motivo, apontamentos: regras.length })
    }

    try {
      if ((alvo.tamanho_bytes ?? 0) > LIMITE_ARQUIVO_BYTES)
        return await falhar('arquivo_grande_demais')

      const arquivo = await deps.baixar(autorizacao, alvo.caminho)
      if (!arquivo.dados) {
        return await falhar(
          'erro_interno',
          undefined,
          `storage: ${(arquivo.erro ?? 'sem arquivo').slice(0, 200)}`,
        )
      }

      let texto: string
      try {
        if (alvo.mime === MIME_PDF) texto = (await deps.lerPdf(arquivo.dados)).join('\n\n')
        else if (alvo.mime === MIME_DOCX) texto = await deps.lerDocx(arquivo.dados)
        else return await falhar('arquivo_sem_texto')
      } catch {
        return await falhar('arquivo_sem_texto')
      }
      if (caracteresVisiveis(texto) < MINIMO_CARACTERES) return await falhar('arquivo_sem_texto')

      regras = regrasFixas(texto, contexto)

      if (!alvo.ia_liberada) return await falhar('ia_fora_do_plano')
      const chave = deps.env('OPENROUTER_API_KEY')
      if (!chave) {
        return await falhar(
          'configuracao_ausente',
          undefined,
          'OPENROUTER_API_KEY não encontrada na função',
        )
      }
      if (texto.length > LIMITE_CARACTERES_CONFERENCIA) {
        return await falhar(
          'texto_longo_demais',
          undefined,
          `${String(texto.length)} caracteres (limite ${String(LIMITE_CARACTERES_CONFERENCIA)})`,
        )
      }

      const reserva = await deps.reservar(id)
      if (reserva.erro !== null) {
        return await falhar('erro_interno', undefined, `reserva: ${reserva.erro.slice(0, 200)}`)
      }
      if (reserva.dados !== true) return await falhar('limite_atingido')

      let resultado
      try {
        resultado = await deps
          .criarConferidor(chave, modelo)
          .conferir(
            { contexto, texto },
            tempoLimite(Math.max(1, LIMITE_TEMPO_MS - (agora() - inicio))),
          )
      } catch (erro) {
        if (erro instanceof FalhaDoProvedor)
          return await falhar(erro.motivo as MotivoDaConferencia, erro.consumo, erro.detalhe)
        throw erro
      }

      const conferida = validarConferencia(resultado.conteudo)
      if (!conferida) return await falhar('resposta_invalida', resultado, 'fora do schema esperado')

      const apontamentos = juntarApontamentos(regras, conferida.apontamentos)
      const gravacao = await deps.concluir(id, conferida.resumo, apontamentos, {
        modelo: resultado.modelo,
        versaoPrompt: VERSAO_PROMPT_CONFERENCIA,
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
        custoMicros: resultado.custoMicros,
        duracaoMs: agora() - inicio,
      })
      if (gravacao.erro !== null || gravacao.dados === null) {
        return await falhar(
          'erro_interno',
          resultado,
          `gravação: ${(gravacao.erro ?? 'sem resposta').slice(0, 200)}`,
        )
      }
      return responder({ situacao: 'concluida', apontamentos: gravacao.dados })
    } catch (erro) {
      return await falhar('erro_interno', undefined, String(erro).slice(0, 200))
    }
  }
}
