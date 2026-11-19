// Resumo do mês por e-mail para a Gestão (ADR-0027). A Edge Function enviar-resumo-do-mes só liga
// as dependências reais (Supabase e fetch); a regra fica aqui, testada com `deno test` e
// dependências falsas.
//
// Dois caminhos, ambos POST:
// 1. Agendado (GitHub Actions, dia 1 às 08:00 de Brasília): header x-cron-token conferido contra o
//    segredo CRON_TOKEN em tempo constante. Com a service role, lista o resumo do mês anterior de
//    cada consultoria não arquivada que ainda não recebeu (resumos_do_mes_pendentes), reserva o
//    envio (reservar_envio_do_resumo), manda para os e-mails da Gestão ativa e grava o envio
//    (registrar_envio_do_resumo). Repetir, mesmo ao mesmo tempo, não reenvia: sem a reserva, não
//    manda. Recusa do Resend libera a reserva (liberar_reserva_do_resumo); sem resposta ou com
//    falha ao gravar, a reserva fica (o e-mail pode ter saído) e só é retomada após 60 minutos.
// 2. Teste pela central ({ teste: true, consultoriaId }): com o JWT de quem chama, o banco confere
//    operador com dois fatores (central_resumo_do_mes); o e-mail vai só para quem está logado e
//    nada é gravado.
// Envio pelo Resend (RESEND_API_KEY, AVISO_REMETENTE). Sem as variáveis: erro tratado (503).
// Nunca vão para o log: e-mails, a chave, o token nem os números das consultorias.

export const URL_DO_RESEND = 'https://api.resend.com/emails'
export const LIMITE_TEMPO_ENVIO_MS = 15_000

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Uma linha das RPCs resumos_do_mes_pendentes e central_resumo_do_mes. */
export interface LinhaDoResumo {
  consultoriaId: string
  consultoriaNome: string
  /** Mês do resumo (aaaa-mm-01); `mes` é ele ou o anterior. */
  mesDoResumo: string
  mes: string
  horasTotal: number
  reaisCentavos: number | null
  horasEstimadas: boolean
  juntandoDados: boolean
  prazoPrevistas: number
  prazoCumpridas: number
  renovacoesVencendo: number
  renovacoesProtegidas: number
}

export interface ResumoDaConsultoria {
  consultoriaId: string
  consultoriaNome: string
  mes: string
  atual: LinhaDoResumo
  anterior: LinhaDoResumo | null
}

export interface ResumoDeTeste {
  linhas: LinhaDoResumo[]
  /** E-mail de quem chamou (do JWT); nulo quando a conta não tem. */
  email: string | null
  /** Código estável do banco quando recusou (ex.: dois_fatores_necessarios). */
  erro: string | null
}

export interface DependenciasDoResumo {
  env: (nome: string) => string | undefined
  fetch: typeof fetch
  /** Service role: o resumo de cada consultoria pendente (duas linhas por consultoria). */
  resumosPendentes: () => Promise<LinhaDoResumo[]>
  /** Service role: e-mails da Gestão ativa da consultoria. */
  emailsDaGestao: (consultoriaId: string) => Promise<string[]>
  /**
   * Service role: reserva o envio antes de mandar; falso quando outra execução reservou há pouco
   * ou o envio já foi gravado.
   */
  reservarEnvio: (consultoriaId: string, mes: string) => Promise<boolean>
  /** Service role: desfaz a reserva depois de uma falha no envio. */
  liberarReserva: (consultoriaId: string, mes: string) => Promise<void>
  /** Service role: grava o envio; falso quando já estava gravado. */
  registrarEnvio: (consultoriaId: string, mes: string, destinatarios: number) => Promise<boolean>
  /** Com o JWT de quem chama: confere operador com dois fatores e lê o resumo e o e-mail dele. */
  resumoDeTeste: (autorizacao: string, consultoriaId: string) => Promise<ResumoDeTeste>
  /** Log da função; recebe só ids, etapas e códigos. */
  registrar?: (linha: string) => void
}

export function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Compara dois textos sem parar no primeiro caractere diferente (tempo constante no tamanho). */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diferenca = x.length ^ y.length
  const tamanho = Math.max(x.length, y.length)
  for (let i = 0; i < tamanho; i++) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diferenca === 0
}

