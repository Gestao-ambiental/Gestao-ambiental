import { describe, expect, it } from 'vitest'

import {
  CAMPOS_DA_IMPORTACAO,
  chaveDaLicenca,
  chaveDoEmpreendimento,
  colunaPareceCpf,
  dadosVazios,
  dataDoSerialDoExcel,
  decodificarCsv,
  descartarColunasDeCpf,
  detectarSeparadorDoCsv,
  faltamObrigatorios,
  lerDataDaPlanilha,
  linhasComErroEmCsv,
  mapearCabecalhos,
  marcarRepetidas,
  mensagemDoProblema,
  montarDadosDaLinha,
  normalizarCabecalho,
  normalizarTextoDeComparacao,
  numeroPareceCpf,
  podeDesfazer,
  tirarCpfDoTexto,
  validarLinha,
  valorPareceCpf,
  type CelulaLida,
  type DadosDaLinha,
  type LinhaLida,
  type TabelaLida,
} from '.'

const texto = (t: string): CelulaLida => ({ valor: t, texto: t })
const numero = (n: number, formatado = String(n)): CelulaLida => ({ valor: n, texto: formatado })
const vazia: CelulaLida = { valor: null, texto: '' }

function linha(numeroLinha: number, ...celulas: CelulaLida[]): LinhaLida {
  return { numeroLinha, celulas }
}

function dados(extra: Partial<DadosDaLinha>): DadosDaLinha {
  return { ...dadosVazios(), ...extra }
}

describe('campos e cabeçalhos', () => {
  it('o modelo de licenças tem as colunas de empreendimentos e mais cinco obrigatórias', () => {
    expect(CAMPOS_DA_IMPORTACAO.empreendimento.map((c) => c.rotulo)).toEqual([
      'Empreendimento',
      'Cliente',
      'CNPJ',
      'Unidade',
      'Endereço da unidade',
    ])
    expect(CAMPOS_DA_IMPORTACAO.licenca.filter((c) => c.obrigatorio).map((c) => c.campo)).toEqual([
      'empreendimento',
      'tipo',
      'numero',
      'orgao',
      'emitido_em',
      'validade',
    ])
  })

  it('normaliza como private.normalizar_nome; o cabeçalho também perde a pontuação', () => {
    expect(normalizarTextoDeComparacao('  Órgão   Emissor ')).toBe('orgao emissor')
    expect(normalizarTextoDeComparacao('Válida até:')).toBe('valida ate:')
    expect(normalizarCabecalho('Válida até:')).toBe('valida ate')
    expect(normalizarCabecalho('Nº da licença')).toBe('no da licenca')
    expect(normalizarCabecalho('N.º')).toBe('n o')
  })

  it('sugere o mapeamento pelos sinônimos, cada cabeçalho uma vez só', () => {
    const cabecalhos = ['Empresa', 'Vencimento', 'Nº', 'Órgão emissor', 'Data de emissão', 'Tipo']
    expect(mapearCabecalhos(cabecalhos, 'licenca')).toEqual({
      empreendimento: 'Empresa',
      tipo: 'Tipo',
      numero: 'Nº',
      orgao: 'Órgão emissor',
      emitido_em: 'Data de emissão',
      validade: 'Vencimento',
    })
    // Na aba Empreendimentos, as colunas da licença não entram.
    expect(mapearCabecalhos(cabecalhos, 'empreendimento')).toEqual({ empreendimento: 'Empresa' })
  })

  it('a memória vem antes dos sinônimos, só com cabeçalhos que existem no arquivo', () => {
    const cabecalhos = ['Nome fantasia', 'Empreendimento', 'Doc']
    const memoria = { empreendimento: 'Nome fantasia', cnpj: 'CNPJ antigo', cliente: 'Doc' }
    expect(mapearCabecalhos(cabecalhos, 'empreendimento', memoria)).toEqual({
      empreendimento: 'Nome fantasia',
      cliente: 'Doc',
    })
    expect(mapearCabecalhos(cabecalhos, 'empreendimento', null)).toEqual({
      empreendimento: 'Empreendimento',
    })
  })

  it('aponta os obrigatórios sem coluna', () => {
    expect(faltamObrigatorios({ empreendimento: 'A' }, 'empreendimento')).toEqual([])
    expect(faltamObrigatorios({ empreendimento: 'A', tipo: 'T' }, 'licenca')).toEqual([
      'numero',
      'orgao',
      'emitido_em',
      'validade',
    ])
  })
})

