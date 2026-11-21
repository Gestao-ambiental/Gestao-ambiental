import assert from 'node:assert/strict'

import { ErroDaColeta } from './comum.ts'
import { zipComDeflate, zipGuardado } from './fixtures/zip.ts'
import { contextoDeDiario } from './fixtures/diarios.ts'
import { BancoFalso, html, type Rota } from './fixtures/falsos.ts'
import {
  BASE_DO_INLABS,
  coletarDouPeloInlabs,
  lerMateriaDoInlabs,
  orgaoDaMateria,
  xmlsDoZip,
} from './inlabs.ts'
import { coletarLeisDoPlanalto, textoVigenteDoPlanalto, urlNoPlanalto } from './planalto.ts'

// ---------------------------------------------------------------------------
// Planalto
// ---------------------------------------------------------------------------
const CAMINHO_6938 = 'ccivil_03/leis/l6938.htm'
const URL_6938 = 'https://www.planalto.gov.br/ccivil_03/leis/l6938.htm'

function paginaDaLei(artigo3: string): string {
  const corpo = [
    '<p>Art. 1º Esta Lei estabelece a Política Nacional do Meio Ambiente, seus fins e mecanismos de formulação e aplicação.</p>',
    '<p>Art. 2º A Política Nacional do Meio Ambiente tem por objetivo a preservação, melhoria e recuperação da qualidade ambiental.</p>',
    `<p>Art. 3º ${artigo3}</p>`,
    '<p><strike>Art. 4º Texto revogado que não vale mais.</strike></p>',
  ].join('\n')
  return `<html><head><title>L6938</title></head><body>${corpo}</body></html>`
}

function paginaComMarca(corpo: string, etag: string): Response {
  const resposta = html(corpo)
  resposta.headers.set('ETag', etag)
  return resposta
}

function bancoDoPlanalto(): BancoFalso {
  const banco = new BancoFalso()
  banco.carregar({ chave: 'br;federal;lei;6938;1981', fonte: 'planalto', id_externo: CAMINHO_6938 })
  return banco
}

Deno.test('Planalto: o texto vigente tira os trechos riscados', () => {
  const texto = textoVigenteDoPlanalto(
    paginaDaLei('Para os fins desta Lei, entende-se por meio ambiente.'),
  )
  assert.match(texto, /Art\. 3º Para os fins desta Lei/)
  assert.doesNotMatch(texto, /Texto revogado/)
})

Deno.test('Planalto: caminho com domínio ou que sobe pastas é recusado', () => {
  assert.equal(urlNoPlanalto(CAMINHO_6938), URL_6938)
  assert.throws(() => urlNoPlanalto('ccivil_03/../etc/senha.htm'), ErroDaColeta)
  assert.throws(() => urlNoPlanalto('https://outro.site/l6938.htm'), ErroDaColeta)
})

Deno.test('Planalto: versão-base, 304 sem baixar e versão nova com a diferença', async () => {
  const banco = bancoDoPlanalto()
  let etag = '"v1"'
  let corpo = paginaDaLei(
    'Para os fins desta Lei, entende-se por meio ambiente o conjunto de condições.',
  )
  const rotas: Record<string, Rota> = {
    [`GET ${URL_6938}`]: (chamada) =>
      chamada.cabecalhos.get('if-none-match') === etag
        ? new Response(null, { status: 304 })
        : paginaComMarca(corpo, etag),
  }

  const primeira = contextoDeDiario(banco, rotas, { fonte: 'planalto' })
  await coletarLeisDoPlanalto(primeira.ctx)
  const [base] = banco.versoesDa('br;federal;lei;6938;1981')
  assert.equal(base?.id_externo, '"v1"')
  assert.equal(primeira.ctx.contagem.baixados, 1)
  assert.equal(banco.mudancas.length, 0)

  const segunda = contextoDeDiario(banco, rotas, { fonte: 'planalto' })
  await coletarLeisDoPlanalto(segunda.ctx)
  assert.equal(segunda.rede.chamadas[0]?.cabecalhos.get('if-none-match'), '"v1"')
  assert.equal(segunda.ctx.contagem.baixados, 0)
  assert.equal(banco.versoesDa('br;federal;lei;6938;1981').length, 1)

  etag = '"v2"'
  corpo = paginaDaLei(
    'Para os fins desta Lei, entende-se por meio ambiente o conjunto de condições, leis e influências.',
  )
  const terceira = contextoDeDiario(banco, rotas, { fonte: 'planalto' })
  await coletarLeisDoPlanalto(terceira.ctx)
  assert.equal(banco.versoesDa('br;federal;lei;6938;1981').length, 2)
  assert.equal(banco.mudancas[0]?.tipo, 'alterada')
})

// ---------------------------------------------------------------------------
// INLABS
// ---------------------------------------------------------------------------
const DIA = '2026-11-18'
const URL_LOGIN = `${BASE_DO_INLABS}/logar.php`
const URL_DO1 = `${BASE_DO_INLABS}/index.php?p=${DIA}&dl=${DIA}-DO1.zip`

function materia(atributos: string, identifica: string, ementa: string, texto: string): string {
  return `<xml><article id="${atributos.split('|')[0]}" artType="${atributos.split('|')[1]}" artCategory="${atributos.split('|')[2]}" pubDate="18/11/2026"><body><Identifica><![CDATA[${identifica}]]></Identifica><Ementa><![CDATA[${ementa}]]></Ementa><Texto><![CDATA[<p>${texto}</p>]]></Texto></body></article></xml>`
}

