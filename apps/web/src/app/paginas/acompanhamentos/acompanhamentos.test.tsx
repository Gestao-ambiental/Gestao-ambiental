import { adicionarDias, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')
const dm = (dias: number) => formatarDataCivil(adicionarDias(hoje, dias)).slice(0, 5)

function renovacao(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    instrumento_id: 'i1',
    licenca: 'LAO 4821/2023',
    orgao: 'IMA',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    validade: adicionarDias(hoje, 126),
    dias_limite_protocolo: 120,
    antecedencia_dias: 30,
    protocolado_em: null,
    protocolo_numero: null,
    hoje,
    total: 2,
    ...extra,
  }
}

function plano(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ...renovacao({
      instrumento_id: 'i2',
      licenca: 'LAO 2207/2023',
      empreendimento_nome: 'Laticínios Serra Azul',
      validade: adicionarDias(hoje, 147),
    }),
    consultoria_id: 'c-Filtroville',
    comprovante_caminho: null,
    comprovante_nome: null,
    comprovante_tamanho: null,
    registrado_por_nome: null,
    registrado_em: null,
    row_version: 1,
    ...extra,
  }
}

function cenario(
  papel: 'gestao' | 'equipe' = 'gestao',
  rpc: NonNullable<Cenario['rpc']> = {},
): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_aguardando_conferencia: {
        data: [
          {
            ocorrencia_id: 'o1',
            codigo: '4.2',
            titulo: 'Relatório de automonitoramento',
            empreendimento_nome: 'Metalúrgica Rio Cubatão',
            responsavel_nome: 'Bruno Kist',
            conferente_nome: null,
            evidencia_numero: 1,
            enviada_em: new Date(Date.now() - 3 * 3600_000).toISOString(),
            total: 1,
          },
        ],
      },
      listar_renovacoes: {
        data: [
          renovacao(),
          renovacao({
            id: 'p2',
            instrumento_id: 'i2',
            licenca: 'LAO 2207/2023',
            empreendimento_nome: 'Laticínios Serra Azul',
            validade: adicionarDias(hoje, 147),
          }),
        ],
      },
      obter_plano_renovacao: { data: [plano()] },
      definir_antecedencia_renovacao: { data: 2 },
      registrar_protocolo: { data: 2 },
      ...rpc,
    },
  }
}

describe('Acompanhamentos (EQ-05)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra as conferências pendentes e as renovações com limite e situação', async () => {
    renderizarApp('/acompanhamentos')

    const conferencias = await screen.findByRole('region', { name: 'Aguardando conferência' })
    const [linhaConferencia] = await within(conferencias).findAllByRole('link', {
      name: /Relatório de automonitoramento/,
    })
    expect(linhaConferencia).toHaveAttribute('href', '/ocorrencias/o1')
    expect(within(conferencias).getAllByText('Gestão').length).toBeGreaterThan(0)
    expect(within(conferencias).getAllByText(/3 h/).length).toBeGreaterThan(0)

    const renovacoes = await screen.findByRole('region', { name: 'Renovações no radar' })
    await within(renovacoes).findAllByText('Protocolo em 6 dias')
    expect(within(renovacoes).getAllByText('Protocolo em 6 dias').length).toBeGreaterThan(0)
    expect(within(renovacoes).getAllByText(`Em preparação · ${dm(-3)}`).length).toBeGreaterThan(0)
    expect(
      within(renovacoes).getAllByText(formatarDataCivil(adicionarDias(hoje, 6))).length,
    ).toBeGreaterThan(0)
    expect(within(renovacoes).getAllByRole('link', { name: 'LAO 4821/2023' })[0]).toHaveAttribute(
      'href',
      '/renovacoes/i1',
    )
  })

  it('listas vazias explicam o que aparece ali', async () => {
    falso.reiniciar(
      cenario('equipe', {
        listar_aguardando_conferencia: { data: [] },
        listar_renovacoes: { data: [] },
      }),
    )
    renderizarApp('/acompanhamentos')
    expect(await screen.findByText('Nenhuma evidência aguardando conferência.')).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma LAO ativa para renovar.')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/acompanhamentos')
    await screen.findAllByText('Protocolo em 6 dias')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('plano de renovação (REN-01)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra preparação, limite e vencimento sem cálculo manual e as etapas', async () => {
    renderizarApp('/renovacoes/i2')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Renovação da LAO 2207/2023',
    )
    expect(screen.getByText(`Em preparação · ${dm(-3)}`)).toBeInTheDocument()
    expect(screen.getByText('Limite de protocolo')).toBeInTheDocument()
    expect(
      screen.getByText(
        `Início da preparação ${formatarDataCivil(adicionarDias(hoje, -3))} · limite continua ${formatarDataCivil(adicionarDias(hoje, 27))}`,
      ),
    ).toBeInTheDocument()
    const etapas = screen.getByRole('region', { name: 'Etapas preparatórias' })
    expect(within(etapas).getAllByRole('listitem')).toHaveLength(4)
    expect(within(etapas).getByText('Protocolar pedido de renovação')).toBeInTheDocument()
    expect(
      screen.getByText(
        `Protocolar no prazo não prorroga a licença automaticamente. A validade original continua ${formatarDataCivil(adicionarDias(hoje, 147))}.`,
      ),
    ).toBeInTheDocument()
  })

  it('trocar 30 por 60 move só o início da preparação; a Gestão salva', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/renovacoes/i2')
    const campo = await screen.findByLabelText('Antecedência adicional (dias)')
    await usuario.clear(campo)
    await usuario.type(campo, '60')
    expect(
      screen.getByText(
        `Início da preparação ${formatarDataCivil(adicionarDias(hoje, -33))} · limite continua ${formatarDataCivil(adicionarDias(hoje, 27))}`,
      ),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar antecedência' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_antecedencia_renovacao', {
        p_plano_id: 'p1',
        p_antecedencia: 60,
        p_row_version: 1,
      })
    })
  })

  it('Equipe vê o plano, mas não muda a antecedência nem protocola', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/renovacoes/i2')
    expect(await screen.findByLabelText('Antecedência adicional (dias)')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Registrar protocolo' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Só a Gestão muda a antecedência e registra o protocolo.'),
    ).toBeInTheDocument()
  })

  it('licença sem plano ou de outra consultoria', async () => {
    falso.reiniciar(cenario('gestao', { obter_plano_renovacao: { data: [] } }))
    renderizarApp('/renovacoes/i9')
    expect(await screen.findAllByText('Plano de renovação não encontrado')).not.toHaveLength(0)
  })
})