describe('CPF nunca sai do aparelho', () => {
  it('valor com formato de CPF ou 11 dígitos com verificadores certos', () => {
    expect(valorPareceCpf('529.982.247-25')).toBe(true)
    expect(valorPareceCpf('52998224725')).toBe(true)
    expect(valorPareceCpf('Fulano 123.456.789-00')).toBe(true)
    expect(valorPareceCpf('52998224724')).toBe(false)
    expect(valorPareceCpf('12.345.678/0001-90')).toBe(false)
    expect(valorPareceCpf('')).toBe(false)
  })

  it('coluna de CPF pelo cabeçalho, por um valor formatado ou por metade dos valores', () => {
    expect(colunaPareceCpf('CPF do responsável', [])).toBe(true)
    expect(colunaPareceCpf('CPF/CNPJ', ['12345678000190'])).toBe(true)
    expect(colunaPareceCpf('Documento', ['', '529.982.247-25', 'x'])).toBe(true)
    expect(colunaPareceCpf('Documento', ['52998224725', '12345678000190'])).toBe(true)
    expect(colunaPareceCpf('Documento', ['52998224725', 'a', 'b'])).toBe(false)
    expect(colunaPareceCpf('Cpfx', ['a'])).toBe(false)
    expect(colunaPareceCpf('Documento', ['', ' '])).toBe(false)
  })

  it('descarta a coluna inteira antes do mapeamento', () => {
    const tabela: TabelaLida = {
      cabecalhos: ['Empreendimento', 'CPF', 'Cliente'],
      linhas: [linha(2, texto('Metalúrgica'), texto('529.982.247-25'), texto('Grupo A'))],
    }
    const { tabela: limpa, descartadas } = descartarColunasDeCpf(tabela)
    expect(descartadas).toEqual(['CPF'])
    expect(limpa.cabecalhos).toEqual(['Empreendimento', 'Cliente'])
    expect(limpa.linhas[0]?.celulas.map((c) => c.texto)).toEqual(['Metalúrgica', 'Grupo A'])
    expect(JSON.stringify(limpa)).not.toContain('529')
    const semCpf = { cabecalhos: ['A'], linhas: [linha(2, texto('x'))] }
    expect(descartarColunasDeCpf(semCpf).tabela).toBe(semCpf)
  })

  it('planilha sem cabeçalho: a coluna cujo "cabeçalho" é um CPF também sai', () => {
    expect(colunaPareceCpf('529.982.247-25', ['Rede X'])).toBe(true)
    expect(colunaPareceCpf('52998224725', [])).toBe(true)
    const { descartadas } = descartarColunasDeCpf({
      cabecalhos: ['Metalúrgica', '529.982.247-25'],
      linhas: [linha(2, texto('Têxtil'), texto('Rede X'))],
    })
    expect(descartadas).toEqual(['529.982.247-25'])
  })

  it('CPF guardado como número no Excel perde o zero à esquerda e ainda é CPF', () => {
    // 012.345.678-90 numa célula numérica vira 1234567890.
    expect(numeroPareceCpf(1234567890)).toBe(true)
    expect(numeroPareceCpf(52998224725)).toBe(true)
    expect(numeroPareceCpf(1234567891)).toBe(false)
    // Número curto (ex.: número da licença) não vira CPF por acaso.
    expect(numeroPareceCpf(4821)).toBe(false)
    expect(numeroPareceCpf('1234567890')).toBe(false)
    // A coluna numérica com esses CPFs sai inteira (pelo texto, 10 dígitos, não sairia).
    expect(colunaPareceCpf('Documento', ['1234567890'])).toBe(false)
    expect(
      descartarColunasDeCpf({
        cabecalhos: ['Empreendimento', 'Documento'],
        linhas: [linha(2, texto('A'), numero(1234567890))],
      }).descartadas,
    ).toEqual(['Documento'])
  })

  it('CPF sai do nome do arquivo; CNPJ e outros números ficam', () => {
    expect(tirarCpfDoTexto('carteira 529.982.247-25.xlsx')).toBe('carteira.xlsx')
    expect(tirarCpfDoTexto('Sítio 52998224725 licenças.csv')).toBe('Sítio licenças.csv')
    expect(tirarCpfDoTexto('cliente 12345678000190.xlsx')).toBe('cliente 12345678000190.xlsx')
    expect(tirarCpfDoTexto('lote 52998224724.xlsx')).toBe('lote 52998224724.xlsx')
    expect(tirarCpfDoTexto('carteira 2026.xlsx')).toBe('carteira 2026.xlsx')
  })
})

