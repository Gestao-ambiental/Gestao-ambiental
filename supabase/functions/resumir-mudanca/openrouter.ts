// Adapter do provedor de IA para o resumo de mudança de norma (ADR-0050, pacote L4). Mesmo provedor e
// mesmas garantias da extração e da conferência: OpenRouter, saída por schema, só provedores que não
// guardam nem treinam com o conteúdo. Trocar modelo é trocar o segredo OPENROUTER_MODEL.

import { custoEmMicros, detalheDoProvedor, motivoDoStatus } from '../_shared/extracao.ts'
import {
  mensagemDoResumo,
  PROMPT_SISTEMA_NORMA,
  type Resumidor,
  SCHEMA_DO_RESUMO,
} from '../_shared/resumo-de-norma.ts'
import { type Consumo, FalhaDoProvedor } from '../extrair-licenca/openrouter.ts'

interface RespostaOpenRouter {
  model?: string
  choices?: { finish_reason?: string; message?: { content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
}

export function criarResumidorOpenRouter(chave: string, modelo: string): Resumidor {
  return {
    async resumir(entrada, sinal) {
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
            max_tokens: 4_000,
            messages: [
              { role: 'system', content: PROMPT_SISTEMA_NORMA },
              { role: 'user', content: mensagemDoResumo(entrada) },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'resumo_de_norma', strict: true, schema: SCHEMA_DO_RESUMO },
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
