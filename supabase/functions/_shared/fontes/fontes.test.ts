import assert from 'node:assert/strict'

import { MARCADOR_DE_CPF } from '../dominio/sem-cpf.ts'
import {
  type ContextoDaColeta,
  buscarComEducacao,
  decodificarEntidades,
  htmlParaTexto,
  nomeDoArquivo,
} from './comum.ts'
import {
  coletarConsema,
  DATA_DA_CARGA,
  idDoDownloadNaPagina,
  lerSitemap,
  resolucaoDaPagina,
  tituloDaPagina,
} from './consema.ts'
import { BancoFalso, html, lerPdfFalso, pdf, redeFalsa, type Rota } from './fixtures/falsos.ts'
import { PAGINA_DAS_INS } from './fixtures/ima-in.ts'
// Respostas recortadas da consulta de portarias de 20/11/2026 (sem o nome de quem assina).
import portariasGravadas from './fixtures/ima-portarias.json' with { type: 'json' }
import { PAGINA_DA_RESOLUCAO_315, RSS_NO_LUGAR, SITEMAP_DA_SEMAE } from './fixtures/semae.ts'
import { caixaDeFrase, dataDoNomeDoPdf, lerCardsDeIn } from './ima-in.ts'
import {
  chaveDaPortaria,
  coletarPortariasDoIma,
  insRevogadas,
  lerPortarias,
  URL_DAS_PORTARIAS,
} from './ima-portaria.ts'

const AGORA = new Date('2026-11-20T13:00:00Z')

function contexto(banco: BancoFalso, rotas: Record<string, Rota>, limite = 15) {
  const rede = redeFalsa(rotas)
  const log: string[] = []
  let uuid = 0
  const ctx: ContextoDaColeta = {
    coletaId: 'coleta-teste',
    fonte: 'teste',
    banco,
    buscar: buscarComEducacao(rede.fetch, { esperar: () => Promise.resolve() }),
    lerPdf: lerPdfFalso,
    limite,
    agora: AGORA,
    novoUuid: () => {
      uuid++
      return `00000000-0000-4000-8000-${String(uuid).padStart(12, '0')}`
    },
    registrar: (linha) => log.push(linha),
    contagem: { itensNovos: 0, baixados: 0, pendentes: 0, falhas: [] },
  }
  return { ctx, rede, log }
}

function json(corpo: unknown, tipo = 'application/json'): Response {
  return new Response(JSON.stringify(corpo), { headers: { 'Content-Type': tipo } })
}

// ---------------------------------------------------------------------------
// HTML e cabeçalhos
// ---------------------------------------------------------------------------
Deno.test('htmlParaTexto tira tags e estilos, quebra os blocos e decodifica entidades', () => {
  const texto = htmlParaTexto(
    '<p style="x"><b>PORTARIA N&ordm; 1/2026</b></p><p>Art. 1&ordm; Fica&nbsp;aprovada a &quot;IN&quot; &#8211; ok.<br>Art. 2&ordm; Revoga&ccedil;&atilde;o.</p><style>p{}</style>',
  )
  assert.equal(texto, 'PORTARIA Nº 1/2026\nArt. 1º Fica aprovada a "IN" – ok.\nArt. 2º Revogação.')
  assert.equal(decodificarEntidades('&Aacute;gua &amp; &#xE7;'), 'Água & ç')
})

Deno.test('nomeDoArquivo lê o Content-Disposition simples e o estendido', () => {
  const simples = new Response(null, {
    headers: {
      'Content-Disposition':
        'attachment; filename="1-Resolucao-CONSEMA-n.-250-2024-compilada-ate-314-2026.pdf"',
    },
  })
  assert.equal(nomeDoArquivo(simples), '1-Resolucao-CONSEMA-n.-250-2024-compilada-ate-314-2026.pdf')
  const estendido = new Response(null, {
    headers: { 'Content-Disposition': "attachment; filename*=UTF-8''Resolu%C3%A7%C3%A3o-251.pdf" },
  })
  assert.equal(nomeDoArquivo(estendido), 'Resolução-251.pdf')
  assert.equal(nomeDoArquivo(new Response(null)), null)
})

