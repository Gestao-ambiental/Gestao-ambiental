import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  ITENS_SUGERIDOS,
  SEM_LOCAL,
  aceitaRegistro,
  conferirLocalizacao,
  descreverLocal,
  exigeComentario,
  grupoDaVistoria,
  localDoAparelho,
  localManual,
  pendenciasDoEnvio,
  progressoDaVistoria,
  rotuloDaPrecisao,
  rotuloDoDiaDaVistoria,
  type ItemDaVistoria,
} from './vistoria'

const hoje = dataCivil('2026-11-14')

function item(id: string, extra: Partial<ItemDaVistoria> = {}): ItemDaVistoria {
  return { id, titulo: `Item ${id}`, resultado: 'pendente', comentario: null, ...extra }
}

describe('comentário e registro (ADR-0033)', () => {
  it('não conforme e requer avaliação exigem comentário', () => {
    expect(exigeComentario('nao_conforme')).toBe(true)
    expect(exigeComentario('requer_avaliacao')).toBe(true)
    expect(exigeComentario('conforme')).toBe(false)
    expect(exigeComentario('nao_aplicavel')).toBe(false)
    expect(exigeComentario('pendente')).toBe(false)
  })

  it('só em andamento ou devolvida aceita registro', () => {
    expect(aceitaRegistro('em_andamento')).toBe(true)
    expect(aceitaRegistro('devolvida')).toBe(true)
    for (const situacao of ['planejada', 'enviada', 'aprovada', 'cancelada'] as const) {
      expect(aceitaRegistro(situacao)).toBe(false)
    }
  })

  it('sugere os quatro itens do protótipo', () => {
    expect(ITENS_SUGERIDOS.map((i) => i.titulo)).toEqual([
      'Registrar área visitada',
      'Registrar condições observadas',
      'Identificar acompanhante',
      'Anexar foto geral',
    ])
  })
})

describe('progresso e pendências do envio', () => {
  it('conta só o que saiu de pendente', () => {
    expect(
      progressoDaVistoria([
        item('1', { resultado: 'conforme' }),
        item('2'),
        item('3', { resultado: 'nao_aplicavel' }),
      ]),
    ).toEqual({ registrados: 2, total: 3, percentual: 66 })
    expect(progressoDaVistoria([])).toEqual({ registrados: 0, total: 0, percentual: 0 })
  })

  it('lista sem resultado e comentário faltando, na ordem do checklist', () => {
    expect(
      pendenciasDoEnvio([
        item('1', { resultado: 'conforme' }),
        item('2', { resultado: 'nao_conforme', comentario: '  ' }),
        item('3'),
        item('4', { resultado: 'requer_avaliacao', comentario: 'Rachadura no piso' }),
      ]),
    ).toEqual([
      { itemId: '2', titulo: 'Item 2', motivo: 'sem_comentario' },
      { itemId: '3', titulo: 'Item 3', motivo: 'sem_resultado' },
    ])
  })
})

describe('grupo em Minhas vistorias', () => {
  it('abertas pela data contra o hoje da consultoria', () => {
    expect(grupoDaVistoria('planejada', dataCivil('2026-11-13'), hoje)).toBe('atrasadas')
    expect(grupoDaVistoria('em_andamento', hoje, hoje)).toBe('hoje')
    expect(grupoDaVistoria('devolvida', dataCivil('2026-11-20'), hoje)).toBe('proximas')
  })

  it('enviada e aprovada em Enviadas; cancelada fica de fora', () => {
    expect(grupoDaVistoria('enviada', dataCivil('2026-11-01'), hoje)).toBe('enviadas')
    expect(grupoDaVistoria('aprovada', dataCivil('2026-11-01'), hoje)).toBe('enviadas')
    expect(grupoDaVistoria('cancelada', hoje, hoje)).toBeNull()
  })

  it('rótulo do dia', () => {
    expect(rotuloDoDiaDaVistoria(hoje, hoje)).toBe('Hoje')
    expect(rotuloDoDiaDaVistoria(dataCivil('2026-11-15'), hoje)).toBe('Amanhã')
    expect(rotuloDoDiaDaVistoria(dataCivil('2026-11-13'), hoje)).toBe('Ontem')
    expect(rotuloDoDiaDaVistoria(dataCivil('2026-12-01'), hoje)).toBe('01/12/2026')
  })
})

describe('localização da foto', () => {
  it('arredonda a coordenada do aparelho para o formato gravado', () => {
    expect(
      localDoAparelho({ latitude: -26.30451234, longitude: -48.84512399, accuracy: 7.66 }),
    ).toEqual({
      origem: 'aparelho',
      latitude: -26.304512,
      longitude: -48.845124,
      precisaoM: 7.7,
      localManual: null,
    })
    expect(localDoAparelho({ latitude: 1, longitude: 2, accuracy: null }).precisaoM).toBeNull()
  })

  it('aceita aparelho com coordenada, manual com descrição e nenhum vazio', () => {
    expect(conferirLocalizacao(localDoAparelho({ latitude: -26.3, longitude: -48.8 }))).toBeNull()
    expect(conferirLocalizacao(localManual('Portão norte'))).toBeNull()
    expect(conferirLocalizacao(SEM_LOCAL)).toBeNull()
  })

  it('recusa local incoerente ou fora de faixa', () => {
    const aparelho = localDoAparelho({ latitude: -26.3, longitude: -48.8, accuracy: 5 })
    expect(conferirLocalizacao({ ...aparelho, longitude: null })).toBe('coordenada_obrigatoria')
    expect(conferirLocalizacao({ ...aparelho, latitude: 91 })).toBe('coordenada_invalida')
    expect(conferirLocalizacao({ ...aparelho, longitude: -181 })).toBe('coordenada_invalida')
    expect(conferirLocalizacao({ ...aparelho, precisaoM: -1 })).toBe('precisao_invalida')
    expect(conferirLocalizacao({ ...aparelho, localManual: 'x' })).toBe('local_incoerente')
    expect(conferirLocalizacao(localManual('  '))).toBe('descricao_obrigatoria')
    expect(conferirLocalizacao(localManual('a'.repeat(201)))).toBe('descricao_longa')
    expect(conferirLocalizacao({ ...localManual('x'), latitude: 1 })).toBe('local_incoerente')
    expect(conferirLocalizacao({ ...SEM_LOCAL, precisaoM: 3 })).toBe('local_incoerente')
    expect(conferirLocalizacao({ ...SEM_LOCAL, localManual: 'x' })).toBe('local_incoerente')
  })

  it('descreve o local para a revisão', () => {
    expect(
      descreverLocal(localDoAparelho({ latitude: -26.304512, longitude: -48.845124, accuracy: 8 })),
    ).toBe('-26,304512, -48,845124 · ± 8 m')
    expect(descreverLocal(localManual('Portão norte'))).toBe('Portão norte')
    expect(descreverLocal(SEM_LOCAL)).toBe('Sem localização')
    expect(rotuloDaPrecisao(0.4)).toBe('± 1 m')
  })
})
