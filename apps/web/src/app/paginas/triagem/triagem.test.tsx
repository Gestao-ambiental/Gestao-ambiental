import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResultadoDoLocal } from '@/lib/api/consulta-de-local'
import { falso, type Cenario } from '@/test/supabase-falso'

import { PaginaTriagem } from './PaginaTriagem'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))
// O Leaflet não desenha no jsdom: o mapa vira um botão que marca o Centro de Joinville.
vi.mock('./MapaDoLocal', () => ({
  default: ({
    aoEscolher,
  }: {
    aoEscolher: (c: { latitude: number; longitude: number }) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        aoEscolher({ latitude: -26.3044, longitude: -48.8487 })
      }}
    >
      Marcar no mapa
    </button>
  ),
}))

const CENTRO: ResultadoDoLocal = {
  municipio: { codigoIbge: '4209102', nome: 'Joinville' },
  lote: { inscricaoImobiliaria: '13-20-23-7-239', quadra: null, lote: '239', areaM2: 2312.2588 },
  bairro: 'CENTRO',
  zoneamento: { setor: 'SA-01', macrozona: 'AUAP' },
  restricoes: [
    {
      tipo: 'inundacao',
      descricao: 'Dentro da mancha de inundação',
      fonte: 'SIMGeo Joinville, Mancha de inundação',
    },
  ],
  falhas: [],
  fontes: [],
}

const DONA_FRANCISCA = {
  rotulo: 'Rua Dona Francisca',
  detalhe: 'Centro, Joinville',
  latitude: -26.29591,
  longitude: -48.84275,
}

function cenario(funcoes: Cenario['funcoes'] = {}): Cenario {
  return {
    funcoes: {
      'consultar-local': { data: CENTRO },
      'buscar-endereco': { data: { sugestoes: [DONA_FRANCISCA] } },
      ...funcoes,
    },
  }
}

beforeEach(() => {
  falso.reiniciar(cenario())
  window.localStorage.clear()
})

function montar(caminho = '/triagem') {
  const usuario = userEvent.setup()
  const cliente = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const tela = render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[caminho]}>
        <PaginaTriagem />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { usuario, ...tela }
}

type Usuario = ReturnType<typeof userEvent.setup>

async function continuar(usuario: Usuario) {
  await usuario.click(screen.getByRole('button', { name: /^Continuar para/ }))
}

async function irParaAtividades(usuario: Usuario) {
  await usuario.click(screen.getByRole('button', { name: 'Continuar para atividades e porte' }))
}

async function irParaResultado(usuario: Usuario) {
  await usuario.click(screen.getByRole('button', { name: 'Continuar para resultado' }))
}

async function voltar(usuario: Usuario, para: string) {
  await usuario.click(screen.getByRole('button', { name: para }))
}

async function incluir(usuario: Usuario, termo: string, codigo: string) {
  const busca = screen.getByRole('searchbox', { name: /Atividade/ })
  await usuario.clear(busca)
  await usuario.type(busca, termo)
  await usuario.click(screen.getByRole('button', { name: `Incluir ${codigo}` }))
}

async function digitarNoParametro(
  usuario: Usuario,
  codigo: string,
  parametro: RegExp,
  valor: string,
) {
  const cartao = screen.getByRole('article', {
    name: new RegExp(`^${codigo.replace(/\./g, '\\.')}`),
  })
  const campo = within(cartao).getByRole('textbox', { name: parametro })
  await usuario.clear(campo)
  await usuario.type(campo, valor)
}

function resumo() {
  return screen.getByRole('region', { name: 'Resumo da triagem' })
}

async function escolherHabilitacao(usuario: Usuario, nivel: '1' | '2' | '3' | '') {
  await usuario.click(within(resumo()).getByRole('button', { name: /^Trocar a habilitação/ }))
  await usuario.selectOptions(
    within(resumo()).getByRole('combobox', { name: /Habilitação do município/ }),
    nivel,
  )
}

