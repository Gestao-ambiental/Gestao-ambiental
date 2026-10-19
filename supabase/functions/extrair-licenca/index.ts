// Edge Function extrair-licenca (épico 9; IA-01, IA-03, IA-04; ADR-0006).
//
// 1. Com o JWT de quem pediu: inicia a extração (o banco confere Gestão, rascunho, PDF e se ainda
//    não há condicionantes) e baixa o PDF do Storage. O navegador nunca envia o PDF à IA.
//    Extração repetida (mesmo id) não chama a IA de novo: devolve a situação atual.
// 2. Extrai o texto por página aqui; PDF sem texto (escaneado) ou acima de 10 MB não vai à IA.
// 3. Chama o provedor pelo adapter, com tempo limite, e valida a resposta por schema.
// 4. Com a service role: grava a proposta como rascunho ou registra a falha, com modelo, prompt,
//    tokens, custo e duração. Se a pessoa sair da tela, a gravação acontece do mesmo jeito.
// Segredos: OPENROUTER_API_KEY (obrigatório) e OPENROUTER_MODEL (opcional). Nunca em log.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1'

import {
  LIMITE_PDF_BYTES,
  LIMITE_TEMPO_MS,
  MODELO_PADRAO,
  type MotivoDeFalha,
  pdfTemTexto,
  validarProposta,
  VERSAO_PROMPT,
} from '../_shared/extracao.ts'
import { type Consumo, criarExtratorOpenRouter, FalhaDoProvedor } from './openrouter.ts'

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
const ERROS_DO_INICIO: Record<string, number> = {
  sem_permissao: 403,
  instrumento_ativo: 409,
  pdf_obrigatorio: 409,
  condicionantes_existentes: 409,
  extracao_em_andamento: 409,
}

Deno.serve(async (pedido) => {
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

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
  const usuario = createClient(url, anonima, {
    ...opcoes,
    global: { headers: { Authorization: autorizacao } },
  })
  const admin = createClient(url, servico, opcoes)
  const inicio = Date.now()

  const inicio_ = await usuario.rpc('iniciar_extracao_ia', {
    p_id: extracaoId,
    p_instrumento_id: instrumentoId,
  })
  if (inicio_.error) {
    const codigo = inicio_.error.message
    return responder(
      { erro: codigo in ERROS_DO_INICIO ? codigo : 'erro_interno' },
      ERROS_DO_INICIO[codigo] ?? 500,
    )
  }
  const pdf = (
    inicio_.data as {
      nova: boolean
      situacao: string
      motivo: string | null
      itens_propostos: number | null
      caminho: string
      tamanho_bytes: number
      tipos: string[]
    }[]
  )[0]
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

  const modelo = Deno.env.get('OPENROUTER_MODEL') || MODELO_PADRAO
  let paginas = 0

  async function falhar(
    motivo: MotivoDeFalha,
    consumo?: Consumo,
    detalhe: string | null = null,
  ): Promise<Response> {
    // Log da função (Supabase → Edge Functions → Logs): só ids, motivo e o detalhe do provedor.
    console.error(JSON.stringify({ extracaoId, instrumentoId, motivo, detalhe, modelo }))
    await admin.rpc('falhar_extracao_ia', {
      p_id: extracaoId,
      p_motivo: motivo,
      p_modelo: consumo?.modelo ?? modelo,
      p_versao_prompt: VERSAO_PROMPT,
      p_tokens_entrada: consumo?.tokensEntrada ?? null,
      p_tokens_saida: consumo?.tokensSaida ?? null,
      p_custo_micros: consumo?.custoMicros ?? null,
      p_paginas: paginas || null,
      p_duracao_ms: Date.now() - inicio,
      p_detalhe: detalhe,
    })
    return responder({ situacao: 'falhou', motivo, detalhe })
  }

  try {
    const chave = Deno.env.get('OPENROUTER_API_KEY')
    if (!chave) {
      return await falhar(
        'configuracao_ausente',
        undefined,
        'OPENROUTER_API_KEY não encontrada na função',
      )
    }
    if (pdf.tamanho_bytes > LIMITE_PDF_BYTES) return await falhar('pdf_grande_demais')

    const arquivo = await usuario.storage.from('arquivos').download(pdf.caminho)
    if (arquivo.error) {
      return await falhar(
        'erro_interno',
        undefined,
        `storage: ${arquivo.error.message.slice(0, 200)}`,
      )
    }

    let textos: string[]
    try {
      const documento = await getDocumentProxy(new Uint8Array(await arquivo.data.arrayBuffer()))
      const extraido = await extractText(documento, { mergePages: false })
      paginas = extraido.totalPages
      textos = extraido.text
    } catch {
      return await falhar('pdf_sem_texto')
    }
    if (!pdfTemTexto(textos)) return await falhar('pdf_sem_texto')

    const extrator = criarExtratorOpenRouter(chave, modelo)
    let resultado
    try {
      resultado = await extrator.extrair(
        { paginas: textos, tipos: pdf.tipos },
        AbortSignal.timeout(LIMITE_TEMPO_MS - (Date.now() - inicio)),
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

    const gravacao = await admin.rpc('concluir_extracao_ia', {
      p_id: extracaoId,
      p_resultado: proposta,
      p_modelo: resultado.modelo,
      p_versao_prompt: VERSAO_PROMPT,
      p_tokens_entrada: resultado.tokensEntrada,
      p_tokens_saida: resultado.tokensSaida,
      p_custo_micros: resultado.custoMicros,
      p_paginas: paginas,
      p_duracao_ms: Date.now() - inicio,
    })
    if (gravacao.error) {
      return await falhar(
        'erro_interno',
        resultado,
        `gravação: ${gravacao.error.message.slice(0, 200)}`,
      )
    }
    return responder({ situacao: 'concluida', itens: gravacao.data as number })
  } catch (erro) {
    return await falhar('erro_interno', undefined, String(erro).slice(0, 200))
  }
})
