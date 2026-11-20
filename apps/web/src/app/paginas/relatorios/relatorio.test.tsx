// Relatório escrito no Grama (ADR-0040): autor envia para revisão (e a IA confere), revisor aprova
// ou devolve com motivo, apontamento sublinhado no texto com "Aplicar sugestão" e "Ignorar",
// "Conferir antes de enviar", erro do banco e relatório que não existe.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const bruno = sessaoDe('bruno@filtroville.test', 'Bruno Kist')

function relatorio(extra: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    consultoria_id: 'c-Filtroville',
    empreendimento_id: 'e1',
    ocorrencia_id: 'o1',
    titulo: 'Relatório semestral',
    conteudo: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Conforme a LAO 4812/2023, emitida pelo IMA.' }],
        },
      ],
    },
    situacao: 'rascunho',
    versao: 2,
    row_version: 3,
    atualizado_em: '2026-11-20T13:00:00Z',
    autor_id: 'm-Filtroville',
    motivo_devolucao: null,
    empreendimento: { nome: 'Metalúrgica Rio Cubatão' },
    autor: { nome: 'Bruno Kist' },
    revisor: null,
    ...extra,
  }
}

const conferencia = {
  id: 'ci1',
  evidencia_id: null,
  relatorio_id: 'r1',
  relatorio_versao: 2,
  ignorados: [],
  situacao: 'concluida',
  motivo: null,
  resumo: 'Um ponto a corrigir.',
  apontamentos: [
    {
      origem: 'ia',
      categoria: 'licenca',
      gravidade: 'corrigir',
      trecho: 'LAO 4812/2023',
      problema: 'Número da licença diferente do cadastro.',
      sugestao: 'Use LAO 4821/2023.',
      substituicao: 'LAO 4821/2023',
    },
  ],
  iniciada_em: '2026-11-20T13:01:00Z',
}

function cenario(
  permissoes: { pode_editar: boolean; pode_revisar: boolean },
  extra: {
    relatorio?: Record<string, unknown>
    conferencias?: unknown[]
    rpc?: Cenario['rpc']
  } = {},
): Cenario {
  return {
    sessao: bruno,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      permissoes_do_relatorio: { data: [permissoes] },
      salvar_relatorio: { data: 4 },
      enviar_relatorio: { data: 4 },
      aprovar_relatorio: { data: 4 },
      devolver_relatorio: { data: 4 },
      ignorar_apontamento: { data: null },
      ...extra.rpc,
    },
    funcoes: { 'conferir-relatorio': { data: { situacao: 'concluida' } } },
    tabelas: {
      relatorio: [extra.relatorio ?? relatorio()],
      conferencia_ia: extra.conferencias ?? [],
    },
  }
}

const autor = { pode_editar: true, pode_revisar: false }
const revisor = { pode_editar: true, pode_revisar: true }

beforeEach(() => {
  falso.reiniciar(cenario(autor))
})

describe('relatório escrito no Grama', () => {
  it('o autor vê o texto e envia para revisão; a IA confere a versão enviada', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/relatorios/r1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Relatório semestral' }))
    expect(screen.getByRole('textbox', { name: 'Texto do relatório' })).toHaveTextContent(
      'Conforme a LAO 4812/2023',
    )
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Enviar para revisão' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('enviar_relatorio', {
        p_id: 'r1',
        p_row_version: 3,
      })
    })
    await waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('conferir-relatorio', {
        body: expect.objectContaining({ relatorioId: 'r1', versao: 2 }) as unknown,
      })
    })
  })

  it('o apontamento sublinha o trecho; aplicar troca o texto e marca como resolvido', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario(autor, { conferencias: [conferencia] }))
    renderizarApp('/relatorios/r1')
    const coluna = await screen.findByRole('region', { name: 'Conferência da IA' })
    expect(await within(coluna).findByText('1 apontamento')).toBeInTheDocument()
    const texto = screen.getByRole('textbox', { name: 'Texto do relatório' })
    await waitFor(() => {
      expect(texto.querySelector('.trecho-apontado')).toHaveTextContent('LAO 4812/2023')
    })

    await usuario.click(within(coluna).getByRole('button', { name: 'Aplicar sugestão' }))
    expect(texto).toHaveTextContent('Conforme a LAO 4821/2023, emitida pelo IMA.')
    expect(screen.getByText('Não salvo')).toBeInTheDocument()
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('ignorar_apontamento', {
        p_conferencia_id: 'ci1',
        p_indice: 0,
      })
    })
  })

  it('"Ignorar" grava o apontamento como ignorado', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario(autor, { conferencias: [conferencia] }))
    renderizarApp('/relatorios/r1')
    const coluna = await screen.findByRole('region', { name: 'Conferência da IA' })
    await usuario.click(await within(coluna).findByRole('button', { name: 'Ignorar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('ignorar_apontamento', {
        p_conferencia_id: 'ci1',
        p_indice: 0,
      })
    })
  })

  it('"Conferir antes de enviar" pede a conferência da versão atual', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/relatorios/r1')
    const coluna = await screen.findByRole('region', { name: 'Conferência da IA' })
    await usuario.click(within(coluna).getByRole('button', { name: 'Conferir antes de enviar' }))
    await waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('conferir-relatorio', {
        body: expect.objectContaining({ relatorioId: 'r1', versao: 2 }) as unknown,
      })
    })
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('salvar_relatorio', expect.anything())
  })

  it('o revisor aprova; devolver exige motivo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario(revisor, { relatorio: relatorio({ situacao: 'em_revisao' }) }))
    renderizarApp('/relatorios/r1')
    await screen.findByRole('heading', { level: 1, name: 'Relatório semestral' })
    expect(screen.queryByRole('button', { name: 'Enviar para revisão' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Devolver' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Devolver para correção' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    expect(await within(dialogo).findByText('Informe o motivo')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Falta o período de referência.')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('devolver_relatorio', {
        p_id: 'r1',
        p_motivo: 'Falta o período de referência.',
        p_row_version: 3,
      })
    })

    await usuario.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('aprovar_relatorio', expect.anything())
    })
  })

  it('devolvido mostra o motivo para o autor', async () => {
    falso.reiniciar(
      cenario(autor, {
        relatorio: relatorio({
          situacao: 'devolvido',
          motivo_devolucao: 'Falta o período de referência.',
          revisor: { nome: 'Eduardo Karnopp' },
        }),
      }),
    )
    renderizarApp('/relatorios/r1')
    expect(await screen.findByText('Falta o período de referência.')).toBeInTheDocument()
    expect(screen.getByText('Devolvido por Eduardo Karnopp')).toBeInTheDocument()
  })

  it('mostra o erro do banco ao salvar', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario(autor, { rpc: { salvar_relatorio: { error: { message: 'conflito_de_versao' } } } }),
    )
    renderizarApp('/relatorios/r1')
    const titulo = await screen.findByLabelText('Título')
    await usuario.type(titulo, ' 2026')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Isto foi alterado em outro lugar')
  })

  it('relatório que não existe (ou de outra consultoria) mostra o estado vazio', async () => {
    falso.reiniciar({ ...cenario(autor), tabelas: { relatorio: [], conferencia_ia: [] } })
    renderizarApp('/relatorios/r9')
    expect(
      await screen.findByRole('heading', { name: 'Relatório não encontrado' }),
    ).toBeInTheDocument()
  })
})
