// Tempo ativo por tarefa (ADR-0027). Conta segundos só com a aba visível e alguma tecla, clique ou
// rolagem nos últimos 2 minutos (contaComoTempoAtivo, no domínio). Uma tarefa pode atravessar
// telas (cadastro de licença com IA, orçamento): o cronômetro vive aqui, por chave, e só conta
// enquanto alguma tela da tarefa está montada (usePrenderTarefa). Ao terminar, grava um evento
// (registrarTarefa); falha nunca aparece para a pessoa. Em modo suporte nada começa a contar, e
// a central não usa estes hooks. Recarregar a página perde a tarefa em andamento (protótipo).

import {
  BLOCO_DE_ACOMPANHAMENTO_SEGUNDOS,
  contaComoTempoAtivo,
  ehRotaDeAcompanhamento,
  type TipoDeTarefa,
} from '@gestao-ambiental/domain'
import { useContext, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router'

import { registrarTarefa } from '@/lib/api/indicadores-de-valor'

import { ContextoConsultoria } from './contexto-consultoria'

const segundos = new Map<string, number>()
const presos = new Map<string, number>()
const aoContar = new Set<() => void>()
let ultimaInteracao: number | null = null
let relogio: number | null = null
let ouvindo = false

const EVENTOS_DE_INTERACAO = ['keydown', 'pointerdown', 'wheel', 'scroll', 'touchstart'] as const

function marcarInteracao() {
  ultimaInteracao = Date.now()
}

function ouvirInteracoes() {
  if (ouvindo) return
  ouvindo = true
  for (const evento of EVENTOS_DE_INTERACAO) {
    window.addEventListener(evento, marcarInteracao, { capture: true, passive: true })
  }
}

function tique() {
  if (!contaComoTempoAtivo(Date.now(), ultimaInteracao, document.visibilityState === 'visible')) {
    return
  }
  for (const [chave, telas] of presos) {
    const atual = segundos.get(chave)
    if (telas > 0 && atual !== undefined) segundos.set(chave, atual + 1)
  }
  for (const avisar of aoContar) avisar()
}

function ajustarRelogio() {
  const algum = [...presos.values()].some((telas) => telas > 0)
  if (algum && relogio === null) relogio = window.setInterval(tique, 1000)
  if (!algum && relogio !== null) {
    window.clearInterval(relogio)
    relogio = null
  }
}

/** Chave do tempo ativo de um orçamento: de Novo orçamento até a proposta pronta ou enviada. */
export function chaveDoOrcamento(id: string): string {
  return `orcamento:${id}`
}

/** Começa (ou continua) a tarefa da chave. Começar é uma interação. */
export function iniciarTarefa(chave: string): void {
  ouvirInteracoes()
  marcarInteracao()
  if (!segundos.has(chave)) segundos.set(chave, 0)
}

export function descartarTarefa(chave: string): void {
  segundos.delete(chave)
}

/** Muda a chave (ex.: o orçamento novo ganha id ao ser criado). */
export function transferirTarefa(de: string, para: string): void {
  const contados = segundos.get(de)
  if (contados === undefined) return
  segundos.delete(de)
  segundos.set(para, (segundos.get(para) ?? 0) + contados)
}

/** Termina a tarefa e devolve os segundos ativos (nulo se não havia tarefa). */
export function terminarTarefa(chave: string): number | null {
  const contados = segundos.get(chave)
  segundos.delete(chave)
  return contados ?? null
}

/** Termina e grava (só com quantidade e algum segundo). */
export function concluirTarefa(
  chave: string,
  consultoriaId: string,
  tipo: TipoDeTarefa,
  quantidade: number,
): void {
  const contados = terminarTarefa(chave)
  if (contados && quantidade > 0) void registrarTarefa(consultoriaId, tipo, quantidade, contados)
}

/** Só para os testes: zera o estado do módulo. */
export function reiniciarTempoAtivo(): void {
  segundos.clear()
  presos.clear()
  aoContar.clear()
  ultimaInteracao = null
  if (relogio !== null) window.clearInterval(relogio)
  relogio = null
}

/** Enquanto a tela está montada, a tarefa da chave (se existir) conta tempo ativo. */
export function usePrenderTarefa(chave: string | null): void {
  useEffect(() => {
    if (!chave) return
    ouvirInteracoes()
    presos.set(chave, (presos.get(chave) ?? 0) + 1)
    ajustarRelogio()
    return () => {
      const telas = (presos.get(chave) ?? 1) - 1
      if (telas > 0) presos.set(chave, telas)
      else presos.delete(chave)
      ajustarRelogio()
    }
  }, [chave])
}

/**
 * Funções das tarefas presas à consultoria atual. Em modo suporte (ou fora de uma consultoria),
 * nada começa a contar: concluir não encontra tarefa e não grava nada.
 */
export function useTarefas() {
  const estado = useContext(ContextoConsultoria)
  const consultoriaId = estado && !estado.suporte ? estado.atual.consultoriaId : null
  return useMemo(
    () => ({
      iniciar: (chave: string) => {
        if (consultoriaId) iniciarTarefa(chave)
      },
      descartar: descartarTarefa,
      transferir: transferirTarefa,
      concluir: (chave: string, tipo: TipoDeTarefa, quantidade: number) => {
        if (consultoriaId) concluirTarefa(chave, consultoriaId, tipo, quantidade)
        else descartarTarefa(chave)
      },
    }),
    [consultoriaId],
  )
}

/**
 * Tempo na área de licenças e prazos (visão da equipe, calendário, acompanhamentos,
 * empreendimentos, ocorrência e renovação). Grava ao sair da área, ao esconder a aba e a cada 30
 * minutos ativos. Só com vínculo de verdade (o modo suporte não chama este hook).
 */
export function useTempoDeAcompanhamento(consultoriaId: string | null): void {
  const { pathname } = useLocation()
  const naArea = consultoriaId !== null && ehRotaDeAcompanhamento(pathname)

  useEffect(() => {
    if (!naArea || !consultoriaId) return
    const chave = `acompanhamento:${consultoriaId}`
    if (!segundos.has(chave)) segundos.set(chave, 0)

    const gravar = () => {
      const contados = terminarTarefa(chave)
      segundos.set(chave, 0)
      if (contados) void registrarTarefa(consultoriaId, 'acompanhamento', 1, contados)
    }
    const conferirBloco = () => {
      if ((segundos.get(chave) ?? 0) >= BLOCO_DE_ACOMPANHAMENTO_SEGUNDOS) gravar()
    }
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') gravar()
    }

    ouvirInteracoes()
    presos.set(chave, (presos.get(chave) ?? 0) + 1)
    ajustarRelogio()
    aoContar.add(conferirBloco)
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      aoContar.delete(conferirBloco)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      const telas = (presos.get(chave) ?? 1) - 1
      if (telas > 0) presos.set(chave, telas)
      else presos.delete(chave)
      ajustarRelogio()
      gravar()
      segundos.delete(chave)
    }
  }, [naArea, consultoriaId])
}
