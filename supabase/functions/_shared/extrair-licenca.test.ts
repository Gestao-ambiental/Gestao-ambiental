import assert from 'node:assert/strict'

import { FalhaDoProvedor, type Resultado } from '../extrair-licenca/openrouter.ts'
import {
  criarTratadorDaExtracao,
  type DependenciasDaExtracao,
  type InicioDaExtracao,
  type RegistroDaExtracao,
  type RespostaDoBanco,
} from './extrair-licenca.ts'
import { LIMITE_PAGINAS } from './extracao.ts'

const EXTRACAO = '30000000-0000-4000-8000-000000000001'
const INSTRUMENTO = '10000000-0000-4000-8000-000000000001'

const INICIO: InicioDaExtracao = {
  nova: true,
  situacao: 'em_andamento',
  motivo: null,
  itens_propostos: null,
  caminho: 'c/instrumento/x.pdf',
  tamanho_bytes: 1000,
  tipos: ['LAO'],
}

const PAGINA = 'Condicionante 1. Apresentar relatório semestral de efluentes ao órgão ambiental.'

const PROPOSTA_DO_MODELO = {
  identificacao: {
    tipo: { valor: 'LAO', pagina: 1 },
    numero: { valor: null, pagina: null },
    orgao: { valor: null, pagina: null },
    emitido_em: { valor: null, texto: null, pagina: null },
    assinado_em: { valor: null, texto: null, pagina: null },
    publicado_em: { valor: null, texto: null, pagina: null },
    recebido_em: { valor: null, texto: null, pagina: null },
    validade: { valor: null, texto: null, pagina: null },
  },
  condicionantes: [],
}

interface Chamadas {
  baixar: number
  reservar: number
  extrair: number
  concluir: number
  falhar: { motivo: string; registro: RegistroDaExtracao; detalhe: string | null }[]
  log: string[]
}

function montar(
  extra: Partial<DependenciasDaExtracao> & {
    inicio?: RespostaDoBanco<InicioDaExtracao>
    textos?: string[]
    reserva?: RespostaDoBanco<boolean>
    provedor?: () => Promise<Resultado>
    erroAoFalhar?: string | null
  } = {},
) {
  const chamadas: Chamadas = {
    baixar: 0,
    reservar: 0,
    extrair: 0,
    concluir: 0,
    falhar: [],
    log: [],
  }
  const tratar = criarTratadorDaExtracao({
    env: (nome) => (nome === 'OPENROUTER_API_KEY' ? 'chave-de-teste' : undefined),
    iniciar: () => Promise.resolve(extra.inicio ?? { dados: INICIO, erro: null }),
    baixarPdf: () => {
      chamadas.baixar++
      return Promise.resolve({ dados: new Uint8Array([1]), erro: null })
    },
    lerPdf: () => {
      const textos = extra.textos ?? [PAGINA]
      return Promise.resolve({ totalPaginas: textos.length, textos })
    },
    reservar: () => {
      chamadas.reservar++
      return Promise.resolve(extra.reserva ?? { dados: true, erro: null })
    },
    criarExtrator: () => ({
      extrair: () => {
        chamadas.extrair++
        return extra.provedor
          ? extra.provedor()
          : Promise.resolve({
              modelo: 'modelo-teste',
              tokensEntrada: 10,
              tokensSaida: 5,
              custoMicros: 7,
              conteudo: PROPOSTA_DO_MODELO,
            })
      },
    }),
    concluir: () => {
      chamadas.concluir++
      return Promise.resolve({ dados: 0, erro: null })
    },
    falhar: (_id, motivo, registro, detalhe) => {
      chamadas.falhar.push({ motivo, registro, detalhe })
      return Promise.resolve({ erro: extra.erroAoFalhar ?? null })
    },
    registrar: (linha) => chamadas.log.push(linha),
    // Sem timer pendurado no fim do teste (o Deno acusa vazamento).
    tempoLimite: () => new AbortController().signal,
    ...extra,
  })
  return { tratar, chamadas }
}

function pedido(): Request {
  return new Request('http://localhost/extrair-licenca', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt-de-teste', 'Content-Type': 'application/json' },
    body: JSON.stringify({ extracaoId: EXTRACAO, instrumentoId: INSTRUMENTO }),
  })
}

Deno.test('extração: reserva uma chamada, chama a IA uma vez e conclui', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { situacao: 'concluida', itens: 0 })
  assert.equal(chamadas.reservar, 1)
  assert.equal(chamadas.extrair, 1)
  assert.equal(chamadas.concluir, 1)
  assert.equal(chamadas.falhar.length, 0)
})

