import assert from 'node:assert/strict'

import {
  custoEmMicros,
  dataValida,
  mensagemDoUsuario,
  pdfTemTexto,
  SCHEMA_DA_RESPOSTA,
  validarProposta,
} from './extracao.ts'

const contexto = { totalPaginas: 12, tipos: ['LAO', 'LAP', 'AuA'] }

function resposta(extra: Record<string, unknown> = {}) {
  const vazio = { valor: null, pagina: null }
  const dataVazia = { valor: null, texto: null, pagina: null }
  return {
    identificacao: {
      tipo: { valor: 'lao', pagina: 1 },
      numero: { valor: ' 4821/2023 ', pagina: 1 },
      orgao: vazio,
      emitido_em: { valor: '2023-02-30', texto: '30/02/2023', pagina: 1 },
      assinado_em: { valor: '2023-02-14', texto: '14 de fevereiro de 2023', pagina: 1 },
      publicado_em: dataVazia,
      recebido_em: dataVazia,
      validade: { valor: '2027-02-15', texto: 'até 15/02/2027', pagina: 99 },
    },
    condicionantes: [
      {
        codigo: '4.3',
        pai_codigo: '4',
        titulo: 'Análise do corpo receptor',
        texto_literal: '  Realizar, semestralmente, análise. ',
        natureza: 'obrigacao',
        pagina: 4,
        periodicidade: 'semestral',
      },
      {
        codigo: '',
        pai_codigo: null,
        titulo: '',
        texto_literal: '',
        natureza: 'informacao_geral',
        pagina: null,
        periodicidade: null,
      },
    ],
    ...extra,
  }
}

Deno.test('valida e normaliza: sigla da consultoria, datas reais, páginas do PDF', () => {
  const proposta = validarProposta(resposta(), contexto)
  assert.ok(proposta)
  assert.deepEqual(proposta.identificacao.tipo, { valor: 'LAO', pagina: 1 })
  assert.equal(proposta.identificacao.numero.valor, '4821/2023')
  assert.equal(proposta.identificacao.orgao.valor, null)
  assert.equal(proposta.identificacao.emitido_em.valor, null, 'data inexistente vira nulo')
  assert.equal(proposta.identificacao.emitido_em.texto, '30/02/2023', 'o texto original fica')
  assert.equal(proposta.identificacao.assinado_em.valor, '2023-02-14')
  assert.equal(proposta.identificacao.validade.pagina, null, 'página fora do PDF vira nulo')
  assert.equal(proposta.condicionantes.length, 1, 'item vazio é ignorado')
  assert.deepEqual(proposta.condicionantes[0], {
    codigo: '4.3',
    pai_codigo: '4',
    titulo: 'Análise do corpo receptor',
    texto_literal: 'Realizar, semestralmente, análise.',
    natureza: 'obrigacao',
    pagina: 4,
    periodicidade: 'semestral',
  })
})

Deno.test('sigla que não é da consultoria não vira tipo', () => {
  const bruto = resposta()
  bruto.identificacao.tipo = { valor: 'Alvará', pagina: 1 }
  assert.deepEqual(validarProposta(bruto, contexto)?.identificacao.tipo, {
    valor: null,
    pagina: null,
  })
})

Deno.test('formato errado, natureza inventada ou mais de 300 itens: resposta inválida', () => {
  assert.equal(validarProposta(null, contexto), null)
  assert.equal(validarProposta({ identificacao: {}, condicionantes: {} }, contexto), null)
  const inventada = resposta()
  ;(inventada.condicionantes[0] as Record<string, unknown>).natureza = 'tarefa'
  assert.equal(validarProposta(inventada, contexto), null)
  const muitos = resposta({
    condicionantes: Array.from({ length: 301 }, (_, i) => ({
      codigo: String(i),
      pai_codigo: null,
      titulo: 'Item',
      texto_literal: 'Texto',
      natureza: 'obrigacao',
      pagina: null,
      periodicidade: null,
    })),
  })
  assert.equal(validarProposta(muitos, contexto), null)
})

Deno.test('datas: só aaaa-mm-dd que existe no calendário', () => {
  assert.equal(dataValida('2028-02-29'), '2028-02-29')
  assert.equal(dataValida('2027-02-29'), null)
  assert.equal(dataValida('15/02/2027'), null)
  assert.equal(dataValida(null), null)
})

Deno.test('PDF escaneado (sem texto) é reconhecido', () => {
  assert.equal(pdfTemTexto([]), false)
  assert.equal(pdfTemTexto(['', '  ', '\n']), false)
  assert.equal(pdfTemTexto(['x'.repeat(500), '']), true)
})

Deno.test('mensagem marca cada página e lista as siglas', () => {
  const mensagem = mensagemDoUsuario(['Licença', ' Anexo I '], ['LAO', 'AuA'])
  assert.match(mensagem, /Siglas de tipo de instrumento aceitas: LAO, AuA\./)
  assert.match(mensagem, /=== Página 1 ===\nLicença\n\n=== Página 2 ===\nAnexo I/)
})

Deno.test('custo em milionésimos de dólar', () => {
  assert.equal(custoEmMicros(0.012345), 12345)
  assert.equal(custoEmMicros(undefined), null)
  assert.equal(custoEmMicros(-1), null)
})

Deno.test('schema estrito exige todos os campos', () => {
  assert.deepEqual(SCHEMA_DA_RESPOSTA.required, ['identificacao', 'condicionantes'])
  assert.equal(SCHEMA_DA_RESPOSTA.properties.condicionantes.items.additionalProperties, false)
})
