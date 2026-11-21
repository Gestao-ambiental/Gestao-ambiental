// Coleta de normas (pacotes L1 e L2, ADR-0050, LEG-02 e LEG-03). A Edge Function coletar-normas só liga
// as dependências reais (Supabase com a service role, Storage, fetch e unpdf); a regra fica aqui e
// nos adaptadores de _shared/fontes/, testada com `deno test` e dependências falsas.
//
// Chamada pelo pg_cron + pg_net (private.ligar_coleta_de_normas), uma vez por dia útil por fonte,
// com POST {fonte, janela?, forcar?, limite?} e o header x-cron-token conferido em tempo constante
// contra o segredo COLETA_NORMAS_TOKEN (sem o segredo: 503). Passos:
// 1. iniciar_coleta(fonte, janela): a janela padrão é o dia de hoje em Brasília. null = a coleta da
//    janela já foi feita ou está em andamento (200 {ignorada: true}).
// 2. O adaptador da fonte busca, compara com versoes_conhecidas e grava as versões novas (no
//    máximo `limite` arquivos baixados por execução, padrão 15; o resto fica para a próxima). Os
//    diários (DOE-SC, DOEM de Joinville) leem as edições do dia da janela, que vai no contexto.
// 3. concluir_coleta com os itens novos, ou com o código curto do erro (falhou): o código vai para
//    fonte_legal.ultimo_erro, que é o alerta de fonte fora do ar ou de formato mudado.
// Nunca vão para o log: o token, textos de norma nem dados pessoais. Só fonte, ids e códigos.

import { iguaisEmTempoConstante } from './resumo-do-mes.ts'
import {
  type BancoDaColeta,
  buscarComEducacao,
  type Coletor,
  type ContextoDaColeta,
  codigoDoErro,
  dataEmSaoPaulo,
  ErroDaColeta,
} from './fontes/comum.ts'
import { coletarLeisDaAlesc, FONTE_ALESC } from './fontes/alesc.ts'
import { coletarConsema, FONTE_CONSEMA } from './fontes/consema.ts'
import { coletarDoeSc, FONTE_DOE_SC } from './fontes/doe-sc.ts'
import { coletarInsDoIma, FONTE_IMA_IN } from './fontes/ima-in.ts'
import { coletarPortariasDoIma, FONTE_IMA_PORTARIA } from './fontes/ima-portaria.ts'
import { coletarDoemDeJoinville, FONTE_JOINVILLE_DOEM } from './fontes/joinville-doem.ts'
import { coletarDouPeloInlabs, FONTE_INLABS } from './fontes/inlabs.ts'
import { coletarLeisDoPlanalto, FONTE_PLANALTO } from './fontes/planalto.ts'

export { buscarComEducacao, ErroDaColeta }

export const LIMITE_PADRAO = 15
export const LIMITE_MAXIMO = 50

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const COLETORES: Readonly<Record<string, Coletor>> = {
  [FONTE_IMA_IN]: coletarInsDoIma,
  [FONTE_IMA_PORTARIA]: coletarPortariasDoIma,
  [FONTE_CONSEMA]: coletarConsema,
  [FONTE_DOE_SC]: coletarDoeSc,
  [FONTE_ALESC]: coletarLeisDaAlesc,
  [FONTE_JOINVILLE_DOEM]: coletarDoemDeJoinville,
  [FONTE_INLABS]: coletarDouPeloInlabs,
  [FONTE_PLANALTO]: coletarLeisDoPlanalto,
}

export interface DependenciasDaColeta {
  env: (nome: string) => string | undefined
  fetch: typeof fetch
  banco: BancoDaColeta
  /** Texto do PDF (unpdf). Pode lançar: a versão fica com texto nulo. */
  lerPdf: (bytes: Uint8Array) => Promise<string>
  agora?: () => Date
  /** Espera do acesso educado (no teste, falsa). */
  esperar?: (ms: number) => Promise<void>
  novoUuid?: () => string
  coletores?: Readonly<Record<string, Coletor>>
  /** Log da função; recebe só fonte, ids e códigos. */
  registrar?: (linha: string) => void
}

export function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const FONTE = /^[a-z][a-z0-9_]{1,39}$/
const JANELA = /^\d{4}-\d{2}-\d{2}(?:T\d{2})?$/

interface PedidoDeColeta {
  fonte: string
  janela: string | null
  forcar: boolean
  limite: number
}

