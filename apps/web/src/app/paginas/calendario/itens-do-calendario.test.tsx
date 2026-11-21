import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { EventoDoCalendario } from '@/lib/api/prazos'

import { EventoDoDia, MarcaDoTipo } from './ItemDoCalendario'
import { ROTULO_DO_TIPO, TIPOS_DO_ITEM, itemDoEvento } from './itens-do-calendario'

const base: EventoDoCalendario = {
  tipo: 'prazo',
  data: '2026-11-25',
  id: 'id1',
  codigo: null,
  titulo: 'Título',
  empreendimentoNome: 'Metalúrgica Açores',
  unidadeNome: 'Matriz',
  licenca: 'LAO 1001/2024',
  responsavelNome: 'Bruno Kist',
  responsavelId: 'm-bruno',
  semResponsavel: false,
}

/** Classes da forma (o span de dentro da marca) e da cor (a marca), por tipo. */
function desenhoDa(tipo: (typeof TIPOS_DO_ITEM)[number]) {
  const { container } = render(<MarcaDoTipo tipo={tipo} />)
  const marca = container.querySelector(`[data-tipo="${tipo}"]`)
  const forma = marca?.querySelector('span')
  return { forma: forma?.className ?? '', marca: marca?.className ?? '' }
}

describe('formas do calendário (DESIGN.md regra 4: palavra + forma)', () => {
  it('cada tipo tem forma própria, sem repetir', () => {
    const formas = TIPOS_DO_ITEM.map((tipo) => desenhoDa(tipo).forma)
    expect(formas.every((f) => f.length > 0)).toBe(true)
    expect(new Set(formas).size).toBe(TIPOS_DO_ITEM.length)
  })

  it('exigência é losango vazado e vencimento é traço', () => {
    expect(desenhoDa('exigencia').forma).toContain('rotate-45')
    expect(desenhoDa('exigencia').forma).toContain('border-current')
    expect(desenhoDa('exigencia').forma).not.toContain('bg-current')
    expect(desenhoDa('tarefa').forma).toContain('bg-current')
    expect(desenhoDa('vencimento').forma).toContain('h-[3px]')
  })

  it('a marca é decorativa: o tipo também vai escrito', () => {
    const { container } = render(<MarcaDoTipo tipo="exigencia" />)
    expect(container.querySelector('[data-tipo="exigencia"]')).toHaveAttribute('aria-hidden')
  })

  it('todo tipo tem rótulo escrito, sem repetir', () => {
    const rotulos = TIPOS_DO_ITEM.map((tipo) => ROTULO_DO_TIPO[tipo])
    expect(new Set(rotulos).size).toBe(TIPOS_DO_ITEM.length)
    expect(ROTULO_DO_TIPO.exigencia).toBe('Exigência')
    expect(ROTULO_DO_TIPO.vencimento).toBe('Vencimento')
  })
})

describe('eventos de exigência e vencimento no calendário', () => {
  it('exigência: prefixo escrito, responsável no apoio e link para a exigência', () => {
    const item = itemDoEvento(
      { ...base, tipo: 'exigencia', id: 'x1', titulo: 'Apresentar laudo complementar' },
      false,
    )
    expect(item).toMatchObject({
      chave: 'exigencia:x1',
      prefixo: 'Exigência',
      texto: 'Apresentar laudo complementar',
      apoio: 'Metalúrgica Açores · Matriz · Bruno Kist',
      link: '/exigencias/x1',
    })
    expect(item.descricao).toBe(
      'Exigência · Apresentar laudo complementar · Metalúrgica Açores · Matriz · Bruno Kist',
    )
  })

  it('exigência sem responsável diz isso no apoio', () => {
    const item = itemDoEvento(
      { ...base, tipo: 'exigencia', responsavelNome: null, semResponsavel: true },
      true,
    )
    expect(item.apoio).toBe('Metalúrgica Açores · Matriz · sem responsável')
    expect(item.semResponsavel).toBe(true)
  })

  it('vencimento: prefixo escrito, sem responsável no apoio e sem link', () => {
    const item = itemDoEvento({ ...base, tipo: 'vencimento', id: 'v1', titulo: 'AVCB' }, true)
    expect(item).toMatchObject({
      prefixo: 'Vencimento',
      texto: 'AVCB',
      apoio: 'Metalúrgica Açores · Matriz',
      link: null,
    })
  })

  it('o evento desenha a palavra do tipo ao lado da forma', () => {
    const item = itemDoEvento({ ...base, tipo: 'exigencia', id: 'x1', titulo: 'Laudo' }, true)
    const { getByText, getByRole, container } = render(
      <MemoryRouter>
        <EventoDoDia item={item} modo="inteiro" />
      </MemoryRouter>,
    )
    expect(getByText('Exigência')).toBeInTheDocument()
    expect(getByRole('link')).toHaveAttribute('href', '/exigencias/x1')
    expect(container.querySelector('[data-tipo="exigencia"]')).not.toBeNull()
  })

  it('os tipos de antes continuam com o mesmo texto e link', () => {
    expect(itemDoEvento({ ...base, tipo: 'prazo', codigo: '4.2' }, true)).toMatchObject({
      prefixo: null,
      texto: '4.2 Título',
      link: '/ocorrencias/id1',
    })
    expect(itemDoEvento({ ...base, tipo: 'meta' }, true)).toMatchObject({
      prefixo: 'Meta',
      link: '/ocorrencias/id1',
    })
    expect(itemDoEvento({ ...base, tipo: 'limite_protocolo' }, true)).toMatchObject({
      texto: 'Protocolo LAO 1001/2024',
      link: '/renovacoes/id1',
      apoio: 'Metalúrgica Açores · Matriz',
    })
    expect(itemDoEvento({ ...base, tipo: 'validade' }, true)).toMatchObject({
      texto: 'Validade LAO 1001/2024',
      link: null,
    })
    expect(itemDoEvento({ ...base, tipo: 'tarefa', orcamentoId: 'orc1' }, true)).toMatchObject({
      prefixo: 'Serviço',
      link: '/orcamentos/orc1',
    })
    expect(itemDoEvento({ ...base, tipo: 'tarefa', orcamentoId: 'orc1' }, false).link).toBeNull()
  })
})

describe('ação de requisito legal no calendário (ADR-0050)', () => {
  it('prefixo escrito, responsável no apoio e sem link (o evento não traz o empreendimento)', () => {
    const item = itemDoEvento(
      { ...base, tipo: 'acao_legal', titulo: 'Trocar o filtro', responsavelNome: 'Ana Ribeiro' },
      true,
    )
    expect(item.prefixo).toBe('Requisito legal')
    expect(item.texto).toBe('Trocar o filtro')
    expect(item.apoio).toContain('Ana Ribeiro')
    expect(item.link).toBeNull()
    expect(ROTULO_DO_TIPO.acao_legal).toBe('Requisito legal')
  })
})
