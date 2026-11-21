// API de normas para as consultorias: argumentos das RPCs do aviso_norma, leitura defensiva do
// detalhe da norma e erros repassados à tela.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  afetadosPelaMudanca,
  buscarNormas,
  contarMudancasNaoVistas,
  detalheDaNorma,
  listarMudancasDaConsultoria,
  marcarMudancaVista,
  rotuloDoTipoDeNorma,
} from './normas'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ERRO_PERMISSAO = { code: '42501', message: 'sem_permissao' }

beforeEach(() => {
  falso.reiniciar({})
})

describe('normas', () => {
  it('busca no catálogo paginado e marca a revogada', async () => {
    falso.reiniciar({
      rpc: {
        buscar_normas: {
          data: [
            {
              id: 'n1',
              chave: 'sc;ima;instrucao_normativa;2',
              titulo: 'IN 02 do IMA',
              esfera: 'estadual',
              municipio_ibge: null,
              orgao: 'IMA',
              tipo: 'instrucao_normativa',
              numero: '2',
              ano: null,
              situacao_na_fonte: 'revogada',
              ultima_versao_em: '2026-11-19',
              total: 41,
            },
          ],
        },
      },
    })
    const pagina = await buscarNormas('  IN 2 ', 2)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('buscar_normas', {
      p_termo: 'IN 2',
      p_limite: 20,
      p_deslocamento: 40,
    })
    expect(pagina.total).toBe(41)
    expect(pagina.itens[0]).toMatchObject({
      id: 'n1',
      revogada: true,
      ultimaVersaoEm: '2026-11-19',
    })
  })

  it('lê o detalhe com versões, mudanças (diferença e resumo) e critérios', async () => {
    falso.reiniciar({
      rpc: {
        detalhe_da_norma: {
          data: {
            id: 'n1',
            chave: 'sc;ima;instrucao_normativa;2',
            titulo: 'IN 02 do IMA',
            ementa: 'Licenciamento de postos.',
            esfera: 'estadual',
            municipio_ibge: null,
            orgao: 'IMA',
            tipo: 'instrucao_normativa',
            numero: '2',
            ano: 2024,
            temas: ['efluentes'],
            url_oficial: 'https://in.ima.sc.gov.br/in02.pdf',
            situacao_na_fonte: 'vigente',
            revogada_em: null,
            revogada_por: null,
            versoes: [
              {
                id: 'v2',
                numero: 2,
                publicada_em: '2026-11-19',
                publicada_em_texto: '19/11/2026',
                coletada_em: '2026-11-20T05:00:00Z',
              },
            ],
            mudancas: [
              {
                id: 'm1',
                tipo: 'alterada',
                detectada_em: '2026-11-20T05:00:00Z',
                publicada_em: '2026-11-20T15:00:00Z',
                diferenca: {
                  estruturada: true,
                  incluidos: [],
                  alterados: [{ caminho: 'art6', rotulo: 'Art. 6º', antes: 'A', depois: 'B' }],
                  revogados: [],
                  iguais: 4,
                },
                resumo: {
                  resumo: 'Muda o prazo.',
                  o_que_muda: ['Prazo de 60 dias', ' '],
                  prazo_de_adequacao: '90 dias',
                  confianca: 'alta',
                },
              },
              { id: 'm0', tipo: 'inventado', publicada_em: null, diferenca: {}, resumo: null },
            ],
            criterios: [
              { tipo: 'atividade', valor: '47.30.00', origem: 'simulador_ima' },
              { tipo: 'outro', valor: 'x', origem: 'curadoria' },
            ],
          },
        },
      },
    })
    const norma = await detalheDaNorma('n1')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('detalhe_da_norma', { p_norma_id: 'n1' })
    expect(norma?.ano).toBe(2024)
    expect(norma?.revogada).toBe(false)
    expect(norma?.versoes).toEqual([
      {
        id: 'v2',
        numero: 2,
        publicadaEm: '2026-11-19',
        publicadaEmTexto: '19/11/2026',
        coletadaEm: '2026-11-20T05:00:00Z',
      },
    ])
    expect(norma?.mudancas[0]).toEqual({
      id: 'm1',
      tipo: 'alterada',
      detectadaEm: '2026-11-20T05:00:00Z',
      publicadaEm: '2026-11-20T15:00:00Z',
      diferenca: {
        estruturada: true,
        incluidos: [],
        alterados: [{ caminho: 'art6', rotulo: 'Art. 6º', antes: 'A', depois: 'B' }],
        revogados: [],
      },
      resumo: {
        resumo: 'Muda o prazo.',
        oQueMuda: ['Prazo de 60 dias'],
        prazoDeAdequacao: '90 dias',
      },
    })
    expect(norma?.mudancas[1]).toMatchObject({ tipo: 'alterada', diferenca: null, resumo: null })
    expect(norma?.criterios).toEqual([
      { tipo: 'atividade', valor: '47.30.00', origem: 'simulador_ima' },
    ])
  })

  it('norma inexistente devolve nulo', async () => {
    falso.reiniciar({ rpc: { detalhe_da_norma: { data: null } } })
    expect(await detalheDaNorma('n9')).toBeNull()
  })

  it('lista as mudanças da consultoria com paginação e filtro de não vistas', async () => {
    falso.reiniciar({
      rpc: {
        listar_mudancas_de_norma_da_consultoria: {
          data: [
            {
              mudanca_id: 'm1',
              norma_id: 'n1',
              norma_titulo: 'IN 02 do IMA',
              tipo_mudanca: 'revogada',
              publicada_em: '2026-11-20T15:00:00Z',
              resumo: null,
              empreendimentos: 3,
              licencas: 2,
              clientes: 1,
              nao_vista: true,
              total: 26,
            },
          ],
        },
      },
    })
    const pagina = await listarMudancasDaConsultoria('c1', 1, true)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_mudancas_de_norma_da_consultoria', {
      p_consultoria_id: 'c1',
      p_so_nao_vistas: true,
      p_limite: 25,
      p_deslocamento: 25,
    })
    expect(pagina).toEqual({
      itens: [
        {
          mudancaId: 'm1',
          normaId: 'n1',
          normaTitulo: 'IN 02 do IMA',
          tipo: 'revogada',
          publicadaEm: '2026-11-20T15:00:00Z',
          resumo: null,
          empreendimentos: 3,
          licencas: 2,
          clientes: 1,
          naoVista: true,
        },
      ],
      total: 26,
    })
  })

  it('conta as não vistas e marca a mudança como vista', async () => {
    falso.reiniciar({
      rpc: {
        contar_mudancas_de_norma_nao_vistas: { data: 4 },
        marcar_mudanca_de_norma_vista: { data: 2 },
      },
    })
    expect(await contarMudancasNaoVistas('c1')).toBe(4)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('contar_mudancas_de_norma_nao_vistas', {
      p_consultoria_id: 'c1',
    })
    expect(await marcarMudancaVista('c1', 'm1')).toBe(2)
    expect(falso.cliente.rpc).toHaveBeenLastCalledWith('marcar_mudanca_de_norma_vista', {
      p_consultoria_id: 'c1',
      p_mudanca_id: 'm1',
    })
  })

  it('lê os afetados com o motivo', async () => {
    falso.reiniciar({
      rpc: {
        afetados_pela_mudanca: {
          data: [
            {
              empreendimento_id: 'e1',
              empreendimento_nome: 'Posto Boa Vista',
              cliente_nome: 'Rede Sul',
              instrumento_id: 'i1',
              licenca: 'LAO 4821/2023',
              motivo: { criterio: 'atividade', valor: '47.30.00' },
              visto_em: null,
            },
            {
              empreendimento_id: 'e2',
              empreendimento_nome: 'Metalúrgica',
              cliente_nome: null,
              instrumento_id: null,
              licenca: null,
              motivo: null,
              visto_em: '2026-11-20T16:00:00Z',
            },
          ],
        },
      },
    })
    const afetados = await afetadosPelaMudanca('c1', 'm1')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('afetados_pela_mudanca', {
      p_consultoria_id: 'c1',
      p_mudanca_id: 'm1',
    })
    expect(afetados[0]?.motivo).toEqual({ criterio: 'atividade', valor: '47.30.00' })
    expect(afetados[1]).toMatchObject({ licenca: null, motivo: { criterio: '', valor: '' } })
  })

  it('repassa o erro do banco', async () => {
    falso.reiniciar({
      rpc: {
        listar_mudancas_de_norma_da_consultoria: { error: ERRO_PERMISSAO },
        contar_mudancas_de_norma_nao_vistas: { error: ERRO_PERMISSAO },
        afetados_pela_mudanca: { error: ERRO_PERMISSAO },
        marcar_mudanca_de_norma_vista: { error: ERRO_PERMISSAO },
        detalhe_da_norma: { error: ERRO_PERMISSAO },
        buscar_normas: { error: ERRO_PERMISSAO },
      },
    })
    await expect(listarMudancasDaConsultoria('c2')).rejects.toBe(ERRO_PERMISSAO)
    await expect(contarMudancasNaoVistas('c2')).rejects.toBe(ERRO_PERMISSAO)
    await expect(afetadosPelaMudanca('c2', 'm1')).rejects.toBe(ERRO_PERMISSAO)
    await expect(marcarMudancaVista('c2', 'm1')).rejects.toBe(ERRO_PERMISSAO)
    await expect(detalheDaNorma('n1')).rejects.toBe(ERRO_PERMISSAO)
    await expect(buscarNormas('IN')).rejects.toBe(ERRO_PERMISSAO)
  })

  it('tipo de norma legível, e o desconhecido como veio', () => {
    expect(rotuloDoTipoDeNorma('instrucao_normativa')).toBe('Instrução normativa')
    expect(rotuloDoTipoDeNorma('outro')).toBe('outro')
  })
})