describe('datas da planilha', () => {
  it('lê dd/mm/aaaa, d/m/aaaa e aaaa-mm-dd sem new Date', () => {
    expect(lerDataDaPlanilha(texto('04/04/2027'))).toEqual({
      data: '2027-04-04',
      textoOriginal: '04/04/2027',
    })
    expect(lerDataDaPlanilha(texto('4/4/2027')).data).toBe('2027-04-04')
    expect(lerDataDaPlanilha(texto(' 2027-04-04 ')).data).toBe('2027-04-04')
  })

  it('ano com dois dígitos, data inexistente e ano fora de 1900..2100 são inválidos', () => {
    expect(lerDataDaPlanilha(texto('04/04/27'))).toEqual({ data: null, textoOriginal: '04/04/27' })
    expect(lerDataDaPlanilha(texto('31/02/2027')).data).toBeNull()
    expect(lerDataDaPlanilha(texto('01/01/1899')).data).toBeNull()
    expect(lerDataDaPlanilha(texto('01/01/2101')).data).toBeNull()
    expect(lerDataDaPlanilha(texto('abril de 2027')).data).toBeNull()
    expect(lerDataDaPlanilha(vazia)).toEqual({ data: null, textoOriginal: '' })
  })

  it('número de série do Excel, sistema 1900, com o 29/02/1900 inventado inválido', () => {
    expect(dataDoSerialDoExcel(1)).toBe('1900-01-01')
    expect(dataDoSerialDoExcel(59)).toBe('1900-02-28')
    expect(dataDoSerialDoExcel(60)).toBeNull()
    expect(dataDoSerialDoExcel(61)).toBe('1900-03-01')
    expect(dataDoSerialDoExcel(45000)).toBe('2023-03-15')
    expect(dataDoSerialDoExcel(46481.75)).toBe('2027-04-04')
    expect(dataDoSerialDoExcel(0)).toBeNull()
    expect(dataDoSerialDoExcel(Number.NaN)).toBeNull()
    expect(dataDoSerialDoExcel(80000)).toBeNull()
    expect(lerDataDaPlanilha(numero(46481, '04/04/2027'))).toEqual({
      data: '2027-04-04',
      textoOriginal: '04/04/2027',
    })
  })
})

describe('CSV', () => {
  it('UTF-8 válido fica; senão windows-1252; o BOM sai', () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, 0x4f, 0x72, 0x67, 0xc3, 0xa3, 0x6f])
    expect(decodificarCsv(utf8)).toBe('Orgão')
    const latino = new Uint8Array([0xd3, 0x72, 0x67, 0xe3, 0x6f])
    expect(decodificarCsv(latino)).toBe('Órgão')
  })

  it('detecta ";" ou "," na primeira linha, fora de aspas; ";" ganha o empate', () => {
    expect(detectarSeparadorDoCsv('Empreendimento;Cliente;CNPJ\na,b;c;d')).toBe(';')
    expect(detectarSeparadorDoCsv('Empreendimento,Cliente\n')).toBe(',')
    expect(detectarSeparadorDoCsv('"Nome; completo",Cliente,CNPJ')).toBe(',')
    expect(detectarSeparadorDoCsv('Só uma coluna')).toBe(';')
  })
})

