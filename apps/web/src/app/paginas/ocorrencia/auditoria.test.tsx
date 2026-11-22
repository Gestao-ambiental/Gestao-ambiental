import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import type { RegistroDeAuditoria } from '@/lib/api/ocorrencias'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import { descreverRegistro } from './auditoria'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const FUSO = 'America/Sao_Paulo'

function registro(extra: Partial<RegistroDeAuditoria> = {}): RegistroDeAuditoria {
  return {
    id: 1,
    instante: '2026-10-16T13:00:00Z',
    entidade: 'ocorrencia',
    acao: 'update',
    atorNome: 'Ana Ribeiro',
    antes: null,
    depois: null,
    motivo: null,
    ...extra,
  }
}

describe('descreverRegistro', () => {
  it('alteração: lista só os campos que mudaram, legíveis', () => {
    const linha = descreverRegistro(
      registro({
        antes: {
          situacao: 'em_conferencia',
          row_version: 3,
          concluida_por: null,
          concluida_em: null,
          prazo_oficial_atual: '2026-11-10',
          titulo: 'Laudo',
        },
        depois: {
          situacao: 'concluida',
          row_version: 4,
          concluida_por: 'm1',
          concluida_em: '2026-10-18T14:00:00Z',
          prazo_oficial_atual: '2026-11-10',
          titulo: 'Laudo',
        },
      }),
      FUSO,
    )
    expect(linha.acao).toBe('Alterou a ocorrência')
    expect(linha.mudancas).toEqual([
      { campo: 'Situação', de: 'em conferencia', para: 'concluida' },
      { campo: 'Concluída por', de: null, para: 'definido' },
      { campo: 'Concluída em', de: null, para: '18/10/2026 às 11:00' },
    ])
  })

  it('datas civis em dd/mm/aaaa e booleanos em palavras', () => {
    const linha = descreverRegistro(
      registro({
        antes: { meta_interna: '2026-11-01', concluida_sem_evidencia: false },
        depois: { meta_interna: '2026-11-05', concluida_sem_evidencia: true },
      }),
      FUSO,
    )
    expect(linha.mudancas).toEqual([
      { campo: 'Meta interna', de: '01/11/2026', para: '05/11/2026' },
      { campo: 'Concluída sem evidência', de: 'não', para: 'sim' },
    ])
  })

  it('envio, aprovação, devolução e conferência do arquivo viram frases', () => {
    expect(
      descreverRegistro(
        registro({ entidade: 'evidencia', acao: 'insert', depois: { numero: 2 } }),
        FUSO,
      ),
    ).toEqual({ acao: 'Enviou a evidência v2', mudancas: [] })
    expect(
      descreverRegistro(
        registro({ entidade: 'conferencia', acao: 'insert', depois: { decisao: 'aprovada' } }),
        FUSO,
      ).acao,
    ).toBe('Aprovou a evidência')
    expect(
      descreverRegistro(
        registro({
          entidade: 'conferencia',
          acao: 'insert',
          depois: { decisao: 'devolvida', motivo: 'Falta assinatura' },
        }),
        FUSO,
      ).acao,
    ).toBe('Devolveu a evidência: “Falta assinatura”')
    expect(
      descreverRegistro(
        registro({
          entidade: 'conferencia_de_arquivo',
          acao: 'insert',
          depois: { confere: false },
        }),
        FUSO,
      ).acao,
    ).toBe('Servidor conferiu o arquivo: diferente do enviado')
    expect(
      descreverRegistro(
        registro({ entidade: 'etapa', acao: 'insert', depois: { titulo: 'Coletar' } }),
        FUSO,
      ).acao,
    ).toBe('Criou a etapa “Coletar”')
  })
})

function linhaDoBanco(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    instante: '2026-10-16T13:00:00Z',
    entidade: 'evidencia',
    acao: 'insert',
    ator_nome: 'Bruno Kist',
    antes: null,
    depois: { numero: id },
    motivo: null,
    total: 51,
    ...extra,
  }
}

function cenario(papel: 'gestao' | 'equipe', auditoria: Cenario['rpc'] = {}): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_auditoria_da_ocorrencia: (args) => ({
        data:
          args.p_deslocamento === 0
            ? Array.from({ length: 50 }, (_, i) => linhaDoBanco(i + 1))
            : [
                linhaDoBanco(51, {
                  ator_nome: null,
                  entidade: 'conferencia_de_arquivo',
                  depois: { confere: true },
                }),
              ],
      }),
      ...auditoria,
    },
  }
}

describe('auditoria da ocorrência (só Gestão)', () => {
  it('a Gestão vê quem fez o quê e quando, em páginas', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(cenario('gestao'))
    renderizarApp('/ocorrencias/o1/auditoria')

    const lista = await screen.findByRole('list', { name: 'Registros de auditoria' })
    expect(within(lista).getAllByText('Bruno Kist')).toHaveLength(50)
    expect(within(lista).getByText('Enviou a evidência v1')).toBeInTheDocument()
    expect(screen.getByText('1–50 de 51')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anteriores' })).toBeDisabled()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_auditoria_da_ocorrencia', {
      p_ocorrencia_id: 'o1',
      p_limite: 50,
      p_deslocamento: 0,
    })

    await usuario.click(screen.getByRole('button', { name: 'Próximos' }))
    expect(
      await screen.findByText('Servidor conferiu o arquivo: igual ao enviado'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sistema')).toBeInTheDocument()
    expect(screen.getByText('51–51 de 51')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próximos' })).toBeDisabled()

    const resultado = await axe.run(document.body, { rules: { region: { enabled: false } } })
    expect(resultado.violations).toEqual([])
  })

  it('a Equipe recebe "sem permissão" e o banco nem é chamado', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/ocorrencias/o1/auditoria')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'listar_auditoria_da_ocorrencia',
      expect.anything(),
    )
  })

  it('o banco recusa (outra consultoria): sem permissão', async () => {
    falso.reiniciar(
      cenario('gestao', {
        listar_auditoria_da_ocorrencia: { error: { code: '42501', message: 'sem_permissao' } },
      }),
    )
    renderizarApp('/ocorrencias/o1/auditoria')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
  })

  it('erro ao carregar oferece tentar de novo', async () => {
    falso.reiniciar(
      cenario('gestao', { listar_auditoria_da_ocorrencia: { error: { message: 'falhou' } } }),
    )
    renderizarApp('/ocorrencias/o1/auditoria')
    expect(await screen.findByText('Não foi possível carregar a auditoria.')).toBeInTheDocument()
  })

  it('sem registros', async () => {
    falso.reiniciar(cenario('gestao', { listar_auditoria_da_ocorrencia: { data: [] } }))
    renderizarApp('/ocorrencias/o1/auditoria')
    expect(await screen.findByText('Nenhum registro de auditoria.')).toBeInTheDocument()
  })
})
