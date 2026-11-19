// Aviso por e-mail do acesso de emergência do suporte (ADR-0025; Termos de Uso §13.3 b). A Edge
// Function avisar-acesso-de-suporte só liga as dependências reais (Supabase e fetch); a regra fica
// aqui, testada com `deno test` e dependências falsas.
//
// Dois chamadores:
// - o gatilho do banco (pg_net), com o header x-aviso-token, conferido em tempo constante contra
//   SUPORTE_AVISO_TOKEN: o aviso sai mesmo quando o acesso foi aberto sem o front;
// - o front da central, com o JWT de quem chama: o banco confere que é operador com dois fatores e
//   que existe acesso de emergência valendo aberto por ele (RPC dados_do_aviso_de_emergencia).
// Depois, com a service role:
// 1. Reserva o aviso (RPC reservar_aviso_de_emergencia): só um chamador envia; quem chega depois
//    recebe { enviados: 0 } sem enviar de novo.
// 2. Lê os e-mails da Gestão ativa da consultoria.
// 3. Envia pelo Resend (RESEND_API_KEY, AVISO_REMETENTE). Se falhar, libera a reserva
//    (liberar_aviso_de_emergencia) para uma nova tentativa. Sem as variáveis: erro tratado, sem
//    reservar; o acesso continua (a faixa de aviso aparece para a Gestão no Grama do mesmo jeito).
// Nunca vão para o log: e-mails, a chave, o token e o motivo.

import { iguaisEmTempoConstante } from './resumo-do-mes.ts'

export const URL_DO_RESEND = 'https://api.resend.com/emails'
export const LIMITE_TEMPO_ENVIO_MS = 15_000

export const ROTULO_DA_CATEGORIA: Record<string, string> = {
  incidente_de_seguranca: 'Incidente de segurança',
  falha_grave: 'Falha grave que impede o uso',
  ordem_legal: 'Ordem legal ou judicial',
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Dados do aviso, como a RPC dados_do_aviso_de_emergencia devolve (sem e-mails). */
export interface DadosDoAviso {
  acessoId: string
  consultoriaId: string
  consultoriaNome: string
  fuso: string
  categoria: string
  motivo: string
  inicio: string
  fimPrevisto: string
  operadorNome: string
}

export interface ConferenciaDoAviso {
  dados: DadosDoAviso | null
  /** Código estável do banco quando recusou (ex.: sem_acesso_de_emergencia). */
  erro: string | null
}

export interface DependenciasDoAviso {
  env: (nome: string) => string | undefined
  /** RPC com o JWT de quem chama: confere operador, dois fatores e emergência valendo. */
  conferirAviso: (autorizacao: string, acessoId: string) => Promise<ConferenciaDoAviso>
  /**
   * RPC reservar_aviso_de_emergencia (service role): os dados do e-mail quando esta chamada
   * reservou o aviso; nulo quando já foi reservado (ou não é emergência).
   */
  reservarAviso: (acessoId: string) => Promise<DadosDoAviso | null>
  /** RPC liberar_aviso_de_emergencia (service role): desfaz a reserva depois de uma falha. */
  liberarAviso: (acessoId: string) => Promise<void>
  /** E-mails da Gestão ativa da consultoria (service role). */
  emailsDaGestao: (consultoriaId: string) => Promise<string[]>
  fetch: typeof fetch
  /** Log da função; recebe só dados sem e-mail, chave ou motivo. */
  registrar?: (linha: string) => void
}

export function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** "14/11/2026 às 14:30" no fuso da consultoria. */
export function formatarNoFuso(instante: string, fuso: string): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instante))
      .map((p) => [p.type, p.value]),
  )
  return `${partes.day}/${partes.month}/${partes.year} às ${partes.hour}:${partes.minute}`
}

export interface EmailDoAviso {
  assunto: string
  texto: string
}

