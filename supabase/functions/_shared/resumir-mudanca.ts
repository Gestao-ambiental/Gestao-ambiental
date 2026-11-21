// Orquestração da Edge Function resumir-mudanca (ADR-0050, pacote L4), com as dependências injetadas
// para testar com `deno test` sem rede. O index.ts só liga as dependências reais.
//
// Dois caminhos, ambos POST {mudanca_id}:
// 1. Gatilho do banco (pg_net, depois do insert em private.norma_mudanca): header x-resumo-token
//    conferido contra o segredo RESUMO_NORMAS_TOKEN em tempo constante.
// 2. Central (operador do Grama pede o resumo de novo): com o JWT de quem chama, o banco confere o
//    operador em central_detalhe_da_mudanca_de_norma antes de seguir.
// Depois, com a service role: reservar_resumo_de_mudanca (cota de plataforma, fora de
// private.uso_de_ia), o modelo pelo adapter com tempo limite, e concluir_resumo_de_mudanca ou
// falhar_resumo_de_mudanca. A IA recebe só texto público da norma; nada de consultoria.
// Log só com ids, etapa e motivo: nunca a chave, o token, o texto da norma nem a resposta do modelo.

import { FalhaDoProvedor, type Resultado } from '../extrair-licenca/openrouter.ts'
import { LIMITE_TEMPO_MS, MODELO_PADRAO } from './extracao.ts'
import { iguaisEmTempoConstante } from './resumo-do-mes.ts'
import {
  criteriosParaPublicacao,
  type CriterioSugerido,
  entradaDoModelo,
  lerReserva,
  normalizarResumo,
  type Resumidor,
  resumoParaGravar,
  VERSAO_PROMPT_NORMA,
} from './resumo-de-norma.ts'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MotivoDoResumo =
  | 'provedor_indisponivel'
  | 'provedor_recusou'
  | 'tempo_esgotado'
  | 'resposta_invalida'
  | 'erro_interno'

/** Recusas da conferência do operador (central_detalhe_da_mudanca_de_norma). */
const RECUSAS_DO_OPERADOR: Record<string, number> = {
  sem_permissao: 403,
  dois_fatores_necessarios: 403,
  mudanca_inexistente: 404,
}

/** Erros de reservar_resumo_de_mudanca. Cota vira 429 com o código. */
export const ERROS_DA_RESERVA: Record<string, number> = {
  mudanca_inexistente: 404,
  mudanca_ja_publicada: 409,
  resumo_em_andamento: 409,
  cota_diaria_esgotada: 429,
  cota_mensal_esgotada: 429,
  muitas_simultaneas: 429,
}

export interface RespostaDoBanco<T> {
  dados: T | null
  erro: string | null
}

export interface RegistroDoResumo {
  modelo: string
  versaoPrompt: string
  tokensEntrada: number | null
  tokensSaida: number | null
  custoMicros: number | null
  duracaoMs: number
}

export interface DependenciasDoResumo {
  env: (nome: string) => string | undefined
  /** Com o JWT de quem chama: central_detalhe_da_mudanca_de_norma (só operador passa). */
  conferirOperador: (autorizacao: string, mudancaId: string) => Promise<{ erro: string | null }>
  /** Service role: reservar_resumo_de_mudanca; `dados` é o jsonb como veio. */
  reservar: (mudancaId: string) => Promise<RespostaDoBanco<unknown>>
  criarResumidor: (chave: string, modelo: string) => Resumidor
  /** Service role: concluir_resumo_de_mudanca. */
  concluir: (
    reservaId: string,
    resumo: Record<string, unknown>,
    criterios: CriterioSugerido[],
    registro: RegistroDoResumo,
  ) => Promise<{ erro: string | null }>
  /** Service role: falhar_resumo_de_mudanca. */
  falhar: (reservaId: string, motivo: string) => Promise<{ erro: string | null }>
  agora?: () => number
  tempoLimite?: (ms: number) => AbortSignal
  registrar?: (linha: string) => void
}

function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Motivo curto gravado na reserva: o código e, se houver, o detalhe do provedor. */
export function motivoCurto(motivo: MotivoDoResumo, detalhe: string | null): string {
  return (detalhe ? `${motivo}: ${detalhe}` : motivo).replace(/\s+/g, ' ').slice(0, 200)
}

