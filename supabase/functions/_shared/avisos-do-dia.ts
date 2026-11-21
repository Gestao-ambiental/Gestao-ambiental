// Resumo diário por e-mail (ADR-0047). A Edge Function enviar-avisos-do-dia só liga as dependências
// reais (Supabase e fetch); a regra fica aqui, testada com `deno test` e dependências falsas.
//
// Chamada pelo pg_cron (pg_net) a cada 15 minutos, com o header x-cron-token conferido contra o
// segredo CRON_TOKEN em tempo constante. Com a service role:
// 1. avisos_do_dia_pendentes: quem deve receber agora (7 h às 9 h 59 no fuso da consultoria, dia
//    útil, resumo ligado, sem envio do dia). No máximo 60 envios por chamada (quem não tem item
//    não conta); o resto sai no ciclo seguinte.
// 2. Por pessoa, itens_do_resumo_diario: sem item, não envia e não grava nada (nunca sai vazio).
// 3. reservar_aviso_do_dia: só uma execução envia para cada pessoa e dia.
// 4. Envia pelo Resend com Idempotency-Key resumo-diario/<membro>/<dia> e List-Unsubscribe
//    (one-click, RFC 8058) e grava o resultado (registrar_aviso_do_dia). Recusa do Resend: falhou,
//    e o próximo ciclo tenta de novo. Sem resposta: não grava; a reserva é retomada depois de 30
//    minutos e a chave de idempotência impede o segundo e-mail.
// Entre dois envios, 600 ms (limite de 2 por segundo do Resend).
// Segredos: CRON_TOKEN, RESEND_API_KEY, AVISO_REMETENTE e AVISO_ASSINATURA. Nunca vão para o log:
// e-mails, nomes, tokens, a chave e o conteúdo (só ids, etapa, motivo e status).
//
// L7 (ADR-0050, ADR-0055): o resumo ganha a seção "Mudanças de norma" (normas_do_resumo_diario);
// quem só tem mudança de norma também recebe. E-mail na hora só para revogação de norma que afeta
// licença ativa (revogacoes_para_avisar), um por pessoa e mudança, em qualquer horário, com o mesmo
// descadastro. Sem e-mail por mudança.

import { linhaDaMudanca } from './aviso-de-norma.ts'
import { assinarLinkDeDescadastro } from './link-de-descadastro.ts'
import { LINK_PADRAO_DO_BETA } from './lista-de-espera.ts'
import { enviarPeloResend } from './resend.ts'
import { iguaisEmTempoConstante } from './resumo-do-mes.ts'

export const MAXIMO_POR_CHAMADA = 60
export const INTERVALO_ENTRE_ENVIOS_MS = 600
export const MAXIMO_POR_GRUPO = 15

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Uma linha da RPC avisos_do_dia_pendentes. */
export interface PendenteDoDia {
  consultoriaId: string
  consultoriaNome: string
  membroId: string
  membroNome: string
  email: string
  papel: 'gestao' | 'equipe'
  /** Dia civil do resumo (aaaa-mm-dd) no fuso da consultoria. */
  dia: string
}

export type GrupoDoResumo = 'meus' | 'sem_responsavel' | 'da_consultoria'

/** Uma linha da RPC itens_do_resumo_diario. */
export interface ItemDoResumo {
  grupo: GrupoDoResumo
  tipoLinha: string
  id: string
  prazo: string
  /** prazo − dia do resumo; negativo = atrasado. */
  dias: number
  codigo: string | null
  titulo: string | null
  empreendimentoNome: string | null
  unidadeNome: string | null
  licenca: string | null
}

/** Uma linha da RPC normas_do_resumo_diario. */
export interface MudancaDoResumo {
  mudancaId: string
  tipo: string
  normaTitulo: string
  /** Data civil da publicação (aaaa-mm-dd). */
  publicadaEm: string
  empreendimentoNome: string | null
  licenca: string | null
}