Deno.test(
  'extração: plano sem IA recusa com 403 antes de baixar, reservar ou chamar a IA',
  async () => {
    const { tratar, chamadas } = montar({ inicio: { dados: null, erro: 'ia_fora_do_plano' } })
    const resposta = await tratar(pedido())
    assert.equal(resposta.status, 403)
    assert.deepEqual(await resposta.json(), { erro: 'ia_fora_do_plano' })
    assert.equal(chamadas.baixar, 0)
    assert.equal(chamadas.reservar, 0)
    assert.equal(chamadas.extrair, 0)
  },
)

Deno.test('extração: só leitura também recusa com 403 e o código próprio', async () => {
  const { tratar } = montar({ inicio: { dados: null, erro: 'consultoria_somente_leitura' } })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 403)
  assert.deepEqual(await resposta.json(), { erro: 'consultoria_somente_leitura' })
})

Deno.test('extração: cota esgotada falha com limite_atingido sem chamar a IA', async () => {
  const { tratar, chamadas } = montar({ reserva: { dados: false, erro: null } })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), {
    situacao: 'falhou',
    motivo: 'limite_atingido',
    detalhe: null,
  })
  assert.equal(chamadas.extrair, 0)
  assert.deepEqual(
    chamadas.falhar.map((f) => f.motivo),
    ['limite_atingido'],
  )
})

Deno.test('extração: erro ao reservar não chama a IA (erro interno)', async () => {
  const { tratar, chamadas } = montar({ reserva: { dados: null, erro: 'conexão perdida' } })
  const corpo = (await (await tratar(pedido())).json()) as Record<string, unknown>
  assert.equal(corpo.motivo, 'erro_interno')
  assert.equal(corpo.detalhe, 'reserva: conexão perdida')
  assert.equal(chamadas.extrair, 0)
})

Deno.test('extração: PDF com páginas demais falha antes de reservar a cota', async () => {
  const { tratar, chamadas } = montar({
    textos: Array.from({ length: LIMITE_PAGINAS + 1 }, () => PAGINA),
  })
  const corpo = (await (await tratar(pedido())).json()) as Record<string, unknown>
  assert.equal(corpo.motivo, 'pdf_grande_demais')
  assert.equal(chamadas.reservar, 0)
  assert.equal(chamadas.extrair, 0)
  assert.equal(chamadas.falhar[0]?.registro.paginas, LIMITE_PAGINAS + 1)
})

Deno.test('extração: falha do provedor registra o consumo; a reserva já contou', async () => {
  const { tratar, chamadas } = montar({
    provedor: () =>
      Promise.reject(
        new FalhaDoProvedor(
          'provedor_indisponivel',
          { modelo: 'modelo-teste', tokensEntrada: 3, tokensSaida: null, custoMicros: 1 },
          'HTTP 503',
        ),
      ),
  })
  const corpo = (await (await tratar(pedido())).json()) as Record<string, unknown>
  assert.equal(corpo.motivo, 'provedor_indisponivel')
  assert.equal(chamadas.reservar, 1)
  assert.equal(chamadas.falhar[0]?.registro.tokensEntrada, 3)
  assert.equal(chamadas.falhar[0]?.detalhe, 'HTTP 503')
})

Deno.test('extração: se o registro da falha não grava, responde 500 e não "falhou"', async () => {
  const { tratar, chamadas } = montar({
    reserva: { dados: false, erro: null },
    erroAoFalhar: 'permission denied',
  })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 500)
  assert.deepEqual(await resposta.json(), { erro: 'erro_interno' })
  assert.ok(chamadas.log.some((linha) => linha.includes('registrar_falha')))
})

Deno.test('extração: exceção ao registrar a falha também responde 500', async () => {
  const { tratar } = montar({
    reserva: { dados: false, erro: null },
    falhar: () => Promise.reject(new Error('rede')),
  })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 500)
  assert.deepEqual(await resposta.json(), { erro: 'erro_interno' })
})

Deno.test(
  'extração: repetir (mesmo id) só devolve a situação, sem reservar nem chamar a IA',
  async () => {
    const { tratar, chamadas } = montar({
      inicio: {
        dados: { ...INICIO, nova: false, situacao: 'falhou', motivo: 'limite_atingido' },
        erro: null,
      },
    })
    assert.deepEqual(await (await tratar(pedido())).json(), {
      situacao: 'falhou',
      motivo: 'limite_atingido',
    })
    assert.equal(chamadas.reservar, 0)
    assert.equal(chamadas.extrair, 0)
  },
)

Deno.test('extração: pedido sem JWT ou com ids inválidos é recusado', async () => {
  const { tratar } = montar()
  const semJwt = await tratar(new Request('http://localhost/x', { method: 'POST', body: '{}' }))
  assert.equal(semJwt.status, 401)
  const invalido = await tratar(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
      body: JSON.stringify({ extracaoId: 'x', instrumentoId: INSTRUMENTO }),
    }),
  )
  assert.equal(invalido.status, 400)
})