const RESOLUCAO_CONAMA = materia(
  '901|Resolução|Ministério do Meio Ambiente e Mudança do Clima/Conselho Nacional do Meio Ambiente',
  'RESOLUÇÃO CONAMA Nº 520, DE 17 DE NOVEMBRO DE 2026',
  'Dispõe sobre o licenciamento ambiental de atividades de baixo impacto.',
  'Art. 1º Fica disciplinado o licenciamento ambiental. Art. 2º Revoga a Resolução CONAMA nº 237, de 19 de dezembro de 1997. Responsável: Fulano de Tal, CPF 123.456.789-09.',
)
const PORTARIA_DA_SAUDE = materia(
  '902|Portaria|Ministério da Saúde/Secretaria Executiva',
  'PORTARIA Nº 10, DE 17 DE NOVEMBRO DE 2026',
  'Dispõe sobre vacinação.',
  'Art. 1º Fica aprovado o calendário.',
)
const NOMEACAO = materia(
  '903|Decreto|Atos do Poder Executivo',
  'DECRETO DE 17 DE NOVEMBRO DE 2026',
  'Nomeia Fulano de Tal.',
  'Nomeia Fulano de Tal para exercer o cargo.',
)

function zipDoDia(): Response {
  const bytes = zipGuardado({
    '901.xml': RESOLUCAO_CONAMA,
    '902.xml': PORTARIA_DA_SAUDE,
    '903.xml': NOMEACAO,
  })
  return new Response(bytes, { headers: { 'Content-Type': 'application/zip' } })
}

function rotasDoInlabs(): Record<string, Rota> {
  return {
    [`POST ${URL_LOGIN}`]: () =>
      new Response(null, {
        status: 302,
        headers: {
          Location: '/index.php',
          'Set-Cookie': 'inlabs_session_cookie=sessao123; path=/',
        },
      }),
    [`GET ${URL_DO1}`]: (chamada) =>
      chamada.cabecalhos.get('cookie') === 'inlabs_session_cookie=sessao123'
        ? zipDoDia()
        : new Response('sem sessão', { status: 403 }),
  }
}

Deno.test('INLABS: lê a matéria, o órgão e os XMLs do ZIP', async () => {
  const lida = lerMateriaDoInlabs(RESOLUCAO_CONAMA)
  assert.equal(lida?.id, '901')
  assert.equal(lida?.publicadaEm, DIA)
  assert.equal(orgaoDaMateria(lida ?? { categoria: '' }), 'CONAMA')
  assert.equal(orgaoDaMateria({ categoria: 'Ministério da Saúde/Secretaria Executiva' }), null)
  assert.equal(orgaoDaMateria({ categoria: 'Atos do Poder Executivo' }), 'federal')
  assert.deepEqual(await xmlsDoZip(zipGuardado({ 'a.xml': '<xml/>', 'leia.txt': 'x' })), ['<xml/>'])
  assert.deepEqual(await xmlsDoZip(await zipComDeflate({ 'b.xml': '<xml>ção</xml>' })), [
    '<xml>ção</xml>',
  ])
  await assert.rejects(() => xmlsDoZip(new Uint8Array([1, 2, 3])), ErroDaColeta)
})

Deno.test('INLABS: sem credencial não coleta', async () => {
  const { ctx } = contextoDeDiario(new BancoFalso(), rotasDoInlabs(), {
    fonte: 'inlabs',
    janela: DIA,
  })
  await assert.rejects(
    () => coletarDouPeloInlabs(ctx),
    (erro: unknown) => {
      return erro instanceof ErroDaColeta && erro.codigo === 'configuracao_ausente'
    },
  )
})

Deno.test(
  'INLABS: entra, guarda o ZIP, cria a resolução do CONAMA sem CPF e registra a revogação',
  async () => {
    const banco = new BancoFalso()
    banco.carregar({ chave: 'br;conama;resolucao;237;1997', fonte: 'inlabs' })
    const { ctx, rede } = contextoDeDiario(banco, rotasDoInlabs(), { fonte: 'inlabs', janela: DIA })
    ctx.segredo = (nome) => ({ INLABS_EMAIL: 'coleta@grama.test', INLABS_SENHA: 'segredo' })[nome]

    await coletarDouPeloInlabs(ctx)

    assert.match(rede.chamadas[0]?.corpo ?? '', /email=coleta%40grama\.test/)
    assert.ok(banco.arquivos.has(`diarios/inlabs/${DIA}-DO1.zip`))
    const [versao] = banco.versoesDa('br;conama;resolucao;520;2026')
    assert.ok(versao, 'a resolução nova entra no catálogo')
    assert.doesNotMatch(versao?.texto ?? '', /123\.456\.789-09/)
    assert.equal(banco.norma('br;conama;resolucao;237;1997')?.situacao_na_fonte, 'revogada')
    assert.equal(
      banco.normas.some((n) => n.chave.includes(';portaria;10;')),
      false,
    )
    assert.equal(
      banco.normas.some((n) => n.chave.startsWith('br;federal;decreto')),
      false,
    )
    assert.deepEqual(ctx.contagem.falhas, [])
  },
)
