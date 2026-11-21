import assert from 'node:assert/strict'

import {
  criteriosParaPublicacao,
  diferencaParaOModelo,
  entradaDoModelo,
  LIMITE_DIFERENCA,
  LIMITE_O_QUE_MUDA,
  LIMITE_RESUMO,
  lerReserva,
  mensagemDoResumo,
  normalizarCriterios,
  normalizarResumo,
  SCHEMA_DO_RESUMO,
  TEMAS,
} from './resumo-de-norma.ts'

const RESERVA_ID = '80000000-0000-4000-8000-000000000001'

/** Reserva com campos a mais, que nunca podem ir ao modelo. */
const RESERVA_BRUTA = {
  reserva_id: RESERVA_ID,
  consultoria_id: 'segredo-da-consultoria',
  norma: {
    titulo: 'Instrução Normativa IMA 4',
    tipo: 'instrucao_normativa',
    orgao: 'IMA',
    esfera: 'estadual',
    id: 'id-interno-da-norma',
  },
  tipo_mudanca: 'alterada',
  diferenca: { estruturada: false, mudou: true, interno: { segredo: 'nao-vai' } },
  texto_anterior: 'Art. 1º O prazo é de 120 dias.',
  texto_novo: 'Art. 1º O prazo é de 90 dias.',
}

Deno.test('lerReserva aceita o jsonb da reserva e recusa forma inválida', () => {
  const reserva = lerReserva(RESERVA_BRUTA)
  assert.equal(reserva?.reservaId, RESERVA_ID)
  assert.equal(reserva?.norma.orgao, 'IMA')
  assert.equal(lerReserva(null), null)
  assert.equal(lerReserva({ ...RESERVA_BRUTA, reserva_id: 'x' }), null)
  assert.equal(lerReserva({ ...RESERVA_BRUTA, norma: null }), null)
})

Deno.test('prompt não leva nada além dos campos permitidos', () => {
  const reserva = lerReserva(RESERVA_BRUTA)
  assert.ok(reserva)
  const entrada = entradaDoModelo(reserva)
  assert.deepEqual(Object.keys(entrada).sort(), [
    'diferenca',
    'norma',
    'texto_anterior',
    'texto_novo',
    'tipo_mudanca',
  ])
  assert.deepEqual(Object.keys(entrada.norma).sort(), ['orgao', 'tipo', 'titulo'])
  const mensagem = mensagemDoResumo(entrada)
  for (const proibido of [
    RESERVA_ID,
    'segredo-da-consultoria',
    'id-interno-da-norma',
    'esfera',
    'nao-vai',
    'interno',
  ]) {
    assert.ok(!mensagem.includes(proibido), `não devia conter ${proibido}`)
  }
  for (const esperado of [
    'Instrução Normativa IMA 4',
    'instrucao_normativa',
    'IMA',
    'alterada',
    '"mudou":true',
    '120 dias',
    '90 dias',
  ]) {
    assert.ok(mensagem.includes(esperado), `devia conter ${esperado}`)
  }
})

Deno.test('diferença estruturada vai sem os textos, só com rótulo e texto dos dispositivos', () => {
  const reserva = lerReserva({
    ...RESERVA_BRUTA,
    diferenca: {
      estruturada: true,
      incluidos: [{ caminho: 'art9', rotulo: 'Art. 9º', texto: 'Novo artigo.', extra: 'x1' }],
      revogados: [],
      alterados: [
        { caminho: 'art1', rotulo: 'Art. 1º', antes: '120 dias', depois: '90 dias', extra: 'x2' },
      ],
      iguais: 7,
    },
  })
  assert.ok(reserva)
  const entrada = entradaDoModelo(reserva)
  assert.equal(entrada.texto_anterior, null)
  assert.equal(entrada.texto_novo, null)
  assert.deepEqual(entrada.diferenca, {
    estruturada: true,
    incluidos: [{ rotulo: 'Art. 9º', texto: 'Novo artigo.' }],
    revogados: [],
    alterados: [{ rotulo: 'Art. 1º', antes: '120 dias', depois: '90 dias' }],
    iguais: 7,
    omitidos: 0,
  })
  const mensagem = mensagemDoResumo(entrada)
  assert.ok(!mensagem.includes('TEXTO ANTERIOR'))
  assert.ok(!mensagem.includes('x1') && !mensagem.includes('x2') && !mensagem.includes('art9'))
})

