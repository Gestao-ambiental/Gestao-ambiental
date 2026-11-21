import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function linha(empreendimento: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id: `${empreendimento}-${String(Math.random())}`,
    empreendimento_id: empreendimento,
    empreendimento_nome: nome,
    norma_titulo: 'Norma',
    aplicavel: true,
    avaliacao_resultado: 'conforme',
    avaliada_em: '2026-11-10',
    ultima_mudanca_publicada_em: null,
    acao_prazo: null,
    total: 3,
    ...extra,
  }
}

function cenario(opcoes: { liberado?: boolean; erro?: boolean; linhas?: unknown[] } = {}): Cenario {
  const { liberado = true, erro = false } = opcoes
  const linhas = opcoes.linhas ?? [
    linha('e1', 'Posto Litoral', { acao_prazo: '2020-01-01' }),
    linha('e2', 'Olaria Sul', { avaliacao_resultado: 'nao_conforme' }),
    linha('e3', 'Padaria em Dia'),
  ]
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      recurso_liberado: (args) => ({ data: args.p_recurso === 'legislacao' ? liberado : false }),
      listar_requisitos_da_consultoria: erro
        ? { error: { code: 'XX000', message: 'falhou' } }
        : { data: linhas },
    },
  }
}

describe('quadro Conformidade no Painel (LEG-10)', () => {
  it('lista quem tem pendência, com o que pede atenção escrito, e leva aos requisitos', async () => {
    falso.reiniciar(cenario())
    renderizarApp('/painel')

    const quadro = await screen.findByRole('region', { name: 'Conformidade' })
    const lista = await within(quadro).findByRole('list', {
      name: 'Empreendimentos com pendência de requisito legal',
    })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining('1 ação atrasada'),
      expect.stringContaining('1 não conforme'),
    ])
    expect(within(lista).getByRole('link', { name: 'Posto Litoral' })).toHaveAttribute(
      'href',
      '/empreendimentos/e1#requisitos-legais',
    )
    expect(within(quadro).queryByText('Padaria em Dia')).not.toBeInTheDocument()
  })

  it('sem pendência diz isso numa linha', async () => {
    falso.reiniciar(cenario({ linhas: [linha('e3', 'Padaria em Dia')] }))
    renderizarApp('/painel')

    const quadro = await screen.findByRole('region', { name: 'Conformidade' })
    expect(
      await within(quadro).findByText('Nenhuma pendência de requisito legal.'),
    ).toBeInTheDocument()
  })

  it('erro mostra o estado de erro e fora do plano o quadro some', async () => {
    falso.reiniciar(cenario({ erro: true }))
    const { unmount } = renderizarApp('/painel')
    expect(await screen.findByText('Não foi possível carregar a conformidade.')).toBeInTheDocument()
    unmount()

    falso.reiniciar(cenario({ liberado: false }))
    renderizarApp('/painel')
    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conformidade' })).not.toBeInTheDocument()
  })
})
