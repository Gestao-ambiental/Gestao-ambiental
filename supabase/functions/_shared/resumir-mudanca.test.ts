import assert from 'node:assert/strict'

import { FalhaDoProvedor, type Resultado } from '../extrair-licenca/openrouter.ts'
import { criarTratadorDoResumo, type DependenciasDoResumo } from './resumir-mudanca.ts'
import type { CriterioSugerido, EntradaDoResumo } from './resumo-de-norma.ts'

const MUDANCA = '90000000-0000-4000-8000-000000000001'
const RESERVA_ID = '80000000-0000-4000-8000-000000000001'
const RESERVA_BRUTA = {
  reserva_id: RESERVA_ID,
  norma: {
    titulo: 'Instrução Normativa IMA 4',
    tipo: 'instrucao_normativa',
    orgao: 'IMA',
    esfera: 'estadual',
  },
  tipo_mudanca: 'alterada',
  diferenca: { estruturada: false, mudou: true },
  texto_anterior: 'Art. 1º O prazo é de 120 dias.',
  texto_novo: 'Art. 1º O prazo é de 90 dias.',
}
const TOKEN = 'token-do-gatilho'

const RESPOSTA_DA_IA = {
  resumo: 'O prazo da renovação passou de 120 para 90 dias.',
  o_que_muda: ['Prazo de 90 dias.'],
  prazo_de_adequacao: null,
  criterios: {
    atividades: ['33.10.00', 'errado'],
    prefixos: [],
    tipos_licenca: ['renovacao'],
    municipios: [],
    competencia: ['estadual'],
    temas: ['procedimento'],
  },
  confianca: 'alta',
}

interface Chamadas {
  operador: number
  reservar: number
  resumir: number
  entrada: EntradaDoResumo | null
  concluido: { resumo: Record<string, unknown>; criterios: CriterioSugerido[] } | null
  falhas: string[]
  logs: string[]
}

function montar(
  extra: {
    operador?: { erro: string | null }
    reserva?: { dados: unknown; erro: string | null }
    provedor?: () => Promise<Resultado>
    chave?: string | undefined
    concluir?: { erro: string | null }
  } = {},
) {
  const chamadas: Chamadas = {
    operador: 0,
    reservar: 0,
    resumir: 0,
    entrada: null,
    concluido: null,
    falhas: [],
    logs: [],
  }
  const deps: DependenciasDoResumo = {
    env: (nome) => {
      if (nome === 'RESUMO_NORMAS_TOKEN') return TOKEN
      if (nome === 'OPENROUTER_API_KEY') return 'chave' in extra ? extra.chave : 'chave-de-teste'
      return undefined
    },
    conferirOperador: () => {
      chamadas.operador++
      return Promise.resolve(extra.operador ?? { erro: null })
    },
    reservar: () => {
      chamadas.reservar++
      return Promise.resolve(extra.reserva ?? { dados: RESERVA_BRUTA, erro: null })
    },
    criarResumidor: () => ({
      resumir: (entrada) => {
        chamadas.resumir++
        chamadas.entrada = entrada
        return extra.provedor
          ? extra.provedor()
          : Promise.resolve({
              modelo: 'modelo-teste',
              tokensEntrada: 100,
              tokensSaida: 50,
              custoMicros: 900,
              conteudo: RESPOSTA_DA_IA,
            })
      },
    }),
    concluir: (_id, resumo, criterios) => {
      chamadas.concluido = { resumo, criterios }
      return Promise.resolve(extra.concluir ?? { erro: null })
    },
    falhar: (_id, motivo) => {
      chamadas.falhas.push(motivo)
      return Promise.resolve({ erro: null })
    },
    agora: () => 0,
    tempoLimite: () => new AbortController().signal,
    registrar: (linha) => {
      chamadas.logs.push(linha)
    },
  }
  return { tratar: criarTratadorDoResumo(deps), chamadas }
}

