import { FunctionsHttpError } from '@supabase/supabase-js'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))
vi.mock('@/components/pdf/VisualizadorPdf', () => ({
  VisualizadorPdf: ({
    nome,
    paginaPedida,
  }: {
    nome: string
    paginaPedida?: { numero: number }
  }) => <section aria-label={`PDF ${nome}`} data-pagina={paginaPedida?.numero ?? 1} />,
}))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function rascunho(extra: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    situacao: 'rascunho',
    row_version: 3,
    numero: null,
    orgao: null,
    tipo_id: null,
    unidade_id: 'u1',
    empreendimento_id: 'e1',
    emitido_em: null,
    assinado_em: null,
    publicado_em: null,
    recebido_em: null,
    marco: null,
    validade: null,
    antecedencia_renovacao_dias: 30,
    tipo: null,
    unidade: { nome: 'Matriz', empreendimento: { nome: 'Metalúrgica Rio Cubatão' } },
    documento: {
      versao: { caminho: 'c-Filtroville/instrumento/v1.pdf', nome_original: 'LAO 4821-2023.pdf' },
    },
    ...extra,
  }
}

function cenario(extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_empreendimentos: {
        data: [
          {
            id: 'e1',
            nome: 'Metalúrgica Rio Cubatão',
            cliente_nome: null,
            cnpj: null,
            unidades: 1,
            criado_em: '2026-10-01T12:00:00Z',
            licencas: [],
            total: 1,
          },
        ],
      },
      criar_instrumento: (args) => ({ data: args.p_id }),
      registrar_pdf_instrumento: { data: null },
      ...extra.rpc,
    },
    funcoes: extra.funcoes,
    tabelas: {
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      tipo_instrumento: [
        { id: 't-lao', sigla: 'LAO', nome: 'Licença Ambiental de Operação' },
        { id: 't-aua', sigla: 'AuA', nome: 'Autorização Ambiental' },
      ],
      instrumento: [rascunho()],
      condicionante: [],
      extracao_ia: [],
      ...extra.tabelas,
    },
  }
}

function pdf(nome: string, bytes = 2048): File {
  const conteudo = new Uint8Array(bytes)
  conteudo.set(new TextEncoder().encode('%PDF-1.7\n'))
  return new File([conteudo], nome, { type: 'application/pdf' })
}

describe('extrair com IA: passo 1 (IA-01, IA-04)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('sem PDF, a IA fica indisponível e diz por quê', async () => {
    renderizarApp('/licencas/nova?empreendimento=e1')
    expect(await screen.findByRole('radio', { name: 'Extrair com IA' })).toBeDisabled()
    expect(
      screen.getByText('Envie o PDF da licença para a IA ler. O manual aceita sem PDF.'),
    ).toBeInTheDocument()
  })

  it('PDF acima de 10 MB não vai à IA; o manual continua', async () => {
    const usuario = userEvent.setup({ applyAccept: false })
    renderizarApp('/licencas/nova?empreendimento=e1')
    await screen.findByRole('button', { name: 'Escolher arquivo' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(entrada, pdf('grande.pdf', 11 * 1024 * 1024))
    expect(
      await screen.findByText(/A IA lê PDF com texto até 10 MB; este tem 11,0 MB/),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Extrair com IA' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Cadastrar manualmente' })).toBeEnabled()
  })

  it('com PDF: cria o rascunho, envia o PDF, extrai e segue para a identificação', async () => {
    const usuario = userEvent.setup({ applyAccept: false })
    falso.reiniciar(
      cenario({ funcoes: { 'extrair-licenca': { data: { situacao: 'concluida', itens: 12 } } } }),
    )
    const { router } = renderizarApp('/licencas/nova?empreendimento=e1')
    await screen.findByRole('button', { name: 'Escolher arquivo' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(entrada, pdf('LAO 4821-2023.pdf'))
    await usuario.click(await screen.findByRole('radio', { name: 'Extrair com IA' }))
    expect(screen.getByText('Ao continuar, a IA lê o PDF. Leva até 2 minutos.')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/licencas\/[^/]+\/identificacao$/)
    })
    expect(falso.cliente.functions.invoke).toHaveBeenCalledTimes(1)
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('extrair-licenca', {
      body: {
        extracaoId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        instrumentoId: expect.any(String) as unknown,
      },
    })
  })

  it('tempo esgotado: tenta de novo com outra extração ou segue pelo manual', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        funcoes: { 'extrair-licenca': { data: { situacao: 'falhou', motivo: 'tempo_esgotado' } } },
      }),
    )
    const { router } = renderizarApp('/licencas/i1/documento')
    await usuario.click(await screen.findByRole('radio', { name: 'Extrair com IA' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(
      await screen.findByText(
        'A extração não respondeu em 2 minutos. Tente de novo ou siga pelo manual.',
      ),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledTimes(2)
    })
    const ids = falso.cliente.functions.invoke.mock.calls.map(
      ([, opcoes]) => (opcoes as { body: { extracaoId: string } }).body.extracaoId,
    )
    expect(new Set(ids).size).toBe(2)

    await usuario.click(await screen.findByRole('button', { name: 'Cadastrar manualmente' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/licencas/i1/identificacao')
    })
  })

  it('PDF escaneado: avisa e não oferece tentar de novo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        funcoes: { 'extrair-licenca': { data: { situacao: 'falhou', motivo: 'pdf_sem_texto' } } },
      }),
    )
    renderizarApp('/licencas/i1/documento')
    await usuario.click(await screen.findByRole('radio', { name: 'Extrair com IA' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(
      await screen.findByText(
        'Este PDF é uma imagem e a IA só lê PDF com texto. Siga pelo cadastro manual.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('rascunho que já tem condicionantes: a recusa do banco aparece traduzida', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        funcoes: {
          'extrair-licenca': {
            error: new FunctionsHttpError(
              new Response(JSON.stringify({ erro: 'condicionantes_existentes' }), { status: 409 }),
            ),
          },
        },
      }),
    )
    renderizarApp('/licencas/i1/documento')
    await usuario.click(await screen.findByRole('radio', { name: 'Extrair com IA' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(
      await screen.findByText(
        'Este rascunho já tem condicionantes: a IA só preenche rascunho sem itens. Siga pelo manual.',
      ),
    ).toBeInTheDocument()
  })
})