// ---------------------------------------------------------------------------
// IMA · Instruções Normativas
// ---------------------------------------------------------------------------
Deno.test('lerCardsDeIn lê número, título, revogação e id da versão de cada card', () => {
  assert.deepEqual(lerCardsDeIn(PAGINA_DAS_INS), [
    {
      numero: '0',
      titulo: 'DIRETRIZES GERAIS PARA O LICENCIAMENTO AMBIENTAL NO IMA',
      revogada: false,
      idVersao: '331',
      atualizadaEm: '04/12/2024',
    },
    {
      numero: '2',
      titulo: 'DISPOSIÇÃO FINAL DE REJEITOS EM ATERROS',
      revogada: false,
      idVersao: '344',
      atualizadaEm: '10/10/2025',
    },
    {
      numero: '12',
      titulo: 'ORIZICULTURA',
      revogada: true,
      idVersao: '340',
      atualizadaEm: '21/02/2009',
    },
    {
      numero: '84',
      titulo: 'COMPENSAÇÃO DE RESERVA LEGAL',
      revogada: false,
      idVersao: '328',
      atualizadaEm: '20/08/2024',
    },
  ])
})

Deno.test('caixaDeFrase e a data do nome do PDF seguem a carga do catálogo', () => {
  assert.equal(
    caixaDeFrase('DIRETRIZES GERAIS PARA O LICENCIAMENTO AMBIENTAL NO IMA'),
    'Diretrizes gerais para o licenciamento ambiental no IMA',
  )
  assert.equal(
    caixaDeFrase('Exploração seletiva de bracatinga'),
    'Exploração seletiva de bracatinga',
  )
  assert.deepEqual(dataDoNomeDoPdf('in2_344_20251010.pdf'), {
    data: '2025-10-10',
    texto: '20251010',
  })
  assert.equal(dataDoNomeDoPdf('arquivo.pdf'), null)
})

// ---------------------------------------------------------------------------
// IMA · Portarias
// ---------------------------------------------------------------------------
const PORTARIAS: Rota = () => json(portariasGravadas)

Deno.test('lerPortarias lê a resposta e recusa formato diferente', () => {
  const portarias = lerPortarias(portariasGravadas)
  assert.equal(portarias.length, 3)
  assert.deepEqual(
    portarias.map((p) => [p.id, p.numero, p.ano, p.categoria, p.dataDoe, p.vigente]),
    [
      ['4292', '096', 2026, '4', '2026-04-14', true],
      ['4279', '095', 2026, '1', '2026-04-09', true],
      ['4418', '231', 2026, '2', '2026-10-19', true],
    ],
  )
  // Campos de usuário não entram.
  assert.equal(
    Object.keys(portarias[0] ?? {}).some((k) => k.includes('user')),
    false,
  )
  assert.equal(chaveDaPortaria({ numero: '096', ano: 2026 }), 'sc;ima;portaria;96;2026')
  assert.throws(() => lerPortarias({ erro: true }), /formato_inesperado/)
  assert.throws(() => lerPortarias([{ id_portaria: 'x' }]), /formato_inesperado/)
})

Deno.test('a Portaria 096/2026 revoga a IN 84; a 231/2026 só altera outra portaria', () => {
  const [p096, , p231] = lerPortarias(portariasGravadas)
  assert.ok(p096 && p231)
  assert.deepEqual(insRevogadas(p096, htmlParaTexto(p096.conteudoHtml)), [
    'sc;ima;instrucao_normativa;84',
  ])
  assert.deepEqual(insRevogadas(p231, htmlParaTexto(p231.conteudoHtml)), [])
})