function pedido(headers: Record<string, string>, corpo: unknown = { mudanca_id: MUDANCA }) {
  return new Request('http://local/resumir-mudanca', {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
}

const DO_GATILHO = { 'x-resumo-token': TOKEN }
const DO_OPERADOR = { Authorization: 'Bearer jwt-do-operador' }

Deno.test('gatilho com o token certo: resume, normaliza e conclui', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido(DO_GATILHO))
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { situacao: 'resumida', criterios: 4 })
  assert.equal(chamadas.operador, 0)
  assert.equal(chamadas.reservar, 1)
  assert.deepEqual(chamadas.concluido?.resumo, {
    resumo: 'O prazo da renovação passou de 120 para 90 dias.',
    o_que_muda: ['Prazo de 90 dias.'],
    prazo_de_adequacao: null,
    confianca: 'alta',
  })
  assert.deepEqual(chamadas.concluido?.criterios, [
    { tipo: 'atividade', valor: '33.10.00' },
    { tipo: 'tipo_licenca', valor: 'renovacao' },
    { tipo: 'competencia', valor: 'estadual' },
    { tipo: 'tema', valor: 'procedimento' },
  ])
  assert.deepEqual(chamadas.entrada?.norma, {
    titulo: 'Instrução Normativa IMA 4',
    tipo: 'instrucao_normativa',
    orgao: 'IMA',
  })
})

Deno.test('token errado: 401 sem reservar e sem tentar o JWT', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido({ 'x-resumo-token': 'outro', ...DO_OPERADOR }))
  assert.equal(resposta.status, 401)
  assert.equal(chamadas.operador, 0)
  assert.equal(chamadas.reservar, 0)
})

Deno.test('sem token e sem JWT: 401', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido({}))
  assert.equal(resposta.status, 401)
  assert.equal(chamadas.reservar, 0)
})

Deno.test('operador pelo JWT: o banco confere antes de reservar', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido(DO_OPERADOR))
  assert.equal(resposta.status, 200)
  assert.equal(chamadas.operador, 1)
  assert.equal(chamadas.reservar, 1)
})

Deno.test('não operador pelo JWT: 403 sem reservar', async () => {
  const { tratar, chamadas } = montar({ operador: { erro: 'sem_permissao' } })
  const resposta = await tratar(pedido(DO_OPERADOR))
  assert.equal(resposta.status, 403)
  assert.deepEqual(await resposta.json(), { erro: 'sem_permissao' })
  assert.equal(chamadas.reservar, 0)
})

Deno.test('JWT recusado com erro desconhecido do banco vira 403 sem_permissao', async () => {
  const { tratar } = montar({ operador: { erro: 'JWT expired' } })
  const resposta = await tratar(pedido(DO_OPERADOR))
  assert.equal(resposta.status, 403)
  assert.deepEqual(await resposta.json(), { erro: 'sem_permissao' })
})

Deno.test('mudanca_id inválido: 400', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido(DO_GATILHO, { mudanca_id: 'x' }))
  assert.equal(resposta.status, 400)
  assert.equal(chamadas.reservar, 0)
})

for (const codigo of ['cota_diaria_esgotada', 'cota_mensal_esgotada', 'muitas_simultaneas']) {
  Deno.test(`cota da plataforma (${codigo}): 429 com o código, sem chamar a IA`, async () => {
    const { tratar, chamadas } = montar({ reserva: { dados: null, erro: codigo } })
    const resposta = await tratar(pedido(DO_GATILHO))
    assert.equal(resposta.status, 429)
    assert.deepEqual(await resposta.json(), { erro: codigo })
    assert.equal(chamadas.resumir, 0)
    assert.deepEqual(chamadas.falhas, [])
  })
}