describe('etapas da triagem, como no orçamento', () => {
  it('começa no Local, com a trilha, o endereço primeiro e o resumo do que já se sabe', () => {
    montar()
    expect(screen.getByRole('heading', { name: 'Triagem de licenciamento' })).toBeInTheDocument()
    expect(screen.getByText('Triagem, não enquadramento oficial')).toBeInTheDocument()
    const trilha = screen.getByRole('navigation', { name: 'Etapas da triagem' })
    expect(within(trilha).getByText('Local')).toBeInTheDocument()
    expect(within(trilha).getByText('Atividades e porte')).toBeInTheDocument()
    expect(within(trilha).getByText('Resultado')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Local' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Endereço' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tenho as coordenadas' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Coordenadas/ })).not.toBeInTheDocument()
    expect(within(resumo()).getByText('não marcado')).toBeInTheDocument()
    expect(within(resumo()).getByText('pendente')).toBeInTheDocument()
    // A habilitação saiu do meio do caminho: fica no resumo, junto do município.
    expect(screen.queryByRole('combobox', { name: /Habilitação/ })).not.toBeInTheDocument()
  })

  it('sem atividade não continua para o resultado; ?etapa=resultado cai nas atividades', async () => {
    const { usuario } = montar('/triagem?etapa=resultado')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Atividades e porte' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Nenhuma atividade incluída')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar para resultado' })).toBeDisabled()

    await incluir(usuario, '12.80.10', '12.80.10')
    await irParaResultado(usuario)
    const titulo = screen.getByRole('heading', { level: 2, name: 'Resultado' })
    expect(titulo).toHaveFocus()
    expect(screen.queryByRole('button', { name: /^Continuar para/ })).not.toBeInTheDocument()
  })

  it('voltar ao Local mantém o ponto, a consulta e as atividades', async () => {
    const { usuario } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    expect(await screen.findByText('Joinville (IBGE 4209102)')).toBeInTheDocument()
    await irParaAtividades(usuario)
    await incluir(usuario, '12.80.10', '12.80.10')
    await voltar(usuario, 'Local')
    expect(screen.getByText('Joinville (IBGE 4209102)')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).toHaveBeenCalledTimes(1)
    await continuar(usuario)
    expect(screen.getByRole('article', { name: /^12\.80\.10/ })).toBeInTheDocument()
  })
})

describe('local do empreendimento', () => {
  it('endereço: sugere enquanto digita (só SC), escolhe, marca o ponto e consulta o local', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Endereço' }), 'Rua Dona Francisca')
    const opcao = await screen.findByRole('option', { name: /^Rua Dona Francisca/ })
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('buscar-endereco', {
      body: { texto: 'Rua Dona Francisca' },
    })
    expect(opcao).toHaveTextContent('Centro, Joinville')
    await usuario.click(opcao)

    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: { latitude: -26.29591, longitude: -48.84275 },
    })
    expect(await screen.findByText('Joinville (IBGE 4209102)')).toBeInTheDocument()
    expect(within(resumo()).getByText('Rua Dona Francisca')).toBeInTheDocument()
    expect(within(resumo()).getByText('Joinville')).toBeInTheDocument()
    expect(within(resumo()).getByText('13-20-23-7-239')).toBeInTheDocument()
    expect(within(resumo()).getByText('Dentro da mancha de inundação')).toBeInTheDocument()
  })

  it('endereço sem resultado em SC diz para marcar no mapa', async () => {
    falso.reiniciar(cenario({ 'buscar-endereco': { data: { sugestoes: [] } } }))
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Endereço' }), 'Rua que não existe')
    expect(
      await screen.findByText('Nenhum endereço encontrado em Santa Catarina. Marque no mapa.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('erro da busca de endereço aparece na lista, sem travar o mapa', async () => {
    falso.reiniciar(
      cenario({
        'buscar-endereco': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'muitas_buscas' }), { status: 429 }),
          ),
        },
      }),
    )
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Endereço' }), 'Rua Dona Francisca')
    expect(
      await screen.findByText('Muitas buscas seguidas. Espere um instante e tente de novo.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar no mapa' })).toBeEnabled()
  })

  it('com menos de 4 letras não busca', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Endereço' }), 'Rua')
    await new Promise((r) => setTimeout(r, 500))
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
  })

  it('marcar no mapa consulta o local e mostra município, inscrição, zoneamento e restrições', async () => {
    const { usuario } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    expect(await screen.findByText('Joinville (IBGE 4209102)')).toBeInTheDocument()
    expect(screen.getByText(/13-20-23-7-239 · lote de 2\.312 m² \(0,2312 ha\)/)).toBeInTheDocument()
    expect(screen.getByText('Setor SA-01, AUAP · bairro CENTRO')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: { latitude: -26.3044, longitude: -48.8487 },
    })
    expect(within(resumo()).getByText('-26.30440, -48.84870')).toBeInTheDocument()
  })

  it('tenho as coordenadas: inválidas e fora de SC avisam sem chamar a função; válidas consultam', async () => {
    const { usuario } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Tenho as coordenadas' }))
    const campo = screen.getByRole('textbox', { name: /Coordenadas/ })
    await usuario.type(campo, 'Joinville')
    await usuario.click(screen.getByRole('button', { name: 'Marcar' }))
    expect(screen.getByText(/Use latitude e longitude em graus/)).toBeInTheDocument()
    await usuario.clear(campo)
    await usuario.type(campo, '-23.55, -46.63')
    await usuario.click(screen.getByRole('button', { name: 'Marcar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('O ponto está fora de Santa Catarina.')
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()

    await usuario.clear(campo)
    await usuario.type(campo, '-26.3044, -48.8487')
    await usuario.click(screen.getByRole('button', { name: 'Marcar' }))
    expect(await screen.findByText('Joinville (IBGE 4209102)')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Usar o endereço' }))
    expect(screen.getByRole('combobox', { name: 'Endereço' })).toBeInTheDocument()
  })

  it('erro da consulta do local aparece como alerta', async () => {
    falso.reiniciar(
      cenario({
        'consultar-local': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'sem_permissao' }), { status: 401 }),
          ),
        },
      }),
    )
    const { usuario } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão expirou. Entre de novo.')
  })

  it('camada que falhou aparece como consulta incompleta; fora de Joinville avisa do SIMGeo', async () => {
    falso.reiniciar(
      cenario({
        'consultar-local': {
          data: {
            ...CENTRO,
            municipio: { codigoIbge: '4205407', nome: 'Florianópolis' },
            lote: null,
            bairro: null,
            zoneamento: null,
            restricoes: [],
            falhas: ['IMA/SC, Terra Indígena (FUNAI)'],
          },
        },
      }),
    )
    const { usuario } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    expect(await screen.findByText('Consulta incompleta')).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma restrição encontrada/)).toBeInTheDocument()
    expect(screen.getByText(/só em Joinville \(SIMGeo\)/)).toBeInTheDocument()
    expect(within(resumo()).getByText('Nenhuma encontrada')).toBeInTheDocument()
  })

  it('a área do lote preenche o AU(3) das atividades incluídas e das que vierem depois', async () => {
    const { usuario } = montar()
    await usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    await usuario.click(
      await screen.findByRole('button', { name: 'Usar a área do lote como AU(3)' }),
    )
    await irParaAtividades(usuario)
    await incluir(usuario, '12.80.10', '12.80.10')
    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    expect(within(cartao).getByRole('textbox', { name: /AU\(3\)/ })).toHaveValue('0,2312')
    expect(within(cartao).getByText(/Porte médio/)).toBeInTheDocument()
  })

  it('a habilitação fica junto do município e é lembrada para o mesmo município', async () => {
    const primeira = montar()
    await primeira.usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    await screen.findByText('Joinville (IBGE 4209102)')
    await escolherHabilitacao(primeira.usuario, '2')
    expect(within(resumo()).getByText('Nível II')).toBeInTheDocument()
    primeira.unmount()

    const segunda = montar()
    await segunda.usuario.click(screen.getByRole('button', { name: 'Marcar no mapa' }))
    await screen.findByText('Joinville (IBGE 4209102)')
    expect(within(resumo()).getByText('Nível II')).toBeInTheDocument()
  })
})

