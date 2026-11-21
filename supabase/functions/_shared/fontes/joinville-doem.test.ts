import assert from 'node:assert/strict'

import { avaliarAtoDoDiario } from '../dominio/filtro-de-ato.ts'
import { MARCADOR_DE_CPF } from '../dominio/sem-cpf.ts'
import { decodificarHtml } from './diarios.ts'
import { contextoDeDiario, htmlLatin1, latin1 } from './fixtures/diarios.ts'
import { BancoFalso, type Rota } from './fixtures/falsos.ts'
import {
  DOCUMENTO_AUA,
  DOCUMENTO_IN,
  DOCUMENTO_PORTARIA_DE_PESSOAL,
  DOCUMENTO_RESOLUCAO_COMDEMA,
  EDICAO_3092,
  EDICAO_3093,
  ID,
  LISTA_DE_EDICOES,
} from './fixtures/joinville.ts'
import {
  chaveMunicipalDeJoinville,
  coletarDoemDeJoinville,
  documentoQueInteressa,
  lerDocumentoDoDoem,
  lerDocumentosDaEdicao,
  lerEdicoesDoDoem,
  orgaoDoDocumento,
  semSiglaDoConselho,
  URL_DAS_EDICOES_DO_DOEM,
  urlDaEdicaoDoDoem,
  urlDoDocumentoDoDoem,
} from './joinville-doem.ts'

const DIA = '2026-11-18'
const CHAVE_DA_IN = 'sc;4209102;sama;instrucao_normativa;5;2026'
const CHAVE_DA_RESOLUCAO = 'sc;4209102;comdema;resolucao;4;2026'
const CHAVE_DA_RESOLUCAO_REVOGADA = 'sc;4209102;comdema;resolucao;2;2025'

function rotasDoDoem(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    [`GET ${URL_DAS_EDICOES_DO_DOEM}`]: () => htmlLatin1(LISTA_DE_EDICOES),
    [`GET ${urlDaEdicaoDoDoem('3092')}`]: () => htmlLatin1(EDICAO_3092),
    [`GET ${urlDaEdicaoDoDoem('3093')}`]: () => htmlLatin1(EDICAO_3093),
    [`GET ${urlDoDocumentoDoDoem(ID.instrucaoNormativa)}`]: () => htmlLatin1(DOCUMENTO_IN),
    [`GET ${urlDoDocumentoDoDoem(ID.portariaDePessoal)}`]: () =>
      htmlLatin1(DOCUMENTO_PORTARIA_DE_PESSOAL),
    [`GET ${urlDoDocumentoDoDoem(ID.resolucaoComdema)}`]: () =>
      htmlLatin1(DOCUMENTO_RESOLUCAO_COMDEMA),
    [`GET ${urlDoDocumentoDoDoem(ID.auA)}`]: () => htmlLatin1(DOCUMENTO_AUA),
    ...extra,
  }
}

