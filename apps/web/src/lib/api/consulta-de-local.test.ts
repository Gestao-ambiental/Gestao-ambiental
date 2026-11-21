// Consulta do local pela Edge Function consultar-local: o corpo só leva a unidade quando ela vem, e
// os erros viram mensagem da tela.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { consultarLocal, ErroDaConsultaDeLocal, type ResultadoDoLocal } from './consulta-de-local'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const PONTO = { latitude: -26.3044, longitude: -48.8487 }
const RESULTADO: ResultadoDoLocal = {
  municipio: { codigoIbge: '4209102', nome: 'Joinville' },
  lote: null,
  bairro: null,
  zoneamento: null,
  restricoes: [],
  falhas: [],
  fontes: [],
}

beforeEach(() => {
  falso.reiniciar({ funcoes: { 'consultar-local': { data: RESULTADO } } })
})

describe('consultarLocal', () => {
  it('sem unidade, manda só o ponto', async () => {
    await expect(consultarLocal(PONTO)).resolves.toEqual(RESULTADO)
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: { latitude: -26.3044, longitude: -48.8487 },
    })
  })

  it('com unidade, manda consultoria e unidade e lê se o município foi gravado', async () => {
    falso.reiniciar({
      funcoes: { 'consultar-local': { data: { ...RESULTADO, municipioGravado: true } } },
    })
    const r = await consultarLocal(PONTO, { consultoriaId: 'c1', unidadeId: 'u1' })
    expect(r.municipioGravado).toBe(true)
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: { latitude: -26.3044, longitude: -48.8487, consultoriaId: 'c1', unidadeId: 'u1' },
    })
  })

  it('erro da função vira a mensagem do motivo', async () => {
    falso.reiniciar({
      funcoes: {
        'consultar-local': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'fora_de_santa_catarina' }), { status: 422 }),
          ),
        },
      },
    })
    const promessa = consultarLocal(PONTO, { consultoriaId: 'c1', unidadeId: 'u1' })
    await expect(promessa).rejects.toBeInstanceOf(ErroDaConsultaDeLocal)
    await expect(promessa).rejects.toThrow('O ponto está fora de Santa Catarina.')
  })

  it('sem resposta é falta de conexão', async () => {
    falso.reiniciar({ funcoes: {} })
    await expect(consultarLocal(PONTO)).rejects.toThrow('Sem conexão com o servidor.')
  })
})