function lerPedido(corpo: unknown): PedidoDeColeta | null {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) return null
  const { fonte, janela, forcar, limite } = corpo as Record<string, unknown>
  if (typeof fonte !== 'string' || !FONTE.test(fonte)) return null
  if (
    janela !== undefined &&
    janela !== null &&
    (typeof janela !== 'string' || !JANELA.test(janela))
  ) {
    return null
  }
  if (forcar !== undefined && typeof forcar !== 'boolean') return null
  if (
    limite !== undefined &&
    (typeof limite !== 'number' ||
      !Number.isInteger(limite) ||
      limite < 1 ||
      limite > LIMITE_MAXIMO)
  ) {
    return null
  }
  return {
    fonte,
    janela: typeof janela === 'string' ? janela : null,
    forcar: forcar === true,
    limite: typeof limite === 'number' ? limite : LIMITE_PADRAO,
  }
}

const RECUSAS_DO_INICIO: Record<string, number> = {
  fonte_inexistente: 404,
  fonte_desligada: 409,
}

export function criarTratadorDaColeta(deps: DependenciasDaColeta) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))
  const coletores = deps.coletores ?? COLETORES
  const agora = deps.agora ?? (() => new Date())
  const novoUuid = deps.novoUuid ?? (() => crypto.randomUUID())

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const esperado = deps.env('COLETA_NORMAS_TOKEN') ?? ''
    if (!esperado) {
      registrar(JSON.stringify({ etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }
    const recebido = pedido.headers.get('x-cron-token') ?? ''
    if (!iguaisEmTempoConstante(recebido, esperado)) {
      return responder({ erro: 'sem_permissao' }, 401)
    }

    let corpo: unknown = null
    try {
      corpo = await pedido.json()
    } catch {
      // corpo vazio ou inválido: cai em pedido_invalido
    }
    const dados = lerPedido(corpo)
    if (dados === null) return responder({ erro: 'pedido_invalido' }, 400)
    const coletor = coletores[dados.fonte]
    if (coletor === undefined) return responder({ erro: 'fonte_sem_coletor' }, 400)

    const instante = agora()
    const janela = dados.janela ?? dataEmSaoPaulo(instante)
    let coletaId: string | null
    try {
      coletaId = await deps.banco.iniciarColeta(dados.fonte, janela, dados.forcar)
    } catch (erro) {
      const codigo = codigoDoErro(erro)
      const status = RECUSAS_DO_INICIO[codigo]
      if (status !== undefined) return responder({ erro: codigo }, status)
      registrar(JSON.stringify({ fonte: dados.fonte, etapa: 'iniciar', motivo: codigo }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (coletaId === null) return responder({ ignorada: true, fonte: dados.fonte, janela })

    const ctx: ContextoDaColeta = {
      coletaId,
      fonte: dados.fonte,
      janela,
      banco: deps.banco,
      buscar: buscarComEducacao(deps.fetch, { esperar: deps.esperar }),
      lerPdf: deps.lerPdf,
      limite: dados.limite,
      segredo: deps.env,
      agora: instante,
      novoUuid,
      registrar,
      contagem: { itensNovos: 0, baixados: 0, pendentes: 0, falhas: [] },
    }

    let erro: string | null = null
    try {
      await coletor(ctx)
    } catch (falha) {
      erro = codigoDoErro(falha)
      registrar(JSON.stringify({ fonte: dados.fonte, coletaId, etapa: 'coleta', motivo: erro }))
    }
    // Falha de um item (um PDF fora do ar) também marca a coleta como falhou, para o alerta da
    // fonte; o que foi gravado fica, e a próxima execução retoma o resto.
    const { itensNovos, baixados, pendentes, falhas } = ctx.contagem
    if (erro === null && falhas.length > 0) {
      erro =
        falhas.length === 1
          ? (falhas[0] as string)
          : `${falhas[0] as string} (+${String(falhas.length - 1)})`
    }

    try {
      await deps.banco.concluirColeta(coletaId, itensNovos, erro)
    } catch (falha) {
      registrar(
        JSON.stringify({
          fonte: dados.fonte,
          coletaId,
          etapa: 'concluir',
          motivo: codigoDoErro(falha),
        }),
      )
      return responder({ erro: 'erro_interno', coleta_id: coletaId }, 500)
    }

    const resumo = { coleta_id: coletaId, itens_novos: itensNovos, baixados, pendentes }
    if (erro !== null) return responder({ ...resumo, erro }, 502)
    return responder(resumo)
  }
}
