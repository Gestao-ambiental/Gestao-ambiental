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
    evidencia_id: null,
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
  })

  it('aprovar com ocorrência pede a data real de execução e envia o .docx como evidência', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario(revisor, { relatorio: relatorio({ situacao: 'em_revisao' }) }))
    renderizarApp('/relatorios/r1')
    await usuario.click(await screen.findByRole('button', { name: 'Aprovar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Aprovar e registrar a evidência' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Aprovar' }))
    expect(await within(dialogo).findByText('Informe a data real de execução')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('aprovar_relatorio', expect.anything())

    await usuario.type(within(dialogo).getByLabelText('Data real de execução *'), '18/11/2026')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'aprovar_relatorio',
        expect.objectContaining({
          p_id: 'r1',
          p_row_version: 3,
          p_data_execucao: '2026-11-18',
          p_nome_original: 'Relatório semestral - Metalúrgica Rio Cubatão.docx',
          p_caminho: expect.stringMatching(
            /^c-Filtroville\/evidencia\/[0-9a-f-]{36}\.docx$/,
          ) as unknown,
        }),
      )
    })
    const upload = falso.cliente.storage.from().upload
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.docx$/),
      expect.any(File),
      expect.objectContaining({ upsert: false }),
    )
  })

  it('aprovado com ocorrência mostra que virou a evidência', async () => {
    falso.reiniciar(
      cenario(
        { pode_editar: false, pode_revisar: false },
        { relatorio: relatorio({ situacao: 'aprovado', evidencia_id: 'ev9' }) },
      ),
    )
    renderizarApp('/relatorios/r1')
    expect(await screen.findByText('Virou a evidência da ocorrência')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir a ocorrência' })).toHaveAttribute(
      'href',
      '/ocorrencias/o1',
    )
    expect(screen.getByRole('button', { name: 'Exportar .docx' })).toBeInTheDocument()
  })

  it.each([
    ['rascunho', 'Rascunho', 'padrao'],
    ['em_revisao', 'Em revisão', 'andamento'],
    ['devolvido', 'Devolvido', 'perigo'],
    ['aprovado', 'Aprovado', 'sucesso'],
  ] as const)(
    'o estado %s usa o selo de estado das outras telas, com o texto junto',
    async (situacao, texto, tom) => {
      falso.reiniciar(cenario(autor, { relatorio: relatorio({ situacao }) }))
      renderizarApp('/relatorios/r1')
      await screen.findByRole('heading', { level: 1, name: 'Relatório semestral' })
      const selo = screen.getAllByText(texto).find((el) => el.closest('[data-tom]'))
      expect(selo?.closest('[data-tom]')).toHaveAttribute('data-tom', tom)
    },
  )

  it('aprovado mostra "Exportar .docx" uma vez só, sem repetir no menu', async () => {
    falso.reiniciar(
      cenario(
        { pode_editar: false, pode_revisar: false },
        { relatorio: relatorio({ situacao: 'aprovado' }) },
      ),
    )
    renderizarApp('/relatorios/r1')
    expect(await screen.findByRole('button', { name: 'Exportar .docx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  })

  it('o apontamento escolhido fica marcado por aria-pressed, não só pela cor', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario(autor, { conferencias: [conferencia] }))
    renderizarApp('/relatorios/r1')
    const coluna = await screen.findByRole('region', { name: 'Conferência da IA' })
    const cartao = await within(coluna).findByRole('button', {
      name: /Número da licença diferente do cadastro/,
    })
    expect(cartao).toHaveAttribute('aria-pressed', 'false')
    // O clique rola o editor até o trecho; o jsdom não mede Range.
    const prototipo = Range.prototype as unknown as Record<string, unknown>
    const vazio = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }
    prototipo.getClientRects = () => [vazio]
    prototipo.getBoundingClientRect = () => vazio
    try {
      await usuario.click(cartao)
      expect(cartao).toHaveAttribute('aria-pressed', 'true')
    } finally {
      delete prototipo.getClientRects
      delete prototipo.getBoundingClientRect
    }
  })

  it('sem ocorrência, aprovar não pede data nem envia arquivo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario(revisor, { relatorio: relatorio({ situacao: 'em_revisao', ocorrencia_id: null }) }),
    )
    renderizarApp('/relatorios/r1')
    await usuario.click(await screen.findByRole('button', { name: 'Aprovar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('aprovar_relatorio', {
        p_id: 'r1',
        p_row_version: 3,
      })
    })
    expect(falso.cliente.storage.from().upload).not.toHaveBeenCalled()
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

  // Regra mudou de propósito (padrão de botões, pedido do Eduardo, 23/11/2026): o Salvar não fica
  // mais apagado na barra; só aparece com alteração, e o "Salvo" do cabeçalho diz o estado.
  it('sem alteração não há botão Salvar; editar mostra o botão e salvar o tira de novo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/relatorios/r1')
    const titulo = await screen.findByLabelText('Título')
    expect(screen.getByText('Salvo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    // O primário continua sendo um só.
    expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toBeInTheDocument()

    await usuario.type(titulo, ' 2026')
    expect(screen.getByText('Não salvo')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'salvar_relatorio',
        expect.objectContaining({ p_id: 'r1' }),
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Salvo')).toBeInTheDocument()
  })

  it('relatório que não existe (ou de outra consultoria) mostra o estado vazio', async () => {
    falso.reiniciar({ ...cenario(autor), tabelas: { relatorio: [], conferencia_ia: [] } })
    renderizarApp('/relatorios/r9')
    expect(
      await screen.findByRole('heading', { name: 'Relatório não encontrado' }),
    ).toBeInTheDocument()
  })
})
