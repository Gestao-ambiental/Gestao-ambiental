import assert from 'node:assert/strict'

import { FalhaDoProvedor, type Resultado } from '../extrair-licenca/openrouter.ts'
import { type Apontamento, MIME_DOCX } from './conferencia.ts'
import { CONTEXTO } from './conferencia.test.ts'
import {
  criarTratadorDaConferencia,
  type DependenciasDaConferencia,
  type InicioDaConferencia,
  type RespostaDoBanco,
} from './conferir-relatorio.ts'

const CONFERENCIA = '70000000-0000-4000-8000-000000000001'
const EVIDENCIA = '60000000-0000-4000-8000-000000000001'

const INICIO: InicioDaConferencia = {
  conferencia_id: CONFERENCIA,
  nova: true,
  situacao: 'em_andamento',
  motivo: null,
  ia_liberada: true,
  caminho: 'c/evidencia/x.docx',
  mime: MIME_DOCX,
  tamanho_bytes: 4096,
  contexto: CONTEXTO,
}

const DOCUMENTO = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text:
            'Relatório semestral de efluentes da Metalúrgica Rio Cubatão, condicionante 4.1 da ' +
            'LAO 4812/2023. As coletas foram feitas em 10/11/2026 e os resultados estão abaixo. '.repeat(
              3,
            ),
        },
      ],
    },
  ],
}

const INICIO_RELATORIO: InicioDaConferencia = {
  ...INICIO,
  caminho: null,
  mime: null,
  tamanho_bytes: null,
  conteudo: DOCUMENTO,
}

const TEXTO =
  'Relatório semestral de efluentes da Metalúrgica Rio Cubatão, CNPJ 11.222.333/0001-81, ' +
  'referente à condicionante 4.1 da LAO 4821/2023 emitida pelo IMA. ' +
  'Unidade: [Unidade]. '.repeat(1) +
  'As coletas foram feitas em 10/11/2026 e os resultados estão na tabela abaixo. '.repeat(3)

interface Chamadas {
  baixar: number
  reservar: number
  conferir: number
  concluido: { resumo: string; apontamentos: Apontamento[] } | null
  falhas: { motivo: string; apontamentos: Apontamento[] }[]
}

function montar(
  extra: {
    inicio?: RespostaDoBanco<InicioDaConferencia>
    inicioRelatorio?: RespostaDoBanco<InicioDaConferencia>
    texto?: string
    reserva?: RespostaDoBanco<boolean>
    provedor?: () => Promise<Resultado>
    chave?: string | undefined
  } = {},
) {
  const chamadas: Chamadas = { baixar: 0, reservar: 0, conferir: 0, concluido: null, falhas: [] }
  const deps: DependenciasDaConferencia = {
    env: (nome) =>
      nome === 'OPENROUTER_API_KEY'
        ? 'chave' in extra
          ? extra.chave
          : 'chave-de-teste'
        : undefined,
    iniciar: () => Promise.resolve(extra.inicio ?? { dados: INICIO, erro: null }),
    iniciarRelatorio: () =>
      Promise.resolve(extra.inicioRelatorio ?? { dados: INICIO_RELATORIO, erro: null }),
    baixar: () => {
      chamadas.baixar++
      return Promise.resolve({ dados: new Uint8Array([1]), erro: null })
    },
    lerPdf: () => Promise.resolve([extra.texto ?? TEXTO]),
    lerDocx: () => Promise.resolve(extra.texto ?? TEXTO),
    reservar: () => {
      chamadas.reservar++
      return Promise.resolve(extra.reserva ?? { dados: true, erro: null })
    },
    criarConferidor: () => ({
      conferir: () => {
        chamadas.conferir++
        return extra.provedor
          ? extra.provedor()
          : Promise.resolve({
              modelo: 'modelo-teste',
              tokensEntrada: 10,
              tokensSaida: 5,
              custoMicros: 7,
              conteudo: {
                resumo: 'Um ponto de data.',
                apontamentos: [
                  {
                    categoria: 'datas',
                    gravidade: 'verificar',
                    trecho: '',
                    problema: 'Período de referência não informado.',
                    sugestao: 'Informe o semestre.',
                    substituicao: '',
                  },
                ],
              },
            })
      },
    }),
    concluir: (_id, resumo, apontamentos) => {
      chamadas.concluido = { resumo, apontamentos }
      return Promise.resolve({ dados: apontamentos.length, erro: null })
    },
    falhar: (_id, motivo, _detalhe, apontamentos) => {
      chamadas.falhas.push({ motivo, apontamentos })
      return Promise.resolve({ erro: null })
    },
    agora: () => 0,
    tempoLimite: () => new AbortController().signal,
    registrar: () => {},
  }
  return { tratar: criarTratadorDaConferencia(deps), chamadas }
}