const propostaConcluida = {
  id: 'x1',
  situacao: 'concluida',
  motivo: null,
  iniciada_em: '2026-10-19T12:00:00Z',
  itens_propostos: 2,
  resultado: {
    identificacao: {
      tipo: { valor: 'LAO', pagina: 1 },
      numero: { valor: '4821/2023', pagina: 1 },
      orgao: { valor: null, pagina: null },
      emitido_em: { valor: null, pagina: null },
      assinado_em: { valor: '2023-02-14', pagina: 1 },
      publicado_em: { valor: null, pagina: null },
      recebido_em: { valor: null, pagina: null },
      validade: { valor: '2027-02-15', pagina: 2 },
    },
    condicionantes: [],
  },
}

describe('revisar a proposta da IA (IA-02)', () => {
  it('identificação: marca o que veio da IA, leva o PDF à página e diz o que não achou', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        tabelas: {
          instrumento: [
            rascunho({
              numero: '4821/2023',
              tipo_id: 't-lao',
              tipo: { sigla: 'LAO' },
              assinado_em: '2023-02-14',
              validade: '2027-02-15',
            }),
          ],
          extracao_ia: [propostaConcluida],
        },
      }),
    )
    renderizarApp('/licencas/i1/identificacao')
    const formulario = await screen.findByRole('form', { name: 'Identificação da licença' })
    expect(await within(formulario).findAllByText(/^Proposto pela IA/)).toHaveLength(4)
    expect(within(formulario).getAllByText('Não encontrado no documento.').length).toBeGreaterThan(
      0,
    )

    const [verPagina2] = within(formulario).getAllByRole('button', { name: 'ver página 2' })
    if (!verPagina2) throw new Error('marca da validade ausente')
    await usuario.click(verPagina2)
    expect(screen.getByRole('region', { name: 'PDF LAO 4821-2023.pdf' })).toHaveAttribute(
      'data-pagina',
      '2',
    )
  })

  it('condicionante proposta: fonte e periodicidade lida, aguardando aceite', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        tabelas: {
          condicionante: [
            {
              id: 'c1',
              pai_id: null,
              codigo: '4.3',
              posicao: 1,
              revisao: 'pendente',
              responsavel_id: null,
              origem: 'ia',
              fonte_pagina: 4,
              proposta_ia: { periodicidade: 'semestral' },
              versao: {
                titulo: 'Análise semestral do corpo receptor',
                texto_literal: 'Realizar, semestralmente, análise do corpo receptor.',
                natureza: 'obrigacao',
                recorrencia: null,
                unidade_ciclo: null,
                intervalo_ciclo: null,
                data_referencia: null,
                primeira_data: null,
                fonte_regra: null,
                prazo_confirmado_em: null,
                confirmador: null,
              },
            },
          ],
        },
      }),
    )
    renderizarApp('/licencas/i1/condicionantes')
    await usuario.click(
      await screen.findByRole('button', { name: /Análise semestral do corpo receptor/ }),
    )
    const form = await screen.findByRole('form', { name: 'Condicionante 4.3' })
    expect(within(form).getByText(/^Proposto pela IA/)).toBeInTheDocument()
    expect(within(form).getByText(/A IA leu a periodicidade “semestral”/)).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Aceitar' })).toBeInTheDocument()
    await usuario.click(within(form).getByRole('button', { name: 'ver página 4' }))
    expect(screen.getByRole('region', { name: 'PDF LAO 4821-2023.pdf' })).toHaveAttribute(
      'data-pagina',
      '4',
    )
  })
})
