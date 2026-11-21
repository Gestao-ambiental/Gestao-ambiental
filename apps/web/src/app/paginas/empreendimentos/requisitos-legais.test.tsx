import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function requisito(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    norma_id: `n-${id}`,
    norma_titulo: `Norma ${id}`,
    norma_situacao_na_fonte: 'vigente',
    dispositivo: null,
    descricao: null,
    origem: 'sugerido',
    motivo: { criterio: 'atividade', valor: '47.30.00' },
    aplicavel: true,
    justificativa: null,
    responsavel_id: null,
    row_version: 1,
    avaliacao_resultado: null,
    avaliada_em: null,
    avaliada_por_nome: null,
    ultima_mudanca_publicada_em: null,
    acao_id: null,
    acao_descricao: null,
    acao_prazo: null,
    acao_responsavel_id: null,
    acao_responsavel_nome: null,
    acao_row_version: null,
    evidencias: 0,
    menor_validade: null,
    total: 4,
    ...extra,
  }
}

const LISTA = [
  requisito('sugerido', { aplicavel: null }),
  requisito('conforme', {
    avaliacao_resultado: 'conforme',
    avaliada_em: '2026-11-10',
    avaliada_por_nome: 'Ana Ribeiro',
  }),
  requisito('rever', {
    avaliacao_resultado: 'conforme',
    avaliada_em: '2026-11-10',
    ultima_mudanca_publicada_em: '2026-11-15T13:00:00Z',
  }),
  requisito('atrasada', {
    avaliacao_resultado: 'nao_conforme',
    avaliada_em: '2026-11-01',
    acao_id: 'a1',
    acao_descricao: 'Trocar o filtro',
    acao_prazo: '2026-11-02',
    acao_row_version: 1,
  }),
]

function cenario(
  papel: 'gestao' | 'equipe',
  opcoes: { liberado?: boolean; lista?: unknown[]; erro?: boolean } = {},
): Cenario {
  const { liberado = true, lista = LISTA, erro = false } = opcoes
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      recurso_liberado: (args) => ({ data: args.p_recurso === 'legislacao' ? liberado : false }),
      listar_requisitos_do_empreendimento: erro
        ? { error: { code: 'XX000', message: 'falhou' } }
        : { data: lista },
      sugerir_requisitos: { data: 2 },
      decidir_aplicabilidade: { data: 2 },
      avaliar_requisito: { data: { row_version: 2 } },
    },
    tabelas: {
      empreendimento: [{ id: 'e1', nome: 'Posto Litoral', cnpj: null, cliente: null }],
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      membro: [],
    },
  }
}

describe('requisitos legais no empreendimento (LEG-07 e LEG-08)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario('gestao'))
  })

  it('mostra cada requisito com a situação calculada, escrita e não só na cor', async () => {
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Requisitos legais' })
    expect(await within(secao).findByText('Norma sugerido')).toBeInTheDocument()
    expect(within(secao).getByText('Sugerido')).toBeInTheDocument()
    expect(within(secao).getByText('Conforme')).toBeInTheDocument()
    expect(within(secao).getByText('Rever')).toBeInTheDocument()
    expect(within(secao).getByText('Ação atrasada')).toBeInTheDocument()
    expect(within(secao).getByText(/Ação: Trocar o filtro/)).toBeInTheDocument()
    expect(within(secao).getAllByText(/Atividade 47\.30\.00/).length).toBeGreaterThan(0)
    expect(within(secao).getByRole('link', { name: 'Norma conforme' })).toHaveAttribute(
      'href',
      '/normas/n-conforme',
    )
  })

  it('sugerir pela triagem chama a RPC e diz quantos vieram', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Requisitos legais' })
    await usuario.click(within(secao).getByRole('button', { name: 'Sugerir pela triagem' }))
    expect(await within(secao).findByRole('status')).toHaveTextContent('2 requisitos sugeridos')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('sugerir_requisitos', {
      p_consultoria_id: expect.any(String) as unknown,
      p_empreendimento_id: 'e1',
    })
  })

  it('a Gestão marca "não se aplica" só com justificativa', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Requisitos legais' })
    await usuario.click(
      await within(secao).findByRole('button', { name: 'Ações de Norma conforme' }),
    )
    await usuario.click(await screen.findByRole('menuitem', { name: 'Não se aplica' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Não se aplica' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Escreva por que não se aplica')
    await usuario.type(within(dialogo).getByLabelText('Justificativa *'), 'Não faz essa etapa')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('decidir_aplicabilidade', {
        p_consultoria_id: expect.any(String) as unknown,
        p_requisito_id: 'conforme',
        p_aplicavel: false,
        p_justificativa: 'Não faz essa etapa',
        p_row_version: 1,
      })
    })
  })

  it('a Equipe não vê "não se aplica" e avalia como conforme', async () => {
    falso.reiniciar(cenario('equipe'))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Requisitos legais' })
    await usuario.click(
      await within(secao).findByRole('button', { name: 'Ações de Norma sugerido' }),
    )
    expect(screen.queryByRole('menuitem', { name: 'Não se aplica' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('menuitem', { name: 'Avaliar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Avaliar requisito' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar avaliação' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'avaliar_requisito',
        expect.objectContaining({
          p_requisito_id: 'sugerido',
          p_resultado: 'conforme',
          p_acao: null,
        }),
      )
    })
  })

  it('erro da lista mostra o estado de erro', async () => {
    falso.reiniciar(cenario('gestao', { erro: true }))
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Requisitos legais' })
    expect(
      await within(secao).findByText('Não foi possível carregar os requisitos legais.'),
    ).toBeInTheDocument()
  })

  it('sem requisitos mostra o vazio com as ações', async () => {
    falso.reiniciar(cenario('gestao', { lista: [] }))
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Requisitos legais' })
    expect(await within(secao).findByText('Nenhum requisito legal.')).toBeInTheDocument()
    expect(within(secao).getByRole('button', { name: 'Adicionar norma' })).toBeInTheDocument()
  })

  it('fora do plano a seção não aparece', async () => {
    falso.reiniciar(cenario('gestao', { liberado: false }))
    renderizarApp('/empreendimentos/e1')

    expect(await screen.findByRole('heading', { name: 'Posto Litoral' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Requisitos legais' })).not.toBeInTheDocument()
  })
})