export function criarTratadorDoResumo(deps: DependenciasDoResumo) {
  const agora = deps.agora ?? (() => Date.now())
  const tempoLimite = deps.tempoLimite ?? ((ms: number) => AbortSignal.timeout(ms))
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    // Gatilho do banco: só o token. Central: o JWT, conferido pelo banco logo abaixo.
    const token = pedido.headers.get('x-resumo-token')
    const autorizacao = pedido.headers.get('Authorization')
    if (token !== null) {
      const esperado = deps.env('RESUMO_NORMAS_TOKEN') ?? ''
      if (!esperado || !iguaisEmTempoConstante(token, esperado)) {
        return responder({ erro: 'sem_permissao' }, 401)
      }
    } else if (!autorizacao) {
      return responder({ erro: 'sem_permissao' }, 401)
    }

    let mudancaId = ''
    try {
      const corpo = (await pedido.json()) as { mudanca_id?: unknown }
      mudancaId = typeof corpo.mudanca_id === 'string' ? corpo.mudanca_id : ''
    } catch {
      // corpo inválido: cai na conferência abaixo
    }
    if (!UUID.test(mudancaId)) return responder({ erro: 'pedido_invalido' }, 400)

    if (token === null && autorizacao) {
      let conferencia: { erro: string | null }
      try {
        conferencia = await deps.conferirOperador(autorizacao, mudancaId)
      } catch {
        registrar(JSON.stringify({ mudancaId, etapa: 'operador', motivo: 'erro_interno' }))
        return responder({ erro: 'erro_interno' }, 500)
      }
      if (conferencia.erro !== null) {
        const codigo = conferencia.erro
        return responder(
          { erro: codigo in RECUSAS_DO_OPERADOR ? codigo : 'sem_permissao' },
          RECUSAS_DO_OPERADOR[codigo] ?? 403,
        )
      }
    }

    // Sem a chave, não reserva: a cota não é gasta à toa.
    const chave = deps.env('OPENROUTER_API_KEY')
    if (!chave) {
      registrar(
        JSON.stringify({ mudancaId, etapa: 'configuracao', motivo: 'configuracao_ausente' }),
      )
      return responder({ erro: 'configuracao_ausente' }, 503)
    }
    const modelo = deps.env('OPENROUTER_MODEL') || MODELO_PADRAO

    const inicio = agora()
    let bruta: RespostaDoBanco<unknown>
    try {
      bruta = await deps.reservar(mudancaId)
    } catch {
      registrar(JSON.stringify({ mudancaId, etapa: 'reserva', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (bruta.erro !== null) {
      const codigo = bruta.erro
      if (codigo in ERROS_DA_RESERVA) {
        registrar(JSON.stringify({ mudancaId, etapa: 'reserva', motivo: codigo }))
        return responder({ erro: codigo }, ERROS_DA_RESERVA[codigo])
      }
      registrar(JSON.stringify({ mudancaId, etapa: 'reserva', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    const reservaId =
      typeof bruta.dados === 'object' &&
      bruta.dados !== null &&
      typeof (bruta.dados as { reserva_id?: unknown }).reserva_id === 'string'
        ? (bruta.dados as { reserva_id: string }).reserva_id
        : null
    const reserva = lerReserva(bruta.dados)

    async function falhar(motivo: MotivoDoResumo, detalhe: string | null = null) {
      registrar(JSON.stringify({ mudancaId, reservaId, etapa: 'resumo', motivo }))
      if (!reservaId) return responder({ erro: 'erro_interno' }, 500)
      let erro: string | null
      try {
        erro = (await deps.falhar(reservaId, motivoCurto(motivo, detalhe))).erro
      } catch {
        erro = 'excecao'
      }
      if (erro !== null) {
        registrar(
          JSON.stringify({
            mudancaId,
            reservaId,
            etapa: 'registrar_falha',
            motivo: 'erro_interno',
          }),
        )
        return responder({ erro: 'erro_interno' }, 500)
      }
      return responder({ situacao: 'falhou', motivo })
    }

    if (!reserva) return await falhar('erro_interno', 'reserva fora do formato')

    try {
      let resultado: Resultado
      try {
        resultado = await deps
          .criarResumidor(chave, modelo)
          .resumir(
            entradaDoModelo(reserva),
            tempoLimite(Math.max(1, LIMITE_TEMPO_MS - (agora() - inicio))),
          )
      } catch (erro) {
        if (erro instanceof FalhaDoProvedor) {
          const motivo: MotivoDoResumo =
            erro.motivo === 'provedor_indisponivel' ||
            erro.motivo === 'provedor_recusou' ||
            erro.motivo === 'tempo_esgotado' ||
            erro.motivo === 'resposta_invalida'
              ? erro.motivo
              : 'erro_interno'
          return await falhar(motivo, erro.detalhe)
        }
        throw erro
      }

      const resumo = normalizarResumo(resultado.conteudo)
      if (!resumo) return await falhar('resposta_invalida', 'fora do schema esperado')

      const criterios = criteriosParaPublicacao(resumo.criterios)
      const gravacao = await deps.concluir(reserva.reservaId, resumoParaGravar(resumo), criterios, {
        modelo: resultado.modelo,
        versaoPrompt: VERSAO_PROMPT_NORMA,
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
        custoMicros: resultado.custoMicros,
        duracaoMs: agora() - inicio,
      })
      // O banco confere de novo o resumo e os critérios (resposta_invalida, 22023).
      if (gravacao.erro === 'resposta_invalida') {
        return await falhar('resposta_invalida', 'recusada pelo banco')
      }
      if (gravacao.erro !== null) return await falhar('erro_interno', 'gravação')
      return responder({ situacao: 'resumida', criterios: criterios.length })
    } catch {
      return await falhar('erro_interno')
    }
  }
}
