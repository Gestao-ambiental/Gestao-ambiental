// Peças dos testes dos coletores de diários (pacote L2): contexto de uma execução com banco e rede
// falsos, e respostas JSON e HTML em ISO-8859-1 (o SEI de Joinville).

import type { ContextoDaColeta } from '../comum.ts'
import { buscarComEducacao } from '../comum.ts'
import { type BancoFalso, lerPdfFalso, redeFalsa, type Rota } from './falsos.ts'

export const AGORA_DOS_DIARIOS = new Date('2026-11-18T14:00:00Z')

export interface OpcoesDoContexto {
  limite?: number
  janela?: string
  agora?: Date
  fonte?: string
}

export function contextoDeDiario(
  banco: BancoFalso,
  rotas: Record<string, Rota>,
  opcoes: OpcoesDoContexto = {},
) {
  const rede = redeFalsa(rotas)
  const log: string[] = []
  let uuid = 0
  const ctx: ContextoDaColeta = {
    coletaId: 'coleta-teste',
    fonte: opcoes.fonte ?? 'teste',
    janela: opcoes.janela,
    banco,
    buscar: buscarComEducacao(rede.fetch, { esperar: () => Promise.resolve() }),
    lerPdf: lerPdfFalso,
    limite: opcoes.limite ?? 15,
    agora: opcoes.agora ?? AGORA_DOS_DIARIOS,
    novoUuid: () => {
      uuid++
      return `00000000-0000-4000-8000-${String(uuid).padStart(12, '0')}`
    },
    registrar: (linha) => log.push(linha),
    contagem: { itensNovos: 0, baixados: 0, pendentes: 0, falhas: [] },
  }
  return { ctx, rede, log }
}

export function respostaJson(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** Bytes ISO-8859-1 do texto (só caracteres até U+00FF). */
export function latin1(texto: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([...texto], (caractere) => {
    const codigo = caractere.codePointAt(0) ?? 0
    if (codigo > 0xff) throw new Error(`fora do ISO-8859-1: ${caractere}`)
    return codigo
  })
}

/** HTML em ISO-8859-1 sem charset no Content-Type, como o SEI de Joinville. */
export function htmlLatin1(corpo: string): Response {
  return new Response(latin1(corpo), { headers: { 'Content-Type': 'text/html' } })
}