describe('dados da linha', () => {
  const cabecalhos = [
    'Empreendimento',
    'Cliente',
    'CNPJ',
    'Tipo',
    'Nº',
    'Órgão',
    'Emissão',
    'Validade',
  ]
  const mapa = mapearCabecalhos(cabecalhos, 'licenca')

  it('normaliza: espaços, vazio nulo, CNPJ só com letras e dígitos e datas com o texto original', () => {
    const resultado = montarDadosDaLinha(
      'licenca',
      mapa,
      cabecalhos,
      linha(
        3,
        texto('  Metalúrgica Rio Cubatão '),
        texto(''),
        texto('12.345.678/0001-90'),
        texto('LAO'),
        numero(4821),
        texto('IMA'),
        numero(45000, '15/03/2023'),
        texto('04/04/2027'),
      ),
    )
    expect(resultado).toEqual({
      ...dadosVazios(),
      empreendimento: 'Metalúrgica Rio Cubatão',
      cnpj: '12345678000190',
      tipo: 'LAO',
      numero: '4821',
      orgao: 'IMA',
      emitido_em: '2023-03-15',
      emitido_em_texto: '15/03/2023',
      validade: '2027-04-04',
      validade_texto: '04/04/2027',
    })
  })

  it('CNPJ guardado como número não passa pela notação científica do Excel', () => {
    const resultado = montarDadosDaLinha(
      'empreendimento',
      { empreendimento: 'Empreendimento', cnpj: 'CNPJ' },
      ['Empreendimento', 'CNPJ'],
      linha(2, texto('A'), numero(12345678000190, '1.23457E+13')),
    )
    expect(resultado.cnpj).toBe('12345678000190')
  })

  it('valor com cara de CPF vira nulo e entra em descartados; CNPJ de 11 dígitos sempre', () => {
    const resultado = montarDadosDaLinha(
      'empreendimento',
      { empreendimento: 'Empreendimento', cliente: 'Cliente', cnpj: 'CNPJ' },
      ['Empreendimento', 'Cliente', 'CNPJ'],
      linha(2, texto('Sítio'), texto('529.982.247-25'), texto('123.456.789-01')),
    )
    expect(resultado.cliente).toBeNull()
    expect(resultado.cnpj).toBeNull()
    expect(resultado.descartados).toEqual(['cliente', 'cnpj'])
    const onze = montarDadosDaLinha(
      'empreendimento',
      { empreendimento: 'Empreendimento', cnpj: 'CNPJ' },
      ['Empreendimento', 'CNPJ'],
      linha(2, texto('Sítio'), texto('11111111111')),
    )
    expect(onze.descartados).toEqual(['cnpj'])
    expect(JSON.stringify([resultado, onze])).not.toMatch(/529|11111111111/)
  })

  it('CNPJ ou CPF em célula numérica: o Excel tira os zeros à esquerda', () => {
    const doCnpj = (celula: CelulaLida) =>
      montarDadosDaLinha(
        'empreendimento',
        { empreendimento: 'Empreendimento', cnpj: 'CNPJ' },
        ['Empreendimento', 'CNPJ'],
        linha(2, texto('A'), celula),
      )
    // 06.123.456/0001-25 e 00.000.000/0001-91 guardados como número.
    expect(doCnpj(numero(6123456000125, '6.12346E+12')).cnpj).toBe('06123456000125')
    expect(doCnpj(numero(191)).cnpj).toBe('00000000000191')
    // Sem verificador certo, não completa: fica o número, e a conferência aponta CNPJ incompleto.
    expect(doCnpj(numero(6123456000126)).cnpj).toBe('6123456000126')
    // CPF 012.345.678-90 guardado como número (1234567890): sai, nunca vira CNPJ.
    const cpf = doCnpj(numero(1234567890))
    expect(cpf.cnpj).toBeNull()
    expect(cpf.descartados).toEqual(['cnpj'])
    expect(JSON.stringify(cpf)).not.toContain('1234567890')
  })

  it('na aba Empreendimentos, colunas de licença ficam de fora; coluna sem célula é nula', () => {
    const resultado = montarDadosDaLinha('empreendimento', mapa, cabecalhos, linha(2, texto('A')))
    expect(resultado).toEqual({ ...dadosVazios(), empreendimento: 'A' })
  })
})

