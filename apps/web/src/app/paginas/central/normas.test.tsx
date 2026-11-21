// Fila de revisão das mudanças de norma na central (LEG-04; ADR-0050): lista, uso da IA, detalhe
// com diferença, resumo e critérios editáveis, gerar resumo, publicar com confirmação e descartar
// com motivo. Quem não é operador vê "sem permissão".
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')

function cenario(rpc: Cenario['rpc'], funcoes?: Cenario['funcoes']): Cenario {
  return {
    sessao: operador,
    doisFatores: { nivel: 'aal2', fatores: [{ id: 'f1', status: 'verified' }] },
    rpc: {
      sou_operador: { data: true },
      central_uso_de_ia_da_plataforma: {
        data: {
          resumos_hoje: 3,
          custo_mes_micros: 1_230_000,
          limite_dia: 40,
          limite_mes_micros: 20_000_000,
        },
      },
      ...rpc,
    },
    funcoes,
  }
}

const FILA = [
  {
    id: 'm1',
    norma_id: 'n1',
    norma_titulo: 'Instrução Normativa IMA nº 02',
    tipo: 'alterada',
    situacao: 'resumida',
    // 02:00 UTC é 19/11 em São Paulo: a data sai no fuso da central, não no do aparelho.
    detectada_em: '2026-11-20T02:00:00Z',
    tem_resumo: true,
    total: 2,
  },
  {
    id: 'm2',
    norma_id: 'n2',
    norma_titulo: 'Resolução CONSEMA nº 250',
    tipo: 'revogada',
    situacao: 'detectada',
    detectada_em: '2026-11-18T15:00:00Z',
    tem_resumo: false,
    total: 2,
  },
]

const DETALHE = {
  id: 'm1',
  tipo: 'alterada',
  situacao: 'resumida',
  detectada_em: '2026-11-20T02:00:00Z',
  publicada_em: null,
  motivo_descarte: null,
  norma: {
    id: 'n1',
    titulo: 'Instrução Normativa IMA nº 02',
    tipo: 'instrucao_normativa',
    orgao: 'IMA',
    esfera: 'estadual',
  },
  url_oficial: 'https://in.ima.sc.gov.br/in02.pdf',
  diferenca: {
    estruturada: true,
    incluidos: [{ caminho: 'art9', rotulo: 'Art. 9º', texto: 'Fica exigido o laudo anual.' }],
    alterados: [
      {
        caminho: 'art6',
        rotulo: 'Art. 6º',
        antes: 'O prazo é de 30 dias.',
        depois: 'O prazo é de 60 dias.',
      },
    ],
    revogados: [{ caminho: 'art7', rotulo: 'Art. 7º', texto: 'Dispensa de laudo.' }],
    iguais: 4,
  },
  resumo: {
    resumo: 'O prazo passa a 60 dias.',
    o_que_muda: ['Prazo de 30 para 60 dias', 'Laudo anual'],
    prazo_de_adequacao: null,
    confianca: 'alta',
  },
  criterios_sugeridos: [
    { tipo: 'atividade', valor: '33.10.00' },
    { tipo: 'tipo_licenca', valor: 'LAO' },
  ],
  criterios: [],
  versao_anterior: { publicada_em: '2024-01-10', trecho: 'Art. 6º O prazo é de 30 dias.' },
  versao_nova: { publicada_em: '2026-11-19', trecho: 'Art. 6º O prazo é de 60 dias.' },
  chamadas_ia: [
    {
      id: 'c1',
      situacao: 'concluida',
      modelo: 'modelo-falso',
      custo_micros: 4200,
      criado_em: '2026-11-20T03:00:00Z',
    },
  ],
}

