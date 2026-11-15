// Catálogo de modelos de serviço: sugestões de escopo, não tabela oficial nem preço (ORC-01).
// Gerado a partir do catálogo da prévia de orçamentos, consultado na carta de serviços da Prefeitura
// de Joinville (SAMA) em 10 e 11/11/2026. As referências a propostas de clientes foram retiradas.
// Os modelos sem fonte são de órgão e município a confirmar. Fixo no sistema (decisão do Eduardo,
// 11/11/2026): ao aplicar num orçamento, as etapas e despesas viram itens editáveis.

export interface EtapaDoModelo {
  nome: string
  /** Vem marcada ao abrir o modelo. */
  marcada: boolean
  /** Só se aplica em alguns casos: começa desmarcada. */
  condicional: boolean
  /** Horas sugeridas pela prévia; nulo quando não há sugestão. */
  horasSugeridas: number | null
}

export interface DespesaDoModelo {
  nome: string
  marcada: boolean
  condicional: boolean
}

export interface ModeloDeServico {
  id: string
  nome: string
  categoria: string
  jurisdicao: string
  /** Data em que a fonte foi consultada (aaaa-mm-dd). */
  consultadoEm: string | null
  /** Página da carta de serviços; nulo quando o órgão está a confirmar. */
  fonte: string | null
  nota: string
  etapas: EtapaDoModelo[]
  despesas: DespesaDoModelo[]
}

/** Etapa com horas sugeridas pela prévia: [nome, horas]. */
type EtapaCompacta = string | readonly [nome: string, horas: number]

/**
 * Forma enxuta de guardar o modelo. Itens fixos vêm marcados; os condicionais, desmarcados e
 * depois dos fixos. A nota é a NOTA_PADRAO, seguida de notaExtra quando houver.
 */
interface ModeloCompacto {
  id: string
  nome: string
  categoria: string
  jurisdicao: string
  consultadoEm: string | null
  fonte: string | null
  notaExtra?: string
  etapas: readonly EtapaCompacta[]
  etapasCondicionais?: readonly EtapaCompacta[]
  despesas?: readonly string[]
  despesasCondicionais?: readonly string[]
}

const NOTA_PADRAO =
  'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.'

/** Devolve o modelo no formato lido pelo DialogoModelo. */
function paraModeloDeServico(m: ModeloCompacto): ModeloDeServico {
  const etapa =
    (condicional: boolean) =>
    (e: EtapaCompacta): EtapaDoModelo => {
      const [nome, horasSugeridas] = typeof e === 'string' ? [e, null] : e
      return { nome, marcada: !condicional, condicional, horasSugeridas }
    }
  const despesa =
    (condicional: boolean) =>
    (nome: string): DespesaDoModelo => ({ nome, marcada: !condicional, condicional })
  return {
    id: m.id,
    nome: m.nome,
    categoria: m.categoria,
    jurisdicao: m.jurisdicao,
    consultadoEm: m.consultadoEm,
    fonte: m.fonte,
    nota: m.notaExtra ? `${NOTA_PADRAO} ${m.notaExtra}` : NOTA_PADRAO,
    etapas: [...m.etapas.map(etapa(false)), ...(m.etapasCondicionais ?? []).map(etapa(true))],
    despesas: [
      ...(m.despesas ?? []).map(despesa(false)),
      ...(m.despesasCondicionais ?? []).map(despesa(true)),
    ],
  }
}

