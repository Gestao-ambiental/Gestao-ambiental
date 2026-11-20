import assert from 'node:assert/strict'

import {
  type Apontamento,
  type ContextoDaConferencia,
  juntarApontamentos,
  regrasFixas,
  textoDoDocx,
  validarConferencia,
} from './conferencia.ts'

export const CONTEXTO: ContextoDaConferencia = {
  hoje: '2026-11-19',
  data_execucao: '2026-11-10',
  empreendimento: {
    nome: 'Metalúrgica Rio Cubatão',
    cliente: null,
    cnpj: '11222333000181',
    unidade: 'Matriz',
    endereco: null,
  },
  licenca: {
    tipo: 'LAO',
    numero: '4821/2023',
    orgao: 'IMA',
    emissao: null,
    assinatura: '2023-03-10',
    validade: '2027-12-24',
  },
  condicionante: {
    codigo: '4.1',
    titulo: 'Monitoramento de efluentes',
    texto: 'Apresentar relatório semestral de efluentes.',
    prazo: '2026-11-24',
    ciclo: 1,
  },
}

Deno.test('textoDoDocx: parágrafos, tabulação, tabela, entidades e texto excluído', () => {
  const xml =
    '<w:document><w:body>' +
    '<w:p><w:r><w:t>Relatório &amp; anexos</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">Licença </w:t></w:r><w:r><w:tab/><w:t>LAO</w:t></w:r></w:p>' +
    '<w:p><w:del><w:r><w:delText>apagado</w:delText></w:r></w:del><w:r><w:t>fica</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>DBO</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12 mg/L</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '</w:body></w:document>'
  const texto = textoDoDocx(xml)
  assert.match(texto, /^Relatório & anexos\nLicença \tLAO\nfica\n/)
  assert.match(texto, /DBO\n \| 12 mg\/L/)
  assert.doesNotMatch(texto, /apagado/)
})

Deno.test('regrasFixas: campo sem preencher, CNPJ diferente e data no futuro', () => {
  const texto = [
    'Empreendimento: Metalúrgica Rio Cubatão, CNPJ 11.222.333/0001-81.',
    'Unidade: [Unidade]. Responsável: {{responsavel}}.',
    'CNPJ do laboratório citado como 99.888.777/0001-66.',
    'Coleta em 10/11/2026 e laudo de 15/12/2026.',
    'Licença válida até 24/12/2027, entrega até 24/11/2026.',
  ].join('\n')
  const apontamentos = regrasFixas(texto, CONTEXTO)
  const trechos = apontamentos.map((a) => `${a.categoria}:${a.trecho}`)
  assert.deepEqual(trechos, [
    'escrita:[Unidade]',
    'escrita:{{responsavel}}',
    'empreendimento:99.888.777/0001-66',
    'datas:15/12/2026',
  ])
  assert.ok(apontamentos.every((a) => a.origem === 'regra'))
})

Deno.test('regrasFixas: relatório limpo não aponta nada', () => {
  assert.deepEqual(
    regrasFixas('Metalúrgica Rio Cubatão, CNPJ 11222333000181, coleta em 10/11/2026.', CONTEXTO),
    [],
  )
})

Deno.test('validarConferencia: aceita o válido e descarta o malformado', () => {
  const resultado = validarConferencia({
    resumo: '  Um ponto a corrigir. ',
    apontamentos: [
      {
        categoria: 'licenca',
        gravidade: 'corrigir',
        trecho: 'LAO 4812/2023',
        problema: 'Número trocado.',
        sugestao: 'LAO 4821/2023',
      },
      { categoria: 'outra', gravidade: 'corrigir', trecho: '', problema: 'x', sugestao: '' },
      { categoria: 'datas', gravidade: 'urgente', trecho: '', problema: 'x', sugestao: '' },
      { categoria: 'datas', gravidade: 'verificar', trecho: '', problema: '   ', sugestao: '' },
    ],
  })
  assert.equal(resultado?.resumo, 'Um ponto a corrigir.')
  assert.equal(resultado?.apontamentos.length, 1)
  assert.equal(resultado?.apontamentos[0]?.origem, 'ia')
  assert.equal(validarConferencia({ resumo: 'x' }), null)
  assert.equal(validarConferencia('texto'), null)
})

Deno.test('juntarApontamentos: regra primeiro, sem repetir o que a IA também achou', () => {
  const regra: Apontamento = {
    origem: 'regra',
    categoria: 'escrita',
    gravidade: 'corrigir',
    trecho: '[Unidade]',
    problema: 'Campo do modelo sem preencher.',
    sugestao: '',
  }
  const repetido: Apontamento = { ...regra, origem: 'ia', problema: 'Placeholder.' }
  const novo: Apontamento = {
    ...regra,
    origem: 'ia',
    categoria: 'datas',
    trecho: '',
    problema: 'Período confuso.',
  }
  assert.deepEqual(juntarApontamentos([regra], [repetido, novo]), [regra, novo])
})
