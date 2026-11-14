import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import {
  QR_CODE_FALSO,
  SEGREDO_FALSO,
  falso,
  sessaoDe,
  type CenarioDoisFatores,
} from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')

/** Operador que já confirmou o código nesta sessão (aal2): a central abre direto. */
const COM_DOIS_FATORES: CenarioDoisFatores = {
  nivel: 'aal2',
  fatores: [{ id: 'fator-1', status: 'verified' }],
}

const MINUTO = 60_000
const DIA = 24 * 60 * MINUTO
/** Instante relativo ao relógio do teste (as regras de "agora" e "há N dias" usam o relógio). */
function ha(ms: number) {
  return new Date(Date.now() - ms).toISOString()
}

const filtroville = {
  id: 'c-a',
  nome: 'Filtroville Consultoria Ambiental',
  criada_em: '2026-10-01T15:00:00Z',
  fuso: 'America/Sao_Paulo',
  situacao: 'ativa',
  situacao_alterada_em: null,
  gestao: [{ nome: 'Eduardo Karnopp', email: 'eduardo@filtroville.test' }],
  pessoas_ativas: 6,
  orcamentos: 12,
  empreendimentos: 8,
  licencas: 15,
  ultimo_uso_em: ha(5 * MINUTO),
}
const verdeSul = {
  id: 'c-b',
  nome: 'Verde Sul Ambiental',
  criada_em: '2026-11-02T15:00:00Z',
  fuso: 'America/Sao_Paulo',
  situacao: 'teste',
  situacao_alterada_em: null,
  gestao: [],
  pessoas_ativas: 1,
  orcamentos: 0,
  empreendimentos: 0,
  licencas: 0,
  ultimo_uso_em: '2026-11-02T15:00:00Z',
}

function lista(args: Record<string, unknown>) {
  const busca = typeof args.p_busca === 'string' ? args.p_busca.toLowerCase() : ''
  const linhas = [filtroville, verdeSul]
    .filter((c) => c.nome.toLowerCase().includes(busca))
    .filter((c) => !args.p_situacao || c.situacao === args.p_situacao)
  return { data: linhas.map((c) => ({ ...c, total: linhas.length })) }
}

const detalhe = {
  ...filtroville,
  situacao_motivo: null,
  situacao_alterada_por_nome: null,
  row_version: 1,
}

const pessoas = [
  ['m1', 'Ana Ribeiro', 'ana@filtroville.test', 'equipe', 'ativo', ha(2 * MINUTO), 12],
  [
    'm2',
    'Eduardo Karnopp',
    'eduardo@filtroville.test',
    'gestao',
    'ativo',
    '2026-11-10T13:30:00Z',
    4,
  ],
  ['m3', 'Diego Souza', 'diego@filtroville.test', 'equipe', 'desligado', null, 0],
].map(([membro_id, nome, email, papel, situacao, ultimo_uso_em, dias_com_uso_30]) => ({
  membro_id,
  nome,
  email,
  papel,
  situacao,
  criado_em: '2026-10-01T15:00:00Z',
  desligado_em: situacao === 'desligado' ? '2026-11-01T15:00:00Z' : null,
  ultimo_uso_em,
  dias_com_uso_30,
  total: 3,
}))

const alertas = [
  {
    id: 'c-c',
    nome: 'Consultoria Parada',
    criada_em: ha(40 * DIA),
    fuso: 'America/Sao_Paulo',
    situacao: 'ativa',
    pessoas_ativas: 3,
    ultimo_uso_em: ha(20 * DIA + MINUTO),
    total: 2,
  },
  {
    id: 'c-d',
    nome: 'Consultoria Que Nunca Usou',
    criada_em: ha(30 * DIA + MINUTO),
    fuso: 'America/Sao_Paulo',
    situacao: 'teste',
    pessoas_ativas: 1,
    ultimo_uso_em: null,
    total: 2,
  },
]

const usoPorModulo = [
  { modulo: 'licencas_e_prazos', dias: 18, ultimo_uso_em: ha(5 * MINUTO) },
  { modulo: 'orcamentos', dias: 1, ultimo_uso_em: ha(3 * DIA) },
  { modulo: 'propostas', dias: 0, ultimo_uso_em: null },
  { modulo: 'equipe_e_conta', dias: 2, ultimo_uso_em: ha(9 * DIA) },
]

const historico = [
  {
    id: 'h1',
    situacao_anterior: 'teste',
    situacao_nova: 'ativa',
    motivo: 'Contrato do beta assinado',
    alterada_em: '2026-11-10T13:30:00Z',
    alterada_por_nome: 'Kadu Operador',
    total: 1,
  },
]

