// API da fila de normas na central (LEG-04): argumentos das RPCs, leitura defensiva do detalhe e
// a chamada da Edge Function resumir-mudanca.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  descartarMudancaDeNorma,
  detalheDaMudancaDeNorma,
  gerarResumoDaMudanca,
  lerCriterios,
  listarMudancasDeNorma,
  mensagemDoErroDaNorma,
  publicarMudancaDeNorma,
  usoDeIaDaPlataforma,
} from './central-normas'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

beforeEach(() => {
  falso.reiniciar({})
})

describe('central-normas', () => {
  it('lista a fila paginada e só manda a situação quando há filtro', async () => {
    falso.reiniciar({
      rpc: {
        central_listar_mudancas_de_norma: {
          data: [
            {
              id: 'm1',
              norma_id: 'n1',
              norma_titulo: 'IN 02 do IMA',
              tipo: 'alterada',
              situacao: 'resumida',
              detectada_em: '2026-11-20T02:00:00Z',
              tem_resumo: true,
              total: 30,
            },
          ],
        },
      },
    })
    const pagina = await listarMudancasDeNorma(1)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_listar_mudancas_de_norma', {
      p_limite: 25,
      p_deslocamento: 25,
    })
    expect(pagina).toEqual({
      itens: [
        {
          id: 'm1',
          normaId: 'n1',
          normaTitulo: 'IN 02 do IMA',
          tipo: 'alterada',
          situacao: 'resumida',
          detectadaEm: '2026-11-20T02:00:00Z',
          temResumo: true,
        },
      ],
      total: 30,
    })

    await listarMudancasDeNorma(0, 'publicada')
    expect(falso.cliente.rpc).toHaveBeenLastCalledWith('central_listar_mudancas_de_norma', {
      p_limite: 25,
      p_deslocamento: 0,
      p_situacao: 'publicada',
    })
  })

  it('lê o detalhe com diferença, resumo, versões e chamadas de IA', async () => {
    falso.reiniciar({
      rpc: {
        central_detalhe_da_mudanca_de_norma: {
          data: {
            id: 'm1',
            tipo: 'alterada',
            situacao: 'resumida',
            detectada_em: '2026-11-20T02:00:00Z',
            motivo_descarte: null,
            norma: {
              titulo: 'IN 02',
              tipo: 'instrucao_normativa',
              orgao: 'IMA',
              esfera: 'estadual',
            },
            url_oficial: 'https://in.ima.sc.gov.br/in02.pdf',
            diferenca: {
              estruturada: true,
              incluidos: [{ caminho: 'art9', rotulo: 'Art. 9º', texto: 'Novo.' }],
              alterados: [],
              revogados: [],
              iguais: 3,
            },
            resumo: { resumo: 'Muda o prazo.', o_que_muda: ['Prazo'], confianca: 'alta' },
            criterios_sugeridos: [
              { tipo: 'atividade', valor: '33.10.00' },
              { tipo: 'inventado', valor: 'x' },
            ],
            versao_anterior: { publicada_em: '2024-01-10', trecho: 'Antigo' },
            versao_nova: { publicada_em: '2026-11-19', trecho: 'Novo' },
            chamadas_ia: [
              { id: 'c1', situacao: 'concluida', modelo: 'm', custo_micros: 1500, criado_em: null },
            ],
          },
        },
      },
    })
    const detalhe = await detalheDaMudancaDeNorma('m1')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_detalhe_da_mudanca_de_norma', {
      p_id: 'm1',
    })
    expect(detalhe?.norma.titulo).toBe('IN 02')
    expect(detalhe?.diferenca).toEqual({
      estruturada: true,
      incluidos: [{ caminho: 'art9', rotulo: 'Art. 9º', texto: 'Novo.' }],
      alterados: [],
      revogados: [],
    })
    expect(detalhe?.resumo?.oQueMuda).toEqual(['Prazo'])
    expect(detalhe?.criteriosSugeridos).toEqual([{ tipo: 'atividade', valor: '33.10.00' }])
    expect(detalhe?.versaoNova).toEqual({ publicadaEm: '2026-11-19', trecho: 'Novo' })
    expect(detalhe?.chamadas[0]?.custoMicros).toBe(1500)
  })

  it('detalhe nulo (mudança inexistente) devolve nulo', async () => {
    falso.reiniciar({ rpc: { central_detalhe_da_mudanca_de_norma: { data: null } } })
    expect(await detalheDaMudancaDeNorma('m9')).toBeNull()
  })

  it('publica mantendo os campos do resumo que a tela não edita', async () => {
    falso.reiniciar({ rpc: { central_publicar_mudanca_de_norma: { data: null } } })
    await publicarMudancaDeNorma(
      'm1',
      {
        resumo: '  Texto revisado ',
        oQueMuda: ['Prazo', ' ', 'Taxa '],
        original: { resumo: 'IA', o_que_muda: [], confianca: 'media' },
      },
      [{ tipo: 'tipo_licenca', valor: 'LAO' }],
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_publicar_mudanca_de_norma', {
      p_id: 'm1',
      p_resumo: { resumo: 'Texto revisado', o_que_muda: ['Prazo', 'Taxa'], confianca: 'media' },
      p_criterios: [{ tipo: 'tipo_licenca', valor: 'LAO' }],
    })
  })

  it('descarta com o motivo e lê o uso da IA', async () => {
    falso.reiniciar({
      rpc: {
        central_descartar_mudanca_de_norma: { data: null },
        central_uso_de_ia_da_plataforma: {
          data: {
            resumos_hoje: 3,
            custo_mes_micros: 1230000,
            limite_dia: 40,
            limite_mes_micros: 20000000,
          },
        },
      },
    })
    await descartarMudancaDeNorma('m1', ' Republicação sem mudança ')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_descartar_mudanca_de_norma', {
      p_id: 'm1',
      p_motivo: 'Republicação sem mudança',
    })
    expect(await usoDeIaDaPlataforma()).toEqual({
      resumosHoje: 3,
      custoMesMicros: 1230000,
      limiteDia: 40,
      limiteMesMicros: 20000000,
    })
  })

  it('gerar resumo chama a Edge Function com o id da mudança', async () => {
    falso.reiniciar({ funcoes: { 'resumir-mudanca': { data: { situacao: 'resumida' } } } })
    await gerarResumoDaMudanca('m1')
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('resumir-mudanca', {
      body: { mudanca_id: 'm1' },
    })
  })

  it('erro da Edge Function vira mensagem de tela pelo código', async () => {
    falso.reiniciar({
      funcoes: {
        'resumir-mudanca': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'cota_diaria_esgotada' }), { status: 429 }),
          ),
        },
      },
    })
    const erro: unknown = await gerarResumoDaMudanca('m1').catch((e: unknown) => e)
    expect(mensagemDoErroDaNorma(erro)).toBe('A cota de resumos de hoje acabou. Tente amanhã.')
  })

  it('critérios fora da forma ficam de fora', () => {
    expect(
      lerCriterios([
        { tipo: 'municipio', valor: '4209102' },
        { tipo: 'tema', valor: '  ' },
        'texto',
        null,
      ]),
    ).toEqual([{ tipo: 'municipio', valor: '4209102' }])
  })
})
