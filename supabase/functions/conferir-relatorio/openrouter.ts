// Adapter do provedor de IA para a conferência do relatório (ADR-0006, ADR-0036). Mesmo provedor e
// mesmas garantias da extração: OpenRouter, saída por schema, só provedores que não guardam nem
// treinam com o conteúdo. Trocar modelo é trocar o segredo OPENROUTER_MODEL.

import {
  mensagemDaConferencia,
  PROMPT_SISTEMA_CONFERENCIA,
  SCHEMA_DA_CONFERENCIA,
  type ContextoDaConferencia,
} from '../_shared/conferencia.ts'
import { custoEmMicros, detalheDoProvedor, motivoDoStatus } from '../_shared/extracao.ts'
import { type Consumo, FalhaDoProvedor, type Resultado } from '../extrair-licenca/openrouter.ts'

export interface Conferidor {
  conferir(
    entrada: { contexto: ContextoDaConferencia; texto: string },
    sinal: AbortSignal,
  ): Promise<Resultado>
}

interface RespostaOpenRouter {
  model?: string
  choices?: { finish_reason?: string; message?: { content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
}

export function criarConferidorOpenRouter(chave: string, modelo: string): Conferidor {
  return {
    async conferir(entrada, sinal) {
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
            max_tokens: 8_000,
            messages: [
              { role: 'system', content: PROMPT_SISTEMA_CONFERENCIA },
              { role: 'user', content: mensagemDaConferencia(entrada.contexto, entrada.texto) },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'conferencia_relatorio',
                strict: true,
                schema: SCHEMA_DA_CONFERENCIA,
              },
            },
            provider: { data_collection: 'deny', require_parameters: true },
            usage: { include: true },
          }),
        })
      } catch (erro) {
        throw new FalhaDoProvedor(
          sinal.aborted ? 'tempo_esgotado' : 'provedor_indisponivel',
          semConsumo,
          sinal.aborted ? 'sem resposta no tempo limite' : `rede: ${String(erro).slice(0, 200)}`,
        )
      }

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => '')
        throw new FalhaDoProvedor(
          motivoDoStatus(resposta.status),
          semConsumo,
          detalheDoProvedor(resposta.status, corpo),
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
      const texto = corpo.choices?.[0]?.message?.content
      if (!texto) throw new FalhaDoProvedor('resposta_invalida', consumo, 'resposta vazia')
      try {
        return { ...consumo, conteudo: JSON.parse(texto) as unknown }
      } catch {
        throw new FalhaDoProvedor('resposta_invalida', consumo, 'JSON inválido')
      }
    },
  }
}
