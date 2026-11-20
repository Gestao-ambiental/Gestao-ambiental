import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { renderizarApp } from '@/test/renderizar'
import { falso } from '@/test/supabase-falso'

import {
  MENSAGEM_GOOGLE_CANCELADO,
  MENSAGEM_GOOGLE_DESLIGADO,
  MENSAGEM_GOOGLE_FALHOU,
  MENSAGEM_GOOGLE_SEM_EMAIL,
  erroDoRetornoDoGoogle,
} from './retorno-do-google'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

/** Configurações públicas do Auth (GET /auth/v1/settings): o Google ligado ou não. */
function configuracoesDoAuth(google: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ external: { google, email: true } }))),
    ),
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.test')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anonima-de-teste')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('retorno do Google: o erro vira frase clara', () => {
  it.each([
    ['?error=access_denied&error_description=The+user+denied', MENSAGEM_GOOGLE_CANCELADO],
    [
      '?error=invalid_request&error_code=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled',
      MENSAGEM_GOOGLE_DESLIGADO,
    ],
    [
      '?error=server_error&error_description=Error+getting+user+email+from+external+provider',
      MENSAGEM_GOOGLE_SEM_EMAIL,
    ],
    ['?error=server_error&error_code=email_not_confirmed', MENSAGEM_GOOGLE_SEM_EMAIL],
    ['?error=server_error&error_description=Database+error', MENSAGEM_GOOGLE_FALHOU],
  ])('%s', (busca, mensagem) => {
    expect(erroDoRetornoDoGoogle(busca, '')).toBe(mensagem)
  })

  it('lê também o hash do fluxo implícito e não inventa erro sem erro', () => {
    expect(erroDoRetornoDoGoogle('', '#error=access_denied')).toBe(MENSAGEM_GOOGLE_CANCELADO)
    expect(erroDoRetornoDoGoogle('?para=%2Fcalendario', '')).toBeNull()
  })
})

describe('Continuar com Google (ADR-0040)', () => {
  it('em /entrar, sai para o Google e volta para /entrar com o destino', async () => {
    configuracoesDoAuth(true)
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/entrar?para=%2Fcalendario')

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))

    await waitFor(() => {
      expect(falso.cliente.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/entrar?para=${encodeURIComponent('/calendario')}`,
          queryParams: { prompt: 'select_account' },
        },
      })
    })
    expect(screen.getByRole('button', { name: 'Abrindo o Google…' })).toBeDisabled()
  })

  it('provedor desligado no Supabase: avisa e não sai do Grama', async () => {
    configuracoesDoAuth(false)
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/entrar')

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM_GOOGLE_DESLIGADO)
    expect(falso.cliente.auth.signInWithOAuth).not.toHaveBeenCalled()
    // E-mail e senha seguem funcionando.
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('erro ao abrir o Google: frase clara e o botão volta', async () => {
    configuracoesDoAuth(true)
    falso.reiniciar({ oauth: { data: null, error: { message: 'falhou' } } })
    const usuario = userEvent.setup()
    renderizarApp('/entrar')

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM_GOOGLE_FALHOU)
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeEnabled()
  })

  it('volta do Google cancelado: /entrar mostra a frase e o formulário', async () => {
    falso.reiniciar({})
    renderizarApp('/entrar?error=access_denied&error_description=The+user+denied')
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM_GOOGLE_CANCELADO)
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
  })

  it('criar conta também oferece o Google, voltando pelo /entrar', async () => {
    configuracoesDoAuth(true)
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/criar-conta')

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => {
      expect(falso.cliente.auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo: `${window.location.origin}/entrar`,
          }) as unknown,
        }),
      )
    })
  })

  it('convite sem login: o Google volta para o convite com aceite automático', async () => {
    configuracoesDoAuth(true)
    falso.reiniciar({
      rpc: {
        consultar_convite: {
          data: [
            {
              consultoria_nome: 'Filtroville',
              consultoria_fuso: 'America/Sao_Paulo',
              convidado_por_nome: 'Ana Ribeiro',
              email: 'carla@exemplo.test',
              papel: 'equipe',
              situacao: 'pendente',
              expira_em: '2026-10-24T12:00:00Z',
              conta_com_senha: false,
            },
          ],
        },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/convite?token=abc')

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => {
      expect(falso.cliente.auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo: `${window.location.origin}/convite?token=abc&aceitar=1`,
          }) as unknown,
        }),
      )
    })
    // O link do e-mail continua como alternativa.
    expect(screen.getByRole('button', { name: /Enviar link para/ })).toBeInTheDocument()
  })

  it('o nome de quem entrou pelo Google vem do full_name', () => {
    const sessao = {
      user: { id: 'u1', email: 'marina@gmail.test', user_metadata: { full_name: 'Marina Couto' } },
    } as unknown as Session
    expect(usuarioDaSessao(sessao).nome).toBe('Marina Couto')
  })
})
