import { describe, expect, it } from 'vitest'

import { avaliarAtoDoDiario } from './filtro-de-ato'

// Casos reais dos diários (DOE-SC e DOEM de Joinville), encurtados e sem nomes de pessoas ou
// empresas.

describe('avaliarAtoDoDiario: normas ambientais', () => {
  it('Resolução CGSIM-SC nº 3/2026 (DOE-SC, categoria JUCESC): classificação de risco', () => {
    expect(
      avaliarAtoDoDiario({
        titulo:
          'RESOLUÇÃO CGSIM-SC Nº 3, DE 14 DE SETEMBRO DE 2026 Estabelece critérios e disciplina a ' +
          'classificação das atividades econômicas de nível de risco I (baixo risco) no âmbito da ' +
          'REDESIM-SC.',
        texto:
          'RESOLUÇÃO CGSIM-SC Nº 3, DE 14 DE SETEMBRO DE 2026 O COMITÊ ... (CGSIM-SC), no exercício ' +
          'das competências previstas na Lei nº 19.481, de 7 de outubro de 2025, RESOLVE: Art. 1º ' +
          'Estabelecer critérios para a classificação das atividades econômicas de nível de risco I.',
        categoria: 'JUCESC – Junta Comercial',
        tipoDocumento: 'RESOLUÇÃO',
      }),
    ).toEqual({
      relevante: true,
      motivo: 'normativo_ambiental',
      identificador: { tipo: 'resolucao', numero: '3', ano: 2026 },
    })
  })

  it('Portaria IMA 096/2026 (DOE-SC, categoria IMA) que revoga a IN 84', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'PORTARIA Nº 096/2026',
        texto:
          'PORTARIA Nº 096/2026 O PRESIDENTE DO INSTITUTO DO MEIO AMBIENTE DE SANTA CATARINA, no uso ' +
          'de suas atribuições, RESOLVE: Art. 1º Revogar a Instrução Normativa nº 84, que trata da ' +
          'compensação de reserva legal.',
        categoria: 'IMA – Instituto do Meio Ambiente',
        tipoDocumento: 'PORTARIA',
      }),
    ).toEqual({
      relevante: true,
      motivo: 'normativo_ambiental',
      identificador: { tipo: 'portaria', numero: '96', ano: 2026 },
    })
  })

  it('IN SAMA 02/2026 (DOEM de Joinville, unidade SAMA, título com SEI)', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Instrução Normativa SEI Nº 02/2026 - SAMA.UAT',
        texto:
          'A Secretaria de Meio Ambiente - SAMA, no uso de suas atribuições, RESOLVE: Art. 1º Ficam ' +
          'estabelecidos os documentos exigidos para o licenciamento das atividades industriais.',
        entidade: 'SAMA.UAT',
        tipoDocumento: 'Instrução Normativa',
      }),
    ).toEqual({
      relevante: true,
      motivo: 'normativo_ambiental',
      identificador: { tipo: 'instrucao_normativa', numero: '2', ano: 2026 },
    })
  })

  it('sem órgão ambiental, o tema vem do texto (lei estadual sobre resíduos)', () => {
    const avaliacao = avaliarAtoDoDiario({
      titulo: 'LEI Nº 19.500, DE 10 DE NOVEMBRO DE 2026',
      texto: 'Dispõe sobre a destinação de resíduos sólidos da construção civil.',
      categoria: 'Atos do Poder Executivo',
    })
    expect(avaliacao.relevante).toBe(true)
    expect(avaliacao.identificador).toEqual({ tipo: 'lei', numero: '19500', ano: 2026 })
  })

  it('o identificador sai da abertura do texto quando o título não traz número', () => {
    const avaliacao = avaliarAtoDoDiario({
      titulo: 'Resolução',
      texto: 'RESOLUÇÃO CONSEMA Nº 314, DE 5 DE MARÇO DE 2026 Altera o Anexo VI da Resolução 250.',
      categoria: 'Meio Ambiente e da Economia Verde',
    })
    expect(avaliacao).toEqual({
      relevante: true,
      motivo: 'normativo_ambiental',
      identificador: { tipo: 'resolucao', numero: '314', ano: 2026, orgao: 'CONSEMA' },
    })
  })

  it('sigla de órgão reconhecido com UF continua como órgão (IMA-SC)', () => {
    expect(
      avaliarAtoDoDiario({ titulo: 'Portaria IMA-SC nº 12/2026', texto: 'Fauna silvestre.' })
        .identificador,
    ).toEqual({ tipo: 'portaria', numero: '12', ano: 2026, orgao: 'IMA' })
  })

  it('siglas fora da lista e "Conjunta" entre o tipo e o número saem da leitura', () => {
    const ler = (titulo: string) =>
      avaliarAtoDoDiario({ titulo, texto: 'Recursos hídricos.' }).identificador
    expect(ler('Portaria Conjunta SES/SAP nº 990/2017')).toEqual({
      tipo: 'portaria',
      numero: '990',
      ano: 2017,
    })
    expect(ler('Resolução COMDEMA nº 3/2026')).toEqual({
      tipo: 'resolucao',
      numero: '3',
      ano: 2026,
    })
  })

  it('palavra comum entre o tipo e um número não vira identificador', () => {
    expect(
      avaliarAtoDoDiario({ titulo: 'Resolução que aprova 3 projetos', texto: 'Resíduos.' }),
    ).toEqual({ relevante: false, motivo: 'sem_identificador', identificador: null })
  })
})