Deno.test(
  'portarias: grava as categorias 1, 3, 4 e 6, com texto sem HTML, e revoga a IN vigente',
  async () => {
    const banco = new BancoFalso()
    banco.carregar({ chave: 'sc;ima;instrucao_normativa;84', fonte: 'ima_in', id_externo: '84' })
    const { ctx, rede } = contexto(banco, { [`POST ${URL_DAS_PORTARIAS}`]: PORTARIAS })
    await coletarPortariasDoIma(ctx)

    // Uma consulta só, com o ano corrente.
    assert.equal(rede.chamadas.length, 1)
    assert.equal(rede.chamadas[0]?.corpo, 'conteudo=&numero=&ano=2026&categoria=')
    assert.match(rede.chamadas[0]?.cabecalhos.get('Content-Type') ?? '', /x-www-form-urlencoded/)

    // A 231 (categoria 2, administrativo) fica de fora.
    assert.deepEqual(
      banco.normas.filter((n) => n.fonte === 'ima_portaria').map((n) => n.chave),
      ['sc;ima;portaria;95;2026', 'sc;ima;portaria;96;2026'],
    )
    const p096 = banco.norma('sc;ima;portaria;96;2026')
    assert.equal(p096?.dados.titulo, 'Portaria IMA 096/2026')
    assert.equal(p096?.dados.numero, '96')
    assert.equal(
      p096?.dados.url_oficial,
      'https://consultas.ima.sc.gov.br/portarias/visualizar/4292',
    )
    assert.match(p096?.dados.ementa ?? '', /^Revogação da IN nº 84/)

    const [versao] = banco.versoesDa('sc;ima;portaria;96;2026')
    assert.equal(versao?.objeto, null)
    assert.equal(versao?.mime, 'text/plain')
    assert.equal(versao?.publicada_em, '2026-04-14')
    assert.equal(versao?.id_externo, '4292')
    assert.equal(versao?.texto?.includes('<'), false)
    assert.match(
      versao?.texto ?? '',
      /^PORTARIA Nº 096\/2026 - IMA\nRevoga a Portaria IMA Nº 140\/2024/,
    )

    // A IN 84 vigente no catálogo foi revogada com a portaria como ato e a data do DOE.
    const in84 = banco.norma('sc;ima;instrucao_normativa;84')
    assert.equal(in84?.situacao_na_fonte, 'revogada')
    assert.equal(in84?.revogada_em, '2026-04-14')
    assert.equal(in84?.revogada_por, p096?.id)
    assert.equal(ctx.contagem.itensNovos, 3)

    // De novo, sem mudança na fonte: nada novo e nenhuma revogação repetida.
    const segunda = contexto(banco, { [`POST ${URL_DAS_PORTARIAS}`]: PORTARIAS })
    await coletarPortariasDoIma(segunda.ctx)
    assert.equal(segunda.ctx.contagem.itensNovos, 0)
    assert.equal(banco.versoes.length, 2)
    assert.equal(banco.mudancas.filter((m) => m.tipo === 'revogada').length, 1)
  },
)

Deno.test('portarias: IN já revogada ou fora do catálogo não é revogada de novo', async () => {
  const banco = new BancoFalso()
  banco.carregar({
    chave: 'sc;ima;instrucao_normativa;84',
    fonte: 'ima_in',
    id_externo: '84',
    situacao_na_fonte: 'revogada',
  })
  const { ctx } = contexto(banco, { [`POST ${URL_DAS_PORTARIAS}`]: PORTARIAS })
  await coletarPortariasDoIma(ctx)
  assert.equal(
    banco.chamadas.some((c) => c.startsWith('registrar_revogacao')),
    false,
  )
  assert.deepEqual(ctx.contagem.falhas, [])

  const semIn = new BancoFalso()
  const outro = contexto(semIn, { [`POST ${URL_DAS_PORTARIAS}`]: PORTARIAS })
  await coletarPortariasDoIma(outro.ctx)
  assert.equal(
    semIn.chamadas.some((c) => c.startsWith('registrar_revogacao')),
    false,
  )
})

Deno.test('portarias: o CPF sai do texto e da ementa antes de gravar', async () => {
  const banco = new BancoFalso()
  const comCpf = [
    {
      id_portaria: '5000',
      str_titulo: 'Autoriza o responsável técnico CPF 004.XXX.XXX-61',
      num_numero: '300',
      num_ano: '2026',
      dt_data_doe: '2026-11-19',
      str_conteudo:
        '<p>PORTARIA Nº 300/2026</p><p>Art. 1º Fica autorizado o técnico inscrito no CPF: 123.456.789-09.</p>',
      bool_vigente: '1',
      id_categoria: '1',
      id_user_cadastro: '0',
    },
  ]
  const { ctx } = contexto(banco, { [`POST ${URL_DAS_PORTARIAS}`]: () => json(comCpf) })
  await coletarPortariasDoIma(ctx)
  const [versao] = banco.versoesDa('sc;ima;portaria;300;2026')
  assert.ok(versao?.texto?.includes(MARCADOR_DE_CPF))
  assert.equal(versao?.texto?.includes('123.456.789-09'), false)
  assert.equal(banco.norma('sc;ima;portaria;300;2026')?.dados.ementa?.includes('004.XXX'), false)
})

Deno.test('portarias: em janeiro consulta também o ano anterior', async () => {
  const banco = new BancoFalso()
  const { ctx, rede } = contexto(banco, { [`POST ${URL_DAS_PORTARIAS}`]: () => json([]) })
  ctx.agora = new Date('2027-01-05T13:00:00Z')
  await coletarPortariasDoIma(ctx)
  assert.deepEqual(
    rede.chamadas.map((c) => new URLSearchParams(c.corpo ?? '').get('ano')),
    ['2026', '2027'],
  )
})

Deno.test('portarias: resposta que não é lista JSON vira formato_inesperado', async () => {
  const banco = new BancoFalso()
  const { ctx } = contexto(banco, {
    [`POST ${URL_DAS_PORTARIAS}`]: () => html('<html>Erro</html>'),
  })
  await assert.rejects(coletarPortariasDoIma(ctx), /formato_inesperado/)
})