const CATALOGO: readonly ModeloCompacto[] = [
  {
    id: 'aua',
    nome: 'AUA — autorização ambiental inicial',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    notaExtra:
      'Para AuA industrial, conferir integralmente o art. 55 da IN SAMA 009/2026: a RT dos controles durante a vigência não é substituída pela ART dos documentos; operação de ETE e documentos do cliente precisam de avaliação específica.',
    etapas: [
      'Análise de enquadramento e documentos',
      'Vistoria e registro fotográfico',
      'Planta baixa ambiental — elaborar ou atualizar conforme base disponível',
      'Relatório Técnico Ambiental (RTA) — confirmar enquadramento',
      'Responsabilidade técnica dos documentos contratados',
      'Organização e protocolo do pedido',
    ],
    etapasCondicionais: [
      'Projetos e planos específicos dos controles ambientais',
      'Resposta a exigências — definir limite de horas',
      'RT continuada dos controles ambientais — escopo separado',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
      'Coletas e análises laboratoriais',
      'Levantamento topográfico por terceiro',
    ],
  },
  {
    id: 'aua-renovacao',
    nome: 'AUA — renovação',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    etapas: [
      'Análise da autorização anterior e condicionantes',
      'Vistoria e avaliação dos controles',
      'Atualização de relatório e evidências',
      'Responsabilidade técnica dos documentos',
      'Dossiê e protocolo da renovação',
    ],
    etapasCondicionais: [
      'Atualização da planta se houve alteração',
      'Gestão continuada de condicionantes — contrato próprio',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'lap',
    nome: 'LAP — licença prévia',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    etapas: [
      'Enquadramento e análise locacional',
      'Vistoria e diagnóstico ambiental',
      'Definição do estudo ambiental aplicável',
      'Anteprojeto / planta locacional',
      'Organização e protocolo',
      'Responsabilidade técnica dos documentos',
    ],
    etapasCondicionais: [
      'Novo levantamento e planta completa',
      'Controle acústico / laudo de ruído quando aplicável',
      'Projetos de tratamento de efluentes quando aplicáveis',
      'Acompanhamento e complementação — limites a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
      'Levantamento topográfico por terceiro',
    ],
  },
  {
    id: 'lai',
    nome: 'LAI — licença de instalação',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    etapas: [
      'Análise da LAP e dos projetos disponíveis',
      'Planta ambiental e verificação das áreas',
      'Planos e programas da instalação — definir quais',
      'Organização e protocolo',
      'Responsabilidade técnica dos documentos',
    ],
    etapasCondicionais: [
      'Novo levantamento e planta completa',
      'Controle acústico / laudo de ruído quando aplicável',
      'Projetos de tratamento de efluentes quando aplicáveis',
      'Acompanhamento e complementação — limites a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
      'Levantamento topográfico por terceiro',
    ],
  },
  {
    id: 'lao',
    nome: 'LAO — licença de operação',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    etapas: [
      'Vistoria dos controles e instalações',
      'Consolidação dos relatórios e registros técnicos',
      'Verificação de projetos e plantas',
      'Organização e protocolo',
      'Responsabilidade técnica dos documentos',
    ],
    etapasCondicionais: [
      'Novo levantamento e planta completa',
      'Controle acústico / laudo de ruído quando aplicável',
      'Projetos de tratamento de efluentes quando aplicáveis',
      'Acompanhamento e complementação — limites a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
      'Levantamento topográfico por terceiro',
    ],
  },
  {
    id: 'lao-corretiva',
    nome: 'LAO corretiva — regularização',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    etapas: [
      'Diagnóstico de enquadramento e histórico',
      'Vistoria e levantamento ambiental',
      'Estudo ambiental conforme modalidade e termo aplicável',
      'Planta ambiental sobre base disponível',
      'Inventário de resíduos e PGRS, se contratados',
      'Dossiê e protocolo',
      'Responsabilidade técnica dos documentos',
    ],
    etapasCondicionais: [
      'Novo levantamento e planta completa',
      'Controle acústico / laudo de ruído quando aplicável',
      'Projetos de tratamento de efluentes quando aplicáveis',
      'Acompanhamento e complementação — limites a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
      'Levantamento topográfico por terceiro',
    ],
  },
  {
    id: 'renovacao-lao',
    nome: 'LAO — renovação',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    etapas: [
      'Análise da licença e histórico de condicionantes',
      'Vistoria e registro fotográfico',
      'Relatório Técnico de Condicionantes (RTC)',
      'Conferência da planta e documentação disponível',
      'Dossiê, requerimento e protocolo',
      'Responsabilidade técnica dos documentos',
    ],
    etapasCondicionais: [
      'Novo levantamento e planta completa',
      'Controle acústico / laudo de ruído quando aplicável',
      'Projetos de tratamento de efluentes quando aplicáveis',
      'Acompanhamento e complementação — limites a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
      'Levantamento topográfico por terceiro',
    ],
  },
  {
    id: 'condominio',
    nome: 'Condomínios e hotelaria',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-condominios-e-atividade-de-hotelaria/',
    etapas: [
      'Definição da fase e modalidade do licenciamento',
      'Vistoria e levantamento das unidades',
      'Estudo e planta conforme enquadramento',
      'Dossiê e protocolo',
    ],
    etapasCondicionais: [
      'Estudos especializados e projetos executivos',
      'Resposta a exigências — limite a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Levantamento topográfico por terceiro',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'combustiveis',
    nome: 'Comércio de combustíveis e tancagem',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-comercio-de-combustiveis-liquidos-e-gasosos-e-instalacoes-de-tancagem-autonoma-para-consumo-proprio-de-combustiveis-liquidos-e-gasosos/',
    etapas: [
      'Enquadramento e análise dos sistemas de armazenamento',
      'Vistoria e planta ambiental',
      'Estudos específicos conforme fase e instalação',
      'Dossiê e protocolo',
    ],
    etapasCondicionais: [
      'Estudos especializados e projetos executivos',
      'Resposta a exigências — limite a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Levantamento topográfico por terceiro',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'loteamento',
    nome: 'Loteamento e condomínio de lotes',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenciamento-ambiental-de-loteamento-e-condominios-de-lotes/',
    etapas: [
      'Análise territorial e enquadramento',
      'Vistoria e diagnóstico das restrições',
      'Estudos e plantas do empreendimento — escopo a definir',
      'Dossiê e protocolo',
    ],
    etapasCondicionais: [
      'Estudos especializados e projetos executivos',
      'Resposta a exigências — limite a definir',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Coletas e análises laboratoriais',
      'Levantamento topográfico por terceiro',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'cca',
    nome: 'CCA — certidão de conformidade ambiental',
    categoria: 'Certidões e declarações',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-certidao-de-conformidade-ambiental-cca/',
    etapas: [
      'Análise de atividade e porte',
      'Vistoria técnica para declaração, conforme escopo',
      'Declaração de conformidade ambiental por profissional habilitado',
      'Conferência documental e protocolo',
    ],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'danc',
    nome: 'DANC — declaração de atividade não constante',
    categoria: 'Certidões e declarações',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-atividade-nao-constante-danc/',
    notaExtra:
      'Sugestão comercial inicial: 1h por etapa básica (3h no total), ajustável após conferir o caso. Não é prazo legal nem média medida.',
    etapas: [
      ['Verificação da atividade e enquadramento', 1],
      ['Conferência dos documentos do empreendimento', 1],
      ['Preenchimento do requerimento e protocolo', 1],
    ],
    etapasCondicionais: [
      'Vistoria ou estudo complementar, se necessário',
      'Acompanhamento do pedido — limite a definir',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Certidão de matrícula / emolumentos cartoriais',
      'Viabilidade técnica da concessionária — somente se aplicável',
    ],
  },
  {
    id: 'dca-empreendimento',
    nome: 'DCA — controle acústico de empreendimento',
    categoria: 'Acústica',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-controle-acustico-para-empreendimentos/',
    etapas: [
      'Análise do local/atividade e documentos',
      'Preparação do requerimento e declarações',
      'Organização e protocolo',
    ],
    etapasCondicionais: [
      'Planejamento da campanha e definição de pontos/períodos',
      'Medição de ruído e laudo técnico',
      'Vistoria específica e responsabilidade técnica do laudo',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Locação de sonômetro e acessórios calibrados',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'dca-evento',
    nome: 'DCA — controle acústico de evento temporário',
    categoria: 'Acústica',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-controle-acustico-para-eventos-temporarios/',
    etapas: [
      'Análise do local/atividade e documentos',
      'Preparação do requerimento e declarações',
      'Organização e protocolo',
    ],
    etapasCondicionais: [
      'Planejamento da campanha e definição de pontos/períodos',
      'Medição de ruído e laudo técnico',
      'Vistoria específica e responsabilidade técnica do laudo',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Locação de sonômetro e acessórios calibrados',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'dca-veicular',
    nome: 'DCA — controle acústico de propaganda veicular',
    categoria: 'Acústica',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-controle-acustico-para-propaganda-veicular/',
    etapas: [
      'Análise do local/atividade e documentos',
      'Preparação do requerimento e declarações',
      'Organização e protocolo',
    ],
    etapasCondicionais: [
      'Planejamento da campanha e definição de pontos/períodos',
      'Medição de ruído e laudo técnico',
      'Vistoria específica e responsabilidade técnica do laudo',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Locação de sonômetro e acessórios calibrados',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'ruido',
    nome: 'Laudo / monitoramento de ruído ambiental',
    categoria: 'Acústica',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-controle-acustico-para-empreendimentos/',
    etapas: [
      'Plano da campanha: pontos, períodos e condições',
      'Campanha de medição — quantidade a definir',
      'Tratamento dos dados e laudo técnico',
      'Responsabilidade técnica do laudo',
    ],
    etapasCondicionais: ['Protocolo de DCA — pedido separado quando contratado'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: [
      'Locação e calibração de equipamento',
      'Deslocamento e despesas de campo',
      'Preço público municipal — conforme guia vigente',
    ],
  },
  {
    id: 'efluentes-pedido',
    nome: 'Aprovação de projeto de tratamento de efluentes — pedido',
    categoria: 'Água e saneamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-aprovacao-de-projeto-de-sistema-de-tratamento-de-efluentes/',
    etapas: [
      'Conferência de projeto e documentos assinados pelo autor',
      'Montagem do requerimento e protocolo',
      'Acompanhamento documental — limite a definir',
    ],
    etapasCondicionais: ['Revisões técnicas do projeto, se contratadas'],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Certidão de matrícula / emolumentos cartoriais',
      'Ensaios de solo e infiltração',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
  },
  {
    id: 'efluentes-projeto',
    nome: 'Projeto de tratamento de efluentes — elaboração',
    categoria: 'Água e saneamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-aprovacao-de-projeto-de-sistema-de-tratamento-de-efluentes/',
    etapas: [
      'Vistoria e levantamento de dados de dimensionamento',
      'Dimensionamento e memorial descritivo e de cálculo',
      'Plantas e cortes do sistema',
      'Responsabilidade técnica do projeto',
      'Preparação do pedido de aprovação',
    ],
    etapasCondicionais: ['Suporte à execução e RT de operação — contratação própria'],
    despesas: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Preço público municipal — conforme guia vigente',
    ],
    despesasCondicionais: [
      'Ensaios de solo e infiltração',
      'Levantamento topográfico por terceiro',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'auc',
    nome: 'AuC — corte de vegetação',
    categoria: 'Vegetação e recuperação',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-autorizacao-para-corte-de-vegetacao-auc/',
    etapas: [
      'Enquadramento e vistoria da área',
      'Inventário / levantamento florestal — dimensionar',
      'Planta e caracterização da vegetação',
      'Projeto de compensação / reposição quando aplicável',
      'Dossiê e protocolo',
    ],
    etapasCondicionais: [
      'Laudo de risco ou estudo especializado — quando aplicável',
      'Monitoramento / execução — contratação separada',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Certidão de matrícula / emolumentos cartoriais',
      'Levantamento topográfico por terceiro',
      'Mudas, plantio e compensação — conforme ato',
      'Execução do corte/poda e destinação — não incluída',
    ],
  },
  {
    id: 'cai',
    nome: 'Corte de árvores isoladas',
    categoria: 'Vegetação e recuperação',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-autorizacao-para-corte-de-arvores-isoladas-em-propriedades-privadas/',
    etapas: [
      'Vistoria e identificação das espécies',
      'Levantamento, croqui e registro fotográfico',
      'Justificativa técnica e compensação quando aplicável',
      'Montagem e protocolo do pedido',
    ],
    etapasCondicionais: [
      'Laudo de risco ou estudo especializado — quando aplicável',
      'Monitoramento / execução — contratação separada',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Certidão de matrícula / emolumentos cartoriais',
      'Levantamento topográfico por terceiro',
      'Mudas, plantio e compensação — conforme ato',
      'Execução do corte/poda e destinação — não incluída',
    ],
  },
  {
    id: 'poda',
    nome: 'Poda de árvores isoladas',
    categoria: 'Vegetação e recuperação',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-autorizacao-para-poda-de-arvores-isoladas/',
    etapas: [
      'Vistoria e identificação das árvores',
      'Descrição e justificativa da poda',
      'Documentação e protocolo',
    ],
    etapasCondicionais: [
      'Laudo de risco ou estudo especializado — quando aplicável',
      'Monitoramento / execução — contratação separada',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Certidão de matrícula / emolumentos cartoriais',
      'Levantamento topográfico por terceiro',
      'Mudas, plantio e compensação — conforme ato',
      'Execução do corte/poda e destinação — não incluída',
    ],
  },
  {
    id: 'prad',
    nome: 'PRAD — recuperação de área degradada',
    categoria: 'Vegetação e recuperação',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-aprovacao-de-projeto-de-recuperacao-de-area-degradada-prad/',
    etapas: [
      'Diagnóstico da área degradada',
      'Plano de recuperação e cronograma',
      'Plantas e memorial técnico',
      'Responsabilidade técnica e protocolo',
    ],
    etapasCondicionais: [
      'Laudo de risco ou estudo especializado — quando aplicável',
      'Monitoramento / execução — contratação separada',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Certidão de matrícula / emolumentos cartoriais',
      'Levantamento topográfico por terceiro',
      'Mudas, plantio e compensação — conforme ato',
      'Execução do corte/poda e destinação — não incluída',
    ],
  },
  {
    id: 'averbacao',
    nome: 'Averbação de manutenção florestal / compensação',
    categoria: 'Vegetação e recuperação',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-averbacao-de-area-de-manutencao-florestal-e-ou-compensacao-ambiental/',
    etapas: [
      'Análise do ato ambiental e da matrícula',
      'Conferência da delimitação e memorial da área',
      'Organização do requerimento e suporte à averbação',
    ],
    etapasCondicionais: [
      'Laudo de risco ou estudo especializado — quando aplicável',
      'Monitoramento / execução — contratação separada',
    ],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Certidão de matrícula / emolumentos cartoriais',
      'Levantamento topográfico por terceiro',
      'Mudas, plantio e compensação — conforme ato',
      'Execução do corte/poda e destinação — não incluída',
    ],
  },
  {
    id: 'terraplanagem',
    nome: 'Terraplanagem — licenciamento',
    categoria: 'Território',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte: 'https://www.joinville.sc.gov.br/servicos/requerer-licencas-para-terraplanagem/',
    etapas: [
      'Análise do terreno e enquadramento',
      'Vistoria e levantamento de informações',
      'Projeto, planta e memorial — definir fase e autoria',
      'Plano de medidas e documentos técnicos',
      'Dossiê e protocolo',
    ],
    etapasCondicionais: ['Acompanhamento técnico da execução'],
    despesas: [
      'Preço público municipal — conforme guia vigente',
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
    ],
    despesasCondicionais: [
      'Levantamento topográfico por terceiro',
      'Estudos geotécnicos',
      'Deslocamento e despesas de campo',
      'Certidão de matrícula / emolumentos cartoriais',
    ],
  },
  {
    id: 'hidrografia',
    nome: 'Revisão da base de dados hidrográfica',
    categoria: 'Território',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-revisao-da-base-de-dados-do-levantamento-hidrografico/',
    etapas: [
      'Análise preliminar da base SIMGeo e do imóvel',
      'Reconhecimento e levantamento especializado de campo',
      'Planta georreferenciada e relatório técnico',
      'Consolidação de arquivos geoespaciais',
      'Pedido de revisão somente se houver fundamento técnico',
    ],
    etapasCondicionais: ['Acompanhamento e complementação documental — limite a definir'],
    despesasCondicionais: [
      'Profissional especializado e vínculo técnico',
      'Levantamento topográfico por terceiro',
      'Certidão de matrícula / emolumentos cartoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'dsa',
    nome: 'Diagnóstico socioambiental por microbacia',
    categoria: 'Território',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-apresentacao-de-diagnostico-socioambiental-por-microbacia-hidrografica/',
    etapas: [
      'Definição da microbacia e escopo',
      'Levantamento técnico e cartográfico',
      'Diagnóstico socioambiental e documentação',
      'Consolidação e protocolo',
    ],
    etapasCondicionais: ['Estudos de equipe multidisciplinar'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: [
      'Levantamento topográfico por terceiro',
      'Coletas e análises laboratoriais',
      'Deslocamento e despesas de campo',
    ],
  },
  {
    id: 'consulta',
    nome: 'Consulta de licenças e situação processual',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte: 'https://www.joinville.sc.gov.br/servicos/consultar-licencas-ambientais/',
    etapas: [
      'Pesquisa de licença/processo',
      'Conferência de correspondência com empresa e imóvel',
      'Resumo da consulta, sem auditoria integral',
    ],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'acesso',
    nome: 'Pedido de acesso a processo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-acesso-a-processos-de-licenciamento-ambiental/',
    etapas: ['Identificação e pedido de acesso', 'Organização inicial do material recebido'],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'procurador',
    nome: 'Inclusão de procurador em processo',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-inclusao-de-procurador-em-processos-de-licenciamento-ambiental/',
    etapas: ['Conferência da procuração e identificação', 'Requerimento de vinculação ao processo'],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'cnda',
    nome: 'Certidão negativa de débitos ambientais',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-certidao-negativa-de-debitos-ambientais-cnda/',
    etapas: ['Conferência dos dados e autorização', 'Requerimento e obtenção da certidão'],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'defesa',
    nome: 'Defesa técnica de infração ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/apresentar-defesa-de-infracoes-expedidas-pela-sama-auto-de-infracao-ambiental-auto-de-multa-e-auto-de-infracao/',
    etapas: [
      'Leitura do auto e verificação dos prazos do caso',
      'Análise de documentos e evidências técnicas',
      'Parecer / subsídios técnicos e preparação da manifestação',
    ],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'recurso',
    nome: 'Recurso administrativo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/interpor-recurso-a-processo-administrativo-ambiental-de-obras-ou-de-posturas-que-tramita-na-sama/',
    etapas: [
      'Leitura da decisão e verificação dos prazos do caso',
      'Análise técnica e fundamentação da manifestação',
      'Organização de documentos e apoio ao protocolo',
    ],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'vista-paa',
    nome: 'Vista de processo administrativo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-vista-de-processo-administrativo-ambiental-paa/',
    etapas: [
      'Identificação do processo e pedido de vista',
      'Organização do material disponibilizado',
    ],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'consulta-paa',
    nome: 'Consulta de processo administrativo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/consultar-processos-administrativos-ambientais-paas/',
    etapas: ['Consulta processual autorizada', 'Resumo do andamento consultado'],
    etapasCondicionais: ['Vistoria ou laudo especializado, quando necessário'],
    despesasCondicionais: ['Cópias, certidões e deslocamento, se necessários'],
  },
  {
    id: 'pgrss',
    nome: 'PGRSS — resíduos de serviços de saúde',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Vistoria da geração e manejo dos resíduos',
      'Elaboração do PGRSS',
      'Relatório de adequações e orientação de implantação',
      'Responsabilidade técnica do plano',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'pgrs',
    nome: 'PGRS — resíduos sólidos',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Vistoria e inventário dos resíduos',
      'Elaboração / atualização do PGRS',
      'Orientação sobre registros e destinação',
      'Responsabilidade técnica',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'pgrcc',
    nome: 'PGRCC — resíduos da construção civil',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Levantamento da obra e estimativa de resíduos',
      'Plano de gerenciamento e medidas',
      'Responsabilidade técnica do plano',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'lac-transporte',
    nome: 'LAC — transporte de produtos perigosos em SC',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Análise da operação e enquadramento junto ao órgão competente',
      'Conferência de veículos, produtos e rotas',
      'RCE e declarações aplicáveis',
      'Plano de Ação Emergencial (PAE)',
      'Responsabilidade técnica e apoio ao protocolo',
    ],
    despesas: [
      'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
      'Taxa do órgão estadual — conforme guia',
    ],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'pae',
    nome: 'PAE — plano de ação emergencial',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Levantamento da operação e cenários',
      'Elaboração do PAE',
      'Revisão e entrega com responsabilidade técnica',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'condicionantes',
    nome: 'Gestão de condicionantes / RT continuada',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Leitura da licença e planejamento das entregas',
      'Gestão de prazos e evidências do período contratado',
      'Visitas conforme frequência contratada',
      'Relatório periódico conforme instrumento',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'complementacao',
    nome: 'Complementação técnica / informação técnica do órgão',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Diagnóstico do ofício e matriz de atendimento',
      'Atualização de caracterização, layout e plantas conforme exigências',
      'Revisão de programas e controles contratados',
      'Dossiê de resposta e responsabilidade técnica',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'nutrientes',
    nome: 'Interpretação de nutrientes e sedimentos',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Conferência de dados laboratoriais',
      'Estimativa de estoques de fósforo e nitrogênio',
      'Avaliação de mobilização e carga interna potencial',
      'Nota técnica e planilhas',
    ],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'diagnostico',
    nome: 'Diagnóstico técnico-documental e geoespacial',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Análise de documentos e restrições',
      'Consulta a bases oficiais',
      'Diagnóstico e relatório de pendências',
    ],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'vistoria',
    nome: 'Vistoria técnica preliminar',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Vistoria e reconhecimento do empreendimento',
      'Orientação técnica inicial e encaminhamentos',
    ],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'ctf',
    nome: 'Assessoria cadastral CTF/IBAMA',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Enquadramento cadastral e conferência de dados',
      'Apoio ao cadastro / regularização autorizada',
      'Orientações e comprovantes',
    ],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'rap',
    nome: 'RAP — relatório ambiental prévio',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Definição do termo aplicável',
      'Levantamento e vistoria técnica',
      'Elaboração do RAP',
      'Responsabilidade técnica e entrega',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'eas',
    nome: 'EAS — estudo ambiental simplificado',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Definição do termo aplicável e equipe',
      'Levantamentos e diagnóstico',
      'Elaboração do EAS',
      'Responsabilidade técnica e entrega',
    ],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Coletas e análises laboratoriais', 'Deslocamento e despesas de campo'],
  },
  {
    id: 'sanitario',
    nome: 'Licença sanitária — apoio ao requerimento',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Diagnóstico dos procedimentos e documentos do estabelecimento',
      'Organização do processo sanitário',
      'Apoio ao requerimento e acompanhamento — limite a definir',
    ],
    etapasCondicionais: ['Protocolo específico se contratado'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Deslocamento e despesas de campo', 'Coletas e análises laboratoriais'],
  },
  {
    id: 'planta',
    nome: 'Planta baixa / planta ambiental',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Levantamento da base existente e vistoria quando contratada',
      'Desenho da planta com áreas, unidades e controles',
      'Responsabilidade técnica do documento',
    ],
    etapasCondicionais: ['Protocolo específico se contratado'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Deslocamento e despesas de campo', 'Coletas e análises laboratoriais'],
  },
  {
    id: 'flora',
    nome: 'Inventário florestal / laudo de flora',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Planejamento e delimitação da área',
      'Levantamento de campo da vegetação',
      'Tratamento dos dados e laudo de flora',
      'Responsabilidade técnica',
    ],
    etapasCondicionais: ['Protocolo específico se contratado'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Deslocamento e despesas de campo', 'Coletas e análises laboratoriais'],
  },
  {
    id: 'eca',
    nome: 'ECA — estudo de conformidade ambiental',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Diagnóstico do empreendimento em operação',
      'Vistoria e levantamento dos controles',
      'Estudo de conformidade conforme termo aplicável',
      'Responsabilidade técnica e entrega',
    ],
    etapasCondicionais: ['Protocolo específico se contratado'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Deslocamento e despesas de campo', 'Coletas e análises laboratoriais'],
  },
  {
    id: 'pca',
    nome: 'PCA e programas ambientais específicos',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    etapas: [
      'Diagnóstico e definição dos programas contratados',
      'Plano de controle e medidas de gestão',
      'Cronograma e indicadores',
      'Responsabilidade técnica',
    ],
    etapasCondicionais: ['Protocolo específico se contratado'],
    despesas: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
    despesasCondicionais: ['Deslocamento e despesas de campo', 'Coletas e análises laboratoriais'],
  },
  {
    id: 'canil-gatil',
    nome: 'Autorização para canil/gatil comercial',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-autorizacao-para-canil-gatil-comercial/',
    etapas: [
      'Análise de enquadramento e documentos',
      'Vistoria e registro fotográfico',
      'Memorial descritivo das instalações e do manejo',
      'Responsabilidade técnica dos documentos contratados',
      'Organização e protocolo do pedido',
    ],
    etapasCondicionais: ['Resposta a exigências — definir limite de horas'],
    despesas: ['Preço público municipal — conforme guia vigente'],
    despesasCondicionais: ['Taxa de ART/RRT/TRT — conforme conselho e atribuições'],
  },
  {
    id: 'transporte-efluentes',
    nome: 'Cadastro de transportador de efluentes sanitários',
    categoria: 'Água e saneamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/registrar-empresa-de-transporte-de-efluentes-sanitarios/',
    etapas: [
      'Levantamento dos requisitos e documentos da empresa e da frota',
      'Organização da documentação e preenchimento do cadastro',
      'Protocolo e acompanhamento do pedido',
    ],
    etapasCondicionais: ['Resposta a exigências — definir limite de horas'],
    despesas: ['Preço público municipal — conforme guia vigente'],
  },
  {
    id: 'transporte-rcc',
    nome: 'Cadastro de transportador de resíduos da construção civil',
    categoria: 'Resíduos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/registrar-empresa-de-transporte-de-residuos-de-construcao-civil/',
    etapas: [
      'Levantamento dos requisitos e documentos da empresa e da frota',
      'Organização da documentação e preenchimento do cadastro',
      'Protocolo e acompanhamento do pedido',
    ],
    etapasCondicionais: ['Resposta a exigências — definir limite de horas'],
    despesas: ['Preço público municipal — conforme guia vigente'],
  },
  {
    id: 'mtr',
    nome: 'MTR — manifesto de transporte de resíduos',
    categoria: 'Resíduos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/emitir-manifesto-de-transporte-de-residuos-mtr/',
    etapas: [
      'Conferência do cadastro do gerador, do transportador e do destinador',
      'Emissão dos manifestos no sistema',
    ],
    etapasCondicionais: [
      'Conferência dos certificados de destinação final (CDF)',
      'Rotina mensal de emissão — definir volume',
    ],
    despesasCondicionais: ['Taxas do sistema, se houver'],
  },
]

export const MODELOS_DE_SERVICO: readonly ModeloDeServico[] = CATALOGO.map(paraModeloDeServico)
