// Orquestração da Edge Function extrair-licenca (épico 9; IA-01, IA-03, IA-04; ADR-0006), com as
// dependências injetadas (banco, Storage, leitura do PDF e provedor) para testar com `deno test`
// sem rede. O index.ts da função só liga as dependências reais.
//
// 1. Com o JWT de quem pediu: inicia a extração (o banco confere Gestão, plano com IA, rascunho,
//    PDF e se ainda não há condicionantes) e baixa o PDF do Storage. O navegador nunca envia o PDF
//    à IA. Extração repetida (mesmo id) não chama a IA de novo: devolve a situação atual.
// 2. Extrai o texto por página; PDF sem texto (escaneado), acima de 10 MB, de 300 páginas ou de
//    400 mil caracteres não vai à IA.
// 3. Reserva uma chamada da cota (porte do PR #24) e chama o provedor pelo adapter, com tempo
//    limite; valida a resposta por schema.
// 4. Com a service role: grava a proposta como rascunho ou registra a falha, com modelo, prompt,
//    tokens, custo e duração. Se o registro da falha não gravar, responde 500 (não "falhou").

import {
  excessoDoPdf,
  LIMITE_PDF_BYTES,
  LIMITE_TEMPO_MS,
  MODELO_PADRAO,
  type MotivoDeFalha,
  pdfTemTexto,
  type Proposta,
  validarProposta,
  VERSAO_PROMPT,
} from './extracao.ts'
import { type Consumo, type Extrator, FalhaDoProvedor } from '../extrair-licenca/openrouter.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Códigos estáveis do banco que voltam para a tela como estão (traduzidos em lib/erros.ts). */
export const ERROS_DO_INICIO: Record<string, number> = {
  sem_permissao: 403,
  instrumento_ativo: 409,
  pdf_obrigatorio: 409,
  condicionantes_existentes: 409,
  extracao_em_andamento: 409,
  ia_fora_do_plano: 403,
  consultoria_somente_leitura: 403,
}

/** Linha devolvida por iniciar_extracao_ia. */
export interface InicioDaExtracao {
  nova: boolean
  situacao: string
  motivo: string | null
  itens_propostos: number | null
  caminho: string
  tamanho_bytes: number
  tipos: string[]
}

/** Resposta de uma chamada ao banco: os dados, ou o código estável do erro em `erro`. */
export interface RespostaDoBanco<T> {
  dados: T | null
  erro: string | null
}

/** O que a extração registra ao concluir ou falhar (IA-03). */
export interface RegistroDaExtracao {
  modelo: string
  versaoPrompt: string
  tokensEntrada: number | null
  tokensSaida: number | null
  custoMicros: number | null
  paginas: number | null
  duracaoMs: number
}

export interface DependenciasDaExtracao {
  env: (nome: string) => string | undefined
  /** RPC iniciar_extracao_ia com o JWT de quem pediu. */
  iniciar: (
    autorizacao: string,
    extracaoId: string,
    instrumentoId: string,
  ) => Promise<RespostaDoBanco<InicioDaExtracao>>
  /** PDF do Storage, com o JWT de quem pediu. */
  baixarPdf: (autorizacao: string, caminho: string) => Promise<RespostaDoBanco<Uint8Array>>
  /** Texto de cada página; lança se o PDF não abre. */
  lerPdf: (pdf: Uint8Array) => Promise<{ totalPaginas: number; textos: string[] }>
  /** RPC reservar_extracao_ia (service role): true = há cota para uma chamada paga. */
  reservar: (extracaoId: string) => Promise<RespostaDoBanco<boolean>>
  criarExtrator: (chave: string, modelo: string) => Extrator
  /** RPC concluir_extracao_ia (service role): quantos itens entraram. */
  concluir: (
    extracaoId: string,
    proposta: Proposta,
    registro: RegistroDaExtracao,
  ) => Promise<RespostaDoBanco<number>>
  /** RPC falhar_extracao_ia (service role). */
  falhar: (
    extracaoId: string,
    motivo: MotivoDeFalha,
    registro: RegistroDaExtracao,
    detalhe: string | null,
  ) => Promise<{ erro: string | null }>
  agora?: () => number
  /** Sinal de tempo limite da chamada ao provedor (padrão AbortSignal.timeout). */
  tempoLimite?: (ms: number) => AbortSignal
  /** Log da função (Supabase → Edge Functions → Logs): só ids, motivo e detalhe curto. */
  registrar?: (linha: string) => void
}