function cenarioDoOperador(
  extra: Record<string, unknown> = {},
  doisFatores: CenarioDoisFatores = COM_DOIS_FATORES,
) {
  falso.reiniciar({
    sessao: operador,
    doisFatores,
    rpc: {
      sou_operador: { data: true },
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      central_listar_consultorias: lista,
      central_detalhar_consultoria: { data: [detalhe] },
      central_listar_pessoas: { data: pessoas },
      central_historico_situacao: { data: historico },
      central_mudar_situacao: { data: 2 },
      central_resumo_de_uso: { data: [{ agora: 1, ultimos_7_dias: 4, ultimos_30_dias: 9 }] },
      central_alertas_sem_uso: { data: alertas },
      central_uso_por_modulo: { data: usoPorModulo },
      ...extra,
    },
  })
}

/** Confirmar só vale depois de um instante em que a confirmação já está na tela. */
function esperarConfirmacaoLiberar() {
  return new Promise((resolver) => setTimeout(resolver, 450))
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome)
}

describe('central administrativa: lista (ADM-01)', () => {
  beforeEach(() => {
    cenarioDoOperador()
  })

  it('operador vê as consultorias com Gestão, números e situação', async () => {
    renderizarApp('/admin')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Consultorias' }),
    ).toBeInTheDocument()
    const tabela = await screen.findByRole('table')
    const linha = within(tabela).getByRole('row', { name: /Filtroville/ })
    expect(within(linha).getByText('eduardo@filtroville.test')).toBeInTheDocument()
    expect(within(linha).getByText('Criada em 01/10/2026')).toBeInTheDocument()
    for (const numero of ['6', '12', '8', '15']) {
      expect(within(linha).getByText(numero)).toBeInTheDocument()
    }
    expect(within(linha).getByText('Ativa')).toBeInTheDocument()
    const outra = within(tabela).getByRole('row', { name: /Verde Sul/ })
    expect(within(outra).getByText('Teste')).toBeInTheDocument()
    expect(within(outra).getByText('Sem Gestão ativa')).toBeInTheDocument()
    expect(screen.getAllByText('2 consultorias').length).toBeGreaterThan(0)
    // Paginada: 50 por página.
    expect(chamadas('central_listar_consultorias')[0]?.[1]).toMatchObject({
      p_limite: 50,
      p_deslocamento: 0,
    })
  })

  it('busca pelo nome e filtra por situação', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/admin')
    await screen.findByRole('table')

    await usuario.type(
      screen.getByRole('searchbox', { name: 'Buscar consultoria pelo nome' }),
      'verde',
    )
    await waitFor(() => {
      expect(screen.queryByRole('row', { name: /Filtroville/ })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('row', { name: /Verde Sul/ })).toBeInTheDocument()
    expect(chamadas('central_listar_consultorias').at(-1)?.[1]).toMatchObject({ p_busca: 'verde' })

    await usuario.clear(screen.getByRole('searchbox', { name: 'Buscar consultoria pelo nome' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'Ativa')
    await waitFor(() => {
      expect(screen.queryByRole('row', { name: /Verde Sul/ })).not.toBeInTheDocument()
    })
    expect(router.state.location.search).toBe('?situacao=ativa')
    expect(chamadas('central_listar_consultorias').at(-1)?.[1]).toMatchObject({
      p_situacao: 'ativa',
    })
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/admin')
    await screen.findByRole('table')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('central administrativa: detalhe e situação (ADM-01)', () => {
  beforeEach(() => {
    cenarioDoOperador()
  })

  it('mostra números, Gestão, pessoas (só leitura) e o histórico', async () => {
    renderizarApp('/admin/consultorias/c-a')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Filtroville Consultoria Ambiental',
      }),
    ).toBeInTheDocument()

    const numeros = screen.getByRole('region', { name: 'Números' })
    expect(within(numeros).getByText('Licenças')).toBeInTheDocument()
    expect(within(numeros).getByText('15')).toBeInTheDocument()

    const secaoPessoas = screen.getByRole('region', { name: 'Pessoas' })
    const tabela = await within(secaoPessoas).findByRole('table')
    const diego = within(tabela).getByRole('row', { name: /Diego Souza/ })
    expect(within(diego).getByText('Desligado')).toBeInTheDocument()
    expect(within(tabela).getAllByText('Equipe')).toHaveLength(2)
    expect(within(secaoPessoas).queryByRole('button')).not.toBeInTheDocument()

    const secaoHistorico = screen.getByRole('region', { name: 'Histórico de situações' })
    expect(await within(secaoHistorico).findByText('Contrato do beta assinado')).toBeInTheDocument()
    expect(
      within(secaoHistorico).getByText(/10\/11\/2026 às 10:30 · Kadu Operador/),
    ).toBeInTheDocument()
  })

  it('mudar situação exige motivo, pede confirmação e manda versão e chave', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/admin/consultorias/c-a')
    await usuario.click(await screen.findByRole('button', { name: 'Mudar situação' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Mudar situação' })
    const opcoes = within(dialogo)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Teste', 'Suspensa', 'Arquivada'])

    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar' }))
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    expect(within(dialogo).getByRole('textbox', { name: 'Motivo' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(chamadas('central_mudar_situacao')).toHaveLength(0)

    await usuario.selectOptions(
      within(dialogo).getByRole('combobox', { name: 'Situação nova' }),
      'Suspensa',
    )
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), '  Fim do beta  ')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar' }))

    const confirmacao = await screen.findByRole('dialog', { name: 'Confirmar mudança' })
    expect(
      within(confirmacao).getByText('Filtroville Consultoria Ambiental: de Ativa para Suspensa.'),
    ).toBeInTheDocument()
    // Duplo clique em Continuar não confirma: o clique que chega logo depois é ignorado.
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Confirmar' }))
    expect(chamadas('central_mudar_situacao')).toHaveLength(0)
    await esperarConfirmacaoLiberar()
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Situação mudou para Suspensa.')).toBeInTheDocument()
    const [chamada] = chamadas('central_mudar_situacao')
    expect(chamada?.[1]).toMatchObject({
      p_consultoria_id: 'c-a',
      p_situacao: 'suspensa',
      p_motivo: 'Fim do beta',
      p_row_version: 1,
    })
    expect(chamada?.[1]?.p_chave).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('versão desatualizada mostra o aviso do banco', async () => {
    cenarioDoOperador({
      central_mudar_situacao: { error: { code: 'P0001', message: 'conflito_de_versao' } },
    })
    const usuario = userEvent.setup()
    renderizarApp('/admin/consultorias/c-a')
    await usuario.click(await screen.findByRole('button', { name: 'Mudar situação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mudar situação' })
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), 'Inadimplência')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Confirmar mudança' })
    await esperarConfirmacaoLiberar()
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Confirmar' }))
    expect(await within(confirmacao).findByRole('alert')).toHaveTextContent(
      'Isto foi alterado em outro lugar',
    )
  })

  it('não tem violações de acessibilidade detectáveis pelo axe (detalhe e diálogo)', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/admin/consultorias/c-a')
    await within(await screen.findByRole('region', { name: 'Pessoas' })).findByRole('table')
    await screen.findByText('Contrato do beta assinado')
    const pagina = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(pagina.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

    await usuario.click(screen.getByRole('button', { name: 'Mudar situação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mudar situação' })
    const resultado = await axe.run(dialogo, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('central administrativa: acesso', () => {
  it('quem não é operador vê "sem permissão" e nenhuma RPC da central é chamada', async () => {
    falso.reiniciar({
      sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
      rpc: {
        sou_operador: { data: false },
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      },
    })
    renderizarApp('/admin/consultorias/c-a')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc.startsWith('central_'))).toHaveLength(
      0,
    )
  })

  it('o banco recusando (sem_permissao) também vira "sem permissão"', async () => {
    cenarioDoOperador({
      central_listar_consultorias: { error: { code: '42501', message: 'sem_permissao' } },
    })
    renderizarApp('/admin')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
  })

  it('sem login, /admin vai para a tela de entrar', async () => {
    falso.reiniciar({})
    const { router } = renderizarApp('/admin')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/entrar')
    })
  })

  it('o menu da conta mostra a central só para operador', async () => {
    const usuario = userEvent.setup()
    cenarioDoOperador()
    const { router, unmount } = renderizarApp('/')
    await usuario.click(await screen.findByRole('button', { name: /^Conta de / }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Central administrativa' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin')
    })
    unmount()

    falso.reiniciar({
      sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
      rpc: {
        sou_operador: { data: false },
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      },
    })
    renderizarApp('/')
    await usuario.click(await screen.findByRole('button', { name: /^Conta de / }))
    await screen.findByRole('menuitem', { name: 'Meu perfil' })
    expect(
      screen.queryByRole('menuitem', { name: 'Central administrativa' }),
    ).not.toBeInTheDocument()
  })
})

describe('central administrativa: dois fatores (ADR-0024)', () => {
  it('operador sem fator cadastra o aplicativo autenticador antes de ver qualquer dado', async () => {
    const usuario = userEvent.setup()
    cenarioDoOperador({}, { nivel: 'aal1', fatores: [] })
    renderizarApp('/admin')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ative os dois fatores' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc.startsWith('central_'))).toHaveLength(
      0,
    )
    // O fator só é criado quando a pessoa pede.
    expect(falso.cliente.auth.mfa.enroll).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: 'Ativar dois fatores' }))
    const qr = await screen.findByRole('img', { name: 'QR code para o aplicativo autenticador' })
    expect(qr.getAttribute('src')).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(QR_CODE_FALSO)}`,
    )
    expect(screen.getByText(SEGREDO_FALSO)).toBeInTheDocument()
    expect(falso.cliente.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' })

    const campo = screen.getByRole('textbox', { name: 'Código de 6 dígitos' })
    expect(campo).toHaveAttribute('autocomplete', 'one-time-code')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    await usuario.type(campo, '12')
    await usuario.click(screen.getByRole('button', { name: 'Ativar' }))
    expect(screen.getByText('Informe os 6 dígitos')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(falso.cliente.auth.mfa.challengeAndVerify).not.toHaveBeenCalled()

    await usuario.clear(campo)
    await usuario.type(campo, '123 456')
    await usuario.click(screen.getByRole('button', { name: 'Ativar' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Consultorias' }),
    ).toBeInTheDocument()
    expect(falso.cliente.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'fator-novo',
      code: '123456',
    })
  })

  it('cadastro anterior pela metade é descartado antes de criar o fator novo', async () => {
    const usuario = userEvent.setup()
    cenarioDoOperador({}, { nivel: 'aal1', fatores: [{ id: 'velho', status: 'unverified' }] })
    renderizarApp('/admin')
    await usuario.click(await screen.findByRole('button', { name: 'Ativar dois fatores' }))
    await screen.findByRole('img', { name: 'QR code para o aplicativo autenticador' })
    expect(falso.cliente.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'velho' })
  })

  it('operador com fator e sessão só com senha (aal1) digita o código e segue', async () => {
    const usuario = userEvent.setup()
    cenarioDoOperador({}, { nivel: 'aal1', fatores: [{ id: 'fator-1', status: 'verified' }] })
    renderizarApp('/admin/consultorias/c-a')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirme o código' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'QR code para o aplicativo autenticador' }),
    ).not.toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Código de 6 dígitos' }), '654321')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Filtroville Consultoria Ambiental' }),
    ).toBeInTheDocument()
    expect(falso.cliente.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'fator-1',
      code: '654321',
    })
  })

  it('código errado mostra o erro, limpa o campo e não abre a central', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      sessao: operador,
      doisFatores: {
        nivel: 'aal1',
        fatores: [{ id: 'fator-1', status: 'verified' }],
        verificar: { error: { code: 'mfa_verification_failed', status: 422 } },
      },
      rpc: { sou_operador: { data: true } },
    })
    renderizarApp('/admin')
    const campo = await screen.findByRole('textbox', { name: 'Código de 6 dígitos' })
    await usuario.type(campo, '000000')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Código incorreto. Confira o aplicativo e tente de novo.',
    )
    expect(campo).toHaveValue('')
    expect(screen.getByRole('heading', { level: 1, name: 'Confirme o código' })).toBeInTheDocument()
  })

  it('o banco pedindo dois fatores não vira "sem permissão"', async () => {
    cenarioDoOperador({
      central_listar_consultorias: {
        error: { code: '42501', message: 'dois_fatores_necessarios' },
      },
    })
    renderizarApp('/admin')
    const secao = await screen.findByRole('region', { name: 'Todas as consultorias' })
    expect(await within(secao).findByRole('alert')).toHaveTextContent(
      'Confirme o código do aplicativo autenticador para continuar.',
    )
    expect(
      screen.queryByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).not.toBeInTheDocument()
  })

  it('erro ao conferir os dois fatores mostra erro com "Tentar de novo"', async () => {
    falso.reiniciar({
      sessao: operador,
      doisFatores: { erroAoLer: { message: 'falha de rede' } },
      rpc: { sou_operador: { data: true } },
    })
    renderizarApp('/admin')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conferir os dois fatores.',
    )
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe (cadastro do fator)', async () => {
    const usuario = userEvent.setup()
    cenarioDoOperador({}, { nivel: 'aal1', fatores: [] })
    const { container } = renderizarApp('/admin')
    await usuario.click(await screen.findByRole('button', { name: 'Ativar dois fatores' }))
    await screen.findByRole('textbox', { name: 'Código de 6 dígitos' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('central administrativa: uso (ADR-0024)', () => {
  beforeEach(() => {
    cenarioDoOperador()
  })

  it('visão geral: ativas agora, em 7 e 30 dias, alertas e último uso na lista', async () => {
    renderizarApp('/admin')

    const uso = await screen.findByRole('region', { name: 'Uso' })
    const numeros = await within(uso).findAllByRole('definition')
    expect(numeros.map((n) => n.textContent)).toEqual(['1', '4', '9'])
    expect(within(uso).getByText('Ativas agora')).toBeInTheDocument()
    expect(within(uso).getByText('Ativas em 7 dias')).toBeInTheDocument()
    expect(within(uso).getByText('Ativas em 30 dias')).toBeInTheDocument()

    const secaoAlertas = screen.getByRole('region', { name: /^Alertas/ })
    const lista = await within(secaoAlertas).findByRole('list', { name: 'Consultorias sem uso' })
    const [parada, nunca] = within(lista).getAllByRole('listitem')
    expect(parada).toHaveTextContent('Consultoria Parada')
    expect(parada).toHaveTextContent('Sem uso há 20 dias')
    expect(parada).toHaveTextContent('3 pessoas ativas')
    expect(nunca).toHaveTextContent('Nunca usou · criada há 30 dias')
    expect(within(lista).getByRole('link', { name: /Consultoria Que Nunca Usou/ })).toHaveAttribute(
      'href',
      '/admin/consultorias/c-d',
    )
    expect(chamadas('central_alertas_sem_uso')[0]?.[1]).toMatchObject({ p_dias: 14 })
    expect(chamadas('central_resumo_de_uso')[0]?.[1]).toMatchObject({ p_minutos_agora: 15 })

    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByRole('columnheader', { name: 'Último uso' })).toBeInTheDocument()
    const filtroville = within(tabela).getByRole('row', { name: /Filtroville/ })
    expect(within(filtroville).getByText('Agora')).toBeInTheDocument()
    const verde = within(tabela).getByRole('row', { name: /Verde Sul/ })
    expect(within(verde).getByText('02/11/2026')).toBeInTheDocument()
  })

  it('sem alertas: estado vazio', async () => {
    cenarioDoOperador({ central_alertas_sem_uso: { data: [] } })
    renderizarApp('/admin')
    const secaoAlertas = await screen.findByRole('region', { name: /^Alertas/ })
    expect(await within(secaoAlertas).findByText('Nenhum alerta')).toBeInTheDocument()
  })

  it('erro no resumo de uso aparece só na seção, com "Tentar de novo"', async () => {
    cenarioDoOperador({ central_resumo_de_uso: { error: { message: 'falha' } } })
    renderizarApp('/admin')
    const uso = await screen.findByRole('region', { name: 'Uso' })
    expect(await within(uso).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o uso.',
    )
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('detalhe: último uso e dias com uso por pessoa, e dias com uso por área', async () => {
    renderizarApp('/admin/consultorias/c-a')

    const porArea = await screen.findByRole('region', { name: 'Uso por área em 30 dias' })
    const areas = await within(porArea).findAllByRole('term')
    expect(areas.map((a) => a.textContent)).toEqual([
      'Licenças e prazos',
      'Orçamentos',
      'Propostas',
      'Equipe e conta',
    ])
    expect(
      within(porArea)
        .getAllByRole('definition')
        .map((d) => d.textContent),
    ).toEqual(['18 dias', '1 dia', '0 dias', '2 dias'])

    const secaoPessoas = screen.getByRole('region', { name: 'Pessoas' })
    const tabela = await within(secaoPessoas).findByRole('table')
    const ana = within(tabela).getByRole('row', { name: /Ana Ribeiro/ })
    expect(within(ana).getByText('Agora')).toBeInTheDocument()
    expect(within(ana).getByText('12')).toBeInTheDocument()
    const eduardo = within(tabela).getByRole('row', { name: /Eduardo Karnopp/ })
    expect(within(eduardo).getByText('10/11/2026 às 10:30')).toBeInTheDocument()
    const diego = within(tabela).getByRole('row', { name: /Diego Souza/ })
    expect(within(diego).getByText('Nunca')).toBeInTheDocument()
  })
})
