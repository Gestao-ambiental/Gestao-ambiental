// Apresentação dos eventos do calendário: texto, link e descrição de cada tipo, num formato só.
import { ROTULO_DA_OBRIGACAO_RESIDUO } from '@gestao-ambiental/domain'

import {
  caminhoDosPrazosDeResiduo,
  descricaoDoPrazoDeResiduo,
} from '@/app/paginas/residuos/prazos/prazos-de-residuos'
import type { EventoDoCalendario } from '@/lib/api/prazos'
import type { PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'

/** Tipos que o calendário mostra: os do banco mais o prazo de obrigação de resíduos (ADR-0028). */
export type TipoDoItem = EventoDoCalendario['tipo'] | 'residuo'

/** Um evento do dia, já com texto, link e descrição, do jeito que a tela desenha. */
export interface ItemDoDia {
  chave: string
  tipo: TipoDoItem
  /** Palavra que antecede o texto ("Meta", "Exigência", "Resíduos"): a marca também é escrita. */
  prefixo: string | null
  texto: string
  /** Linha de apoio na lista e no diálogo do dia (empreendimento, unidade, responsável). */
  apoio: string
  /** Texto completo para o `title`. */
  descricao: string
  semResponsavel: boolean
  /** Responsável pelo id, para colorir por pessoa ou área (nulo sem responsável). */
  responsavelId: string | null
  link: string | null
}

/** Todos os tipos que o calendário desenha, na ordem em que a tela os apresenta. */
export const TIPOS_DO_ITEM: readonly TipoDoItem[] = [
  'prazo',
  'meta',
  'limite_protocolo',
  'validade',
  'exigencia',
  'vencimento',
  'tarefa',
  'residuo',
]

export const ROTULO_DO_TIPO: Readonly<Record<TipoDoItem, string>> = {
  prazo: 'Prazo oficial',
  meta: 'Meta interna',
  limite_protocolo: 'Limite de protocolo',
  validade: 'Validade',
  exigencia: 'Exigência',
  vencimento: 'Vencimento',
  tarefa: 'Serviço',
  residuo: 'Resíduos',
}

function textoDoEvento(evento: EventoDoCalendario): string {
  switch (evento.tipo) {
    case 'limite_protocolo':
      return `Protocolo ${evento.licenca ?? ''}`.trim()
    case 'validade':
      return `Validade ${evento.licenca ?? ''}`.trim()
    case 'prazo':
    case 'meta':
    case 'exigencia':
    case 'vencimento':
    case 'tarefa':
      return [evento.codigo, evento.titulo].filter(Boolean).join(' ')
  }
}

/** Palavra antes do texto quando o texto sozinho não diz o tipo (a marca também é escrita). */
function prefixoDoEvento(tipo: EventoDoCalendario['tipo']): string | null {
  switch (tipo) {
    case 'meta':
      return 'Meta'
    case 'tarefa':
      return 'Serviço'
    case 'exigencia':
      return 'Exigência'
    case 'vencimento':
      return 'Vencimento'
    case 'prazo':
    case 'limite_protocolo':
    case 'validade':
      return null
  }
}

/** Tipos cuja linha tem responsável (o apoio diz quem é, ou "sem responsável"). */
function temResponsavel(tipo: EventoDoCalendario['tipo']): boolean {
  switch (tipo) {
    case 'prazo':
    case 'meta':
    case 'exigencia':
    case 'tarefa':
      return true
    case 'limite_protocolo':
    case 'validade':
    case 'vencimento':
      return false
  }
}

/**
 * Prazo e meta abrem a ocorrência; a exigência abre a própria página; o limite de protocolo abre o
 * plano de renovação; a tarefa de serviço abre o orçamento só para a Gestão; validade e
 * vencimento não abrem nada (o evento do calendário não traz o empreendimento).
 */
function linkDoEvento(evento: EventoDoCalendario, ehGestao: boolean): string | null {
  switch (evento.tipo) {
    case 'prazo':
    case 'meta':
      return `/ocorrencias/${evento.id}`
    case 'exigencia':
      return `/exigencias/${evento.id}`
    case 'limite_protocolo':
      return `/renovacoes/${evento.id}`
    case 'tarefa':
      return ehGestao ? `/orcamentos/${evento.orcamentoId ?? ''}` : null
    case 'validade':
    case 'vencimento':
      return null
  }
}

export function itemDoEvento(evento: EventoDoCalendario, ehGestao: boolean): ItemDoDia {
  const quem = temResponsavel(evento.tipo) ? (evento.responsavelNome ?? 'sem responsável') : null
  const texto = textoDoEvento(evento)
  const apoio = [evento.empreendimentoNome, evento.unidadeNome, quem].filter(Boolean).join(' · ')
  return {
    chave: `${evento.tipo}:${evento.id}`,
    tipo: evento.tipo,
    prefixo: prefixoDoEvento(evento.tipo),
    texto,
    apoio,
    descricao: [ROTULO_DO_TIPO[evento.tipo], texto, apoio].filter(Boolean).join(' · '),
    semResponsavel: evento.semResponsavel,
    link: linkDoEvento(evento, ehGestao),
    responsavelId:
      evento.tipo === 'prazo' ||
      evento.tipo === 'meta' ||
      evento.tipo === 'tarefa' ||
      evento.tipo === 'exigencia'
        ? evento.responsavelId
        : null,
  }
}

/** Prazo de obrigação de resíduos: abre a página de obrigações do empreendimento. */
export function itemDoResiduo(prazo: PrazoDeObrigacaoNoCalendario): ItemDoDia {
  return {
    chave: `residuo:${prazo.obrigacaoId}:${prazo.prazo}`,
    tipo: 'residuo',
    prefixo: 'Resíduos',
    texto: `${ROTULO_DA_OBRIGACAO_RESIDUO[prazo.tipo]} · ${prazo.empreendimentoNome}`,
    apoio: prazo.referencia,
    descricao: descricaoDoPrazoDeResiduo(prazo),
    semResponsavel: false,
    responsavelId: null,
    link: caminhoDosPrazosDeResiduo(prazo.empreendimentoId),
  }
}