describe('Central: fila de normas (LEG-04)', () => {
  it('lista norma, mudança, situação e data, com o uso da IA', async () => {
    falso.reiniciar(cenario({ central_listar_mudancas_de_norma: { data: FILA } }))
    renderizarApp('/admin/normas')

    const linha = await screen.findByRole('row', { name: /Instrução Normativa IMA nº 02/ })
    expect(within(linha).getByText('Alterada')).toBeInTheDocument()
    expect(within(linha).getByText('Resumida')).toBeInTheDocument()
    expect(within(linha).getByText('19/11/2026')).toBeInTheDocument()
    expect(
      within(linha).getByRole('link', { name: 'Instrução Normativa IMA nº 02' }),
    ).toHaveAttribute('href', '/admin/normas/m1')
    expect(screen.getByText('2 mudanças')).toBeInTheDocument()

    expect(await screen.findByText('3 / 40')).toBeInTheDocument()
    expect(screen.getByText(/US\$\s1,23 \/ US\$\s20,00/)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Central' })).toHaveTextContent('Normas')
  })

  it('o filtro de situação vai para o banco', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario({ central_listar_mudancas_de_norma: { data: FILA } }))
    renderizarApp('/admin/normas')
    await screen.findByRole('row', { name: /Resolução CONSEMA/ })

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'publicada')
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'central_listar_mudancas_de_norma',
        expect.objectContaining({ p_situacao: 'publicada' }),
      )
    })
  })

  it('fila vazia tem o próprio estado', async () => {
    falso.reiniciar(cenario({ central_listar_mudancas_de_norma: { data: [] } }))
    renderizarApp('/admin/normas')
    expect(await screen.findByText('Nenhuma mudança para revisar')).toBeInTheDocument()
  })

  it('erro do banco mostra o estado de erro', async () => {
    falso.reiniciar(cenario({ central_listar_mudancas_de_norma: { error: { message: 'falhou' } } }))
    renderizarApp('/admin/normas')
    expect(
      await screen.findByText('Não foi possível carregar as mudanças de norma.'),
    ).toBeInTheDocument()
  })

  it('o banco recusando (sem_permissao) vira "sem permissão"', async () => {
    falso.reiniciar(
      cenario({
        central_listar_mudancas_de_norma: { error: { code: '42501', message: 'sem_permissao' } },
      }),
    )
    renderizarApp('/admin/normas')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
  })

  it('quem não é operador vê "sem permissão" e nenhuma RPC da fila é chamada', async () => {
    falso.reiniciar({
      sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
      rpc: { sou_operador: { data: false } },
    })
    renderizarApp('/admin/normas/m1')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc.startsWith('central_'))).toHaveLength(
      0,
    )
  })
})

