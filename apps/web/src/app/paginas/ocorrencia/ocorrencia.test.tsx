import { adicionarDias, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')
const EU = 'm-Filtroville'

function ocorrencia(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'o1',
    consultoria_id: 'c-Filtroville',
    instrumento_id: 'i1',
    ciclo: 2,
    codigo: '3.2.1.3',
    titulo: 'Manutenção dos sistemas de efluentes',
    texto_literal: 'Fazer a manutenção REGULAR dos sistemas de tratamento de efluentes.',
    licenca: 'LAO 109/2020',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Embraco',
    unidade_nome: 'Matriz',
    prazo_oficial_original: adicionarDias(hoje, 10),
    prazo_oficial_atual: adicionarDias(hoje, 10),
    meta_interna: null,
    prazo_ciclo_anterior: adicionarDias(hoje, -80),
    ocorrencia_anterior_id: null,
    data_referencia: null,
    hoje,
    recorrencia: 'mensal',
    criado_em: `${adicionarDias(hoje, -20)}T11:00:00Z`,
    situacao: 'aberta',
    responsavel_id: EU,
    responsavel_nome: 'Ana Ribeiro',
    conferente_id: null,
    conferente_nome: null,
    concluida_em: null,
    concluida_por_nome: null,
    concluida_sem_evidencia: false,
    conferencia_independente: true,
    encerramento_solicitado_em: null,
    row_version: 3,
    ...extra,
  }
}

function arquivo(id: string, nome: string, mime: string, posicao = 1): Record<string, unknown> {
  const extensao = mime === 'application/pdf' ? 'pdf' : 'jpg'
  return {
    posicao,
    versao: {
      id,
      caminho: `c-Filtroville/evidencia/${id}.${extensao}`,
      nome_original: nome,
      tamanho_bytes: 1_887_437,
      mime,
    },
  }
}

function evidencia(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'ev1',
    numero: 1,
    situacao: 'em_conferencia',
    data_execucao: adicionarDias(hoje, -2),
    observacoes: 'Caixa 2 com óleo acima do normal.',
    enviada_em: '2026-11-05T13:42:00Z',
    enviada_por: EU,
    autor: { nome: 'Ana Ribeiro' },
    arquivos: [
      arquivo('v1', 'relatorio-limpeza.pdf', 'application/pdf', 1),
      arquivo('v2', 'foto-antes.jpg', 'image/jpeg', 2),
    ],
    conferencia: null,
    ...extra,
  }
}

function historico(
  id: number,
  tipo: string,
  extra: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    tipo,
    instante: '2026-11-05T12:14:00Z',
    evidencia_numero: null,
    detalhe: null,
    dados: null,
    ator_id: 'm-carla',
    ator: { nome: 'Carla Menezes' },
    ...extra,
  }
}

function cenario(
  papel: 'gestao' | 'equipe' = 'equipe',
  extra: { ocorrencia?: Record<string, unknown>; tabelas?: Cenario['tabelas'] } = {},
): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      obter_ocorrencia: { data: [extra.ocorrencia ?? ocorrencia()] },
      enviar_evidencia: { data: 1 },
      cancelar_envio: { data: null },
      conferir_evidencia: { data: null },
      comentar_ocorrencia: { data: 10 },
      registrar_prorrogacao: { data: 4 },
      solicitar_encerramento: { data: null },
      definir_meta_interna: { data: null },
    },
    tabelas: {
      evidencia: [],
      ocorrencia_historico: [],
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: 'm-carla', nome: 'Carla Menezes' },
        { id: EU, nome: 'Ana Ribeiro' },
      ],
      ...extra.tabelas,
    },
  }
}

const atrasada = ocorrencia({
  prazo_oficial_original: adicionarDias(hoje, -30),
  prazo_oficial_atual: adicionarDias(hoje, -30),
  criado_em: `${hoje}T11:00:00Z`,
  ciclo: 1,
})

async function anexar(usuario: ReturnType<typeof userEvent.setup>, ...arquivos: File[]) {
  await screen.findByRole('button', { name: 'Anexar arquivo' })
  const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!entrada) throw new Error('campo de arquivo ausente')
  await usuario.upload(entrada, arquivos)
}

function png(nome = 'foto.png') {
  return new File(['png'], nome, { type: 'image/png' })
}

function pdf(nome = 'oficio.pdf') {
  return new File(['%PDF-1.7\n'], nome, { type: 'application/pdf' })
}

