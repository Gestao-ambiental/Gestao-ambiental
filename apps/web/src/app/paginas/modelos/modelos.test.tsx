// Modelos de documento (ADR-0036, fatia 1): lista na área de configuração, editor com campos,
// salvar pela RPC, erro do banco na tela e Equipe sem acesso.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

const modelo = {
  id: 'md1',
  nome: 'Relatório semestral',
  atualizado_em: '2026-11-18T13:00:00Z',
  autor: { nome: 'Eduardo Karnopp' },
  conteudo: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Empreendimento: ' },
          { type: 'campo', attrs: { chave: 'empreendimento.nome' } },
        ],
      },
    ],
  },
  row_version: 2,
  arquivado_em: null,
}

function cenario(papel: 'gestao' | 'equipe' = 'gestao', extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      ...extra.rpc,
    },
    tabelas: { modelo_documento: [modelo], ...extra.tabelas },
  }
}

beforeEach(() => {
  falso.reiniciar(cenario())
})

describe('lista de modelos', () => {
  it('Gestão vê os modelos com link para o editor', async () => {
    renderizarApp('/configuracoes/modelos')
    const link = await screen.findByRole('link', { name: 'Relatório semestral' })
    expect(link).toHaveAttribute('href', '/configuracoes/modelos/md1')
    expect(screen.getByRole('button', { name: 'Novo modelo' })).toBeInTheDocument()
  })

  it('sem modelos mostra o estado vazio com a ação de criar', async () => {
    falso.reiniciar(cenario('gestao', { tabelas: { modelo_documento: [] } }))
    renderizarApp('/configuracoes/modelos')
    expect(await screen.findByRole('heading', { name: 'Nenhum modelo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo modelo' })).toBeInTheDocument()
  })

  it('a Equipe não acessa a configuração de modelos', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/configuracoes/modelos')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
  })

  it('o menu da conta leva aos modelos', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/modelos')
    await screen.findByRole('link', { name: 'Relatório semestral' })
    await usuario.click(screen.getByRole('button', { name: 'Conta de Eduardo Karnopp' }))
    expect(
      await screen.findByRole('menuitem', { name: 'Modelos de documento' }),
    ).toBeInTheDocument()
  })
})

describe('editor do modelo', () => {
  it('abre o modelo com o campo como marcador', async () => {
    renderizarApp('/configuracoes/modelos/md1')
    expect(await screen.findByRole('heading', { name: 'Relatório semestral' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Relatório semestral')
    expect(await screen.findByText('Nome do empreendimento')).toHaveClass('campo-do-modelo')
  })

  it('cria um modelo novo com campo e salva pela RPC', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario('gestao', { rpc: { salvar_modelo_documento: { data: 1 } } }))
    renderizarApp('/configuracoes/modelos/novo')
    await usuario.type(await screen.findByLabelText('Nome'), 'Ofício de protocolo')
    await usuario.click(screen.getByRole('button', { name: /Inserir campo/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Número da licença' }))
    expect(screen.getByText('Não salvo')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'salvar_modelo_documento',
        expect.objectContaining({
          p_consultoria_id: 'c-Filtroville',
          p_nome: 'Ofício de protocolo',
        }),
      )
    })
    const chamada = falso.cliente.rpc.mock.calls.find((c) => c[0] === 'salvar_modelo_documento')
    const [, args] = chamada as [string, Record<string, unknown>]
    expect(args).not.toHaveProperty('p_row_version')
    expect(JSON.stringify(args.p_conteudo)).toContain('"chave":"licenca.numero"')
  })

  it('mostra o erro do banco ao salvar com nome repetido', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        rpc: { salvar_modelo_documento: { error: { message: 'modelo_com_mesmo_nome' } } },
      }),
    )
    renderizarApp('/configuracoes/modelos/md1')
    await screen.findByText('Nome do empreendimento')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um modelo com esse nome. Escolha outro nome.',
    )
  })

  it('não salva sem nome', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/modelos/novo')
    await usuario.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe o nome')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('salvar_modelo_documento', expect.anything())
  })
})