export function criarTratadorDaExtracao(deps: DependenciasDaExtracao) {
  const agora = deps.agora ?? (() => Date.now())
  const tempoLimite = deps.tempoLimite ?? ((ms: number) => AbortSignal.timeout(ms))
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const autorizacao = pedido.headers.get('Authorization')
    if (!autorizacao) return responder({ erro: 'sem_permissao' }, 401)

    let extracaoId = ''
    let instrumentoId = ''
    try {
      const corpo = (await pedido.json()) as { extracaoId?: unknown; instrumentoId?: unknown }
      extracaoId = typeof corpo.extracaoId === 'string' ? corpo.extracaoId : ''
      instrumentoId = typeof corpo.instrumentoId === 'string' ? corpo.instrumentoId : ''
    } catch {
      // corpo inválido: cai na conferência abaixo
    }
    if (!UUID.test(extracaoId) || !UUID.test(instrumentoId)) {
      return responder({ erro: 'pedido_invalido' }, 400)
    }

    const inicio = agora()
    let inicio_: RespostaDoBanco<InicioDaExtracao>
    try {
      inicio_ = await deps.iniciar(autorizacao, extracaoId, instrumentoId)
    } catch {
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (inicio_.erro !== null) {
      const codigo = inicio_.erro
      return responder(
        { erro: codigo in ERROS_DO_INICIO ? codigo : 'erro_interno' },
        ERROS_DO_INICIO[codigo] ?? 500,
      )
    }
    const pdf = inicio_.dados
    if (!pdf) return responder({ erro: 'erro_interno' }, 500)
    // Retry ou clique duplo: não chama a IA de novo, só conta como está.
    if (!pdf.nova) {
      return responder(
        pdf.situacao === 'concluida'
          ? { situacao: 'concluida', itens: pdf.itens_propostos ?? 0 }
          : pdf.situacao === 'falhou'
            ? { situacao: 'falhou', motivo: pdf.motivo }
            : { situacao: 'em_andamento' },
      )
    }

    const modelo = deps.env('OPENROUTER_MODEL') || MODELO_PADRAO
    let paginas = 0

    async function falhar(
      motivo: MotivoDeFalha,
      consumo?: Consumo,
      detalhe: string | null = null,
    ): Promise<Response> {
      registrar(JSON.stringify({ extracaoId, instrumentoId, motivo, detalhe, modelo }))
      let erro: string | null
      try {
        const registro = await deps.falhar(
          extracaoId,
          motivo,
          {
            modelo: consumo?.modelo ?? modelo,
            versaoPrompt: VERSAO_PROMPT,
            tokensEntrada: consumo?.tokensEntrada ?? null,
            tokensSaida: consumo?.tokensSaida ?? null,
            custoMicros: consumo?.custoMicros ?? null,
            paginas: paginas || null,
            duracaoMs: agora() - inicio,
          },
          detalhe,
        )
        erro = registro.erro
      } catch (excecao) {
        erro = String(excecao)
      }
      // Sem o registro, a linha fica "em andamento" (409 por 3 min): não diga à tela que falhou.
      if (erro !== null) {
        registrar(
          JSON.stringify({ extracaoId, etapa: 'registrar_falha', erro: erro.slice(0, 200) }),
        )
        return responder({ erro: 'erro_interno' }, 500)
      }
      return responder({ situacao: 'falhou', motivo, detalhe })
    }

    try {
      const chave = deps.env('OPENROUTER_API_KEY')
      if (!chave) {
        return await falhar(
          'configuracao_ausente',
          undefined,
          'OPENROUTER_API_KEY não encontrada na função',
        )
      }
      if (pdf.tamanho_bytes > LIMITE_PDF_BYTES) return await falhar('pdf_grande_demais')

      const arquivo = await deps.baixarPdf(autorizacao, pdf.caminho)
      if (!arquivo.dados) {
        return await falhar(
          'erro_interno',
          undefined,
          `storage: ${(arquivo.erro ?? 'sem arquivo').slice(0, 200)}`,
        )
      }

      let textos: string[]
      try {
        const lido = await deps.lerPdf(arquivo.dados)
        paginas = lido.totalPaginas
        textos = lido.textos
      } catch {
        return await falhar('pdf_sem_texto')
      }
      const excesso = excessoDoPdf(textos)
      if (excesso) return await falhar('pdf_grande_demais', undefined, excesso)
      if (!pdfTemTexto(textos)) return await falhar('pdf_sem_texto')

      // Cota (porte do PR #24): uma reserva por extração, antes da chamada paga. Conta mesmo se o
      // provedor falhar ou se os itens forem descartados depois.
      const reserva = await deps.reservar(extracaoId)
      if (reserva.erro !== null) {
        return await falhar('erro_interno', undefined, `reserva: ${reserva.erro.slice(0, 200)}`)
      }
      if (reserva.dados !== true) return await falhar('limite_atingido')

      const extrator = deps.criarExtrator(chave, modelo)
      let resultado
      try {
        resultado = await extrator.extrair(
          { paginas: textos, tipos: pdf.tipos },
          tempoLimite(Math.max(1, LIMITE_TEMPO_MS - (agora() - inicio))),
        )
      } catch (erro) {
        if (erro instanceof FalhaDoProvedor) {
          return await falhar(erro.motivo, erro.consumo, erro.detalhe)
        }
        throw erro
      }

      const proposta = validarProposta(resultado.conteudo, {
        totalPaginas: paginas,
        tipos: pdf.tipos,
      })
      if (!proposta) return await falhar('resposta_invalida', resultado, 'fora do schema esperado')

      const gravacao = await deps.concluir(extracaoId, proposta, {
        modelo: resultado.modelo,
        versaoPrompt: VERSAO_PROMPT,
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
        custoMicros: resultado.custoMicros,
        paginas,
        duracaoMs: agora() - inicio,
      })
      if (gravacao.erro !== null || gravacao.dados === null) {
        return await falhar(
          'erro_interno',
          resultado,
          `gravação: ${(gravacao.erro ?? 'sem resposta').slice(0, 200)}`,
        )
      }
      return responder({ situacao: 'concluida', itens: gravacao.dados })
    } catch (erro) {
      return await falhar('erro_interno', undefined, String(erro).slice(0, 200))
    }
  }
}