describe('detalhe da ocorrência (DEM-01)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra breadcrumb, título, propriedades, descrição e a atividade', async () => {
    falso.reiniciar(
      cenario('equipe', {
        tabelas: {
          ocorrencia_historico: [
            historico(1, 'responsavel_definido', {
              instante: `${adicionarDias(hoje, -20)}T11:05:00Z`,
              detalhe: 'Ana Ribeiro',
            }),
            historico(2, 'comentario', {
              detalhe: '@Ana Ribeiro confere com a Embraco se a limpeza foi feita.',
              dados: { mencoes: [EU] },
            }),
          ],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Manutenção dos sistemas de efluentes',
    )
    const caminho = screen.getByRole('navigation', { name: 'Caminho' })
    expect(within(caminho).getByRole('link', { name: 'Embraco' })).toBeInTheDocument()
    expect(within(caminho).getByText('Condicionante 3.2.1.3')).toBeInTheDocument()
    expect(screen.getByText('A fazer')).toBeInTheDocument()
    expect(screen.queryByText('Atrasada')).not.toBeInTheDocument()
    expect(screen.getByText(/em 10 dias/)).toBeInTheDocument()
    expect(screen.getByText('Ciclo 2')).toBeInTheDocument()
    expect(screen.getByText('Gestão')).toBeInTheDocument()
    expect(screen.getByText(/Fazer a manutenção REGULAR/)).toBeInTheDocument()
    expect(screen.queryByText('Etapas')).not.toBeInTheDocument()

    const feed = await screen.findByRole('list', { name: 'Atividade da ocorrência' })
    expect(within(feed).getByText(/criou a ocorrência do Ciclo 2/)).toBeInTheDocument()
    expect(within(feed).getByText(/definiu Ana Ribeiro como responsável/)).toBeInTheDocument()
    expect(within(feed).getByText(/confere com a Embraco/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1 comentário/ })).toHaveAttribute(
      'href',
      '/ocorrencias/o1/atividade',
    )
  })

  it('ocorrência de outra consultoria ou inexistente', async () => {
    falso.reiniciar({ ...cenario(), rpc: { ...cenario().rpc, obter_ocorrencia: { data: [] } } })
    renderizarApp('/ocorrencias/o9')
    expect(await screen.findAllByText('Ocorrência não encontrada')).not.toHaveLength(0)
    expect(screen.getByText('Ela não existe ou não é da Filtroville.')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/ocorrencias/o1')
    await screen.findByRole('button', { name: 'Enviar para conferência' })
    await screen.findByRole('list', { name: 'Atividade da ocorrência' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('a Atividade tem tela própria no celular', async () => {
    renderizarApp('/ocorrencias/o1/atividade')
    expect(await screen.findByRole('heading', { name: 'Atividade' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para a ocorrência' })).toHaveAttribute(
      'href',
      '/ocorrencias/o1',
    )
    expect(
      await screen.findByPlaceholderText('Escreva um comentário. Use @ para mencionar.'),
    ).toBeInTheDocument()
  })
})

describe('envio para conferência (DEM-03, DEM-09)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('o botão nunca fica desabilitado: com pendência, marca os campos e não envia', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    const enviar = await screen.findByRole('button', { name: 'Enviar para conferência' })
    expect(screen.getByText('Pendente: arquivos, data de execução')).toBeInTheDocument()
    expect(enviar).toBeEnabled()

    await usuario.click(enviar)
    expect(screen.getAllByText('Obrigatório')).toHaveLength(2)
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('enviar_evidencia', expect.anything())
  })

  it('recusa data futura e avisa fora do ciclo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    const campo = await screen.findByLabelText('Data de execução *')

    await usuario.type(campo, formatarDataCivil(adicionarDias(hoje, 1)))
    expect(await screen.findByText('Data futura não permitida')).toBeInTheDocument()

    await usuario.clear(campo)
    await usuario.type(campo, formatarDataCivil(adicionarDias(hoje, -200)))
    expect(await screen.findByText(/^Fora do ciclo/)).toBeInTheDocument()
    expect(screen.queryByText('Data futura não permitida')).not.toBeInTheDocument()
  })

  it('envia vários arquivos com a data de execução e as observações', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await anexar(usuario, png('foto-1.png'), png('foto-2.png'))
    expect(await screen.findByText('foto-2.png')).toBeInTheDocument()

    const data = adicionarDias(hoje, -2)
    await usuario.type(screen.getByLabelText('Data de execução *'), formatarDataCivil(data))
    await usuario.type(screen.getByLabelText('Observações'), 'Feito pela Limpatec.')
    expect(screen.getByText('Pronto para enviar')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Enviar para conferência' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'enviar_evidencia',
        expect.objectContaining({
          p_ocorrencia_id: 'o1',
          p_data_execucao: data,
          p_observacoes: 'Feito pela Limpatec.',
          p_mantidos: [],
          p_arquivos: [
            expect.objectContaining({
              nome_original: 'foto-1.png',
              caminho: expect.stringMatching(
                /^c-Filtroville\/evidencia\/[0-9a-f-]+\.png$/,
              ) as unknown,
            }),
            expect.objectContaining({ nome_original: 'foto-2.png' }),
          ] as unknown,
        }) as unknown,
      )
    })
  })

  it('em conferência: leitura com miniaturas e "Cancelar envio" para quem enviou', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: {
          evidencia: [evidencia()],
          ocorrencia_historico: [
            historico(1, 'evidencia_enviada', {
              ator_id: EU,
              ator: { nome: 'Ana Ribeiro' },
              evidencia_numero: 1,
              dados: { evidencia_id: 'ev1', arquivos: 2 },
            }),
          ],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')

    expect(await screen.findByText('Em conferência')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Enviar para conferência' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Caixa 2 com óleo acima do normal.')).toBeInTheDocument()
    const feed = await screen.findByRole('list', { name: 'Atividade da ocorrência' })
    expect(within(feed).getByText(/enviou 2 arquivos para conferência/)).toBeInTheDocument()
    expect(
      within(feed).getByText(/alterou o status de A fazer para Em conferência/),
    ).toBeInTheDocument()

    // Só imagens entram no carrossel.
    await usuario.click(within(feed).getByRole('button', { name: 'Ver foto-antes.jpg' }))
    expect(await screen.findByText('1 de 1')).toBeInTheDocument()
    await usuario.keyboard('{Escape}')

    await usuario.click(screen.getByRole('button', { name: 'Cancelar envio' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('cancelar_envio', { p_evidencia_id: 'ev1' })
    })
  })

  it('quem não enviou não cancela', async () => {
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: {
          evidencia: [evidencia({ enviada_por: 'm-bruno', autor: { nome: 'Bruno Kist' } })],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText(/Enviada em/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar envio' })).not.toBeInTheDocument()
  })

  it('devolvida: mostra o motivo e reenvia mantendo os arquivos', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: ocorrencia({ situacao: 'aberta' }),
        tabelas: {
          evidencia: [
            evidencia({
              situacao: 'devolvida',
              conferencia: {
                decisao: 'devolvida',
                motivo: 'Faltam as fotos da caixa separadora 2.',
                decidida_em: '2026-11-04T20:40:00Z',
                conferente_id: 'm-carla',
                conferente: { nome: 'Carla Menezes' },
              },
            }),
          ],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')

    expect(await screen.findByText(/Devolvida por Carla Menezes/)).toBeInTheDocument()
    expect(screen.getByText('Faltam as fotos da caixa separadora 2.')).toBeInTheDocument()
    expect(screen.getByText('relatorio-limpeza.pdf')).toBeInTheDocument()
    expect(screen.getByLabelText('Data de execução *')).toHaveValue(
      formatarDataCivil(adicionarDias(hoje, -2)),
    )

    await usuario.click(screen.getByRole('button', { name: 'Remover foto-antes.jpg' }))
    await usuario.click(screen.getByRole('button', { name: 'Reenviar para conferência' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'enviar_evidencia',
        expect.objectContaining({ p_mantidos: ['v1'], p_arquivos: [] }) as unknown,
      )
    })
  })

  it('quem executa não vê concluir', async () => {
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: { evidencia: [evidencia({ situacao: 'aprovada' })] },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Aprovada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Concluir/ })).not.toBeInTheDocument()
  })

  it('a Gestão confere: devolver exige motivo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: {
          evidencia: [evidencia({ enviada_por: 'm-bruno', autor: { nome: 'Bruno Kist' } })],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('button', { name: 'Devolver para correção' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Falta a nota fiscal')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_evidencia', {
        p_evidencia_id: 'ev1',
        p_decisao: 'devolvida',
        p_motivo: 'Falta a nota fiscal',
      })
    })
  })
})