/** Uma linha da RPC revogacoes_para_avisar: uma pessoa e uma revogação. */
export interface RevogacaoParaAvisar {
  consultoriaId: string
  consultoriaNome: string
  membroId: string
  membroNome: string
  email: string
  mudancaId: string
  normaTitulo: string
  /** "Empreendimento · LAO 1/2024" de cada licença ativa afetada. */
  afetados: string[]
}

export interface DependenciasDosAvisos {
  env: (nome: string) => string | undefined
  fetch: typeof fetch
  /** Service role: quem deve receber agora. */
  pendentes: () => Promise<PendenteDoDia[]>
  /** Service role: itens do resumo da pessoa no dia. */
  itens: (consultoriaId: string, membroId: string, dia: string) => Promise<ItemDoResumo[]>
  /** Service role: reserva o envio; nulo quando outra execução reservou, já saiu ou esgotou. */
  reservar: (consultoriaId: string, membroId: string, dia: string) => Promise<string | null>
  /** Service role: grava o resultado da reserva. */
  registrarResultado: (
    id: string,
    situacao: 'enviado' | 'falhou',
    provedorId?: string | null,
  ) => Promise<boolean>
  /** Service role: mudanças de norma do resumo da pessoa no dia (L7). */
  normas?: (consultoriaId: string, membroId: string, dia: string) => Promise<MudancaDoResumo[]>
  /** Service role: revogações que pedem e-mail na hora (L7). */
  revogacoes?: () => Promise<RevogacaoParaAvisar[]>
  reservarRevogacao?: (
    consultoriaId: string,
    membroId: string,
    mudancaId: string,
  ) => Promise<string | null>
  registrarRevogacao?: (
    id: string,
    situacao: 'enviado' | 'falhou',
    provedorId?: string | null,
  ) => Promise<boolean>
  /** Pausa entre envios (injetável nos testes). */
  esperar?: (ms: number) => Promise<void>
  /** Log da função; recebe só ids, etapas, motivos e status. */
  registrar?: (linha: string) => void
}

export function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const TITULO_DO_GRUPO: Record<GrupoDoResumo, string> = {
  meus: 'Seus prazos',
  sem_responsavel: 'Sem responsável',
  da_consultoria: 'Licenças e vencimentos',
}
const ORDEM_DOS_GRUPOS: GrupoDoResumo[] = ['meus', 'sem_responsavel', 'da_consultoria']

export const ROTULO_DO_TIPO: Record<string, string> = {
  ocorrencia: 'Prazo',
  validade: 'Validade',
  limite_protocolo: 'Limite de protocolo',
  exigencia: 'Exigência',
  vencimento: 'Vencimento',
}

/** aaaa-mm-dd → dd/mm/aaaa. */
export function dataBrasileira(data: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : data
}

export function sufixoDosDias(dias: number): string {
  if (dias < 0) return `${String(-dias)} ${-dias === 1 ? 'dia' : 'dias'} de atraso`
  if (dias === 0) return 'hoje'
  return `em ${String(dias)} ${dias === 1 ? 'dia' : 'dias'}`
}