// ---------------------------------------------------------------------------
// CONSEMA (SEMAE)
// ---------------------------------------------------------------------------
const SEMAE = 'https://www.semae.sc.gov.br'
const DOWNLOAD = (id: string) => `${SEMAE}/?wpdmdl=${id}`
const NOME_250 = '1-Resolucao-CONSEMA-n.-250-2024-compilada-ate-314-2026.pdf'
const NOME_251 = '2-Resolucao-CONSEMA-n.-251-2024-Licenc.-Municipal-compilada-ate-300-25.pdf'

function catalogoDoConsema(): BancoFalso {
  const banco = new BancoFalso()
  banco.carregar({ chave: 'sc;consema;resolucao;250;2024', fonte: 'consema', id_externo: '3480' })
  banco.carregar({ chave: 'sc;consema;resolucao;251;2024', fonte: 'consema', id_externo: '3481' })
  return banco
}

function sitemap(corpo = SITEMAP_DA_SEMAE): Rota {
  return () =>
    new Response(corpo, { headers: { 'Content-Type': 'application/xml; charset=UTF-8' } })
}

Deno.test('lerSitemap e resolucaoDaPagina: número e ano do slug, só páginas de resolução', () => {
  const paginas = lerSitemap(SITEMAP_DA_SEMAE)
  assert.equal(paginas.length, 5)
  assert.deepEqual(
    paginas.map(resolucaoDaPagina).map((r) => (r === null ? null : [r.numero, r.ano, r.lastmod])),
    [
      null,
      ['305', null, '2026-03-30'],
      ['98', 2017, '2026-01-09'],
      ['250', null, '2026-06-08'],
      ['315', null, '2026-07-27'],
    ],
  )
  assert.throws(() => lerSitemap(RSS_NO_LUGAR), /formato_inesperado/)
  assert.equal(idDoDownloadNaPagina(PAGINA_DA_RESOLUCAO_315), '8120')
  assert.equal(
    tituloDaPagina(PAGINA_DA_RESOLUCAO_315),
    'Resolução CONSEMA nº 315 – Atualiza a lista oficial de espécies da fauna ameaçadas de extinção no Estado de Santa Catarina',
  )
})

Deno.test('CONSEMA: HEAD com o mesmo arquivo não baixa; compilação nova vira versão', async () => {
  const banco = catalogoDoConsema()
  const rotas = {
    [`HEAD ${DOWNLOAD('3480')}`]: () => pdf('', NOME_250),
    [`GET ${DOWNLOAD('3480')}`]: () => pdf('Resolução 250 compilada até a 314', NOME_250),
    [`HEAD ${DOWNLOAD('3481')}`]: () => pdf('', NOME_251),
    [`GET ${DOWNLOAD('3481')}`]: () => pdf('Resolução 251 compilada até a 300', NOME_251),
    [`GET ${SEMAE}/wpdmpro-sitemap.xml`]: sitemap(),
  }
  const primeira = contexto(banco, rotas)
  await coletarConsema(primeira.ctx)
  assert.deepEqual(primeira.ctx.contagem.falhas, [])
  assert.deepEqual(
    banco.versoes.map((v) => v.id_externo),
    [NOME_250, NOME_251],
  )
  // Nada no sitemap é novo: a 250 está no catálogo e as outras são de antes da carga.
  assert.equal(banco.normas.length, 2)

  // Segunda execução: a 251 ganhou compilação nova; a 250 continua igual.
  const nome251Novo = NOME_251.replace('300-25', '320-2026')
  const segunda = contexto(banco, {
    ...rotas,
    [`HEAD ${DOWNLOAD('3481')}`]: () => pdf('', nome251Novo),
    [`GET ${DOWNLOAD('3481')}`]: () => pdf('Resolução 251 compilada até a 320', nome251Novo),
  })
  await coletarConsema(segunda.ctx)
  assert.deepEqual(
    segunda.rede.chamadas.map((c) => `${c.metodo} ${c.url}`),
    [
      `HEAD ${DOWNLOAD('3480')}`,
      `HEAD ${DOWNLOAD('3481')}`,
      `GET ${DOWNLOAD('3481')}`,
      `GET ${SEMAE}/wpdmpro-sitemap.xml`,
    ],
  )
  const versoes251 = banco.versoesDa('sc;consema;resolucao;251;2024')
  assert.deepEqual(
    versoes251.map((v) => [v.numero, v.id_externo]),
    [
      [1, NOME_251],
      [2, nome251Novo],
    ],
  )
  assert.equal(segunda.ctx.contagem.itensNovos, 1)
})

