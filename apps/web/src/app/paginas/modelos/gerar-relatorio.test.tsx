// Gerar relatório a partir do modelo (ADR-0036, fatia 2): escolhe o modelo, preenche com o cadastro e
// baixa o .docx; campo sem dado é avisado; erro do banco aparece; sem modelo, o diálogo diz isso.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')

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
          { type: 'campo', attrs: { chave: 'empreendimento.nome' } },
          { type: 'text', text: ', licença ' },
          { type: 'campo', attrs: { chave: 'licenca.numero' } },
        ],
      },
    ],
  },
  row_version: 1,
  arquivado_em: null,
}

const dados = {
  consultoria: 'Filtroville',
  autor: 'Ana Ribeiro',
  hoje: '2026-11-19',
  empreendimento: {
    nome: 'Metalúrgica Rio Cubatão',
    cliente: null,
    cnpj: '12345678000190',
    unidade: null,
    endereco: null,
  },
  licenca: null,
  condicionante: null,
}

function cenario(extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: ana,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      dados_para_relatorio: { data: dados },
      ...extra.rpc,
    },
    tabelas: {
      empreendimento: [
        { id: 'e1', nome: 'Metalúrgica Rio Cubatão', cnpj: '12345678000190', cliente: null },
      ],
      unidade: [],
      modelo_documento: [modelo],
      ...extra.tabelas,
    },
  }
}

let baixados: string[] = []

beforeEach(() => {
  falso.reiniciar(cenario())
  baixados = []
  URL.createObjectURL = vi.fn(() => 'blob:relatorio')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    baixados.push(this.download)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function abrirDialogo() {
  const usuario = userEvent.setup()
  renderizarApp('/empreendimentos/e1')
  await usuario.click(await screen.findByRole('button', { name: 'Gerar relatório' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Gerar relatório' })
  return { usuario, dialogo }
}

describe('gerar relatório no empreendimento', () => {
  it('baixa o .docx preenchido e avisa o campo sem dado', async () => {
    const { usuario, dialogo } = await abrirDialogo()
    expect(await within(dialogo).findByRole('radio', { name: 'Relatório semestral' })).toBeChecked()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Baixar .docx' }))

    await waitFor(() => {
      expect(baixados).toEqual(['Relatório semestral - Metalúrgica Rio Cubatão.docx'])
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('dados_para_relatorio', {
      p_empreendimento_id: 'e1',
    })
    expect(await within(dialogo).findByRole('status')).toHaveTextContent('Número da licença')
  })

  it('mostra o erro do banco', async () => {
    falso.reiniciar(
      cenario({ rpc: { dados_para_relatorio: { error: { message: 'sem_permissao' } } } }),
    )
    const { usuario, dialogo } = await abrirDialogo()
    await within(dialogo).findByRole('radio', { name: 'Relatório semestral' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Baixar .docx' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para esta ação.',
    )
    expect(baixados).toEqual([])
  })

  it('sem modelo cadastrado, o diálogo diz isso e não baixa nada', async () => {
    falso.reiniciar(cenario({ tabelas: { modelo_documento: [] } }))
    const { dialogo } = await abrirDialogo()
    expect(await within(dialogo).findByText('Nenhum modelo cadastrado.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Baixar .docx' })).toBeDisabled()
  })
})