describe('o que o simulador do IMA mostra: taxa, IN e TFASC', () => {
  it('trifásica no IMA mostra LAP, LAI, LAO e total pela classe porte,potencial', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    await irParaResultado(usuario)
    const noIma = screen.getByRole('region', { name: 'No IMA: 12.80.10' })
    // Antes de enquadrar, já mostra a IN e a TFASC, sem taxa.
    expect(within(noIma).queryByText('LAP')).not.toBeInTheDocument()
    expect(
      within(noIma).getByRole('link', {
        name: 'IN 19 · SERVIÇO INDUSTRIAL DE USINAGEM, SOLDAS E SEMELHANTES',
      }),
    ).toHaveAttribute('href', 'https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/189')
    expect(within(noIma).getByText('Revogada no site do IMA')).toBeInTheDocument()
    expect(within(noIma).getByText(/^Paga TFASC/)).toBeInTheDocument()

    await voltar(usuario, 'Atividades e porte')
    await digitarNoParametro(usuario, '12.80.10', /AU\(3\)/, '0,5')
    await irParaResultado(usuario)
    const taxa = screen.getByRole('region', { name: 'No IMA: 12.80.10' })
    expect(within(taxa).getByText('R$ 1.129,72')).toBeInTheDocument()
    expect(within(taxa).getByText('R$ 2.810,36')).toBeInTheDocument()
    expect(within(taxa).getByText('R$ 5.620,79')).toBeInTheDocument()
    expect(within(taxa).getByText('R$ 9.560,87')).toBeInTheDocument()
    expect(within(taxa).getByText(/Classe M,M \(porte, potencial\)/)).toBeInTheDocument()
  })

  it('AuA mostra a taxa fixa; suinocultura usa a fórmula e pede o parâmetro', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    await digitarNoParametro(usuario, '12.80.10', /AU\(3\)/, '0,01')
    await incluir(usuario, '01.54.00', '01.54.00')
    await digitarNoParametro(usuario, '01.54.00', /CmáxC/, '1.000')
    await irParaResultado(usuario)
    expect(screen.getByText('Taxa da AuA: R$ 68,56')).toBeInTheDocument()
    const noIma = screen.getByRole('region', { name: 'No IMA: 01.54.00' })
    expect(within(noIma).getByText('R$ 134,93')).toBeInTheDocument()
    expect(within(noIma).getByText(/Fórmula: Pr = 24,93 \+ 0,11 × NC/)).toBeInTheDocument()
  })

  it('no município não mostra taxa do IMA; potencial divergente do simulador é avisado', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await escolherHabilitacao(usuario, '1')
    await incluir(usuario, '12.80.00', '12.80.00')
    await digitarNoParametro(usuario, '12.80.00', /AU\(3\)/, '0,15')
    await incluir(usuario, '17.21.00', '17.21.00')
    await irParaResultado(usuario)
    const cartao = screen.getByRole('article', { name: /^12\.80\.00/ })
    expect(
      within(cartao).getByText('Licenciamento no município: a taxa é a do município.'),
    ).toBeInTheDocument()
    expect(within(cartao).queryByText('LAP')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: /^17\.21\.00/ })).getByText(
        /O simulador do IMA ainda usa potencial poluidor G; a resolução vigente diz M\./,
      ),
    ).toBeInTheDocument()
  })
})

