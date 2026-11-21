import assert from 'node:assert/strict'

import {
  atosDoJson,
  categoriaNormativa,
  coletarDiariosDoCiga,
  orgaoDaEntidade,
  urlDoDatasetDoMes,
  zipsDoDia,
} from './ciga.ts'
import { contextoDeDiario } from './fixtures/diarios.ts'
import { BancoFalso, html, type Rota } from './fixtures/falsos.ts'
import { zipGuardado } from './fixtures/zip.ts'

const DIA = '2026-11-19'
const BASE = 'https://dados.ciga.sc.gov.br/dataset/7d82ba47/resource'
const ZIP_MANHA = `${BASE}/aaa/download/cigadados_publicacoes_2026_11_19_0000_1159.zip`
const ZIP_TARDE = `${BASE}/bbb/download/cigadados_publicacoes_2026_11_19_1200_1559.zip`
const ZIP_OUTRO_DIA = `${BASE}/ccc/download/cigadados_publicacoes_2026_11_18_1600_2359.zip`

const PAGINA = `<html><body><h1>DOM/SC - Publicações de 11/2026</h1>
<a href="${ZIP_MANHA}">Baixar</a> <a href="${ZIP_MANHA}">Baixar</a>
<a href="${ZIP_TARDE}">Baixar</a> <a href="${ZIP_OUTRO_DIA}">Baixar</a></body></html>`

function ato(codigo: string, extra: Record<string, unknown>) {
  return {
    codigo,
    titulo: 'DECRETO Nº 1/2026',
    data: '2026-11-19 06:00:01',
    municipio: 'Blumenau',
    entidade: 'Prefeitura municipal de Blumenau',
    categoria: 'Decretos',
    link: `https://diariomunicipal.sc.gov.br/?q=id:${codigo}`,
    texto: '<p>Texto.</p>',
    ...extra,
  }
}

const MANHA = {
  autopublicacoes: [
    ato('100', {
      titulo: 'INSTRUÇÃO NORMATIVA Nº 5/2026',
      categoria: 'Instrução Normativa',
      entidade: 'Fundação do Meio Ambiente de Blumenau - FAEMA',
      texto:
        '<p>Dispõe sobre o licenciamento ambiental municipal. Revoga a Instrução Normativa nº 2/2020. Fulano de Tal, CPF 123.456.789-09.</p>',
    }),
    ato('101', {
      titulo: 'AUTORIZAÇÃO AMBIENTAL Nº 22/2026',
      categoria: 'Licenciamento ambiental',
      texto: '<p>Autorização ambiental concedida à Empresa Exemplo Ltda.</p>',
    }),
    ato('102', {
      titulo: 'PORTARIA Nº 50/2026',
      categoria: 'Portarias',
      texto: '<p>Nomeia Fulano de Tal para o cargo de assessor.</p>',
    }),
    ato('103', { municipio: 'Chapecó', titulo: 'LEI Nº 9/2026', categoria: 'Leis' }),
    ato('104', { categoria: 'Contratos', titulo: 'EXTRATO DE CONTRATO Nº 3/2026' }),
  ],
}
const TARDE = {
  edicao_ordinaria: {
    atos: [
      ato('100', {
        titulo: 'INSTRUÇÃO NORMATIVA Nº 5/2026',
        categoria: 'Instrução Normativa',
        entidade: 'Fundação do Meio Ambiente de Blumenau - FAEMA',
        texto: '<p>Dispõe sobre o licenciamento ambiental municipal.</p>',
      }),
    ],
  },
}

function rotas(): Record<string, Rota> {
  const zip = (conteudo: unknown) => () =>
    new Response(zipGuardado({ 'publicacoes.json': JSON.stringify(conteudo) }), {
      headers: { 'Content-Type': 'application/zip' },
    })
  return {
    [`GET ${urlDoDatasetDoMes(DIA)}`]: () => html(PAGINA),
    [`GET ${ZIP_MANHA}`]: zip(MANHA),
    [`GET ${ZIP_TARDE}`]: zip(TARDE),
  }
}

function bancoComBlumenau(): BancoFalso {
  const banco = new BancoFalso()
  banco.vigiados = [{ ibge: '4202404', nome: 'Blumenau' }]
  banco.carregar({
    chave: 'sc;4202404;faema;instrucao_normativa;2;2020',
    fonte: 'ciga',
    id_externo: '1',
  })
  return banco
}

Deno.test('CIGA: URL do dataset do mês e ZIPs do dia, sem repetir', () => {
  assert.equal(
    urlDoDatasetDoMes(DIA),
    'https://dados.ciga.sc.gov.br/dataset/domsc-publicacoes-de-11-2026',
  )
  assert.deepEqual(zipsDoDia(PAGINA, DIA), [ZIP_MANHA, ZIP_TARDE])
})

Deno.test('CIGA: lê as três listas do JSON, a categoria e o órgão', () => {
  assert.equal(atosDoJson(MANHA).length, 5)
  assert.equal(atosDoJson(TARDE).length, 1)
  assert.equal(atosDoJson({ edicoes_ordinarias_exclusivas: [{ atos: [ato('9', {})] }] }).length, 1)
  assert.equal(categoriaNormativa('Instrução Normativa'), true)
  assert.equal(categoriaNormativa('Contratos'), false)
  assert.equal(orgaoDaEntidade('Fundação do Meio Ambiente de Blumenau - FAEMA'), 'FAEMA')
  assert.equal(orgaoDaEntidade('Prefeitura municipal de Blumenau'), 'prefeitura')
})

Deno.test(
  'CIGA: só município vigiado e ato normativo ambiental; sem CPF; revoga a IN anterior',
  async () => {
    const banco = bancoComBlumenau()
    const { ctx } = contextoDeDiario(banco, rotas(), { fonte: 'ciga', janela: DIA })

    await coletarDiariosDoCiga(ctx)

    const chave = 'sc;4202404;faema;instrucao_normativa;5;2026'
    const [versao] = banco.versoesDa(chave)
    assert.ok(versao, 'a IN da FAEMA entra no catálogo')
    assert.doesNotMatch(versao?.texto ?? '', /123\.456\.789-09/)
    assert.equal(banco.versoesDa(chave).length, 1, 'o mesmo ato na janela da tarde não duplica')
    assert.equal(
      banco.norma('sc;4202404;faema;instrucao_normativa;2;2020')?.situacao_na_fonte,
      'revogada',
    )
    assert.equal(banco.normas.length, 2, 'AuA, nomeação, contrato e Chapecó ficam fora')
    assert.deepEqual(ctx.contagem.falhas, [])
  },
)

Deno.test('CIGA: sem município vigiado não baixa nada', async () => {
  const banco = new BancoFalso()
  const { ctx, rede } = contextoDeDiario(banco, rotas(), { fonte: 'ciga', janela: DIA })
  await coletarDiariosDoCiga(ctx)
  assert.equal(rede.chamadas.length, 0)
})