describe('Central: revisão de uma mudança de norma (LEG-04)', () => {
  it('mostra a diferença, o resumo, os critérios e a fonte oficial', async () => {
    falso.reiniciar(cenario({ central_detalhe_da_mudanca_de_norma: { data: DETALHE } }))
    renderizarApp('/admin/normas/m1')

    expect(
      await screen.findByRole('heading', { name: 'Instrução Normativa IMA nº 02' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Detectada em 19/11/2026')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Incluídos (1)' })).toBeInTheDocument()
    expect(screen.getByText('O prazo é de 30 dias.').tagName).toBe('DEL')
    expect(screen.getByText('O prazo é de 60 dias.').tagName).toBe('INS')
    expect(screen.getByText('Dispensa de laudo.').tagName).toBe('DEL')
    expect(screen.getByRole('textbox', { name: 'Resumo' })).toHaveValue('O prazo passa a 60 dias.')
    expect(screen.getByRole('textbox', { name: 'O que muda' })).toHaveValue(
      'Prazo de 30 para 60 dias\nLaudo anual',
    )
    const criterios = screen.getByRole('list', { name: 'Critérios' })
    expect(within(criterios).getByText('Atividade: 33.10.00')).toBeInTheDocument()
    expect(within(criterios).getByText('Tipo de licença: LAO')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fonte oficial/ })).toHaveAttribute(
      'href',
      'https://in.ima.sc.gov.br/in02.pdf',
    )
    expect(screen.getByRole('button', { name: 'Gerar de novo' })).toBeInTheDocument()
  })

  it('diferença não estruturada mostra "Texto mudou" com os dois trechos', async () => {
    falso.reiniciar(
      cenario({
        central_detalhe_da_mudanca_de_norma: {
          data: { ...DETALHE, diferenca: { estruturada: false, mudou: true } },
        },
      }),
    )
    renderizarApp('/admin/normas/m1')
    expect(await screen.findByText('Texto mudou')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Versão anterior/ })).toHaveTextContent(
      'Versão anterior · 10/01/2024',
    )
    expect(screen.getByRole('heading', { name: /Versão nova/ })).toHaveTextContent(
      'Versão nova · 19/11/2026',
    )
    expect(screen.getByText('Art. 6º O prazo é de 30 dias.')).toBeInTheDocument()
  })

  it('publicar pede confirmação na página e manda resumo e critérios editados', async () => {
    const usuario = userEvent.setup()
    const confirmar = vi.spyOn(window, 'confirm')
    falso.reiniciar(
      cenario({
        central_detalhe_da_mudanca_de_norma: { data: DETALHE },
        central_publicar_mudanca_de_norma: { data: null },
      }),
    )
    renderizarApp('/admin/normas/m1')

    const resumo = await screen.findByRole('textbox', { name: 'Resumo' })
    await usuario.clear(resumo)
    await usuario.type(resumo, 'Prazo de entrega dobra.')
    const oQueMuda = screen.getByRole('textbox', { name: 'O que muda' })
    await usuario.clear(oQueMuda)
    await usuario.type(oQueMuda, 'Prazo maior')

    await usuario.click(screen.getByRole('button', { name: 'Remover Atividade: 33.10.00' }))
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo do critério' }),
      'municipio',
    )
    await usuario.type(screen.getByRole('textbox', { name: 'Valor do critério' }), '4209102')
    await usuario.click(screen.getByRole('button', { name: 'Acrescentar' }))
    expect(screen.getByText('Município (IBGE): 4209102')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Publicar' }))
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'central_publicar_mudanca_de_norma',
      expect.anything(),
    )
    await usuario.click(screen.getByRole('button', { name: 'Confirmar publicação' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_publicar_mudanca_de_norma', {
      p_id: 'm1',
      p_resumo: {
        resumo: 'Prazo de entrega dobra.',
        o_que_muda: ['Prazo maior'],
        prazo_de_adequacao: null,
        confianca: 'alta',
      },
      p_criterios: [
        { tipo: 'tipo_licenca', valor: 'LAO' },
        { tipo: 'municipio', valor: '4209102' },
      ],
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Mudança publicada.')
    expect(confirmar).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })

  it('publicar sem resumo não chama o banco', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({ central_detalhe_da_mudanca_de_norma: { data: { ...DETALHE, resumo: null } } }),
    )
    renderizarApp('/admin/normas/m1')
    await usuario.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect(screen.getByText('Informe o resumo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar publicação' })).not.toBeInTheDocument()
  })

  it('descartar exige motivo e manda o motivo ao banco', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        central_detalhe_da_mudanca_de_norma: { data: DETALHE },
        central_descartar_mudanca_de_norma: { data: null },
      }),
    )
    renderizarApp('/admin/normas/m1')

    await usuario.click(await screen.findByRole('button', { name: 'Descartar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Descartar mudança' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'central_descartar_mudanca_de_norma',
      expect.anything(),
    )

    await usuario.type(
      within(dialogo).getByRole('textbox', { name: 'Motivo' }),
      'Republicação sem mudança',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_descartar_mudanca_de_norma', {
      p_id: 'm1',
      p_motivo: 'Republicação sem mudança',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Mudança descartada.')
  })

  it('gerar resumo chama a Edge Function da mudança', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario(
        {
          central_detalhe_da_mudanca_de_norma: {
            data: { ...DETALHE, situacao: 'detectada', resumo: null, criterios_sugeridos: null },
          },
        },
        { 'resumir-mudanca': { data: { situacao: 'resumida' } } },
      ),
    )
    renderizarApp('/admin/normas/m1')

    await usuario.click(await screen.findByRole('button', { name: 'Gerar resumo' }))
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('resumir-mudanca', {
      body: { mudanca_id: 'm1' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Resumo gerado.')
  })

  it('mudança publicada fica só para leitura', async () => {
    falso.reiniciar(
      cenario({
        central_detalhe_da_mudanca_de_norma: {
          data: { ...DETALHE, situacao: 'publicada', publicada_em: '2026-11-20T12:00:00Z' },
        },
      }),
    )
    renderizarApp('/admin/normas/m1')
    expect(await screen.findByRole('textbox', { name: 'Resumo' })).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument()
  })

  it('erro ao carregar o detalhe mostra o estado de erro', async () => {
    falso.reiniciar(
      cenario({ central_detalhe_da_mudanca_de_norma: { error: { message: 'falhou' } } }),
    )
    renderizarApp('/admin/normas/m1')
    expect(await screen.findByText('Não foi possível carregar a mudança.')).toBeInTheDocument()
  })
})
