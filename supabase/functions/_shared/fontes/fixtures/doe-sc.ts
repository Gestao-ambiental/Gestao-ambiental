// Respostas recortadas da API do DOE-SC (portal.doe.sea.sc.gov.br/apis), no formato visto em
// 20/11/2026: lista de edições (/jornal), busca de matérias (/busca-materia) e prévia da matéria
// (/edicao-preview). Os campos de pessoas vêm trocados por "Fulano de Tal" e os textos foram
// encurtados; as Portarias SEMAE 120/2026 e IMA 300/2026 e a Lei 20.101 são exemplos montados para o
// teste, sem nome de pessoa.

const MATERIA_ANTIGA = {
  id: 935710,
  nrJornal: '22097',
  cdJornal: 3338,
  publicacao: '2023-09-05T00:00:00.000Z',
  cdCategoria: 4704300,
  categoria: 'IMA – Instituto do Meio Ambiente',
  assunto: 'EDITAL',
  cancelada: false,
}

/** Edições de 17 e 18/11/2026 (a 22884-A é extra). O campo de quem aprovou nunca é lido. */
export const EDICOES_DO_DOE = {
  error: false,
  records: {
    meta: { total: 3, per_page: 50, current_page: 1, last_page: 1 },
    data: [
      {
        cdJornal: 4721,
        qtdMaterias: 11,
        cdUsuarioaprovacao: 181,
        dsUsuarioaprovacao: 'Fulano de Tal',
        dtPublicacao: '2026-11-18T00:00:00.000Z',
        vlNumero: '22884-A',
        stCancelado: false,
        tpJornal: '1',
        dsArquivo: '/2026/20261118/Jornal/22884-A.pdf',
      },
      {
        cdJornal: 4720,
        qtdMaterias: 468,
        cdUsuarioaprovacao: 181,
        dsUsuarioaprovacao: 'Fulano de Tal',
        dtPublicacao: '2026-11-18T00:00:00.000Z',
        vlNumero: '22884',
        stCancelado: false,
        tpJornal: '0',
        dsArquivo: '/2026/20261118/Jornal/22884.pdf',
      },
      {
        cdJornal: 4719,
        qtdMaterias: 401,
        cdUsuarioaprovacao: 181,
        dsUsuarioaprovacao: 'Fulano de Tal',
        dtPublicacao: '2026-11-17T00:00:00.000Z',
        vlNumero: '22883',
        stCancelado: false,
        tpJornal: '0',
        dsArquivo: '/2026/20261117/Jornal/22883.pdf',
      },
    ],
  },
}

function naBusca(
  id: number,
  cdJornal: number | null,
  nrJornal: string,
  cdCategoria: number,
  categoria: string,
  assunto: string,
) {
  return {
    id,
    nrJornal,
    cdJornal,
    publicacao: '2026-11-18T00:00:00.000Z',
    cdCategoria,
    categoria,
    assunto,
    cancelada: false,
    preview: `https://portal.doe.sea.sc.gov.br/repositorio/2026/20261118/Materias/${String(id)}/${String(id)}_final.html`,
    // O resumo da busca vem com bytes inválidos; o coletor não o usa.
    resumo: 'texto da busca com bytes inv�lidos',
  }
}

const SEMAE = 'Meio Ambiente e da Economia Verde'
const IMA = 'IMA – Instituto do Meio Ambiente'

export const NA_BUSCA = {
  portariaSemae: naBusca(1245001, 4720, '22884', 4704921, SEMAE, 'PORTARIA'),
  editalDoIma: naBusca(1244983, 4720, '22884', 4704300, IMA, 'EDITAL'),
  portariaDoIma: naBusca(1245100, 4720, '22884', 4704300, IMA, 'PORTARIA'),
  resolucaoCgsim: naBusca(
    1245200,
    4721,
    '22884-A',
    4704303,
    'JUCESC – Junta Comercial',
    'RESOLUÇÃO',
  ),
  // Sem cdJornal: a edição do dia é reconhecida pelo número.
  lei: naBusca(1245300, null, '22884', 4704258, 'Atos do Poder Executivo', 'LEIS'),
  antiga: MATERIA_ANTIGA,
}

/** Resposta da busca com as matérias dadas. */
export function respostaDaBusca(texto: string, materias: unknown[]) {
  return {
    total: materias.length,
    pagination: { from: 0, size: 50, total: materias.length },
    resposta: null,
    materias,
    busca: { texto, schema: null, filtros: [], embedding: 'openai' },
    custos: { total_tokens: 0, custo_estimado: 0 },
  }
}

function previa(
  cdMateria: number,
  cdJornal: number,
  vlNumero: string,
  dsCategoria: string,
  dsAssunto: string,
  dsTexto: string,
) {
  return {
    error: false,
    item: {
      dsTitulo: dsTexto.slice(0, 200),
      dsExtensaooriginal: '.DOCX',
      dsTexto,
      cdMateria,
      dtPublicacao: '2026-11-18T00:00:00.000Z',
      dtPublicacaoJornal: '2026-11-18T00:00:00.000Z',
      vlNumero,
      cdJornal,
      tpJornal: 0,
      dsCategoria,
      dsAssunto,
      dsArquivo: `/2026/20261118/Jornal/${vlNumero}.pdf`,
      dsTextoHtml: '<div>não usado</div>',
      dsUrl: `https://portal.doe.sea.sc.gov.br/#/portal/edicao/${String(cdJornal)}/materia/${String(cdMateria)}`,
    },
  }
}