describe('validação da linha', () => {
  const hoje = '2026-11-20'
  const licenca = dados({
    empreendimento: 'A',
    tipo: 'LAO',
    numero: '1',
    orgao: 'IMA',
    emitido_em: '2023-01-10',
    emitido_em_texto: '10/01/2023',
    validade: '2027-01-10',
    validade_texto: '10/01/2027',
  })

  it('licença completa não tem erro nem aviso', () => {
    expect(validarLinha('licenca', licenca, hoje)).toEqual({ erros: [], avisos: [] })
  })

  it('obrigatório em branco, data ilegível, futura e validade antes da emissão', () => {
    const { erros } = validarLinha(
      'licenca',
      dados({
        empreendimento: 'A',
        emitido_em: '2026-11-21',
        emitido_em_texto: '21/11/2026',
        validade: '2026-11-01',
        validade_texto: '01/11/2026',
        orgao: 'IMA',
      }),
      hoje,
    )
    expect(erros).toEqual([
      { codigo: 'campo_obrigatorio', campo: 'tipo' },
      { codigo: 'campo_obrigatorio', campo: 'numero' },
      { codigo: 'data_futura', campo: 'emitido_em' },
      { codigo: 'validade_antes_da_emissao', campo: 'validade' },
    ])
    const ilegivel = validarLinha(
      'licenca',
      { ...licenca, validade: null, validade_texto: '04/04/27' },
      hoje,
    )
    expect(ilegivel.erros).toEqual([{ codigo: 'data_invalida', campo: 'validade' }])
  })

  it('licença vencida é aviso, nunca erro', () => {
    const vencida = { ...licenca, validade: '2026-11-19' as const, validade_texto: '19/11/2026' }
    expect(validarLinha('licenca', vencida, hoje)).toEqual({
      erros: [],
      avisos: [{ codigo: 'licenca_vencida', campo: 'validade' }],
    })
  })

  it('CNPJ incompleto, endereço sem unidade, texto longo e CPF apagado', () => {
    const { erros } = validarLinha(
      'empreendimento',
      dados({
        empreendimento: 'x'.repeat(301),
        cnpj: '1234',
        endereco: 'Rua A',
        descartados: ['cliente'],
      }),
      hoje,
    )
    expect(erros).toEqual([
      { codigo: 'valor_parece_cpf', campo: 'cliente' },
      { codigo: 'texto_longo', campo: 'empreendimento' },
      { codigo: 'cnpj_invalido', campo: 'cnpj' },
      { codigo: 'endereco_sem_unidade', campo: 'endereco' },
    ])
  })

  it('campo obrigatório apagado por parecer CPF não conta duas vezes', () => {
    const { erros } = validarLinha(
      'empreendimento',
      dados({ descartados: ['empreendimento'] }),
      hoje,
    )
    expect(erros).toEqual([{ codigo: 'valor_parece_cpf', campo: 'empreendimento' }])
  })
})

