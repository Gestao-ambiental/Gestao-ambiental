import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
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
    codigo: '4.2',
    titulo: 'Laudo de ruído',
    texto_literal: 'Apresentar laudo de ruído semestral.',
    licenca: 'LAO 4821/2023',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    prazo_oficial_original: adicionarDias(hoje, 10),
    prazo_oficial_atual: adicionarDias(hoje, 10),
    meta_interna: null,
    prazo_ciclo_anterior: adicionarDias(hoje, -170),
    data_referencia: null,
    hoje,
    situacao: 'aberta',
    responsavel_id: 'm-bruno',
    responsavel_nome: 'Bruno Kist',
    conferente_id: null,
    conferente_nome: null,
    concluida_em: null,
    concluida_por_nome: null,
    concluida_sem_evidencia: false,
    conferencia_independente: true,
    row_version: 3,
    ...extra,
  }
}

function evidencia(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'ev1',
    numero: 1,
    situacao: 'em_conferencia',
    data_execucao: adicionarDias(hoje, -2),
    enviada_em: '2026-10-16T13:00:00Z',
    enviada_por: 'm-bruno',
    autor: { nome: 'Bruno Kist' },
    versao: {
      caminho: 'c-Filtroville/evidencia/v1.pdf',
      nome_original: 'laudo.pdf',
      tamanho_bytes: 2048,
    },
    conferencia: null,
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
      obter_ocorrencia: { data: extra.ocorrencia ? [extra.ocorrencia] : [ocorrencia()] },
      enviar_evidencia: { data: 1 },
      conferir_evidencia: { data: null },
      concluir_ocorrencia: { data: 4 },
      reabrir_ocorrencia: { data: 4 },
    },
    tabelas: {
      etapa: [],
      evidencia: [],
      ocorrencia_historico: [],
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: EU, nome: 'Ana Ribeiro' },
      ],
      ...extra.tabelas,
    },
  }
}

describe('detalhe da ocorrência (DEM-01, DEM-02)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra origem, situação, próxima ação, datas e pessoas', async () => {
    falso.reiniciar(
      cenario('equipe', {
        tabelas: {
          etapa: [
            {
              id: 'et1',
              titulo: 'Coletar medições',
              modo: 'trabalho',
              responsavel_externo: null,
              meta: null,
              horas_estimadas: 4,
              concluida_em: null,
              responsavel: { nome: 'Bruno Kist' },
            },
          ],
          ocorrencia_historico: [
            {
              id: 1,
              tipo: 'etapa_criada',
              instante: '2026-10-15T12:00:00Z',
              evidencia_numero: null,
              detalhe: 'Coletar medições',
              ator: { nome: 'Bruno Kist' },
            },
          ],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      '4.2 · Laudo de ruído',
    )
    expect(screen.getByText('A fazer')).toBeInTheDocument()
    expect(screen.getByText('Ciclo 2')).toBeInTheDocument()
    expect(screen.getByText('Apresentar laudo de ruído semestral.')).toBeInTheDocument()
    expect(await screen.findByText('Concluir a etapa “Coletar medições”')).toBeInTheDocument()
    expect(screen.getByText(/em 10 dias/)).toBeInTheDocument()
    expect(screen.getByText('Qualquer pessoa da Gestão')).toBeInTheDocument()
    expect(screen.getByText('Só a Gestão conclui, depois da aprovação.')).toBeInTheDocument()
    expect(await screen.findByText(/criou a etapa “Coletar medições”/)).toBeInTheDocument()
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
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('evidência (DEM-03, DEM-09)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  async function escolherArquivo(usuario: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Escolher arquivo' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(entrada, new File(['png'], 'foto.png', { type: 'image/png' }))
    expect(await screen.findByText(/foto\.png/)).toBeInTheDocument()
  }

  it('exige a data real de execução e recusa data futura', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await escolherArquivo(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Enviar para conferência' }))
    expect(await screen.findByText('Informe a data real de execução')).toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Data real de execução *'), adicionarDias(hoje, 1))
    await usuario.click(screen.getByRole('button', { name: 'Enviar para conferência' }))
    expect(
      await screen.findByText('A data real de execução não pode estar no futuro'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('enviar_evidencia', expect.anything())
  })

  it('avisa fora do ciclo e envia com a data real', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')
    await escolherArquivo(usuario)

    const dataAntiga = adicionarDias(hoje, -200)
    await usuario.type(screen.getByLabelText('Data real de execução *'), dataAntiga)
    expect(await screen.findByText(/fora deste ciclo/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Enviar para conferência' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'enviar_evidencia',
        expect.objectContaining({
          p_ocorrencia_id: 'o1',
          p_data_execucao: dataAntiga,
          p_nome_original: 'foto.png',
          p_caminho: expect.stringMatching(
            /^c-Filtroville\/evidencia\/[0-9a-f-]+\.png$/,
          ) as unknown,
        }) as unknown,
      )
    })
  })

  it('quem enviou não confere: a tela explica e não oferece aprovar', async () => {
    falso.reiniciar(
      cenario('gestao', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: { evidencia: [evidencia({ enviada_por: EU, autor: { nome: 'Ana Ribeiro' } })] },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(
      await screen.findByText('Você enviou esta evidência. Outra pessoa precisa conferir.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
  })

  it('a Gestão aprova; devolver exige motivo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: { evidencia: [evidencia()] },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    const versoes = await screen.findByRole('list', { name: 'Versões da evidência' })
    expect(within(versoes).getByText('Em conferência')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Devolver para correção' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Falta a assinatura do técnico')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_evidencia', {
        p_evidencia_id: 'ev1',
        p_decisao: 'devolvida',
        p_motivo: 'Falta a assinatura do técnico',
      })
    })

    await usuario.click(screen.getByRole('button', { name: 'Aprovar' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_evidencia', {
        p_evidencia_id: 'ev1',
        p_decisao: 'aprovada',
        p_motivo: '',
      })
    })
  })
})

describe('conclusão (DEM-04)', () => {
  it('a Gestão conclui depois da aprovação, com a versão lida', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: {
          evidencia: [
            evidencia({
              situacao: 'aprovada',
              conferencia: {
                decisao: 'aprovada',
                motivo: null,
                decidida_em: '2026-10-17T13:00:00Z',
                conferente: { nome: 'Ana Ribeiro' },
              },
            }),
          ],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Concluir a ocorrência')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Concluir ocorrência' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('concluir_ocorrencia', {
        p_ocorrencia_id: 'o1',
        p_row_version: 3,
      })
    })
  })

  it('concluída: sem envio; reabrir exige motivo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        ocorrencia: ocorrencia({
          situacao: 'concluida',
          concluida_em: '2026-10-17T14:00:00Z',
          concluida_por_nome: 'Ana Ribeiro',
        }),
        tabelas: { evidencia: [evidencia({ situacao: 'aprovada' })] },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(
      await screen.findByText('Ocorrência concluída. Para enviar algo novo, reabra com motivo.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Enviar para conferência' }),
    ).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Reabrir' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reabrir' }))
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Órgão pediu complemento')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reabrir' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('reabrir_ocorrencia', {
        p_ocorrencia_id: 'o1',
        p_motivo: 'Órgão pediu complemento',
        p_row_version: 3,
      })
    })
  })
})