for (const codigo of ['mudanca_ja_publicada', 'resumo_em_andamento']) {
  Deno.test(`reserva recusada (${codigo}): 409 sem chamar a IA`, async () => {
    const { tratar, chamadas } = montar({ reserva: { dados: null, erro: codigo } })
    const resposta = await tratar(pedido(DO_GATILHO))
    assert.equal(resposta.status, 409)
    assert.deepEqual(await resposta.json(), { erro: codigo })
    assert.equal(chamadas.resumir, 0)
  })
}

Deno.test('banco recusa o resumo na gravação: falha com resposta_invalida', async () => {
  const { tratar, chamadas } = montar({ concluir: { erro: 'resposta_invalida' } })
  const resposta = await tratar(pedido(DO_GATILHO))
  assert.deepEqual(await resposta.json(), { situacao: 'falhou', motivo: 'resposta_invalida' })
  assert.equal(chamadas.falhas.length, 1)
})

Deno.test('sem OPENROUTER_API_KEY: 503 sem gastar a cota', async () => {
  const { tratar, chamadas } = montar({ chave: undefined })
  const resposta = await tratar(pedido(DO_GATILHO))
  assert.equal(resposta.status, 503)
  assert.equal(chamadas.reservar, 0)
})

Deno.test('saída inválida da IA: falha a reserva com resposta_invalida', async () => {
  const { tratar, chamadas } = montar({
    provedor: () =>
      Promise.resolve({
        modelo: 'm',
        tokensEntrada: 1,
        tokensSaida: 1,
        custoMicros: 1,
        conteudo: { resumo: '', criterios: {} },
      }),
  })
  const resposta = await tratar(pedido(DO_GATILHO))
  assert.deepEqual(await resposta.json(), { situacao: 'falhou', motivo: 'resposta_invalida' })
  assert.equal(chamadas.concluido, null)
  assert.equal(chamadas.falhas.length, 1)
  assert.ok(chamadas.falhas[0]?.startsWith('resposta_invalida'))
})

Deno.test('provedor fora: falha a reserva com o motivo do provedor', async () => {
  const { tratar, chamadas } = montar({
    provedor: () =>
      Promise.reject(
        new FalhaDoProvedor(
          'provedor_indisponivel',
          { modelo: 'm', tokensEntrada: null, tokensSaida: null, custoMicros: null },
          'HTTP 503: fora',
        ),
      ),
  })
  const resposta = await tratar(pedido(DO_GATILHO))
  assert.deepEqual(await resposta.json(), { situacao: 'falhou', motivo: 'provedor_indisponivel' })
  assert.deepEqual(chamadas.falhas, ['provedor_indisponivel: HTTP 503: fora'])
})

Deno.test('falha ao gravar o resumo: fecha a reserva com erro_interno', async () => {
  const { tratar, chamadas } = montar({ concluir: { erro: 'boom' } })
  const resposta = await tratar(pedido(DO_GATILHO))
  assert.deepEqual(await resposta.json(), { situacao: 'falhou', motivo: 'erro_interno' })
  assert.equal(chamadas.falhas.length, 1)
})

Deno.test('log só com ids, etapa e motivo: nada da norma, do token nem da chave', async () => {
  const { tratar, chamadas } = montar({
    provedor: () =>
      Promise.resolve({
        modelo: 'm',
        tokensEntrada: 1,
        tokensSaida: 1,
        custoMicros: 1,
        conteudo: { resumo: 'Instrução Normativa', criterios: null },
      }),
  })
  await tratar(pedido(DO_GATILHO))
  assert.ok(chamadas.logs.length > 0)
  for (const linha of chamadas.logs) {
    const campos = Object.keys(JSON.parse(linha) as Record<string, unknown>)
    assert.ok(campos.every((c) => ['mudancaId', 'reservaId', 'etapa', 'motivo'].includes(c)))
    assert.ok(!linha.includes('Instrução') && !linha.includes(TOKEN) && !linha.includes('chave'))
  }
  assert.ok(chamadas.logs.some((l) => l.includes(RESERVA_ID)))
})