describe('avaliarAtoDoDiario: atos individuais', () => {
  it('AuA SEI 77/2026 da SAMA (DOEM de Joinville), mesmo citando lei e resolução CONSEMA', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Autorização Ambiental - AuA SEI Nº 77/2026 - SAMA.UAT',
        texto:
          'Licença válida por 48 meses. A Secretaria de Meio Ambiente - SAMA, criada pela Lei ' +
          'Ordinária Municipal nº 9219, de 12/07/2022, confere a presente Autorização. Razão Social: ' +
          'Empresa Exemplo Ltda. Código Enquadramento Resolução CONSEMA nº 251/2024: 12.80.00. ' +
          'Responsável Técnico: Fulano de Tal.',
        entidade: 'SAMA.UAT',
        tipoDocumento: 'Autorização Ambiental - AuA',
      }),
    ).toEqual({ relevante: false, motivo: 'ato_individual', identificador: null })
  })

  it.each([
    ['LAO Nº 123/2026', 'Empresa Exemplo Ltda.'],
    ['LICENÇA AMBIENTAL DE OPERAÇÃO Nº 45/2026', 'Concede à Empresa Exemplo Ltda.'],
    ['Licença Ambiental Prévia - LAP nº 9/2026', 'Loteamento.'],
    ['AUTORIZAÇÃO AMBIENTAL Nº 22/2026', 'Supressão de vegetação em lote urbano.'],
    ['EDITAL DE NOTIFICAÇÃO DE AUTO DE INFRAÇÃO AMBIENTAL', 'Fica notificado Fulano de Tal.'],
    ['EDITAL DE INTIMAÇÃO', 'O IMA faz saber a Fulano de Tal ...'],
    ['Auto de Infração Ambiental nº 17452-E', 'Fulano de Tal.'],
    ['Extrato da Licença Ambiental de Instalação nº 3/2026', 'Empresa Exemplo Ltda.'],
  ])('%s é ato individual', (titulo, texto) => {
    expect(
      avaliarAtoDoDiario({ titulo, texto, categoria: 'IMA – Instituto do Meio Ambiente' }).motivo,
    ).toBe('ato_individual')
  })

  it('o tipo do documento basta, mesmo com título genérico', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Documento 31646646',
        texto: 'Resolução CONSEMA nº 251/2024.',
        tipoDocumento: 'Licença Ambiental de Operação - LAO',
      }).motivo,
    ).toBe('ato_individual')
  })

  it('IN que só cita LAO no corpo continua norma', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Instrução Normativa Nº 5/2026',
        texto:
          'Art. 1º A Licença Ambiental de Operação (LAO) será renovada com 120 dias de antecedência.',
        entidade: 'SAMA.UAT',
      }).motivo,
    ).toBe('normativo_ambiental')
  })
})

