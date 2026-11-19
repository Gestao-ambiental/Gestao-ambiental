// Conferência do relatório por IA (ADR-0036, fatia 3): o resultado aparece para quem confere e para
// quem enviou; quem enviou dispara a conferência; falha mostra o motivo e permite tentar de novo; a
// evidência aceita .docx, e o comprovante de protocolo não.
import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { conferirArquivoDeEvidencia, MIME_DOCX } from '@/lib/api/ocorrencias'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')
const EU = 'm-Filtroville'

const ocorrencia = {
  id: 'o1',
  consultoria_id: 'c-Filtroville',
  instrumento_id: 'i1',
  ciclo: 1,
  codigo: '4.1',
  titulo: 'Monitoramento de efluentes',
  texto_literal: 'Apresentar relatório semestral de efluentes.',
  licenca: 'LAO 4821/2023',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  unidade_nome: 'Matriz',
  prazo_oficial_original: adicionarDias(hoje, 10),
  prazo_oficial_atual: adicionarDias(hoje, 10),
  meta_interna: null,
  prazo_ciclo_anterior: null,
  data_referencia: null,
  hoje,
  situacao: 'em_conferencia',
  responsavel_id: 'm-bruno',
  responsavel_nome: 'Bruno Kist',
  conferente_id: null,
  conferente_nome: null,
  concluida_em: null,
  concluida_por_nome: null,
  concluida_sem_evidencia: false,
  conferencia_independente: true,
  row_version: 3,
}

function evidencia(enviadaPor: string) {
  return {
    id: 'ev1',
    numero: 1,
    situacao: 'em_conferencia',
    data_execucao: adicionarDias(hoje, -2),
    enviada_em: '2026-11-18T13:00:00Z',
    enviada_por: enviadaPor,
    autor: { nome: enviadaPor === EU ? 'Ana Ribeiro' : 'Bruno Kist' },
    versao: {
      caminho: 'c-Filtroville/evidencia/v1.docx',
      nome_original: 'Relatório.docx',
      tamanho_bytes: 4096,
      mime: MIME_DOCX,
    },
    conferencia: null,
  }
}

const concluida = {
  id: 'ci1',
  evidencia_id: 'ev1',
  situacao: 'concluida',
  motivo: null,
  resumo: 'Dois pontos antes de mandar à Gestão.',
  apontamentos: [
    {
      origem: 'regra',
      categoria: 'empreendimento',
      gravidade: 'verificar',
      trecho: '99.888.777/0001-66',
      problema: 'CNPJ diferente do cadastrado para o empreendimento.',
      sugestao: 'O cadastro tem 11.222.333/0001-81.',
    },
    {
      origem: 'ia',
      categoria: 'licenca',
      gravidade: 'corrigir',
      trecho: 'LAO 4812/2023',
      problema: 'Número da licença trocado.',
      sugestao: 'Use LAO 4821/2023.',
    },
  ],
  iniciada_em: '2026-11-18T13:00:05Z',
}

function cenario(
  papel: 'gestao' | 'equipe',
  enviadaPor: string,
  conferencias: unknown[],
  extra: Partial<Cenario> = {},
): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      obter_ocorrencia: { data: [ocorrencia] },
    },
    funcoes: { 'conferir-relatorio': { data: { situacao: 'em_andamento' } }, ...extra.funcoes },
    tabelas: {
      etapa: [],
      evidencia: [evidencia(enviadaPor)],
      ocorrencia_historico: [],
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: EU, nome: 'Ana Ribeiro' },
      ],
      conferencia_ia: conferencias,
    },
  }
}

describe('conferência da IA na evidência', () => {
  beforeEach(() => {
    falso.reiniciar(cenario('gestao', 'm-bruno', [concluida]))
  })

  it('quem confere vê o resumo e os apontamentos, sem disparar nova conferência', async () => {
    renderizarApp('/ocorrencias/o1')
    const secao = await screen.findByRole('region', { name: 'Conferência da IA' })
    expect(await within(secao).findByText('2 apontamentos')).toBeInTheDocument()
    expect(within(secao).getByText('Dois pontos antes de mandar à Gestão.')).toBeInTheDocument()
    const lista = within(secao).getByRole('list', { name: 'Apontamentos da IA' })
    expect(within(lista).getByText('Corrigir')).toBeInTheDocument()
    expect(within(lista).getByText('Verificar')).toBeInTheDocument()
    expect(within(lista).getByText('Número da licença trocado.')).toBeInTheDocument()
    expect(within(lista).getByText('Empreendimento · regra fixa')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
  })

  it('quem enviou dispara a conferência quando ela ainda não existe', async () => {
    falso.reiniciar(cenario('equipe', EU, []))
    renderizarApp('/ocorrencias/o1')
    await waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('conferir-relatorio', {
        body: expect.objectContaining({ evidenciaId: 'ev1' }) as unknown,
      })
    })
    expect(falso.cliente.functions.invoke).toHaveBeenCalledTimes(1)
  })

  it('falha mostra o motivo, as regras fixas e permite conferir de novo', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('equipe', EU, [
        {
          ...concluida,
          situacao: 'falhou',
          motivo: 'limite_atingido',
          resumo: null,
          apontamentos: [concluida.apontamentos[0]],
        },
      ]),
    )
    renderizarApp('/ocorrencias/o1')
    const secao = await screen.findByRole('region', { name: 'Conferência da IA' })
    expect(
      await within(secao).findByText(
        'Não conferido pela IA: limite de uso da IA nas últimas 24 horas',
      ),
    ).toBeInTheDocument()
    expect(
      within(secao).getByText('CNPJ diferente do cadastrado para o empreendimento.'),
    ).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
    await usuario.click(within(secao).getByRole('button', { name: 'Conferir de novo' }))
    await waitFor(() => {
      expect(falso.cliente.functions.invoke).toHaveBeenCalledTimes(1)
    })
  })

  it('erro da função aparece na seção', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario('gestao', 'm-bruno', [], {
        funcoes: { 'conferir-relatorio': { error: new Error('rede') } },
      }),
    )
    renderizarApp('/ocorrencias/o1')
    const secao = await screen.findByRole('region', { name: 'Conferência da IA' })
    await usuario.click(await within(secao).findByRole('button', { name: 'Conferir com IA' }))
    expect(await within(secao).findByRole('alert')).toBeInTheDocument()
  })
})

describe('evidência em .docx', () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])

  it('aceita .docx com assinatura de zip, mesmo sem o tipo do navegador', async () => {
    expect(
      await conferirArquivoDeEvidencia(new File([zip], 'Relatório.docx', { type: MIME_DOCX })),
    ).toBeNull()
    expect(await conferirArquivoDeEvidencia(new File([zip], 'Relatório.docx'))).toBeNull()
  })

  it('recusa .docx que não é zip e .docx no comprovante de protocolo', async () => {
    expect(
      await conferirArquivoDeEvidencia(new File(['texto'], 'falso.docx', { type: MIME_DOCX })),
    ).toBe('nao_docx')
    expect(
      await conferirArquivoDeEvidencia(new File([zip], 'Relatório.docx', { type: MIME_DOCX }), {
        docx: false,
      }),
    ).toBe('tipo')
  })
})
