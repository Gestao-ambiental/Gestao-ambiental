import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mensagemDoErro } from '@/lib/erros'
import { falso } from '@/test/supabase-falso'

import {
  definirResumoDiario,
  gerarLinkDoCalendario,
  lerMeusAvisos,
  pararResumoPorLink,
  revogarLinkDoCalendario,
  urlDoFeed,
} from './avisos'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const TOKEN = 'a'.repeat(64)

describe('API de avisos', () => {
  beforeEach(() => {
    falso.reiniciar({})
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anonima')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lê a preferência e o link da própria pessoa', async () => {
    falso.reiniciar({
      rpc: {
        meus_avisos: {
          data: [
            {
              resumo_diario: false,
              row_version: 3,
              link_ativo: true,
              link_criado_em: '2026-11-18T12:00:00Z',
              link_ultimo_acesso_em: null,
            },
          ],
        },
      },
    })
    await expect(lerMeusAvisos('c1')).resolves.toEqual({
      resumoDiario: false,
      rowVersion: 3,
      linkAtivo: true,
      linkCriadoEm: '2026-11-18T12:00:00Z',
      linkUltimoAcessoEm: null,
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('meus_avisos', { p_consultoria_id: 'c1' })
  })

  it('sem linha: resumo ligado, versão 0 e sem link', async () => {
    falso.reiniciar({ rpc: { meus_avisos: { data: [] } } })
    await expect(lerMeusAvisos('c1')).resolves.toEqual({
      resumoDiario: true,
      rowVersion: 0,
      linkAtivo: false,
      linkCriadoEm: null,
      linkUltimoAcessoEm: null,
    })
  })

  it('erro do banco sobe como veio', async () => {
    const erro = { code: '42501', message: 'sem_permissao' }
    falso.reiniciar({ rpc: { meus_avisos: { error: erro } } })
    await expect(lerMeusAvisos('c1')).rejects.toBe(erro)
  })

  it('define o resumo com a versão e devolve a nova', async () => {
    falso.reiniciar({ rpc: { definir_resumo_diario: { data: 1 } } })
    await expect(definirResumoDiario('c1', false, 0)).resolves.toBe(1)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_resumo_diario', {
      p_consultoria_id: 'c1',
      p_ligado: false,
      p_row_version: 0,
    })
  })

  it('conflito de versão sobe com a mensagem própria', async () => {
    falso.reiniciar({
      rpc: { definir_resumo_diario: { error: { code: 'P0001', message: 'conflito_de_versao' } } },
    })
    const erro: unknown = await definirResumoDiario('c1', true, 2).catch((e: unknown) => e)
    expect(mensagemDoErro(erro)).toMatch(/alterado em outro lugar/)
  })

  it('monta o endereço do feed na própria Edge Function', () => {
    expect(urlDoFeed(TOKEN, 'https://x.test')).toBe(
      `https://x.test/functions/v1/feed-calendario/${TOKEN}.ics`,
    )
    expect(urlDoFeed(TOKEN)).toBe(
      `https://projeto.supabase.test/functions/v1/feed-calendario/${TOKEN}.ics`,
    )
  })

  it('gera o link e devolve o endereço completo', async () => {
    falso.reiniciar({ rpc: { gerar_link_do_calendario: { data: TOKEN } } })
    await expect(gerarLinkDoCalendario('c1')).resolves.toBe(
      `https://projeto.supabase.test/functions/v1/feed-calendario/${TOKEN}.ics`,
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith('gerar_link_do_calendario', {
      p_consultoria_id: 'c1',
    })
  })

  it('gerar com erro do banco sobe o erro', async () => {
    const erro = { code: '42501', message: 'sem_permissao' }
    falso.reiniciar({ rpc: { gerar_link_do_calendario: { error: erro } } })
    await expect(gerarLinkDoCalendario('c1')).rejects.toBe(erro)
  })

  it('revoga e diz se havia link', async () => {
    falso.reiniciar({ rpc: { revogar_link_do_calendario: { data: false } } })
    await expect(revogarLinkDoCalendario('c1')).resolves.toBe(false)
    const erro = { code: '42501', message: 'sem_permissao' }
    falso.reiniciar({ rpc: { revogar_link_do_calendario: { error: erro } } })
    await expect(revogarLinkDoCalendario('c1')).rejects.toBe(erro)
  })

  it('para o resumo pelo link mandando o token no corpo', async () => {
    falso.reiniciar({ funcoes: { 'preferencias-por-link': { data: { desligado: true } } } })
    await expect(pararResumoPorLink('v1.a.b.c')).resolves.toBeUndefined()
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('preferencias-por-link', {
      body: { token: 'v1.a.b.c' },
    })
  })

  it('link recusado (400) vira link_invalido', async () => {
    falso.reiniciar({
      funcoes: {
        'preferencias-por-link': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'link_invalido' }), { status: 400 }),
          ),
        },
      },
    })
    const erro: unknown = await pararResumoPorLink('x').catch((e: unknown) => e)
    expect(erro).toEqual(new Error('link_invalido'))
    expect(mensagemDoErro(erro)).toBe('Este link não vale mais. Desligue o resumo pelo Perfil.')
  })

  it('outra falha da função sobe como veio', async () => {
    const http = new FunctionsHttpError(
      new Response(JSON.stringify({ erro: 'erro_interno' }), { status: 500 }),
    )
    falso.reiniciar({ funcoes: { 'preferencias-por-link': { error: http } } })
    await expect(pararResumoPorLink('x')).rejects.toBe(http)

    const rede = new FunctionsFetchError(new Error('sem rede'))
    falso.reiniciar({ funcoes: { 'preferencias-por-link': { error: rede } } })
    await expect(pararResumoPorLink('x')).rejects.toBe(rede)
  })
})