function pedido(corpo: unknown = { conferenciaId: CONFERENCIA, evidenciaId: EVIDENCIA }) {
  return new Request('http://local/conferir-relatorio', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt' },
    body: JSON.stringify(corpo),
  })
}

Deno.test('conclui com as regras fixas primeiro e os apontamentos da IA', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { situacao: 'concluida', apontamentos: 2 })
  assert.equal(chamadas.reservar, 1)
  assert.equal(chamadas.concluido?.resumo, 'Um ponto de data.')
  assert.deepEqual(
    chamadas.concluido?.apontamentos.map((a) => `${a.origem}:${a.categoria}`),
    ['regra:escrita', 'ia:datas'],
  )
})

Deno.test('plano sem IA: grava só as regras fixas e não reserva cota', async () => {
  const { tratar, chamadas } = montar({
    inicio: { dados: { ...INICIO, ia_liberada: false }, erro: null },
  })
  const resposta = await tratar(pedido())
  assert.deepEqual(await resposta.json(), {
    situacao: 'falhou',
    motivo: 'ia_fora_do_plano',
    apontamentos: 1,
  })
  assert.equal(chamadas.reservar, 0)
  assert.equal(chamadas.conferir, 0)
  assert.equal(chamadas.falhas[0]?.apontamentos[0]?.trecho, '[Unidade]')
})

Deno.test('sem cota: falha com limite_atingido e não chama o provedor', async () => {
  const { tratar, chamadas } = montar({ reserva: { dados: false, erro: null } })
  const resposta = await tratar(pedido())
  assert.equal((await resposta.json()).motivo, 'limite_atingido')
  assert.equal(chamadas.conferir, 0)
})

Deno.test('arquivo sem texto não vai à IA', async () => {
  const { tratar, chamadas } = montar({ texto: '   ' })
  const resposta = await tratar(pedido())
  assert.equal((await resposta.json()).motivo, 'arquivo_sem_texto')
  assert.equal(chamadas.reservar, 0)
})

Deno.test('provedor fora: registra a falha com o motivo do provedor', async () => {
  const { tratar, chamadas } = montar({
    provedor: () =>
      Promise.reject(
        new FalhaDoProvedor('provedor_indisponivel', {
          modelo: 'm',
          tokensEntrada: null,
          tokensSaida: null,
          custoMicros: null,
        }),
      ),
  })
  const resposta = await tratar(pedido())
  assert.equal((await resposta.json()).motivo, 'provedor_indisponivel')
  assert.equal(chamadas.falhas.length, 1)
})

Deno.test('resposta fora do schema: resposta_invalida', async () => {
  const { tratar } = montar({
    provedor: () =>
      Promise.resolve({
        modelo: 'm',
        tokensEntrada: 1,
        tokensSaida: 1,
        custoMicros: 1,
        conteudo: { x: 1 },
      }),
  })
  assert.equal((await (await tratar(pedido())).json()).motivo, 'resposta_invalida')
})

Deno.test('repetição devolve a situação sem chamar nada', async () => {
  const { tratar, chamadas } = montar({
    inicio: { dados: { ...INICIO, nova: false, situacao: 'concluida' }, erro: null },
  })
  assert.deepEqual(await (await tratar(pedido())).json(), { situacao: 'concluida', motivo: null })
  assert.equal(chamadas.reservar, 0)
})

Deno.test('erros do início e pedido inválido', async () => {
  const semPermissao = montar({ inicio: { dados: null, erro: 'sem_permissao' } })
  assert.equal((await semPermissao.tratar(pedido())).status, 403)
  const { tratar } = montar()
  assert.equal((await tratar(pedido({ conferenciaId: 'x', evidenciaId: EVIDENCIA }))).status, 400)
  assert.equal(
    (await tratar(new Request('http://local', { method: 'POST', body: '{}' }))).status,
    401,
  )
})

Deno.test('sem a chave do provedor: configuracao_ausente, com as regras gravadas', async () => {
  const { tratar, chamadas } = montar({ chave: undefined })
  assert.equal((await (await tratar(pedido())).json()).motivo, 'configuracao_ausente')
  assert.equal(chamadas.falhas[0]?.apontamentos.length, 1)
})

Deno.test('relatório escrito no Grama: lê o texto do JSON, sem baixar arquivo', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(
    pedido({ conferenciaId: CONFERENCIA, relatorioId: EVIDENCIA, versao: 3 }),
  )
  assert.deepEqual(await resposta.json(), { situacao: 'concluida', apontamentos: 1 })
  assert.equal(chamadas.baixar, 0)
  assert.equal(chamadas.reservar, 1)
  assert.equal(chamadas.concluido?.apontamentos[0]?.origem, 'ia')
})

Deno.test('relatório: versão inválida no pedido é recusada', async () => {
  const { tratar } = montar()
  const resposta = await tratar(
    pedido({ conferenciaId: CONFERENCIA, relatorioId: EVIDENCIA, versao: 0 }),
  )
  assert.equal(resposta.status, 400)
})