/** Junta as duas linhas de cada consultoria (o mês do resumo e o anterior). */
export function agruparResumos(linhas: readonly LinhaDoResumo[]): ResumoDaConsultoria[] {
  const porConsultoria = new Map<string, ResumoDaConsultoria>()
  for (const linha of linhas) {
    const existente = porConsultoria.get(linha.consultoriaId)
    if (linha.mes === linha.mesDoResumo) {
      porConsultoria.set(linha.consultoriaId, {
        consultoriaId: linha.consultoriaId,
        consultoriaNome: linha.consultoriaNome,
        mes: linha.mesDoResumo,
        atual: linha,
        anterior: existente?.anterior ?? null,
      })
    } else if (existente) {
      existente.anterior = linha
    } else {
      porConsultoria.set(linha.consultoriaId, {
        consultoriaId: linha.consultoriaId,
        consultoriaNome: linha.consultoriaNome,
        mes: linha.mesDoResumo,
        atual: { ...linha, mes: linha.mesDoResumo },
        anterior: linha,
      })
    }
  }
  return [...porConsultoria.values()]
}

const umaCasa = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function mesPorExtenso(mes: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${mes}T12:00:00Z`))
}

function comSinal(texto: string, numero: number): string {
  if (numero > 0) return `+${texto}`
  if (numero < 0) return `−${texto}`
  return texto
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface EmailDoResumo {
  assunto: string
  texto: string
  html: string
}

/** Linhas do resumo (rótulo e valor), iguais no texto e no HTML. Só totais da consultoria. */
export function linhasDoResumo(resumo: ResumoDaConsultoria): [string, string][] {
  const { atual, anterior } = resumo
  const horas = atual.juntandoDados
    ? 'Juntando dados'
    : [
        `${umaCasa.format(atual.horasTotal)} h`,
        atual.reaisCentavos !== null ? reais.format(atual.reaisCentavos / 100) : null,
        atual.horasEstimadas ? 'estimado' : null,
        anterior && !anterior.juntandoDados
          ? `${comSinal(`${umaCasa.format(Math.abs(atual.horasTotal - anterior.horasTotal))} h`, atual.horasTotal - anterior.horasTotal)} contra o mês anterior`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
  const taxa = (l: LinhaDoResumo) =>
    l.prazoPrevistas > 0 ? Math.round((l.prazoCumpridas / l.prazoPrevistas) * 100) : null
  const noPrazo = taxa(atual)
  const noPrazoAntes = anterior ? taxa(anterior) : null
  const entregas =
    noPrazo === null
      ? 'Sem entregas no mês'
      : [
          `${String(noPrazo)}% (${String(atual.prazoCumpridas)} de ${String(atual.prazoPrevistas)})`,
          noPrazoAntes === null
            ? null
            : `${comSinal(`${String(Math.abs(noPrazo - noPrazoAntes))} p.p.`, noPrazo - noPrazoAntes)} contra o mês anterior`,
        ]
          .filter(Boolean)
          .join(' · ')
  const renovacoes =
    atual.renovacoesVencendo === 0
      ? 'Sem vencimentos no mês'
      : `${String(atual.renovacoesProtegidas)} de ${String(atual.renovacoesVencendo)}`
  return [
    ['Horas devolvidas à equipe', horas],
    ['Entregas no prazo', entregas],
    ['Renovações protegidas pelos 120 dias', renovacoes],
  ]
}

export function montarEmailDoResumo(resumo: ResumoDaConsultoria): EmailDoResumo {
  const mes = mesPorExtenso(resumo.mes)
  const linhas = linhasDoResumo(resumo)
  const assunto = `Grama: resumo de ${mes} da ${resumo.consultoriaNome}`
  const texto = [
    'Olá,',
    '',
    `Este é o resumo de ${mes} da ${resumo.consultoriaNome} no Grama.`,
    '',
    ...linhas.map(([rotulo, valor]) => `${rotulo}: ${valor}`),
    '',
    'O resumo completo fica no Grama, em "Resumo do mês".',
  ].join('\n')
  const html = [
    '<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;font-size:14px;color:#1b1b1b">',
    `<p>Este é o resumo de ${escapar(mes)} da ${escapar(resumo.consultoriaNome)} no Grama.</p>`,
    '<table cellpadding="6" style="border-collapse:collapse">',
    ...linhas.map(
      ([rotulo, valor]) =>
        `<tr><th align="left" style="font-weight:600">${escapar(rotulo)}</th><td>${escapar(valor)}</td></tr>`,
    ),
    '</table>',
    '<p>O resumo completo fica no Grama, em "Resumo do mês".</p>',
    '</body></html>',
  ].join('')
  return { assunto, texto, html }
}

const RECUSAS: Record<string, number> = {
  sem_permissao: 403,
  dois_fatores_necessarios: 403,
}

export function criarTratadorDoResumo(deps: DependenciasDoResumo) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  async function enviar(
    chave: string,
    remetente: string,
    para: string[],
    email: EmailDoResumo,
  ): Promise<number> {
    try {
      const resposta = await deps.fetch(URL_DO_RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: remetente,
          to: para,
          subject: email.assunto,
          text: email.texto,
          html: email.html,
        }),
        signal: AbortSignal.timeout(LIMITE_TEMPO_ENVIO_MS),
      })
      return resposta.ok ? 200 : resposta.status
    } catch {
      return 0
    }
  }

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    let corpo: { teste?: unknown; consultoriaId?: unknown } = {}
    try {
      corpo = (await pedido.json()) as typeof corpo
    } catch {
      // corpo vazio ou inválido: caminho agendado
    }

    const chave = deps.env('RESEND_API_KEY')
    const remetente = deps.env('AVISO_REMETENTE')

    // ---- Teste pela central: só para o e-mail de quem chama, nada gravado.
    if (corpo.teste === true) {
      const autorizacao = pedido.headers.get('Authorization')
      if (!autorizacao) return responder({ erro: 'sem_permissao' }, 401)
      const consultoriaId = typeof corpo.consultoriaId === 'string' ? corpo.consultoriaId : ''
      if (!UUID.test(consultoriaId)) return responder({ erro: 'pedido_invalido' }, 400)

      let teste: ResumoDeTeste
      try {
        teste = await deps.resumoDeTeste(autorizacao, consultoriaId)
      } catch {
        registrar(JSON.stringify({ consultoriaId, etapa: 'teste', motivo: 'erro_interno' }))
        return responder({ erro: 'erro_interno' }, 500)
      }
      if (teste.erro) {
        const codigo = teste.erro in RECUSAS ? teste.erro : 'sem_permissao'
        return responder({ erro: codigo }, RECUSAS[codigo] ?? 403)
      }
      if (!chave || !remetente) {
        registrar(JSON.stringify({ etapa: 'configuracao', motivo: 'configuracao_ausente' }))
        return responder({ erro: 'configuracao_ausente' }, 503)
      }
      if (!teste.email) return responder({ erro: 'sem_email' }, 422)
      const [resumo] = agruparResumos(teste.linhas)
      if (!resumo) return responder({ erro: 'sem_permissao' }, 403)
      const status = await enviar(chave, remetente, [teste.email], montarEmailDoResumo(resumo))
      if (status === 200) return responder({ enviados: 1 })
      registrar(JSON.stringify({ consultoriaId, etapa: 'teste', motivo: 'falha_no_envio', status }))
      return responder({ erro: 'falha_no_envio' }, 502)
    }

    // ---- Agendado: segredo próprio no header.
    const esperado = deps.env('CRON_TOKEN') ?? ''
    const recebido = pedido.headers.get('x-cron-token') ?? ''
    if (!esperado || !iguaisEmTempoConstante(recebido, esperado)) {
      return responder({ erro: 'sem_permissao' }, 401)
    }
    if (!chave || !remetente) {
      registrar(JSON.stringify({ etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }

    let resumos: ResumoDaConsultoria[]
    try {
      resumos = agruparResumos(await deps.resumosPendentes())
    } catch {
      registrar(JSON.stringify({ etapa: 'pendentes', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }

    let enviados = 0
    let semDestinatarios = 0
    let emAndamento = 0
    let falhas = 0
    for (const resumo of resumos) {
      const consultoriaId = resumo.consultoriaId
      let etapa = 'destinatarios'
      try {
        const destinatarios = await deps.emailsDaGestao(consultoriaId)
        if (destinatarios.length === 0) {
          semDestinatarios++
          continue
        }
        etapa = 'reserva'
        if (!(await deps.reservarEnvio(consultoriaId, resumo.mes))) {
          emAndamento++
          continue
        }
        etapa = 'envio'
        const status = await enviar(chave, remetente, destinatarios, montarEmailDoResumo(resumo))
        if (status !== 200) {
          falhas++
          registrar(
            JSON.stringify({ consultoriaId, etapa: 'envio', motivo: 'falha_no_envio', status }),
          )
          // Sem resposta (status 0, ex.: tempo esgotado) o e-mail pode ter saído: a reserva fica e
          // só é retomada depois de 60 minutos. Com recusa do Resend, nada saiu: libera já.
          if (status !== 0) {
            etapa = 'liberar'
            await deps.liberarReserva(consultoriaId, resumo.mes)
          }
          continue
        }
        // O e-mail saiu: daqui em diante, nenhuma falha libera a reserva.
        etapa = 'registro'
        await deps.registrarEnvio(consultoriaId, resumo.mes, destinatarios.length)
        enviados++
      } catch {
        if (etapa !== 'liberar') falhas++
        registrar(JSON.stringify({ consultoriaId, etapa, motivo: 'erro_interno' }))
      }
    }

    return responder(
      {
        consultorias: resumos.length,
        enviados,
        sem_destinatarios: semDestinatarios,
        em_andamento: emAndamento,
        falhas,
      },
      falhas > 0 ? 502 : 200,
    )
  }
}
