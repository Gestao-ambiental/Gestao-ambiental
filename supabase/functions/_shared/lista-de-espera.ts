// Lista de espera, parte 2 (ADR-0034). Regras das Edge Functions avisar-lista-de-espera e
// convidar-da-lista-de-espera, testadas com `deno test` e dependências falsas.
//
// Aviso: o gatilho do banco chama a função pelo pg_net com o header x-aviso-token (conferido em
// tempo constante contra LISTA_AVISO_TOKEN). Com a service role ela lê os cadastros ainda sem aviso
// e os e-mails dos operadores, manda um e-mail só pelo Resend e marca os cadastros como avisados.
// Se o envio falhar, nada é marcado: o próximo cadastro leva os pendentes junto. O gatilho só chama
// a função uma vez a cada 10 minutos (migration 20261119300100): os cadastros do intervalo vão
// juntos no próximo aviso.
//
// Convite: o operador (JWT, dois fatores) pede; o banco registra o convite e devolve o contato. Para
// e-mail, a função manda o convite com o link de criar conta do beta (LINK_DO_BETA). WhatsApp não
// passa por aqui: o front registra pela RPC e abre a conversa com a mensagem pronta.
//
// Nunca vão para o log: e-mails, telefones, nomes, a chave e o token.

import { CORS, LIMITE_TEMPO_ENVIO_MS, URL_DO_RESEND, responder } from './aviso-de-suporte.ts'
import { iguaisEmTempoConstante } from './resumo-do-mes.ts'

export const LINK_PADRAO_DO_BETA = 'https://beta.gramaapp.com.br'

const CORS_DO_AVISO = {
  ...CORS,
  'Access-Control-Allow-Headers': `${CORS['Access-Control-Allow-Headers']}, x-aviso-token`,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CadastroNaLista {
  id: string
  nome: string
  contato: string
  tipoContato: 'email' | 'whatsapp'
  criadaEm: string
}

export interface PendentesDeAviso {
  cadastros: CadastroNaLista[]
  destinatarios: string[]
}

interface Envio {
  chave: string
  remetente: string
  para: string[]
  assunto: string
  texto: string
}

async function enviarPeloResend(doFetch: typeof fetch, envio: Envio): Promise<number> {
  try {
    const resposta = await doFetch(URL_DO_RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${envio.chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: envio.remetente,
        to: envio.para,
        subject: envio.assunto,
        text: envio.texto,
      }),
      signal: AbortSignal.timeout(LIMITE_TEMPO_ENVIO_MS),
    })
    return resposta.status
  } catch {
    return 0
  }
}

