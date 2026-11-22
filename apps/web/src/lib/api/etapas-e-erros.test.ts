// ADR-0059: a lista de etapas pagina de verdade (antes parava em 200) e a constraint de data
// civil vira mensagem de tela.
import { LIMITE_DE_ETAPAS } from '@gestao-ambiental/domain'
import { describe, expect, it, vi } from 'vitest'

import { mensagemDoErro } from '@/lib/erros'
import { falso } from '@/test/supabase-falso'

import { listarEtapas } from './ocorrencias'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function etapa(n: number) {
  return {
    id: `e${String(n)}`,
    titulo: `Etapa ${String(n)}`,
    modo: 'trabalho',
    responsavel_externo: null,
    meta: null,
    horas_estimadas: null,
    concluida_em: null,
    responsavel: null,
  }
}

describe('listarEtapas', () => {
  it('traz todas as etapas, em páginas, mesmo além da 200ª', async () => {
    const total = LIMITE_DE_ETAPAS + 37
    falso.reiniciar({ tabelas: { etapa: Array.from({ length: total }, (_, i) => etapa(i + 1)) } })
    const etapas = await listarEtapas('o1')
    expect(etapas).toHaveLength(total)
    expect(etapas.at(-1)?.titulo).toBe(`Etapa ${String(total)}`)
  })

  it('uma página só quando cabe', async () => {
    falso.reiniciar({ tabelas: { etapa: [etapa(1), etapa(2)] } })
    expect((await listarEtapas('o1')).map((e) => e.titulo)).toEqual(['Etapa 1', 'Etapa 2'])
  })
})

describe('mensagemDoErro', () => {
  it('constraint de data civil e limite de etapas viram mensagem', () => {
    expect(
      mensagemDoErro({
        code: '23514',
        message:
          'new row for relation "vencimento" violates check constraint "data_civil_0a1b2c3d4e5f6a7b"',
      }),
    ).toBe('Use uma data entre 01/01/1900 e 31/12/2199.')
    expect(mensagemDoErro({ message: 'limite_de_etapas' })).toBe(
      'Esta ocorrência já tem 200 etapas.',
    )
  })
})