export const PREVIAS: Record<string, unknown> = {
  '1245001': previa(
    1245001,
    4720,
    '22884',
    `Secretarias de Estado.${SEMAE}`,
    'PORTARIA',
    [
      'PORTARIA Nº 120, DE 17 DE NOVEMBRO DE 2026',
      'Revoga a Portaria nº 92, de 2 de março de 2026, e estabelece os procedimentos para análise dos pedidos de compensação de Reserva Legal.',
      'O SECRETÁRIO DE ESTADO DO MEIO AMBIENTE E DA ECONOMIA VERDE, no uso de suas atribuições,',
      'RESOLVE:',
      'Art. 1º Os pedidos de compensação de Reserva Legal seguem o rito do licenciamento ambiental.',
      'Art. 2º O parecer é assinado pelo responsável técnico inscrito no CPF 123.456.789-09.',
      'Art. 3º Fica revogada a Portaria nº 92, de 2 de março de 2026.',
      'Art. 4º Esta Portaria entra em vigor na data de sua publicação.',
      'Secretário de Estado',
    ].join('\n'),
  ),
  // Edital real (DOE 22884), só com o nome do administrado trocado.
  '1244983': previa(
    1244983,
    4720,
    '22884',
    `Autarquias Estaduais.${IMA}`,
    'EDITAL',
    [
      'EDITAL DE INTIMAÇÃO',
      'O   INSTITUTO DO MEIO AMBIENTE DE SANTA CATARINA (IMA) , no uso de suas atribuições legais, por meio do presente Edital,  INTIMA E NOTIFICA  o administrado abaixo relacionado, acerca da decisão proferida pela Terceira Câmara Recursal do Conselho Estadual do Meio Ambiente (CONSEMA).',
      'Administrado | CPF/CNPJ | Auto de Infração (AIA) | Processo (SGP-e)',
      'Fulano de Tal | 004.XXX.XXX-61 | AIA nº 11424-D | IMA nº 0001534/2019',
      'Florianópolis/SC, data da assinatura eletrônica.',
    ].join('\n'),
  ),
  '1245100': previa(
    1245100,
    4720,
    '22884',
    `Autarquias Estaduais.${IMA}`,
    'PORTARIA',
    [
      'PORTARIA Nº 300/2026 - IMA',
      'Revoga a Instrução Normativa nº 84, que dispõe sobre a compensação de reserva legal.',
      'O PRESIDENTE DO INSTITUTO DO MEIO AMBIENTE DO ESTADO DE SANTA CATARINA (IMA), no uso de suas atribuições legais,',
      'RESOLVE:',
      'Art. 1º Fica revogada a Instrução Normativa nº 84, que dispõe sobre o licenciamento da compensação de reserva legal.',
      'Art. 2º Esta Portaria entra em vigor na data de sua publicação.',
    ].join('\n'),
  ),
  // Resolução CGSIM-SC 3/2026 (DOE 22867), encurtada.
  '1245200': previa(
    1245200,
    4721,
    '22884-A',
    'Autarquias Estaduais.JUCESC – Junta Comercial',
    'RESOLUÇÃO',
    [
      'RESOLUÇÃO CGSIM-SC Nº 3, DE 14 DE SETEMBRO DE 2026',
      '',
      'Estabelece critérios e disciplina a classificação das atividades econômicas de nível de risco I (baixo risco) no âmbito da REDESIM-SC.',
      'O COMITÊ PARA INTEGRAÇÃO DAS ADMINISTRAÇÕES TRIBUTÁRIAS E GESTÃO DA REDE ESTADUAL PARA A SIMPLIFICAÇÃO DO REGISTRO E DA LEGALIZAÇÃO DE EMPRESAS E NEGÓCIOS DE SANTA CATARINA (CGSIM-SC) , no exercício das competências previstas nos arts. 6º, § 1º, e 11, § 2º, da Lei nº 19.481, de 7 de outubro de 2025,',
      'RESOLVE:',
      'Art. 1º Ficam classificadas como de nível de risco I as atividades do Anexo Único.',
      'Art. 2º Esta Resolução entra em vigor na data de sua publicação.',
    ].join('\n'),
  ),
  '1245300': previa(
    1245300,
    4720,
    '22884',
    'Atos do Poder Executivo',
    'LEIS',
    [
      'LEI Nº 20.101, DE 13 DE NOVEMBRO DE 2026',
      'Altera a Lei nº 14.675, de 2009, que institui o Código Estadual do Meio Ambiente.',
      'O GOVERNADOR DO ESTADO DE SANTA CATARINA,',
      'Art. 1º O licenciamento ambiental passa a observar o seguinte.',
      'Art. 2º Esta Lei entra em vigor na data de sua publicação.',
    ].join('\n'),
  ),
}
