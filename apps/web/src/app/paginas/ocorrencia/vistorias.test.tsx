import { adicionarDias, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function ocorrencia(extra: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    consultoria_id: 'c-Filtroville',
    instrumento_id: 'i1',
    ciclo: 1,
    codigo: '4.2',
    titulo: 'Laudo de resíduos',
    texto_literal: 'Manter o abrigo de resíduos.',
    licenca: 'LAO 4821/2023',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    unidade_nome: 'Unidade Norte',
    prazo_oficial_original: adicionarDias(hoje, 10),
    prazo_oficial_atual: adicionarDias(hoje, 10),
    meta_interna: null,
    prazo_ciclo_anterior: null,
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
    row_version: 1,
    ...extra,
  }
}

function cenario(extra: { ocorrencia?: Record<string, unknown>; rpc?: Cenario['rpc'] } = {}) {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      obter_ocorrencia: { data: [extra.ocorrencia ?? ocorrencia()] },
      listar_vistorias: {
        data: [
          {
            id: 'v1',
            ocorrencia_id: 'o1',
            titulo: 'Inspeção do abrigo',
            responsavel_id: 'm-bruno',
            responsavel_nome: 'Bruno Kist',
            data_planejada: hoje,
            hora_planejada: '09:30:00',
            duracao_minutos: null,
            situacao: 'em_andamento',
            enviada_em: null,
            condicionante_codigo: '4.2',
            empreendimento_nome: 'Indústria Horizonte',
            unidade_nome: 'Unidade Norte',
            licenca: null,
            total_itens: 4,
            itens_registrados: 1,
            hoje,
            total: 1,
          },
        ],
      },
      criar_vistoria: { data: 'v2' },
      ...extra.rpc,
    },
    tabelas: {
      etapa: [],
      evidencia: [],
      ocorrencia_historico: [],
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: 'm-Filtroville', nome: 'Ana Ribeiro' },
      ],
    },
  } satisfies Cenario
}

describe('vistorias na ocorrência (ADR-0033)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('lista as vistorias da ocorrência com link para o Campo', async () => {
    renderizarApp('/ocorrencias/o1')
    const secao = await screen.findByRole('region', { name: 'Vistorias' })
    const link = await within(secao).findByRole('link', { name: 'Inspeção do abrigo' })
    expect(link).toHaveAttribute('href', '/campo/v1')
    expect(
      within(secao).getByText(`${formatarDataCivil(hoje)} às 09:30 · Bruno Kist · 1 de 4 itens`),
    ).toBeInTheDocument()
    expect(within(secao).getByText('Em andamento')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_vistorias',
      expect.objectContaining({
        p_consultoria_id: 'c-Filtroville',
        p_ocorrencia_id: 'o1',
        p_somente_minhas: false,
      }),
    )
  })

  it('agenda com os itens sugeridos, editados, e id gerado na tela', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/ocorrencias/o1')

    await usuario.click(await screen.findByRole('button', { name: 'Agendar vistoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agendar vistoria' })
    expect(within(dialogo).getByLabelText('Item 1')).toHaveValue('Registrar área visitada')

    await usuario.click(within(dialogo).getByRole('button', { name: 'Agendar' }))
    expect(within(dialogo).getByText('Informe o título')).toBeInTheDocument()
    expect(within(dialogo).getByText('Informe a data')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('criar_vistoria', expect.anything())

    await usuario.type(within(dialogo).getByLabelText('Título'), 'Vistoria do abrigo')
    await usuario.type(
      within(dialogo).getByLabelText('Data'),
      formatarDataCivil(adicionarDias(hoje, 2)),
    )
    await usuario.type(within(dialogo).getByLabelText('Duração (min)'), '45')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Remover item 4' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Adicionar item' }))
    await usuario.type(within(dialogo).getByLabelText('Item 4'), 'Conferir extintores')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Agendar' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'criar_vistoria',
      expect.objectContaining({
        p_id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        p_ocorrencia_id: 'o1',
        p_titulo: 'Vistoria do abrigo',
        p_data: adicionarDias(hoje, 2),
        p_hora: null,
        p_duracao_minutos: 45,
        p_responsavel_id: 'm-Filtroville',
        p_itens: [
          { titulo: 'Registrar área visitada', descricao: 'Área identificada no empreendimento' },
          { titulo: 'Registrar condições observadas', descricao: 'Nota ou foto das condições' },
          { titulo: 'Identificar acompanhante', descricao: 'Contato registrado na visita' },
          { titulo: 'Conferir extintores', descricao: null },
        ],
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ocorrência concluída não agenda', async () => {
    falso.reiniciar(cenario({ ocorrencia: ocorrencia({ situacao: 'concluida' }) }))
    renderizarApp('/ocorrencias/o1')
    await screen.findByRole('region', { name: 'Vistorias' })
    expect(screen.queryByRole('button', { name: 'Agendar vistoria' })).not.toBeInTheDocument()
  })
})
