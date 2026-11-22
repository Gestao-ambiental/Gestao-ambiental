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
    documento_versao_id: 'v1',
    autor: { nome: 'Bruno Kist' },
    versao: {
      caminho: 'c-Filtroville/evidencia/v1.pdf',
      nome_original: 'laudo.pdf',
      tamanho_bytes: 2048,
      sha256: 'a'.repeat(64),
      conferencia_de_arquivo: null,
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
      concluir_etapa: { data: null },
      atribuir_ocorrencia: { data: null },
      concluir_sem_evidencia: { data: 4 },
      conferir_evidencia: { data: null },
      concluir_ocorrencia: { data: 4 },
      reabrir_ocorrencia: { data: 4 },
      obter_evidencia_aprovada: { data: [] },
    },
    funcoes: { 'conferir-arquivo': { data: { confere: true, sha256: 'a'.repeat(64) } } },
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

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('4.2 Laudo de ruído')
    expect(screen.getByText('A fazer')).toBeInTheDocument()
    expect(screen.getByText('Ciclo 2')).toBeInTheDocument()
    expect(screen.getByText('Apresentar laudo de ruído semestral.')).toBeInTheDocument()
    expect(await screen.findByText('Concluir a etapa “Coletar medições”')).toBeInTheDocument()
    expect(screen.getByText(/em 10 dias/)).toBeInTheDocument()
    expect(screen.getByText('Qualquer pessoa da Gestão')).toBeInTheDocument()
    expect(await screen.findByText(/criou a etapa “Coletar medições”/)).toBeInTheDocument()
  })

  it('a próxima ação é o botão principal: concluir a etapa pendente', async () => {
    const usuario = userEvent.setup()
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
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    const lista = await screen.findByRole('list', { name: 'Etapas' })
    expect(
      within(lista).getByRole('button', { name: 'Concluir etapa Coletar medições' }),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir etapa' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('concluir_etapa', { p_etapa_id: 'et1' })
    })
  })

  it('sem etapa pendente, o botão principal leva ao envio da evidência', async () => {
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Enviar a evidência para conferência')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar evidência' })).toBeInTheDocument()
    expect(screen.getByText('Nenhuma etapa.')).toBeInTheDocument()
  })

  it('erro ao concluir a etapa aparece no topo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      ...cenario('equipe', {
        tabelas: {
          etapa: [
            {
              id: 'et1',
              titulo: 'Coletar medições',
              modo: 'espera_externa',
              responsavel_externo: 'Laboratório',
              meta: null,
              horas_estimadas: null,
              concluida_em: null,
              responsavel: null,
            },
          ],
        },
      }),
      rpc: {
        ...cenario().rpc,
        concluir_etapa: { error: { message: 'falhou', code: 'XX000' } },
      },
    })
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText(/Espera externa · Laboratório/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Concluir etapa' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
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

    await usuario.type(
      screen.getByLabelText('Data real de execução *'),
      formatarDataCivil(adicionarDias(hoje, 1)),
    )
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
    await usuario.type(
      screen.getByLabelText('Data real de execução *'),
      formatarDataCivil(dataAntiga),
    )
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
    // Depois do envio, o servidor confere o hash da mesma versão.
    const envio = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'enviar_evidencia')
    await vi.waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('conferir-arquivo', {
        body: { versaoId: (envio?.[1] as { p_versao_id: string }).p_versao_id },
      })
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
    // Antes de aprovar, o servidor conferiu o hash da versão.
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('conferir-arquivo', {
      body: { versaoId: 'v1' },
    })
  })

  it('arquivo diferente do enviado: não aprova e diz por quê', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      ...cenario('gestao', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: { evidencia: [evidencia()] },
      }),
      funcoes: { 'conferir-arquivo': { data: { confere: false, sha256: 'f'.repeat(64) } } },
    })
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('button', { name: 'Aprovar' }))
    expect(
      await screen.findByText(
        'O arquivo guardado não é igual ao enviado. Devolva para um novo envio.',
      ),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('conferir_evidencia', expect.anything())
  })
})