/** "(47) 99999-1234" a partir de "5547999991234"; outros formatos ficam como vieram. */
export function formatarWhatsapp(digitos: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digitos)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${digitos}`
}

/**
 * Assunto e texto do aviso aos operadores. Texto puro (sem HTML, nada a escapar). O nome vem de
 * quem se cadastrou no site, sem login: fica só no corpo, nunca no assunto.
 */
export function montarEmailDoAviso(cadastros: readonly CadastroNaLista[]): {
  assunto: string
  texto: string
} {
  const assunto =
    cadastros.length === 1
      ? 'Grama: 1 pessoa entrou na lista de espera'
      : `Grama: ${String(cadastros.length)} pessoas entraram na lista de espera`
  const linhas = cadastros.map(
    (c) =>
      `- ${c.nome}: ${c.tipoContato === 'email' ? c.contato : `WhatsApp ${formatarWhatsapp(c.contato)}`}`,
  )
  return {
    assunto,
    texto: [
      cadastros.length === 1
        ? 'Cadastro novo na lista de espera:'
        : 'Cadastros novos na lista de espera:',
      '',
      ...linhas,
      '',
      'A lista completa fica na central do Grama, em Lista de espera.',
    ].join('\n'),
  }
}

/** Assunto e texto do convite para o beta. Texto puro. */
export function montarEmailDoConvite(
  nome: string,
  linkDoBeta: string,
): {
  assunto: string
  texto: string
} {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome
  return {
    assunto: 'Seu convite para o beta do Grama',
    texto: [
      `Olá, ${primeiroNome},`,
      '',
      'Você se inscreveu na lista de espera do Grama e o beta está aberto para você.',
      '',
      `Crie sua conta: ${linkDoBeta}/criar-conta`,
      '',
      'Se tiver qualquer dúvida, é só responder este e-mail.',
      '',
      'Equipe Grama',
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------------------------
// Aviso aos operadores
// ---------------------------------------------------------------------------------------------

export interface DependenciasDoAvisoDaLista {
  env: (nome: string) => string | undefined
  /** RPC lista_de_espera_pendente_de_aviso (service role). */
  pendentes: () => Promise<PendentesDeAviso>
  /** RPC lista_de_espera_marcar_avisados (service role). */
  marcarAvisados: (ids: string[]) => Promise<number>
  fetch: typeof fetch
  registrar?: (linha: string) => void
}

export function criarTratadorDoAvisoDaLista(deps: DependenciasDoAvisoDaLista) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS_DO_AVISO })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const esperado = deps.env('LISTA_AVISO_TOKEN') ?? ''
    const recebido = pedido.headers.get('x-aviso-token') ?? ''
    if (!esperado || !iguaisEmTempoConstante(recebido, esperado)) {
      return responder({ erro: 'sem_permissao' }, 401)
    }

    const chave = deps.env('RESEND_API_KEY')
    const remetente = deps.env('AVISO_REMETENTE')
    if (!chave || !remetente) {
      registrar(JSON.stringify({ etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }

    let pendentes: PendentesDeAviso
    try {
      pendentes = await deps.pendentes()
    } catch {
      registrar(JSON.stringify({ etapa: 'pendentes', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (pendentes.cadastros.length === 0) return responder({ avisados: 0 })
    if (pendentes.destinatarios.length === 0) return responder({ erro: 'sem_destinatarios' }, 422)

    const email = montarEmailDoAviso(pendentes.cadastros)
    const status = await enviarPeloResend(deps.fetch, {
      chave,
      remetente,
      para: pendentes.destinatarios,
      assunto: email.assunto,
      texto: email.texto,
    })
    if (status < 200 || status >= 300) {
      registrar(JSON.stringify({ etapa: 'envio', motivo: 'falha_no_envio', status }))
      return responder({ erro: 'falha_no_envio' }, 502)
    }

    try {
      const avisados = await deps.marcarAvisados(pendentes.cadastros.map((c) => c.id))
      return responder({ avisados })
    } catch {
      registrar(JSON.stringify({ etapa: 'marcar', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Convite por e-mail
// ---------------------------------------------------------------------------------------------

export interface RegistroDoConvite {
  dados: { nome: string; contato: string; tipoContato: 'email' | 'whatsapp' } | null
  /** Código estável do banco quando recusou (ex.: sem_permissao, cadastro_inexistente). */
  erro: string | null
}

export interface DependenciasDoConvite {
  env: (nome: string) => string | undefined
  /** RPC central_registrar_convite com o JWT de quem chama. */
  registrarConvite: (autorizacao: string, id: string) => Promise<RegistroDoConvite>
  fetch: typeof fetch
  registrar?: (linha: string) => void
}

const RECUSAS_DO_CONVITE: Record<string, number> = {
  sem_permissao: 403,
  dois_fatores_necessarios: 403,
  cadastro_inexistente: 404,
}

export function criarTratadorDoConvite(deps: DependenciasDoConvite) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const autorizacao = pedido.headers.get('Authorization')
    if (!autorizacao) return responder({ erro: 'sem_permissao' }, 401)

    let id = ''
    try {
      const corpo = (await pedido.json()) as { id?: unknown }
      id = typeof corpo.id === 'string' ? corpo.id : ''
    } catch {
      // corpo inválido: cai na conferência abaixo
    }
    if (!UUID.test(id)) return responder({ erro: 'pedido_invalido' }, 400)

    // Confere a configuração antes de registrar: sem ela, o convite não fica marcado à toa.
    const chave = deps.env('RESEND_API_KEY')
    const remetente = deps.env('AVISO_REMETENTE')
    if (!chave || !remetente) {
      registrar(JSON.stringify({ id, etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }

    let registro: RegistroDoConvite
    try {
      registro = await deps.registrarConvite(autorizacao, id)
    } catch {
      registrar(JSON.stringify({ id, etapa: 'registro', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    const dados = registro.dados
    if (!dados) {
      const codigo = registro.erro ?? 'sem_permissao'
      return responder(
        { erro: codigo in RECUSAS_DO_CONVITE ? codigo : 'sem_permissao' },
        RECUSAS_DO_CONVITE[codigo] ?? 403,
      )
    }
    if (dados.tipoContato !== 'email') return responder({ erro: 'contato_nao_e_email' }, 422)

    const link = (deps.env('LINK_DO_BETA') ?? LINK_PADRAO_DO_BETA).replace(/\/+$/, '')
    const email = montarEmailDoConvite(dados.nome, link)
    const status = await enviarPeloResend(deps.fetch, {
      chave,
      remetente,
      para: [dados.contato],
      assunto: email.assunto,
      texto: email.texto,
    })
    if (status >= 200 && status < 300) return responder({ enviado: true })
    registrar(JSON.stringify({ id, etapa: 'envio', motivo: 'falha_no_envio', status }))
    return responder({ erro: 'falha_no_envio' }, 502)
  }
}