describe('atrasada: Regularizar (DEM-09)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario('equipe', { ocorrencia: atrasada }))
  })

  it('substitui a Evidência e marca atrasada; a importação aparece na atividade', async () => {
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByRole('heading', { name: 'Regularizar' })).toBeInTheDocument()
    expect(screen.getByText('Atrasada')).toBeInTheDocument()
    expect(screen.getByText(/há 30 dias/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Já foi feito/ })).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(
      await screen.findByText(/importou a ocorrência do histórico da licença/),
    ).toBeInTheDocument()
  })

  it('prazo prorrogado: ofício, novo prazo futuro e PDF', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('radio', { name: /Prazo prorrogado/ }))
    expect(screen.getByText('Pendente: ofício, novo prazo, PDF')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Registrar prorrogação' }))
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('registrar_prorrogacao', expect.anything())

    await usuario.type(screen.getByLabelText('Número do ofício *'), '1123/2026')
    await usuario.type(screen.getByLabelText('Novo prazo oficial *'), formatarDataCivil(hoje))
    expect(await screen.findByText('Use uma data futura')).toBeInTheDocument()

    const novo = adicionarDias(hoje, 60)
    await usuario.clear(screen.getByLabelText('Novo prazo oficial *'))
    await usuario.type(screen.getByLabelText('Novo prazo oficial *'), formatarDataCivil(novo))
    await anexar(usuario, pdf())
    expect(await screen.findByText('oficio.pdf')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Registrar prorrogação' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'registrar_prorrogacao',
        expect.objectContaining({
          p_ocorrencia_id: 'o1',
          p_numero_oficio: '1123/2026',
          p_novo_prazo: novo,
          p_nome_original: 'oficio.pdf',
          p_caminho: expect.stringMatching(
            /^c-Filtroville\/prorrogacao\/[0-9a-f-]+\.pdf$/,
          ) as unknown,
        }) as unknown,
      )
    })
    expect(await screen.findByText('Prorrogação registrada')).toBeInTheDocument()
  })

  it('não se aplica: pede encerramento à Gestão com justificativa', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('radio', { name: /Não se aplica/ }))
    await usuario.click(screen.getByRole('button', { name: 'Solicitar encerramento' }))
    expect(screen.getByText('Pendente: justificativa')).toBeInTheDocument()
    expect(screen.getByText('Obrigatório')).toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Justificativa *'), 'CSAOs desativadas em 2021')
    await usuario.click(screen.getByRole('button', { name: 'Solicitar encerramento' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'solicitar_encerramento',
        expect.objectContaining({
          p_ocorrencia_id: 'o1',
          p_justificativa: 'CSAOs desativadas em 2021',
        }) as unknown,
      )
    })
    expect(await screen.findByText('Encerramento solicitado')).toBeInTheDocument()
    expect(screen.getByText('Aguardando decisão da Gestão.')).toBeInTheDocument()
  })

  it('pedido de encerramento pendente aparece ao abrir', async () => {
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: { ...atrasada, encerramento_solicitado_em: `${hoje}T12:00:00Z` },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Encerramento solicitado')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { checked: true })).not.toBeInTheDocument()
  })

  it('fazer agora: salva a nova meta interna', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('radio', { name: /Fazer agora/ }))
    expect(screen.getByText('Pendente: data')).toBeInTheDocument()

    const meta = adicionarDias(hoje, 7)
    await usuario.type(screen.getByLabelText('Nova meta interna *'), formatarDataCivil(meta))
    await usuario.click(screen.getByRole('button', { name: 'Salvar meta' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_meta_interna', {
        p_ocorrencia_id: 'o1',
        p_meta: meta,
      })
    })
    expect(await screen.findByText('Meta salva')).toBeInTheDocument()
  })
})

describe('comentários (Atividade)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('menciona com @ e grava o comentário com as menções', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    const campo = await screen.findByRole('textbox', { name: 'Comentário' })

    await usuario.type(campo, 'Pedi a NF para @Bru')
    const opcoes = await screen.findByRole('listbox', { name: 'Pessoas para mencionar' })
    expect(within(opcoes).getAllByRole('option')).toHaveLength(1)
    await usuario.keyboard('{Enter}')
    expect(campo).toHaveValue('Pedi a NF para @Bruno Kist ')

    await usuario.type(campo, 'hoje.')
    await usuario.click(screen.getByRole('button', { name: 'Comentar' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'comentar_ocorrencia',
        expect.objectContaining({
          p_ocorrencia_id: 'o1',
          p_texto: 'Pedi a NF para @Bruno Kist hoje.',
          p_mencoes: ['m-bruno'],
        }) as unknown,
      )
    })
    await vi.waitFor(() => {
      expect(campo).toHaveValue('')
    })
  })

  it('comentário vazio não é gravado', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('button', { name: 'Comentar' }))
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('comentar_ocorrencia', expect.anything())
  })
})