describe('evidência que vale (piloto 2a)', () => {
  function aprovada(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      evidencia_id: 'ev2',
      numero: 2,
      versao_id: 'v2',
      caminho: 'c-Filtroville/evidencia/v2.pdf',
      nome_original: 'laudo-v2.pdf',
      sha256: '0123456789abcdef'.repeat(4),
      arquivo_confere: true,
      arquivo_conferido_em: '2026-10-17T12:00:00Z',
      data_execucao: adicionarDias(hoje, -3),
      enviada_por_nome: 'Bruno Kist',
      enviada_em: '2026-10-16T13:00:00Z',
      conferente_nome: 'Ana Ribeiro',
      conferida_em: '2026-10-17T12:30:00Z',
      concluida_por_nome: 'Ana Ribeiro',
      concluida_em: '2026-10-18T14:00:00Z',
      ...extra,
    }
  }

  function comAprovada(
    papel: 'gestao' | 'equipe',
    resposta: { data?: unknown; error?: unknown },
    extra: { ocorrencia?: Record<string, unknown> } = {},
  ): Cenario {
    const base = cenario(papel, extra)
    return { ...base, rpc: { ...base.rpc, obter_evidencia_aprovada: resposta } }
  }

  it('mostra a versão aprovada, quem enviou, quem conferiu, quem concluiu e o hash', async () => {
    const usuario = userEvent.setup()
    const copiar = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: copiar },
      configurable: true,
    })
    falso.reiniciar(
      comAprovada(
        'gestao',
        { data: [aprovada()] },
        { ocorrencia: ocorrencia({ situacao: 'concluida', concluida_em: '2026-10-18T14:00:00Z' }) },
      ),
    )
    renderizarApp('/ocorrencias/o1')

    const destaque = await screen.findByRole('region', { name: 'Aprovada: v2' })
    expect(within(destaque).getByText(/Enviada por Bruno Kist em 16\/10\/2026/)).toBeInTheDocument()
    expect(
      within(destaque).getByText(/conferida por Ana Ribeiro em 17\/10\/2026/),
    ).toBeInTheDocument()
    expect(
      within(destaque).getByText(/Concluída por Ana Ribeiro em 18\/10\/2026/),
    ).toBeInTheDocument()
    expect(within(destaque).getByText('Arquivo conferido')).toBeInTheDocument()
    expect(within(destaque).getByText('01234567…cdef')).toBeInTheDocument()

    await usuario.click(within(destaque).getByRole('button', { name: 'Copiar SHA-256' }))
    expect(copiar).toHaveBeenCalledWith('0123456789abcdef'.repeat(4))
    expect(await within(destaque).findByText('Copiado')).toBeInTheDocument()

    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    await usuario.click(within(destaque).getByRole('button', { name: 'Baixar laudo-v2.pdf' }))
    await vi.waitFor(() => {
      expect(abrir).toHaveBeenCalledWith(
        'https://falso.test/c-Filtroville/evidencia/v2.pdf',
        '_blank',
        'noopener,noreferrer',
      )
    })
    abrir.mockRestore()
  })

  it('aprovada antes da conferência no servidor: oferece conferir o arquivo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      comAprovada(
        'gestao',
        {
          data: [aprovada({ arquivo_confere: null, concluida_por_nome: null, concluida_em: null })],
        },
        { ocorrencia: ocorrencia({ situacao: 'em_conferencia' }) },
      ),
    )
    renderizarApp('/ocorrencias/o1')
    const destaque = await screen.findByRole('region', { name: 'Aprovada: v2' })
    expect(within(destaque).getByText('Arquivo não conferido')).toBeInTheDocument()
    expect(within(destaque).queryByText(/Concluída por/)).not.toBeInTheDocument()
    await usuario.click(within(destaque).getByRole('button', { name: 'Conferir arquivo' }))
    await vi.waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('conferir-arquivo', {
        body: { versaoId: 'v2' },
      })
    })
  })

  it('sem evidência aprovada não há destaque', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Aprovada:/ })).not.toBeInTheDocument()
  })

  it('erro ao ler a evidência aprovada aparece com nova tentativa', async () => {
    falso.reiniciar(comAprovada('gestao', { error: { message: 'falhou' } }))
    renderizarApp('/ocorrencias/o1')
    expect(
      await screen.findByText(/Não foi possível carregar a evidência aprovada/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('só a Gestão tem o link da auditoria', async () => {
    falso.reiniciar(cenario('gestao'))
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByRole('link', { name: 'Auditoria' })).toHaveAttribute(
      'href',
      '/ocorrencias/o1/auditoria',
    )
  })

  it('a Equipe não vê o link da auditoria', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Auditoria' })).not.toBeInTheDocument()
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
    expect(await screen.findByText('Nada pendente')).toBeInTheDocument()
    expect(screen.getByText(/^Concluída por Ana Ribeiro em/)).toBeInTheDocument()
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

  it('a Equipe vê a evidência aprovada, mas só a Gestão conclui', async () => {
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: ocorrencia({ situacao: 'em_conferencia' }),
        tabelas: { evidencia: [evidencia({ situacao: 'aprovada' })] },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Concluir a ocorrência')).toBeInTheDocument()
    expect(screen.getByText('Só a Gestão conclui.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Concluir ocorrência' })).not.toBeInTheDocument()
  })

  it('devolvida: o motivo aparece no topo e a Gestão conclui sem evidência pelo menu', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        tabelas: {
          evidencia: [
            evidencia({
              situacao: 'devolvida',
              conferencia: {
                decisao: 'devolvida',
                motivo: 'Falta a ART',
                decidida_em: '2026-10-17T13:00:00Z',
                conferente: { nome: 'Helena' },
              },
            }),
          ],
        },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Corrigir e reenviar a evidência')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar evidência' })).toBeInTheDocument()
    expect(screen.getAllByText(/Falta a ART/).length).toBeGreaterThan(0)

    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Concluir sem evidência' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Concluir sem evidência' }))
    expect(within(dialogo).getByText('Informe a justificativa')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Justificativa'), 'Órgão dispensou')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Concluir sem evidência' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('concluir_sem_evidencia', {
        p_ocorrencia_id: 'o1',
        p_justificativa: 'Órgão dispensou',
        p_row_version: 3,
      })
    })
  })
})

describe('pessoas', () => {
  it('sem responsável, a Gestão atribui ali mesmo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', {
        ocorrencia: ocorrencia({ responsavel_id: null, responsavel_nome: null }),
      }),
    )
    renderizarApp('/ocorrencias/o1')
    await usuario.click(await screen.findByRole('button', { name: 'Atribuir responsável' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Bruno Kist' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('atribuir_ocorrencia', {
        p_ocorrencia_id: 'o1',
        p_membro_id: 'm-bruno',
        p_row_version: 3,
      })
    })
  })

  it('a Equipe só lê "Sem responsável"', async () => {
    falso.reiniciar(
      cenario('equipe', {
        ocorrencia: ocorrencia({ responsavel_id: null, responsavel_nome: null }),
      }),
    )
    renderizarApp('/ocorrencias/o1')
    expect(await screen.findByText('Sem responsável')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Atribuir responsável' })).not.toBeInTheDocument()
  })
})