describe('protocolo (REN-02)', () => {
  it('exige número, data e comprovante e registra', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario())
    renderizarApp('/renovacoes/i2')

    await usuario.click(await screen.findByRole('button', { name: 'Registrar protocolo' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar protocolo' }))
    expect(within(dialogo).getByText('Informe o número do protocolo')).toBeInTheDocument()
    expect(within(dialogo).getByText('Informe a data do protocolo')).toBeInTheDocument()
    expect(within(dialogo).getByText('Anexe o comprovante')).toBeInTheDocument()

    await usuario.type(within(dialogo).getByLabelText('Número do protocolo *'), 'IMA 2026/558812')
    await usuario.type(within(dialogo).getByLabelText('Data *'), adicionarDias(hoje, -1))
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(entrada, new File(['png'], 'comprovante.png', { type: 'image/png' }))
    expect(await within(dialogo).findByText(/comprovante\.png/)).toBeInTheDocument()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar protocolo' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'registrar_protocolo',
        expect.objectContaining({
          p_plano_id: 'p1',
          p_numero: 'IMA 2026/558812',
          p_data: adicionarDias(hoje, -1),
          p_nome_original: 'comprovante.png',
          p_row_version: 1,
          p_caminho: expect.stringMatching(
            /^c-Filtroville\/protocolo\/[0-9a-f-]+\.png$/,
          ) as unknown,
        }) as unknown,
      )
    })
  })

  it('depois do protocolo: aviso com número e data, sem novo protocolo nem antecedência', async () => {
    falso.reiniciar(
      cenario('gestao', {
        obter_plano_renovacao: {
          data: [
            plano({
              protocolado_em: adicionarDias(hoje, -2),
              protocolo_numero: 'IMA 2026/558812',
              comprovante_caminho: 'c-Filtroville/protocolo/x.pdf',
              comprovante_nome: 'Comprovante protocolo IMA.pdf',
              comprovante_tamanho: 327680,
              registrado_por_nome: 'Ana Ribeiro',
              registrado_em: new Date().toISOString(),
              row_version: 2,
            }),
          ],
        },
      }),
    )
    renderizarApp('/renovacoes/i2')
    expect(
      await screen.findByText(
        `Protocolada em ${formatarDataCivil(adicionarDias(hoje, -2))} · protocolo IMA 2026/558812`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Protocolada')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Comprovante protocolo IMA.pdf' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar protocolo' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Antecedência adicional (dias)')).toBeDisabled()
  })
})