describe('avaliarAtoDoDiario: pessoal e compras', () => {
  it('nomeação de servidor na Secretaria de Meio Ambiente', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Portaria SEI Nº 310/2026 - SAMA.UGC',
        texto:
          'O Prefeito, no uso de suas atribuições, RESOLVE: Nomear Fulano de Tal para o cargo de ...',
        entidade: 'SAMA.UGC',
        tipoDocumento: 'Portaria',
      }),
    ).toEqual({
      relevante: false,
      motivo: 'pessoal',
      identificador: { tipo: 'portaria', numero: '310', ano: 2026 },
    })
  })

  it('portaria do IMA que designa servidor (DOE-SC)', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'PORTARIA Nº 187/2023',
        texto:
          'PORTARIA Nº 187/2023 DESIGNAR, de acordo com o art. 38 da Lei nº 6.745/85, Fulano de Tal.',
        categoria: 'IMA – Instituto do Meio Ambiente',
      }).motivo,
    ).toBe('pessoal')
  })

  it.each([
    ['Atas de registro de preços', 'ATA DE REGISTRO DE PREÇOS Nº 10/2026'],
    ['Contratos', 'CONTRATO Nº 55/2026'],
    ['Licitações', 'PREGÃO ELETRÔNICO Nº 8/2026'],
    ['Extratos', 'EXTRATO DO TERMO ADITIVO Nº 2'],
    ['Portarias', 'Portaria nº 77/2026 - Concede férias'],
    ['Portarias', 'Portaria nº 78/2026 - Concede diárias'],
    ['Portarias', 'Portaria nº 79/2026 - Exonera servidor'],
    ['Portarias', 'Portaria nº 80/2026 - Concede gratificação'],
  ])('categoria %s, título %s', (categoria, titulo) => {
    expect(
      avaliarAtoDoDiario({ titulo, texto: 'Fundação Municipal do Meio Ambiente.', categoria })
        .motivo,
    ).toBe('pessoal')
  })

  it('contrato citado só no corpo, longe da abertura, não torna a norma ato de pessoal', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Resolução COMDEMA nº 3/2026',
        texto: `RESOLVE: Art. 1º Aprovar o regimento. ${'x '.repeat(400)} Art. 9º O contrato de ...`,
        entidade: 'COMDEMA',
      }).motivo,
    ).toBe('normativo_ambiental')
  })
})

describe('avaliarAtoDoDiario: fora do tema e sem identificador', () => {
  it('norma sem órgão nem tema ambiental', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'DECRETO Nº 413, DE 19 DE DEZEMBRO DE 2019',
        texto: 'Institui o Comitê Gestor SC Bem Mais Simples.',
        categoria: 'Atos do Poder Executivo',
      }),
    ).toEqual({
      relevante: false,
      motivo: 'fora_do_tema',
      identificador: { tipo: 'decreto', numero: '413', ano: 2019 },
    })
  })

  it('CGSIM sem classificação de risco é fora do tema', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'RESOLUÇÃO CGSIM-SC Nº 4/2026',
        texto: 'Aprova o regimento interno do CGSIM-SC.',
        categoria: 'JUCESC – Junta Comercial',
      }).motivo,
    ).toBe('fora_do_tema')
  })

  it('emissão de nota fiscal e outorga onerosa não são tema ambiental', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'Decreto nº 900/2026',
        texto: 'Regulamenta a emissão de nota fiscal e a outorga onerosa do direito de construir.',
        categoria: 'Fazenda',
      }).motivo,
    ).toBe('fora_do_tema')
  })

  it('APP e CONSEMA só valem em maiúsculas', () => {
    expect(
      avaliarAtoDoDiario({ titulo: 'Lei nº 1/2026', texto: 'Cria o app da prefeitura.' }).motivo,
    ).toBe('fora_do_tema')
    expect(
      avaliarAtoDoDiario({ titulo: 'Lei nº 2/2026', texto: 'Ocupação de APP urbana.' }).motivo,
    ).toBe('normativo_ambiental')
  })

  it('ato sem identificador de norma, mesmo de órgão ambiental', () => {
    expect(
      avaliarAtoDoDiario({
        titulo: 'RELATÓRIO DE ATIVIDADES',
        texto: 'O Presidente do IMA apresenta o relatório.',
        categoria: 'IMA – Instituto do Meio Ambiente',
      }),
    ).toEqual({ relevante: false, motivo: 'sem_identificador', identificador: null })
  })
})