describe('duplicidade dentro da planilha', () => {
  it('chaves: CNPJ, ou nome e cliente normalizados; licença por tipo, número e órgão', () => {
    expect(chaveDoEmpreendimento(dados({ empreendimento: 'A', cnpj: '12345678000190' }))).toBe(
      'cnpj:12345678000190',
    )
    expect(
      chaveDoEmpreendimento(dados({ empreendimento: ' Metalúrgica  A ', cliente: 'Grupo' })),
    ).toBe('nome:metalurgica a|grupo')
    expect(chaveDaLicenca(dados({ tipo: 'LAO', numero: ' 4821/2023', orgao: 'Ima' }))).toBe(
      'lao|4821/2023|ima',
    )
  })

  it('a primeira ganha; as seguintes recebem o aviso de repetida', () => {
    const a = dados({ empreendimento: 'Metalúrgica', cliente: 'Grupo' })
    const b = dados({ empreendimento: 'metalurgica', cliente: 'grupo' })
    const semNome = dados({})
    const marcas = marcarRepetidas('empreendimento', [
      { numeroLinha: 2, dados: a },
      { numeroLinha: 3, dados: b },
      { numeroLinha: 4, dados: semNome },
      { numeroLinha: 5, dados: semNome },
    ])
    expect([...marcas]).toEqual([
      [3, { codigo: 'empreendimento_repetido_na_planilha', campo: 'empreendimento' }],
    ])
    const l = dados({ tipo: 'LAO', numero: '1', orgao: 'IMA' })
    expect([
      ...marcarRepetidas('licenca', [
        { numeroLinha: 2, dados: l },
        { numeroLinha: 9, dados: { ...l, empreendimento: 'Outro' } },
      ]),
    ]).toEqual([[9, { codigo: 'licenca_repetida_na_planilha', campo: 'numero' }]])
  })
})

describe('mensagens, CSV de erros e prazo de desfazer', () => {
  it('mensagem curta com o rótulo do campo quando cabe', () => {
    expect(mensagemDoProblema({ codigo: 'campo_obrigatorio', campo: 'orgao' }, 'licenca')).toBe(
      'Órgão: em branco',
    )
    expect(mensagemDoProblema({ codigo: 'empreendimento_ja_existe', campo: null }, 'licenca')).toBe(
      'Entra no empreendimento já cadastrado',
    )
    expect(
      mensagemDoProblema({ codigo: 'empreendimento_ja_existe', campo: null }, 'empreendimento'),
    ).toBe('Empreendimento já cadastrado: fica de fora')
    expect(mensagemDoProblema({ codigo: 'tipo_desconhecido', campo: 'tipo' }, 'licenca')).toBe(
      'Tipo de licença não cadastrado',
    )
    expect(
      mensagemDoProblema({ codigo: 'codigo_novo' as 'licenca_vencida', campo: null }, 'licenca'),
    ).toBe('Linha com problema')
  })

  it('CSV de erros com BOM, ";", texto original da data e fórmula neutralizada', () => {
    const csv = linhasComErroEmCsv('empreendimento', [
      {
        numeroLinha: 7,
        dados: dados({ empreendimento: '=SOMA(A1)', cliente: 'Grupo; Sul', cnpj: '1234' }),
        erros: [
          { codigo: 'cnpj_invalido', campo: 'cnpj' },
          { codigo: 'campo_obrigatorio', campo: 'unidade' },
        ],
      },
    ])
    expect(csv).toBe(
      '\uFEFFLinha;Empreendimento;Cliente;CNPJ;Unidade;Endereço da unidade;Erros\r\n' +
        '7;\'=SOMA(A1);"Grupo; Sul";1234;;;CNPJ incompleto | Unidade: em branco\r\n',
    )
    const comData = linhasComErroEmCsv('licenca', [
      {
        numeroLinha: 2,
        dados: dados({ validade: '2027-04-04', emitido_em_texto: '04/04/27' }),
        erros: [],
      },
    ])
    expect(comData).toContain(';04/04/27;04/04/2027;')
  })

  it('desfazer vale por 24 h a partir de efetivar, em qualquer fuso', () => {
    const efetivada = '2026-11-20T13:00:00Z'
    expect(podeDesfazer(efetivada, new Date('2026-11-21T12:59:59Z'))).toBe(true)
    expect(podeDesfazer(efetivada, new Date('2026-11-21T13:00:00Z'))).toBe(false)
    expect(podeDesfazer('não é data', new Date('2026-11-20T13:00:00Z'))).toBe(false)
  })
})
