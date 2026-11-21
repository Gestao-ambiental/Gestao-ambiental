// "Colorir por" no calendário (pedido do Eduardo, 20/11/2026): tipo (o de sempre, pela forma),
// área (a profissão do responsável) ou pessoa (o responsável). A cor nunca vai sozinha: o evento
// leva as iniciais da categoria, o title diz o nome dela e a legenda lista cada uma, com filtro.
// A escolha fica no navegador (não é dado crítico).

import {
  PROFISSOES,
  areaDaProfissao,
  coresDasAreas,
  coresSemRepetir,
  iniciaisDe,
} from '@gestao-ambiental/domain'

import type { MembroAtivo } from '@/lib/api/perfil'

import { ROTULO_DO_TIPO, type ItemDoDia, type TipoDoItem } from './itens-do-calendario'

export type ColorirPor = 'tipo' | 'area' | 'pessoa'

export interface Categoria {
  chave: string
  rotulo: string
  /** Índice da cor (0 a 8) da paleta de categorias; nulo = neutra (ou a forma, no modo tipo). */
  cor: number | null
  /** Duas letras que vão no evento, além da cor (vazio no modo tipo: lá a forma já diz). */
  sigla: string
  /** Só no modo tipo: o tipo, para a legenda desenhar a forma. */
  tipo?: TipoDoItem
}

const CHAVE_ARMAZENADA = 'grama.calendario.colorir-por'

export function lerColorirPor(): ColorirPor {
  try {
    const v = window.localStorage.getItem(CHAVE_ARMAZENADA)
    if (v === 'tipo' || v === 'area' || v === 'pessoa') return v
  } catch {
    // Sem armazenamento: o padrão.
  }
  return 'tipo'
}

export function guardarColorirPor(valor: ColorirPor): void {
  try {
    window.localStorage.setItem(CHAVE_ARMAZENADA, valor)
  } catch {
    // Sem armazenamento: só não lembra.
  }
}

const SEM_RESPONSAVEL: Categoria = {
  chave: 'sem-responsavel',
  rotulo: 'Sem responsável',
  cor: null,
  sigla: '—',
}
const AREA_NAO_INFORMADA: Categoria = {
  chave: 'area:nao-informada',
  rotulo: 'Área não informada',
  cor: null,
  sigla: '?',
}

const ORDEM_DAS_PROFISSOES = PROFISSOES.map((p) => p.codigo as string)

/**
 * Monta a categoria de cada evento no modo escolhido. As cores de pessoa vêm de toda a equipe
 * ativa (não só de quem aparece no mês), para a mesma pessoa não mudar de cor ao trocar de mês.
 */
export function categorizador(
  modo: ColorirPor,
  membros: readonly MembroAtivo[],
): (item: ItemDoDia) => Categoria {
  if (modo === 'tipo') {
    return (item) => ({
      chave: `tipo:${item.tipo}`,
      rotulo: ROTULO_DO_TIPO[item.tipo],
      cor: null,
      sigla: '',
      tipo: item.tipo,
    })
  }
  const porId = new Map(membros.map((m) => [m.id, m]))
  if (modo === 'pessoa') {
    const cores = coresSemRepetir(membros.map((m) => m.id))
    return (item) => {
      const membro = item.responsavelId ? porId.get(item.responsavelId) : undefined
      if (!item.responsavelId || !membro) return SEM_RESPONSAVEL
      return {
        chave: `pessoa:${membro.id}`,
        rotulo: membro.nome,
        cor: cores.get(membro.id) ?? null,
        sigla: iniciaisDe(membro.nome),
      }
    }
  }
  const areas = membros.flatMap((m) => (m.profissao ? [m.profissao as string] : []))
  const cores = coresDasAreas(areas, ORDEM_DAS_PROFISSOES)
  return (item) => {
    const membro = item.responsavelId ? porId.get(item.responsavelId) : undefined
    if (!item.responsavelId || !membro) return SEM_RESPONSAVEL
    if (!membro.profissao) return AREA_NAO_INFORMADA
    const rotulo = areaDaProfissao(membro.profissao)
    return {
      chave: `area:${membro.profissao}`,
      rotulo,
      cor: cores.get(membro.profissao) ?? null,
      sigla: iniciaisDe(rotulo),
    }
  }
}

/** Categorias presentes, com quantos eventos cada uma tem: as coloridas primeiro, as neutras no fim. */
export function legendaDe(
  itens: readonly ItemDoDia[],
  categoriaDe: (item: ItemDoDia) => Categoria,
): { categoria: Categoria; quantidade: number }[] {
  const contagem = new Map<string, { categoria: Categoria; quantidade: number }>()
  for (const item of itens) {
    const categoria = categoriaDe(item)
    const atual = contagem.get(categoria.chave)
    if (atual) atual.quantidade += 1
    else contagem.set(categoria.chave, { categoria, quantidade: 1 })
  }
  return [...contagem.values()].sort((a, b) => {
    const ca = a.categoria.cor ?? Number.MAX_SAFE_INTEGER
    const cb = b.categoria.cor ?? Number.MAX_SAFE_INTEGER
    return ca - cb || a.categoria.rotulo.localeCompare(b.categoria.rotulo, 'pt-BR')
  })
}

/** Variáveis de cor da categoria, para o style (fundo suave e marca forte). */
export function estiloDaCategoria(cor: number | null): { fundo: string; forte: string } {
  const n = cor === null ? 'neutra' : String(cor + 1)
  return { fundo: `var(--categoria-${n}-fundo)`, forte: `var(--categoria-${n}-forte)` }
}