function lerLatin1(html: string): string {
  return decodificarHtml(latin1(html), 'text/html')
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
Deno.test('lerEdicoesDoDoem lê número, data e edição extraordinária', () => {
  assert.deepEqual(lerEdicoesDoDoem(lerLatin1(LISTA_DE_EDICOES)), [
    { numero: '3094', data: '2026-11-19', extraordinaria: false },
    { numero: '3093', data: '2026-11-18', extraordinaria: true },
    { numero: '3092', data: '2026-11-18', extraordinaria: false },
  ])
  assert.throws(
    () => lerEdicoesDoDoem('<html><body>Manutenção</body></html>'),
    /formato_inesperado/,
  )
})

Deno.test(
  'lerDocumentosDaEdicao decodifica o ISO-8859-1 e o filtro fica com SAMA normativa',
  () => {
    const documentos = lerDocumentosDaEdicao(lerLatin1(EDICAO_3092))
    assert.deepEqual(
      documentos.map((d) => [d.tipo, d.unidade, d.idDocumento]),
      [
        ['Decreto', 'SEGOV.UAD', ID.decretoDaSegov],
        ['Instrução Normativa', 'SAMA.UNF', ID.instrucaoNormativa],
        ['Autorização Ambiental - AuA', 'SAMA.UAT', ID.auA],
        ['Licença Ambiental de Instalação', 'SAMA.UAT.AEE', ID.licencaDeInstalacao],
        ['Portaria', 'SAMA.UGC', ID.portariaDePessoal],
        ['Extrato', 'SAMA.UGC.PAP', '10000032285413'],
      ],
    )
    // Decreto da SEGOV (outra unidade), AuA, LAI e extrato (atos individuais) nem são baixados.
    assert.deepEqual(
      documentos.filter(documentoQueInteressa).map((d) => d.idDocumento),
      [ID.instrucaoNormativa, ID.portariaDePessoal],
    )
    assert.equal(
      documentoQueInteressa({ idDocumento: '1', tipo: 'Lei Ordinária', unidade: 'SAMA' }),
      true,
    )
    assert.equal(
      documentoQueInteressa({
        idDocumento: '1',
        tipo: 'Resumo da Ata de Deliberação',
        unidade: 'COMDEMA',
      }),
      true,
    )
    assert.equal(
      documentoQueInteressa({ idDocumento: '1', tipo: 'Portaria', unidade: 'SAMAE.UAD' }),
      false,
    )
    assert.throws(() => lerDocumentosDaEdicao('<html><body></body></html>'), /formato_inesperado/)
  },
)

Deno.test('lerDocumentoDoDoem tira o quadro do SEI e o timbre e junta as linhas quebradas', () => {
  const documento = lerDocumentoDoDoem(lerLatin1(DOCUMENTO_IN))
  assert.equal(documento.titulo, 'Instrução Normativa SEI Nº 5/2026 - SAMA.UNF')
  assert.equal(documento.texto.includes('Módulo SEI'), false)
  assert.equal(documento.texto.includes('base64'), false)
  assert.match(documento.texto, /\nEstabelece os procedimentos para o licenciamento ambiental/)
  assert.match(documento.texto, /\nFulano de Tal\nSecretário de Meio Ambiente$/)
})

Deno.test('documento da SAMA: a IN é norma; a AuA e a portaria de pessoal não', () => {
  const avaliar = (html: string, tipo: string, unidade: string) => {
    const lido = lerDocumentoDoDoem(lerLatin1(html))
    return avaliarAtoDoDiario({
      titulo: semSiglaDoConselho(lido.titulo),
      texto: semSiglaDoConselho(lido.texto),
      entidade: unidade,
      tipoDocumento: tipo,
    })
  }
  const instrucao = avaliar(DOCUMENTO_IN, 'Instrução Normativa', 'SAMA.UNF')
  assert.equal(instrucao.relevante, true)
  assert.deepEqual(instrucao.identificador, { tipo: 'instrucao_normativa', numero: '5', ano: 2026 })
  // A AuA não passa nem quando a lista a marca com outro tipo: o título já diz que é ato individual.
  assert.equal(
    avaliar(DOCUMENTO_AUA, 'Autorização Ambiental - AuA', 'SAMA.UAT').motivo,
    'ato_individual',
  )
  assert.equal(avaliar(DOCUMENTO_AUA, 'Portaria', 'SAMA.UAT').motivo, 'ato_individual')
  assert.equal(avaliar(DOCUMENTO_PORTARIA_DE_PESSOAL, 'Portaria', 'SAMA.UGC').motivo, 'pessoal')
  const resolucao = avaliar(DOCUMENTO_RESOLUCAO_COMDEMA, 'Resolução', 'SAMA.UGC')
  assert.equal(resolucao.relevante, true)
  assert.deepEqual(resolucao.identificador, { tipo: 'resolucao', numero: '4', ano: 2026 })
})

Deno.test('órgão e chave municipal de Joinville', () => {
  assert.equal(orgaoDoDocumento('SAMA.UGC', 'Resolução COMDEMA SEI Nº 4/2026'), 'COMDEMA')
  assert.equal(orgaoDoDocumento('SAMA.UNF', 'Instrução Normativa SEI Nº 5/2026'), 'SAMA')
  assert.equal(
    chaveMunicipalDeJoinville({ tipo: 'instrucao_normativa', numero: '5', ano: 2026 }, 'SAMA'),
    CHAVE_DA_IN,
  )
})

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------
Deno.test(
  'DOEM: edições do dia (com a extraordinária) viram normas municipais da SAMA e do COMDEMA',
  async () => {
    const banco = new BancoFalso()
    banco.carregar({ chave: CHAVE_DA_RESOLUCAO_REVOGADA, fonte: 'joinville_doem', id_externo: '1' })
    const { ctx, rede } = contextoDeDiario(banco, rotasDoDoem(), { janela: DIA })
    await coletarDoemDeJoinville(ctx)
    assert.deepEqual(ctx.contagem.falhas, [])

    // A edição 3094 é de outro dia; AuA, LAI, extrato e decreto da SEGOV não são baixados.
    const urls = rede.chamadas.map((c) => c.url)
    assert.equal(urls.includes(urlDaEdicaoDoDoem('3094')), false)
    for (const id of [ID.auA, ID.licencaDeInstalacao, ID.decretoDaSegov]) {
      assert.equal(urls.includes(urlDoDocumentoDoDoem(id)), false, id)
    }
    assert.ok(urls.includes(urlDoDocumentoDoDoem(ID.portariaDePessoal)))

    // A portaria de pessoal foi lida e descartada.
    assert.deepEqual(
      banco.normas.map((n) => n.chave),
      [CHAVE_DA_RESOLUCAO_REVOGADA, CHAVE_DA_IN, CHAVE_DA_RESOLUCAO],
    )
    const instrucao = banco.norma(CHAVE_DA_IN)
    assert.equal(instrucao?.fonte, 'joinville_doem')
    assert.equal(instrucao?.id_externo, ID.instrucaoNormativa)
    assert.equal(instrucao?.dados.esfera, 'municipal')
    assert.equal(instrucao?.dados.municipio_ibge, '4209102')
    assert.equal(instrucao?.dados.orgao, 'SAMA')
    assert.equal(instrucao?.dados.titulo, 'IN SAMA 5/2026')
    assert.equal(
      instrucao?.dados.ementa,
      'Estabelece os procedimentos para o licenciamento ambiental de atividades de baixo impacto no Município de Joinville.',
    )
    assert.equal(instrucao?.dados.url_oficial, urlDoDocumentoDoDoem(ID.instrucaoNormativa))
    const [versao] = banco.versoesDa(CHAVE_DA_IN)
    assert.equal(versao?.publicada_em, DIA)
    assert.equal(versao?.objeto, null)
    assert.equal(versao?.mime, 'text/plain')
    assert.ok(versao?.texto?.includes(MARCADOR_DE_CPF))
    assert.equal(versao?.texto?.includes('123.456.789-09'), false)
    assert.match(versao?.texto ?? '', /^Instrução Normativa SEI Nº 5\/2026/)

    const resolucao = banco.norma(CHAVE_DA_RESOLUCAO)
    assert.equal(resolucao?.dados.orgao, 'COMDEMA')
    assert.equal(resolucao?.dados.titulo, 'Resolução COMDEMA 4/2026')

    // A resolução 4/2026 revoga a 2/2025, que está no catálogo.
    const revogada = banco.norma(CHAVE_DA_RESOLUCAO_REVOGADA)
    assert.equal(revogada?.situacao_na_fonte, 'revogada')
    assert.equal(revogada?.revogada_em, DIA)
    assert.equal(revogada?.revogada_por, resolucao?.id)
    assert.equal(ctx.contagem.itensNovos, 3)

    // De novo: nada novo.
    const segunda = contextoDeDiario(banco, rotasDoDoem(), { janela: DIA })
    await coletarDoemDeJoinville(segunda.ctx)
    assert.equal(segunda.ctx.contagem.itensNovos, 0)
    assert.equal(banco.versoes.length, 2)
  },
)

Deno.test('DOEM: dia sem edição só lê a lista', async () => {
  const banco = new BancoFalso()
  const { ctx, rede } = contextoDeDiario(banco, rotasDoDoem(), { janela: '2026-11-20' })
  await coletarDoemDeJoinville(ctx)
  assert.deepEqual(
    rede.chamadas.map((c) => c.url),
    [URL_DAS_EDICOES_DO_DOEM],
  )
  assert.equal(ctx.contagem.itensNovos, 0)
})

Deno.test('DOEM: documento fora do ar é falha do item; os outros seguem', async () => {
  const banco = new BancoFalso()
  const rotas = rotasDoDoem({
    [`GET ${urlDoDocumentoDoDoem(ID.instrucaoNormativa)}`]: () =>
      new Response('erro', { status: 500 }),
  })
  const { ctx, log } = contextoDeDiario(banco, rotas, { janela: DIA })
  await coletarDoemDeJoinville(ctx)
  assert.deepEqual(ctx.contagem.falhas, ['http_500'])
  assert.ok(log.some((l) => l.includes(`documento_${ID.instrucaoNormativa}`)))
  assert.ok(banco.norma(CHAVE_DA_RESOLUCAO))
})
