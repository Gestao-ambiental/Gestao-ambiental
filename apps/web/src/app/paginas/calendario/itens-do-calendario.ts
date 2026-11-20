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
  /** Palavra que antecede o texto ("Meta", "Serviço", "Resíduos"): a marca também é escrita. */
  prefixo: string | null
  texto: string
  /** Linha de apoio na lista e no diálogo do dia (empreendimento, unidade, responsável). */
  apoio: string
  /** Texto completo para o `title`. */
  descricao: string
  semResponsavel: boolean
  link: string | null
}

const ROTULO_DO_TIPO: Record<TipoDoItem, string> = {
  prazo: 'Prazo oficial',
  meta: 'Meta interna',
  limite_protocolo: 'Limite de protocolo',
  validade: 'Validade',
  tarefa: 'Serviço',
  residuo: 'Resíduos',
}

function textoDoEvento(evento: EventoDoCalendario): string {
  if (evento.tipo === 'limite_protocolo') return `Protocolo ${evento.licenca ?? ''}`.trim()
  if (evento.tipo === 'validade') return `Validade ${evento.licenca ?? ''}`.trim()
  return [evento.codigo, evento.titulo].filter(Boolean).join(' ')
}

/**
 * Prazo e meta abrem a ocorrência; o limite de protocolo abre o plano de renovação; a tarefa de
 * serviço abre o orçamento só para a Gestão; a validade não abre nada.
 */
export function itemDoEvento(evento: EventoDoCalendario, ehGestao: boolean): ItemDoDia {
  const quem =
    evento.tipo === 'prazo' || evento.tipo === 'meta' || evento.tipo === 'tarefa'
      ? (evento.responsavelNome ?? 'sem responsável')
      : null
  const texto = textoDoEvento(evento)
  const link =
    evento.tipo === 'limite_protocolo'
      ? `/renovacoes/${evento.id}`
      : evento.tipo === 'tarefa'
        ? ehGestao
          ? `/orcamentos/${evento.orcamentoId ?? ''}`
          : null
        : evento.tipo === 'validade'
          ? null
          : `/ocorrencias/${evento.id}`
  const apoio = [evento.empreendimentoNome, evento.unidadeNome, quem].filter(Boolean).join(' · ')
  return {
    chave: `${evento.tipo}:${evento.id}`,
    tipo: evento.tipo,
    prefixo: evento.tipo === 'meta' ? 'Meta' : evento.tipo === 'tarefa' ? 'Serviço' : null,
    texto,
    apoio,
    descricao: [ROTULO_DO_TIPO[evento.tipo], texto, apoio].filter(Boolean).join(' · '),
    semResponsavel: evento.semResponsavel,
    link,
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
    link: caminhoDosPrazosDeResiduo(prazo.empreendimentoId),
  }
}