/** "dd/mm/aaaa · código · título · empreendimento (sufixo)", sem partes vazias nem repetidas. */
export function linhaDoItem(item: ItemDoResumo): string {
  const partes: string[] = []
  for (const parte of [
    item.codigo?.trim() || ROTULO_DO_TIPO[item.tipoLinha] || 'Prazo',
    item.titulo?.trim() ?? '',
    item.empreendimentoNome?.trim() ?? '',
  ]) {
    if (parte && parte !== partes.at(-1)) partes.push(parte)
  }
  return `${dataBrasileira(item.prazo)} · ${partes.join(' · ')} (${sufixoDosDias(item.dias)})`
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface EmailDoResumoDiario {
  assunto: string
  texto: string
  html: string
}

export interface LinksDoResumo {
  /** Link do app (LINK_DO_BETA), sem barra no fim. */
  app: string
  /** Token assinado do descadastro (vai no fragmento da página /avisos/parar). */
  tokenDeDescadastro: string
}

interface GrupoMontado {
  titulo: string
  linhas: string[]
  restantes: number
}

function agrupar(itens: readonly ItemDoResumo[]): GrupoMontado[] {
  const grupos: GrupoMontado[] = []
  for (const grupo of ORDEM_DOS_GRUPOS) {
    const doGrupo = itens.filter((i) => i.grupo === grupo)
    if (doGrupo.length === 0) continue
    grupos.push({
      titulo: `${TITULO_DO_GRUPO[grupo]} (${String(doGrupo.length)})`,
      linhas: doGrupo.slice(0, MAXIMO_POR_GRUPO).map(linhaDoItem),
      restantes: Math.max(doGrupo.length - MAXIMO_POR_GRUPO, 0),
    })
  }
  return grupos
}

/** Seção "Mudanças de norma (n)" do resumo, até 15 linhas. */
function grupoDasNormas(normas: readonly MudancaDoResumo[]): GrupoMontado[] {
  if (normas.length === 0) return []
  return [
    {
      titulo: `Mudanças de norma (${String(normas.length)})`,
      linhas: normas.slice(0, MAXIMO_POR_GRUPO).map((m) => linhaDaMudanca(m)),
      restantes: Math.max(normas.length - MAXIMO_POR_GRUPO, 0),
    },
  ]
}

export function montarEmailDoResumoDiario(
  pendente: PendenteDoDia,
  itens: readonly ItemDoResumo[],
  links: LinksDoResumo,
  normas: readonly MudancaDoResumo[] = [],
): EmailDoResumoDiario {
  const dia = dataBrasileira(pendente.dia)
  const nome = primeiroNome(pendente.membroNome)
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.'
  const abrir = `${links.app}/`
  const parar = `${links.app}/avisos/parar#${links.tokenDeDescadastro}`
  const grupos = [...agrupar(itens), ...grupoDasNormas(normas)]
  const maisNoGrama = (n: number) => `e mais ${String(n)} no Grama`

  const texto = [
    saudacao,
    '',
    ...grupos.flatMap((g) => [
      g.titulo,
      ...g.linhas.map((l) => `- ${l}`),
      ...(g.restantes > 0 ? [maisNoGrama(g.restantes)] : []),
      '',
    ]),
    `Abrir no Grama: ${abrir}`,
    '',
    `Parar de receber este resumo: ${parar}`,
  ].join('\n')

  const html = [
    '<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;font-size:14px;color:#1b1b1b">',
    `<p>${escapar(saudacao)}</p>`,
    ...grupos.map(
      (g) =>
        `<p style="margin:16px 0 4px;font-weight:600">${escapar(g.titulo)}</p>` +
        `<ul style="margin:0;padding-left:20px">${g.linhas.map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>` +
        (g.restantes > 0
          ? `<p style="margin:4px 0 0">${escapar(maisNoGrama(g.restantes))}</p>`
          : ''),
    ),
    `<p style="margin-top:16px"><a href="${escapar(abrir)}">Abrir no Grama</a></p>`,
    `<p style="margin-top:24px;font-size:12px"><a href="${escapar(parar)}">Parar de receber este resumo</a></p>`,
    '</body></html>',
  ].join('')

  const assunto =
    itens.length > 0 ? `Grama: prazos de ${dia}` : `Grama: mudanças de norma de ${dia}`
  return { assunto, texto, html }
}

/** E-mail na hora da revogação: a norma, onde afeta, o link e o descadastro. */
export function montarEmailDeRevogacao(
  revogacao: RevogacaoParaAvisar,
  links: LinksDoResumo,
): EmailDoResumoDiario {
  const nome = primeiroNome(revogacao.membroNome)
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.'
  const abrir = `${links.app}/`
  const parar = `${links.app}/avisos/parar#${links.tokenDeDescadastro}`
  const frase = `A norma ${revogacao.normaTitulo} foi revogada e afeta licença ativa:`
  const texto = [
    saudacao,
    '',
    frase,
    ...revogacao.afetados.map((a) => `- ${a}`),
    '',
    `Abrir no Grama: ${abrir}`,
    '',
    `Parar de receber estes avisos: ${parar}`,
  ].join('\n')
  const html = [
    '<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;font-size:14px;color:#1b1b1b">',
    `<p>${escapar(saudacao)}</p>`,
    `<p>${escapar(frase)}</p>`,
    `<ul style="margin:0;padding-left:20px">${revogacao.afetados.map((a) => `<li>${escapar(a)}</li>`).join('')}</ul>`,
    `<p style="margin-top:16px"><a href="${escapar(abrir)}">Abrir no Grama</a></p>`,
    `<p style="margin-top:24px;font-size:12px"><a href="${escapar(parar)}">Parar de receber estes avisos</a></p>`,
    '</body></html>',
  ].join('')
  return { assunto: `Grama: norma revogada (${revogacao.normaTitulo})`, texto, html }
}

const esperarDeVerdade = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))