describe('atividades e resultado', () => {
  it('busca por palavra, inclui a atividade e enquadra pelo parâmetro digitado em formato brasileiro', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, 'usinagem pintura', '12.80.10')

    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    expect(within(cartao).getByText(/Informe AU\(3\) para enquadrar/)).toBeInTheDocument()

    await digitarNoParametro(usuario, '12.80.10', /AU\(3\)/, '0,5')
    expect(within(cartao).getByText('Enquadrada')).toBeInTheDocument()
    expect(within(cartao).getByText(/Porte médio/)).toBeInTheDocument()

    await irParaResultado(usuario)
    const resultado = screen.getByRole('article', { name: /^12\.80\.10/ })
    expect(within(resultado).getByText('Médio')).toBeInTheDocument()
    expect(within(resultado).getByText('RAP (Relatório Ambiental Prévio)')).toBeInTheDocument()
    expect(within(resultado).getByText('Porte Médio: 0,2 < AU(3) < 1 (RAP)')).toBeInTheDocument()
    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText(/pela atividade 12\.80\.10/)).toBeInTheDocument()
  })

  it('o resultado mostra grande quem licencia, a modalidade, o estudo e a taxa; o resumo também', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    await digitarNoParametro(usuario, '12.80.10', /AU\(3\)/, '0,5')
    // No resumo, a sigla grande e, embaixo, o nome por extenso e quem licencia.
    expect(within(resumo()).getByText('LAP, LAI e LAO')).toBeInTheDocument()
    expect(
      within(resumo()).getByText('Licenciamento trifásico · Licencia o Estado (IMA)'),
    ).toBeInTheDocument()
    await irParaResultado(usuario)
    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText('Estado (IMA)')).toBeInTheDocument()
    expect(within(conclusao).getByText('LAP, LAI e LAO')).toBeInTheDocument()
    expect(within(conclusao).getByText('RAP')).toBeInTheDocument()
    // A mesma taxa total do cartão "No IMA", sem somar nada que a regra não some.
    expect(within(conclusao).getByText('R$ 9.560,87')).toBeInTheDocument()
  })

  it('as fontes legais ficam no resultado, num detalhe recolhível', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    await irParaResultado(usuario)
    expect(screen.getByText('Sobre as fontes')).toBeInTheDocument()
    expect(screen.getByText(/Confira com o órgão licenciador/)).not.toBeVisible()
  })

  it('porte mínimo vira AuA com estudo dispensado', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    await digitarNoParametro(usuario, '12.80.10', /AU\(3\)/, '0,01')
    await irParaResultado(usuario)
    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    expect(within(cartao).getByText('Autorização Ambiental (AuA)')).toBeInTheDocument()
    expect(within(cartao).getByText('Dispensado (Art. 22)')).toBeInTheDocument()
  })

  it('valor inválido avisa na hora, e abaixo do limite fala da Certidão de Conformidade', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '01.54.01', '01.54.01')
    await digitarNoParametro(usuario, '01.54.01', /CmáxM/, 'abc')
    const cartao = screen.getByRole('article', { name: /^01\.54\.01/ })
    expect(within(cartao).getByText(/use um número maior ou igual a zero/)).toBeInTheDocument()

    await digitarNoParametro(usuario, '01.54.01', /CmáxM/, '10')
    expect(within(cartao).getByText(/Abaixo do limite de licenciamento/)).toBeInTheDocument()
    await irParaResultado(usuario)
    expect(
      screen.getByText(/Certidão de Conformidade Ambiental, a CCA \(Art\. 14\)/),
    ).toBeInTheDocument()
  })

  it('com várias atividades, o estudo é o da mais complexa; remover tira da conclusão', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    await digitarNoParametro(usuario, '12.80.10', /AU\(3\)/, '0,1')
    await incluir(usuario, '17.21.00', '17.21.00')
    await digitarNoParametro(usuario, '17.21.00', /AU\(3\)/, '2')
    await irParaResultado(usuario)

    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText('EAS')).toBeInTheDocument()
    expect(
      within(conclusao).getByText('Estudo Ambiental Simplificado, pela atividade 17.21.00'),
    ).toBeInTheDocument()

    await voltar(usuario, 'Atividades e porte')
    await usuario.click(screen.getByRole('button', { name: 'Remover 17.21.00' }))
    expect(screen.queryByRole('article', { name: /^17\.21\.00/ })).not.toBeInTheDocument()
    await irParaResultado(usuario)
    const depois = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(depois).getByText('RAP')).toBeInTheDocument()
    expect(
      within(depois).getByText('Relatório Ambiental Prévio, pela atividade 12.80.10'),
    ).toBeInTheDocument()
  })

  it('quem licencia: sem habilitação, o resultado oferece a troca; com nível I, município; acima, Estado', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.00', '12.80.00')
    await digitarNoParametro(usuario, '12.80.00', /AU\(3\)/, '0,15')
    await irParaResultado(usuario)
    const cartao = screen.getByRole('article', { name: /^12\.80\.00/ })
    expect(within(cartao).getByText('Quem licencia: Estado (IMA)')).toBeInTheDocument()
    expect(within(cartao).getByText(/município sem habilitação informada/)).toBeInTheDocument()

    // A troca da habilitação aparece ali mesmo, onde ela decide quem licencia.
    await usuario.click(within(cartao).getByRole('button', { name: /^Trocar a habilitação/ }))
    await usuario.selectOptions(
      within(cartao).getByRole('combobox', { name: /Habilitação do município/ }),
      '1',
    )
    expect(within(cartao).getByText(/Quem licencia: município/)).toBeInTheDocument()
    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText('Município')).toBeInTheDocument()
    expect(within(conclusao).getByText('Do município')).toBeInTheDocument()
    expect(within(resumo()).getByText(/Licencia o município/)).toBeInTheDocument()

    await voltar(usuario, 'Atividades e porte')
    await digitarNoParametro(usuario, '12.80.00', /AU\(3\)/, '2')
    await irParaResultado(usuario)
    const acima = screen.getByRole('article', { name: /^12\.80\.00/ })
    expect(within(acima).getByText('Quem licencia: Estado (IMA)')).toBeInTheDocument()
    expect(
      within(acima).getByText(/porte fora das faixas que o município pode licenciar/),
    ).toBeInTheDocument()
  })

  it('não inclui a mesma atividade duas vezes', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '12.80.10', '12.80.10')
    expect(screen.getByRole('button', { name: '12.80.10 já incluída' })).toBeDisabled()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('busca de atividade sem resultado avisa', async () => {
    const { usuario } = montar('/triagem?etapa=atividades')
    await usuario.type(screen.getByRole('searchbox', { name: /Atividade/ }), 'xyzzy')
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma atividade do Anexo VI encontrada')
  })
})

describe('acessibilidade', () => {
  it('sem violações no local com o endereço aberto', async () => {
    const { usuario, container } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Endereço' }), 'Rua Dona Francisca')
    await screen.findByRole('option', { name: /^Rua Dona Francisca/ })
    const r = await axe.run(container)
    expect(r.violations.map((v) => v.id)).toEqual([])
  })

  it('sem violações no resultado com uma atividade enquadrada', async () => {
    const { usuario, container } = montar('/triagem?etapa=atividades')
    await incluir(usuario, '00.12.03', '00.12.03')
    await digitarNoParametro(usuario, '00.12.03', /PA/, '10.000')
    await irParaResultado(usuario)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Conclusão da triagem' })).toBeInTheDocument()
    })
    const r = await axe.run(container)
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})