/** Assunto e texto do e-mail para a Gestão. Texto puro: nada do motivo vira HTML. */
export function montarEmail(dados: DadosDoAviso): EmailDoAviso {
  const categoria = ROTULO_DA_CATEGORIA[dados.categoria] ?? dados.categoria
  return {
    assunto: `Grama: acesso de emergência do suporte à ${dados.consultoriaNome}`,
    texto: [
      'Olá,',
      '',
      `O suporte do Grama abriu um acesso de emergência à ${dados.consultoriaNome}, sem autorização prévia, como preveem os Termos de Uso (seção 13).`,
      '',
      `Início: ${formatarNoFuso(dados.inicio, dados.fuso)}`,
      `Término: ${formatarNoFuso(dados.fimPrevisto, dados.fuso)} (somente leitura)`,
      `Operador: ${dados.operadorNome}`,
      `Categoria: ${categoria}`,
      `Motivo: ${dados.motivo}`,
      '',
      'O registro fica no Grama, em Equipe, na seção "Acessos do suporte". Lá a Gestão pode encerrar o acesso antes do prazo.',
    ].join('\n'),
  }
}

const RECUSAS: Record<string, number> = {
  sem_permissao: 403,
  dois_fatores_necessarios: 403,
  sem_acesso_de_emergencia: 403,
}

export function criarTratadorDoAviso(deps: DependenciasDoAviso) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    // Gatilho do banco: só o token. Front: o JWT, conferido pelo banco logo abaixo.
    const token = pedido.headers.get('x-aviso-token')
    const autorizacao = pedido.headers.get('Authorization')
    if (token !== null) {
      const esperado = deps.env('SUPORTE_AVISO_TOKEN') ?? ''
      if (!esperado || !iguaisEmTempoConstante(token, esperado)) {
        return responder({ erro: 'sem_permissao' }, 401)
      }
    } else if (!autorizacao) {
      return responder({ erro: 'sem_permissao' }, 401)
    }

    let acessoId = ''
    try {
      const corpo = (await pedido.json()) as { acessoId?: unknown }
      acessoId = typeof corpo.acessoId === 'string' ? corpo.acessoId : ''
    } catch {
      // corpo inválido: cai na conferência abaixo
    }
    if (!UUID.test(acessoId)) return responder({ erro: 'pedido_invalido' }, 400)

    if (token === null && autorizacao) {
      let conferencia: ConferenciaDoAviso
      try {
        conferencia = await deps.conferirAviso(autorizacao, acessoId)
      } catch {
        registrar(JSON.stringify({ acessoId, etapa: 'conferencia', motivo: 'erro_interno' }))
        return responder({ erro: 'erro_interno' }, 500)
      }
      if (!conferencia.dados) {
        const codigo = conferencia.erro ?? 'sem_permissao'
        return responder(
          { erro: codigo in RECUSAS ? codigo : 'sem_permissao' },
          RECUSAS[codigo] ?? 403,
        )
      }
    }

    const chave = deps.env('RESEND_API_KEY')
    const remetente = deps.env('AVISO_REMETENTE')
    if (!chave || !remetente) {
      registrar(JSON.stringify({ acessoId, etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }

    let dados: DadosDoAviso | null
    try {
      dados = await deps.reservarAviso(acessoId)
    } catch {
      registrar(JSON.stringify({ acessoId, etapa: 'reserva', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    // Já avisado (pelo gatilho ou pelo front): não envia de novo.
    if (!dados) return responder({ enviados: 0 })

    const liberar = async () => {
      try {
        await deps.liberarAviso(acessoId)
      } catch {
        registrar(JSON.stringify({ acessoId, etapa: 'liberar', motivo: 'erro_interno' }))
      }
    }

    let destinatarios: string[]
    try {
      destinatarios = await deps.emailsDaGestao(dados.consultoriaId)
    } catch {
      registrar(JSON.stringify({ acessoId, etapa: 'destinatarios', motivo: 'erro_interno' }))
      await liberar()
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (destinatarios.length === 0) {
      await liberar()
      return responder({ erro: 'sem_destinatarios' }, 422)
    }

    const email = montarEmail(dados)
    let status = 0
    try {
      const resposta = await deps.fetch(URL_DO_RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: remetente,
          to: destinatarios,
          subject: email.assunto,
          text: email.texto,
        }),
        signal: AbortSignal.timeout(LIMITE_TEMPO_ENVIO_MS),
      })
      status = resposta.status
      if (resposta.ok) return responder({ enviados: destinatarios.length })
    } catch {
      // rede ou tempo esgotado: status fica 0
    }
    registrar(JSON.stringify({ acessoId, etapa: 'envio', motivo: 'falha_no_envio', status }))
    await liberar()
    return responder({ erro: 'falha_no_envio' }, 502)
  }
}
