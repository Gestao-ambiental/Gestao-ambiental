// Adapter do provedor de IA (ADR-0006): a função fala com esta interface, não com o OpenRouter.
// Trocar modelo é trocar o segredo OPENROUTER_MODEL; trocar provedor é escrever outro adapter.

import {
  custoEmMicros,
  mensagemDoUsuario,
  type MotivoDeFalha,
  PROMPT_SISTEMA,
  SCHEMA_DA_RESPOSTA,
} from '../_shared/extracao.ts'

export interface Entrada {
  paginas: readonly string[]
  tipos: readonly string[]
}

export interface Consumo {
  modelo: string
  tokensEntrada: number | null
  tokensSaida: number | null
  custoMicros: number | null
}

export interface Resultado extends Consumo {
  /** JSON devolvido pelo modelo, ainda não validado. */
  conteudo: unknown
}

/** Falha com motivo estável e o consumo que houve até ali (tokens podem ter sido cobrados). */
export class FalhaDoProvedor extends Error {
  constructor(
    readonly motivo: MotivoDeFalha,
    readonly consumo: Consumo,
  ) {
    super(motivo)
  }
}

export interface Extrator {
  extrair(entrada: Entrada, sinal: AbortSignal): Promise<Resultado>
}

interface RespostaOpenRouter {
  model?: string
  choices?: { finish_reason?: string; message?: { content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
}

export function criarExtratorOpenRouter(chave: string, modelo: string): Extrator {
  return {
    async extrair(entrada, sinal) {
      const semConsumo: Consumo = {
        modelo,
        tokensEntrada: null,
        tokensSaida: null,
        custoMicros: null,
      }
      let resposta: Response
      try {
        resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: sinal,
          headers: {
            Authorization: `Bearer ${chave}`,
            'Content-Type': 'application/json',
            'X-Title': 'Grama',
          },
          body: JSON.stringify({
            model: modelo,
            temperature: 0,
            max_tokens: 32_000,
            messages: [
              { role: 'system', content: PROMPT_SISTEMA },
              { role: 'user', content: mensagemDoUsuario(entrada.paginas, entrada.tipos) },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'proposta_licenca', strict: true, schema: SCHEMA_DA_RESPOSTA },
            },
            // Só provedores que não guardam nem treinam com o conteúdo (RNF 9).
            provider: { data_collection: 'deny', require_parameters: true },
            usage: { include: true },
          }),
        })
      } catch (erro) {
        throw new FalhaDoProvedor(
          sinal.aborted ? 'tempo_esgotado' : 'provedor_indisponivel',
          semConsumo,
        )
      }

      if (!resposta.ok) {
        // 400 aqui é pedido que o provedor não aceita (modelo errado, schema): configuração.
        throw new FalhaDoProvedor(
          resposta.status === 401 || resposta.status === 400
            ? 'configuracao_ausente'
            : 'provedor_indisponivel',
          semConsumo,
        )
      }

      let corpo: RespostaOpenRouter
      try {
        corpo = (await resposta.json()) as RespostaOpenRouter
      } catch {
        throw new FalhaDoProvedor(
          sinal.aborted ? 'tempo_esgotado' : 'resposta_invalida',
          semConsumo,
        )
      }

      const consumo: Consumo = {
        modelo: corpo.model ?? modelo,
        tokensEntrada: corpo.usage?.prompt_tokens ?? null,
        tokensSaida: corpo.usage?.completion_tokens ?? null,
        custoMicros: custoEmMicros(corpo.usage?.cost),
      }
      const escolha = corpo.choices?.[0]
      const texto = escolha?.message?.content
      if (!texto || escolha.finish_reason === 'length') {
        throw new FalhaDoProvedor('resposta_invalida', consumo)
      }
      try {
        return { ...consumo, conteudo: JSON.parse(texto) as unknown }
      } catch {
        throw new FalhaDoProvedor('resposta_invalida', consumo)
      }
    },
  }
}