export function criarTratadorDosAvisos(deps: DependenciasDosAvisos) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))
  const esperar = deps.esperar ?? esperarDeVerdade

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const esperado = deps.env('CRON_TOKEN') ?? ''
    const recebido = pedido.headers.get('x-cron-token') ?? ''
    if (!esperado || !iguaisEmTempoConstante(recebido, esperado)) {
      return responder({ erro: 'sem_permissao' }, 401)
    }

    const chave = deps.env('RESEND_API_KEY')
    const remetente = deps.env('AVISO_REMETENTE')
    const assinatura = deps.env('AVISO_ASSINATURA')
    const urlDoProjeto = (deps.env('SUPABASE_URL') ?? '').replace(/\/+$/, '')
    if (!chave || !remetente || !assinatura || !urlDoProjeto) {
      registrar(JSON.stringify({ etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }
    const app = (deps.env('LINK_DO_BETA') ?? LINK_PADRAO_DO_BETA).replace(/\/+$/, '')

    let pendentes: PendenteDoDia[]
    try {
      pendentes = await deps.pendentes()
    } catch {
      registrar(JSON.stringify({ etapa: 'pendentes', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }

    // O limite conta só os envios tentados: quem não tem item (vazio) ou já está reservado por
    // outra execução não ocupa vaga, senão 60 pessoas sem prazo travariam as seguintes da fila.
    let processados = 0
    let tentados = 0
    let enviados = 0
    let vazios = 0
    let emAndamento = 0
    let falhas = 0
    let jaEnviou = false

    for (const pendente of pendentes) {
      if (tentados >= MAXIMO_POR_CHAMADA) break
      processados++
      const { consultoriaId, membroId, dia } = pendente
      let etapa = 'itens'
      try {
        const itens = await deps.itens(consultoriaId, membroId, dia)
        etapa = 'normas'
        const normas = deps.normas ? await deps.normas(consultoriaId, membroId, dia) : []
        if (itens.length === 0 && normas.length === 0) {
          vazios++
          continue
        }
        etapa = 'reserva'
        const reserva = await deps.reservar(consultoriaId, membroId, dia)
        if (!reserva) {
          emAndamento++
          continue
        }
        tentados++
        etapa = 'envio'
        const token = await assinarLinkDeDescadastro(assinatura, consultoriaId, membroId)
        const email = montarEmailDoResumoDiario(
          pendente,
          itens,
          { app, tokenDeDescadastro: token },
          normas,
        )
        if (jaEnviou) await esperar(INTERVALO_ENTRE_ENVIOS_MS)
        jaEnviou = true
        const resultado = await enviarPeloResend(deps.fetch, chave, {
          de: remetente,
          para: [pendente.email],
          assunto: email.assunto,
          texto: email.texto,
          html: email.html,
          cabecalhos: {
            'List-Unsubscribe': `<${urlDoProjeto}/functions/v1/preferencias-por-link/${token}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          chaveDeIdempotencia: `resumo-diario/${membroId}/${dia}`,
        })
        if (resultado.ok) {
          // O e-mail saiu: daqui em diante, nenhuma falha gera outro envio (a reserva fica).
          etapa = 'registro'
          await deps.registrarResultado(reserva, 'enviado', resultado.id)
          enviados++
          continue
        }
        falhas++
        registrar(
          JSON.stringify({
            membroId,
            etapa: 'envio',
            motivo: 'falha_no_envio',
            status: resultado.status,
          }),
        )
        // Sem resposta (status 0) o e-mail pode ter saído: a reserva fica e só é retomada depois de
        // 30 minutos. Com recusa do Resend, nada saiu: grava a falha e o próximo ciclo tenta.
        if (resultado.status !== 0) {
          etapa = 'registro_da_falha'
          await deps.registrarResultado(reserva, 'falhou')
        }
      } catch {
        if (etapa !== 'registro_da_falha') falhas++
        registrar(JSON.stringify({ membroId, etapa, motivo: 'erro_interno' }))
      }
    }

    // E-mail na hora das revogações (L7): independe do horário do resumo.
    let revogacoesEnviadas = 0
    if (deps.revogacoes && deps.reservarRevogacao && deps.registrarRevogacao) {
      let revogacoes: RevogacaoParaAvisar[] = []
      try {
        revogacoes = await deps.revogacoes()
      } catch {
        falhas++
        registrar(JSON.stringify({ etapa: 'revogacoes', motivo: 'erro_interno' }))
      }
      for (const revogacao of revogacoes) {
        if (tentados >= MAXIMO_POR_CHAMADA) break
        const { consultoriaId, membroId, mudancaId } = revogacao
        let etapa = 'reserva_da_revogacao'
        try {
          const reserva = await deps.reservarRevogacao(consultoriaId, membroId, mudancaId)
          if (!reserva) {
            emAndamento++
            continue
          }
          tentados++
          etapa = 'envio_da_revogacao'
          const token = await assinarLinkDeDescadastro(assinatura, consultoriaId, membroId)
          const email = montarEmailDeRevogacao(revogacao, { app, tokenDeDescadastro: token })
          if (jaEnviou) await esperar(INTERVALO_ENTRE_ENVIOS_MS)
          jaEnviou = true
          const resultado = await enviarPeloResend(deps.fetch, chave, {
            de: remetente,
            para: [revogacao.email],
            assunto: email.assunto,
            texto: email.texto,
            html: email.html,
            cabecalhos: {
              'List-Unsubscribe': `<${urlDoProjeto}/functions/v1/preferencias-por-link/${token}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            chaveDeIdempotencia: `revogacao/${membroId}/${mudancaId}`,
          })
          if (resultado.ok) {
            etapa = 'registro_da_revogacao'
            await deps.registrarRevogacao(reserva, 'enviado', resultado.id)
            revogacoesEnviadas++
            continue
          }
          falhas++
          registrar(
            JSON.stringify({
              membroId,
              mudancaId,
              etapa: 'envio_da_revogacao',
              motivo: 'falha_no_envio',
              status: resultado.status,
            }),
          )
          if (resultado.status !== 0) {
            etapa = 'registro_da_falha'
            await deps.registrarRevogacao(reserva, 'falhou')
          }
        } catch {
          if (etapa !== 'registro_da_falha') falhas++
          registrar(JSON.stringify({ membroId, mudancaId, etapa, motivo: 'erro_interno' }))
        }
      }
    }

    return responder(
      {
        pendentes: pendentes.length,
        enviados,
        vazios,
        em_andamento: emAndamento,
        falhas,
        adiados: pendentes.length - processados,
        ...(deps.revogacoes ? { revogacoes_enviadas: revogacoesEnviadas } : {}),
      },
      falhas > 0 ? 502 : 200,
    )
  }
}