Deno.test('diferença estruturada grande é cortada no limite e conta os omitidos', () => {
  const alterados = Array.from({ length: 100 }, (_, i) => ({
    rotulo: `Art. ${String(i + 1)}`,
    antes: 'a'.repeat(5_000),
    depois: 'b'.repeat(5_000),
  }))
  const saida = diferencaParaOModelo({ estruturada: true, incluidos: [], revogados: [], alterados })
  assert.ok(JSON.stringify(saida).length <= LIMITE_DIFERENCA + 200)
  assert.ok((saida.omitidos as number) > 0)
  const primeiro = (saida.alterados as { antes: string }[])[0]
  assert.equal(primeiro?.antes.length, 4_000)
})

Deno.test('normaliza critérios: descarta formato errado, repetido e fora da lista', () => {
  const criterios = normalizarCriterios({
    atividades: ['33.10.00', '3310', '33.10.00', ' 01.20.30 ', '1.2.3'],
    prefixos: ['33', '33.10', '3', '33.10.00'],
    tipos_licenca: ['LAO', 'aua', 'Renovação', 'LO', 'LAC'],
    municipios: ['4209102', '420910', 'Joinville', 4209102],
    competencia: ['Estadual', 'federal'],
    temas: ['Efluentes', 'recursos hídricos', 'agua', 'ruído'],
  })
  assert.deepEqual(criterios, {
    atividades: ['33.10.00', '01.20.30'],
    prefixos: ['33', '33.10'],
    tipos_licenca: ['LAO', 'AuA', 'renovacao', 'LAC'],
    municipios: ['4209102'],
    competencia: ['estadual'],
    temas: ['efluentes', 'recursos_hidricos', 'ruido'],
  })
  assert.deepEqual(normalizarCriterios(null).atividades, [])
})

Deno.test('converte os critérios para a lista [{tipo, valor}] da publicação', () => {
  const lista = criteriosParaPublicacao({
    atividades: ['33.10.00'],
    prefixos: ['33'],
    tipos_licenca: ['LAO'],
    municipios: ['4209102'],
    competencia: ['municipal'],
    temas: ['efluentes'],
  })
  assert.deepEqual(lista, [
    { tipo: 'atividade', valor: '33.10.00' },
    { tipo: 'prefixo_atividade', valor: '33' },
    { tipo: 'tipo_licenca', valor: 'LAO' },
    { tipo: 'municipio', valor: '4209102' },
    { tipo: 'competencia', valor: 'municipal' },
    { tipo: 'tema', valor: 'efluentes' },
  ])
})

Deno.test('normalizarResumo corta tamanhos e recusa a forma inválida', () => {
  const resumo = normalizarResumo({
    resumo: `  ${'x'.repeat(2_000)}  `,
    o_que_muda: [...Array.from({ length: 12 }, (_, i) => `Item ${String(i)}`), 3, ''],
    prazo_de_adequacao: '   ',
    criterios: { atividades: ['33.10.00'] },
    confianca: 'altissima',
  })
  assert.ok(resumo)
  assert.equal(resumo.resumo.length, LIMITE_RESUMO)
  assert.equal(resumo.o_que_muda.length, LIMITE_O_QUE_MUDA)
  assert.equal(resumo.prazo_de_adequacao, null)
  assert.equal(resumo.confianca, 'baixa')
  assert.deepEqual(resumo.criterios.atividades, ['33.10.00'])
  assert.equal(normalizarResumo({ resumo: '', criterios: {} }), null)
  assert.equal(normalizarResumo({ resumo: 'Ok.' }), null)
  assert.equal(normalizarResumo('texto solto'), null)
  assert.equal(normalizarResumo([]), null)
})

Deno.test('schema estrito pede todos os campos e só os temas da lista fixa', () => {
  assert.deepEqual(SCHEMA_DO_RESUMO.required, [
    'resumo',
    'o_que_muda',
    'prazo_de_adequacao',
    'criterios',
    'confianca',
  ])
  assert.deepEqual(SCHEMA_DO_RESUMO.properties.criterios.properties.temas.items.enum, [...TEMAS])
})