Deno.test(
  'CONSEMA: RSS no lugar do sitemap e HEAD sem nome de arquivo viram falha da fonte',
  async () => {
    const banco = catalogoDoConsema()
    const { ctx } = contexto(banco, {
      [`HEAD ${DOWNLOAD('3480')}`]: () =>
        new Response(RSS_NO_LUGAR, { headers: { 'Content-Type': 'application/rss+xml' } }),
      [`HEAD ${DOWNLOAD('3481')}`]: () => pdf(''),
      [`GET ${SEMAE}/wpdmpro-sitemap.xml`]: () =>
        new Response(RSS_NO_LUGAR, { headers: { 'Content-Type': 'application/rss+xml' } }),
    })
    await coletarConsema(ctx)
    assert.deepEqual(ctx.contagem.falhas, [
      'conteudo_inesperado',
      'formato_inesperado',
      'conteudo_inesperado',
    ])
    assert.equal(banco.versoes.length, 0)
  },
)

Deno.test(
  'CONSEMA: resolução nova no sitemap depois da carga vira norma com ato novo e PDF',
  async () => {
    const banco = catalogoDoConsema()
    const loc315 =
      'https://www.semae.sc.gov.br/download/resolucao-consema-no-315-atualiza-a-lista-oficial-de-especies-da-fauna-ameacadas-de-extincao-no-estado-de-santa-catarina-e-da-outras-providencias/'
    // A 315 aparece com lastmod depois da carga (no recorte real ela é de 27/07/2026).
    const sitemapNovo = SITEMAP_DA_SEMAE.replace('2026-07-27T19:10:02', '2026-11-23T10:00:00')
    assert.ok(DATA_DA_CARGA <= '2026-11-23')
    const { ctx, rede } = contexto(banco, {
      [`HEAD ${DOWNLOAD('3480')}`]: () => pdf('', NOME_250),
      [`GET ${DOWNLOAD('3480')}`]: () => pdf('250', NOME_250),
      [`HEAD ${DOWNLOAD('3481')}`]: () => pdf('', NOME_251),
      [`GET ${DOWNLOAD('3481')}`]: () => pdf('251', NOME_251),
      [`GET ${SEMAE}/wpdmpro-sitemap.xml`]: sitemap(sitemapNovo),
      [`GET ${loc315}`]: () => html(PAGINA_DA_RESOLUCAO_315),
      [`GET ${DOWNLOAD('8120')}`]: () =>
        pdf('Art. 1º Atualiza a lista.\nArt. 2º Vigência.', 'Resolucao-CONSEMA-315-2026.pdf'),
    })
    await coletarConsema(ctx)
    assert.deepEqual(ctx.contagem.falhas, [])
    const r315 = banco.norma('sc;consema;resolucao;315')
    assert.equal(r315?.id_externo, '8120')
    assert.equal(r315?.dados.titulo, 'Resolução CONSEMA 315')
    assert.equal(r315?.dados.url_oficial, loc315)
    assert.match(r315?.dados.ementa ?? '', /^Resolução CONSEMA nº 315 – Atualiza/)
    const [versao] = banco.versoesDa('sc;consema;resolucao;315')
    assert.equal(versao?.id_externo, 'Resolucao-CONSEMA-315-2026.pdf')
    assert.equal(rede.chamadas.filter((c) => c.url === DOWNLOAD('8120')).length, 1)
    assert.equal(ctx.contagem.baixados, 3)
  },
)

Deno.test(
  'CONSEMA: sem espaço no limite, a resolução nova fica para a próxima execução',
  async () => {
    const banco = catalogoDoConsema()
    const sitemapNovo = SITEMAP_DA_SEMAE.replace('2026-07-27T19:10:02', '2026-11-23T10:00:00')
    const { ctx, rede } = contexto(
      banco,
      {
        [`HEAD ${DOWNLOAD('3480')}`]: () => pdf('', NOME_250),
        [`GET ${DOWNLOAD('3480')}`]: () => pdf('250', NOME_250),
        [`HEAD ${DOWNLOAD('3481')}`]: () => pdf('', NOME_251),
        [`GET ${SEMAE}/wpdmpro-sitemap.xml`]: sitemap(sitemapNovo),
      },
      1,
    )
    await coletarConsema(ctx)
    assert.equal(ctx.contagem.baixados, 1)
    assert.equal(ctx.contagem.pendentes, 2)
    assert.equal(banco.norma('sc;consema;resolucao;315'), undefined)
    assert.equal(
      rede.chamadas.some((c) => c.url.includes('resolucao-consema-no-315')),
      false,
    )
  },
)
