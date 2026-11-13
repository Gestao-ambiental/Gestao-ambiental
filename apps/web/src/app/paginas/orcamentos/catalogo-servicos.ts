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

export const MODELOS_DE_SERVICO: readonly ModeloDeServico[] = [
  {
    id: 'aua',
    nome: 'AUA — autorização ambiental inicial',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-licenca-ambiental-para-atividades-industriais-e-atividades-diversas/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento. Para AuA industrial, conferir integralmente o art. 55 da IN SAMA 009/2026: a RT dos controles durante a vigência não é substituída pela ART dos documentos; operação de ETE e documentos do cliente precisam de avaliação específica.',
    etapas: [
      {
        nome: 'Análise de enquadramento e documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e registro fotográfico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planta baixa ambiental — elaborar ou atualizar conforme base disponível',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Relatório Técnico Ambiental (RTA) — confirmar enquadramento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos contratados',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo do pedido',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Projetos e planos específicos dos controles ambientais',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — definir limite de horas',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'RT continuada dos controles ambientais — escopo separado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise da autorização anterior e condicionantes',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e avaliação dos controles',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Atualização de relatório e evidências',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo da renovação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Atualização da planta se houve alteração',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Gestão continuada de condicionantes — contrato próprio',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Enquadramento e análise locacional',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e diagnóstico ambiental',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Definição do estudo ambiental aplicável',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Anteprojeto / planta locacional',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Novo levantamento e planta completa',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Controle acústico / laudo de ruído quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Projetos de tratamento de efluentes quando aplicáveis',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento e complementação — limites a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise da LAP e dos projetos disponíveis',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planta ambiental e verificação das áreas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planos e programas da instalação — definir quais',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Novo levantamento e planta completa',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Controle acústico / laudo de ruído quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Projetos de tratamento de efluentes quando aplicáveis',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento e complementação — limites a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria dos controles e instalações',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Consolidação dos relatórios e registros técnicos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Verificação de projetos e plantas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Novo levantamento e planta completa',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Controle acústico / laudo de ruído quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Projetos de tratamento de efluentes quando aplicáveis',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento e complementação — limites a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Diagnóstico de enquadramento e histórico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e levantamento ambiental',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudo ambiental conforme modalidade e termo aplicável',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planta ambiental sobre base disponível',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Inventário de resíduos e PGRS, se contratados',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Novo levantamento e planta completa',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Controle acústico / laudo de ruído quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Projetos de tratamento de efluentes quando aplicáveis',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento e complementação — limites a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise da licença e histórico de condicionantes',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e registro fotográfico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Relatório Técnico de Condicionantes (RTC)',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Conferência da planta e documentação disponível',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê, requerimento e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Novo levantamento e planta completa',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Controle acústico / laudo de ruído quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Projetos de tratamento de efluentes quando aplicáveis',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento e complementação — limites a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Definição da fase e modalidade do licenciamento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e levantamento das unidades',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudo e planta conforme enquadramento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudos especializados e projetos executivos',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — limite a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Enquadramento e análise dos sistemas de armazenamento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e planta ambiental',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudos específicos conforme fase e instalação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudos especializados e projetos executivos',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — limite a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise territorial e enquadramento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e diagnóstico das restrições',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudos e plantas do empreendimento — escopo a definir',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudos especializados e projetos executivos',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — limite a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise de atividade e porte',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria técnica para declaração, conforme escopo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Declaração de conformidade ambiental por profissional habilitado',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Conferência documental e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento. Sugestão comercial inicial: 1h por etapa básica (3h no total), ajustável após conferir o caso. Não é prazo legal nem média medida.',
    etapas: [
      {
        nome: 'Verificação da atividade e enquadramento',
        marcada: true,
        condicional: false,
        horasSugeridas: 1,
      },
      {
        nome: 'Conferência dos documentos do empreendimento',
        marcada: true,
        condicional: false,
        horasSugeridas: 1,
      },
      {
        nome: 'Preenchimento do requerimento e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: 1,
      },
      {
        nome: 'Vistoria ou estudo complementar, se necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento do pedido — limite a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Viabilidade técnica da concessionária — somente se aplicável',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise do local/atividade e documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Preparação do requerimento e declarações',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planejamento da campanha e definição de pontos/períodos',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Medição de ruído e laudo técnico',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria específica e responsabilidade técnica do laudo',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Locação de sonômetro e acessórios calibrados',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise do local/atividade e documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Preparação do requerimento e declarações',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planejamento da campanha e definição de pontos/períodos',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Medição de ruído e laudo técnico',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria específica e responsabilidade técnica do laudo',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Locação de sonômetro e acessórios calibrados',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise do local/atividade e documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Preparação do requerimento e declarações',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planejamento da campanha e definição de pontos/períodos',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Medição de ruído e laudo técnico',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria específica e responsabilidade técnica do laudo',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Locação de sonômetro e acessórios calibrados',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Plano da campanha: pontos, períodos e condições',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Campanha de medição — quantidade a definir',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Tratamento dos dados e laudo técnico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica do laudo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo de DCA — pedido separado quando contratado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Locação e calibração de equipamento',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Conferência de projeto e documentos assinados pelo autor',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Montagem do requerimento e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento documental — limite a definir',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Revisões técnicas do projeto, se contratadas',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Ensaios de solo e infiltração',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria e levantamento de dados de dimensionamento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dimensionamento e memorial descritivo e de cálculo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plantas e cortes do sistema',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica do projeto',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Preparação do pedido de aprovação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Suporte à execução e RT de operação — contratação própria',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Ensaios de solo e infiltração',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Enquadramento e vistoria da área',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Inventário / levantamento florestal — dimensionar',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planta e caracterização da vegetação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Projeto de compensação / reposição quando aplicável',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Laudo de risco ou estudo especializado — quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Monitoramento / execução — contratação separada',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Mudas, plantio e compensação — conforme ato',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Execução do corte/poda e destinação — não incluída',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria e identificação das espécies',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Levantamento, croqui e registro fotográfico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Justificativa técnica e compensação quando aplicável',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Montagem e protocolo do pedido',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Laudo de risco ou estudo especializado — quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Monitoramento / execução — contratação separada',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Mudas, plantio e compensação — conforme ato',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Execução do corte/poda e destinação — não incluída',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria e identificação das árvores',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Descrição e justificativa da poda',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Documentação e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Laudo de risco ou estudo especializado — quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Monitoramento / execução — contratação separada',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Mudas, plantio e compensação — conforme ato',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Execução do corte/poda e destinação — não incluída',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Diagnóstico da área degradada',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plano de recuperação e cronograma',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plantas e memorial técnico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Laudo de risco ou estudo especializado — quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Monitoramento / execução — contratação separada',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Mudas, plantio e compensação — conforme ato',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Execução do corte/poda e destinação — não incluída',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise do ato ambiental e da matrícula',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Conferência da delimitação e memorial da área',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização do requerimento e suporte à averbação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Laudo de risco ou estudo especializado — quando aplicável',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Monitoramento / execução — contratação separada',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Mudas, plantio e compensação — conforme ato',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Execução do corte/poda e destinação — não incluída',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'terraplanagem',
    nome: 'Terraplanagem — licenciamento',
    categoria: 'Território',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte: 'https://www.joinville.sc.gov.br/servicos/requerer-licencas-para-terraplanagem/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise do terreno e enquadramento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e levantamento de informações',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Projeto, planta e memorial — definir fase e autoria',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plano de medidas e documentos técnicos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento técnico da execução',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Estudos geotécnicos',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise preliminar da base SIMGeo e do imóvel',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Reconhecimento e levantamento especializado de campo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Planta georreferenciada e relatório técnico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Consolidação de arquivos geoespaciais',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Pedido de revisão somente se houver fundamento técnico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Acompanhamento e complementação documental — limite a definir',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Profissional especializado e vínculo técnico',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Certidão de matrícula / emolumentos cartoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
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
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Definição da microbacia e escopo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Levantamento técnico e cartográfico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Diagnóstico socioambiental e documentação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Consolidação e protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudos de equipe multidisciplinar',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Levantamento topográfico por terceiro',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'consulta',
    nome: 'Consulta de licenças e situação processual',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte: 'https://www.joinville.sc.gov.br/servicos/consultar-licencas-ambientais/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Pesquisa de licença/processo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Conferência de correspondência com empresa e imóvel',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Resumo da consulta, sem auditoria integral',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'acesso',
    nome: 'Pedido de acesso a processo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-acesso-a-processos-de-licenciamento-ambiental/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Identificação e pedido de acesso',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização inicial do material recebido',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'procurador',
    nome: 'Inclusão de procurador em processo',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-inclusao-de-procurador-em-processos-de-licenciamento-ambiental/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Conferência da procuração e identificação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Requerimento de vinculação ao processo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'cnda',
    nome: 'Certidão negativa de débitos ambientais',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-certidao-negativa-de-debitos-ambientais-cnda/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Conferência dos dados e autorização',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Requerimento e obtenção da certidão',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'defesa',
    nome: 'Defesa técnica de infração ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/apresentar-defesa-de-infracoes-expedidas-pela-sama-auto-de-infracao-ambiental-auto-de-multa-e-auto-de-infracao/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Leitura do auto e verificação dos prazos do caso',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Análise de documentos e evidências técnicas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Parecer / subsídios técnicos e preparação da manifestação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'recurso',
    nome: 'Recurso administrativo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/interpor-recurso-a-processo-administrativo-ambiental-de-obras-ou-de-posturas-que-tramita-na-sama/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Leitura da decisão e verificação dos prazos do caso',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Análise técnica e fundamentação da manifestação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização de documentos e apoio ao protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'vista-paa',
    nome: 'Vista de processo administrativo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-vista-de-processo-administrativo-ambiental-paa/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Identificação do processo e pedido de vista',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização do material disponibilizado',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'consulta-paa',
    nome: 'Consulta de processo administrativo ambiental',
    categoria: 'Suporte e processos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-10',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/consultar-processos-administrativos-ambientais-paas/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Consulta processual autorizada',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Resumo do andamento consultado',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria ou laudo especializado, quando necessário',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Cópias, certidões e deslocamento, se necessários',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'pgrss',
    nome: 'PGRSS — resíduos de serviços de saúde',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria da geração e manejo dos resíduos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Elaboração do PGRSS',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Relatório de adequações e orientação de implantação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica do plano',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'pgrs',
    nome: 'PGRS — resíduos sólidos',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria e inventário dos resíduos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Elaboração / atualização do PGRS',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Orientação sobre registros e destinação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'pgrcc',
    nome: 'PGRCC — resíduos da construção civil',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Levantamento da obra e estimativa de resíduos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plano de gerenciamento e medidas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica do plano',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'lac-transporte',
    nome: 'LAC — transporte de produtos perigosos em SC',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise da operação e enquadramento junto ao órgão competente',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Conferência de veículos, produtos e rotas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'RCE e declarações aplicáveis',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plano de Ação Emergencial (PAE)',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica e apoio ao protocolo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa do órgão estadual — conforme guia',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'pae',
    nome: 'PAE — plano de ação emergencial',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Levantamento da operação e cenários',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Elaboração do PAE',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Revisão e entrega com responsabilidade técnica',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'condicionantes',
    nome: 'Gestão de condicionantes / RT continuada',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Leitura da licença e planejamento das entregas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Gestão de prazos e evidências do período contratado',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Visitas conforme frequência contratada',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Relatório periódico conforme instrumento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'complementacao',
    nome: 'Complementação técnica / informação técnica do órgão',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Diagnóstico do ofício e matriz de atendimento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Atualização de caracterização, layout e plantas conforme exigências',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Revisão de programas e controles contratados',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Dossiê de resposta e responsabilidade técnica',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'nutrientes',
    nome: 'Interpretação de nutrientes e sedimentos',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Conferência de dados laboratoriais',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estimativa de estoques de fósforo e nitrogênio',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Avaliação de mobilização e carga interna potencial',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Nota técnica e planilhas',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'diagnostico',
    nome: 'Diagnóstico técnico-documental e geoespacial',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise de documentos e restrições',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Consulta a bases oficiais',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Diagnóstico e relatório de pendências',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'vistoria',
    nome: 'Vistoria técnica preliminar',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Vistoria e reconhecimento do empreendimento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Orientação técnica inicial e encaminhamentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'ctf',
    nome: 'Assessoria cadastral CTF/IBAMA',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Enquadramento cadastral e conferência de dados',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Apoio ao cadastro / regularização autorizada',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Orientações e comprovantes',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'rap',
    nome: 'RAP — relatório ambiental prévio',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Definição do termo aplicável',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Levantamento e vistoria técnica',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Elaboração do RAP',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica e entrega',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'eas',
    nome: 'EAS — estudo ambiental simplificado',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Definição do termo aplicável e equipe',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Levantamentos e diagnóstico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Elaboração do EAS',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica e entrega',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'sanitario',
    nome: 'Licença sanitária — apoio ao requerimento',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Diagnóstico dos procedimentos e documentos do estabelecimento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização do processo sanitário',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Apoio ao requerimento e acompanhamento — limite a definir',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo específico se contratado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'planta',
    nome: 'Planta baixa / planta ambiental',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Levantamento da base existente e vistoria quando contratada',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Desenho da planta com áreas, unidades e controles',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica do documento',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo específico se contratado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'flora',
    nome: 'Inventário florestal / laudo de flora',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Planejamento e delimitação da área',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Levantamento de campo da vegetação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Tratamento dos dados e laudo de flora',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo específico se contratado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'eca',
    nome: 'ECA — estudo de conformidade ambiental',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Diagnóstico do empreendimento em operação',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e levantamento dos controles',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Estudo de conformidade conforme termo aplicável',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica e entrega',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo específico se contratado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'pca',
    nome: 'PCA e programas ambientais específicos',
    categoria: 'Planos e serviços complementares',
    jurisdicao: 'Órgão e município a confirmar',
    consultadoEm: '2026-11-10',
    fonte: null,
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Diagnóstico e definição dos programas contratados',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Plano de controle e medidas de gestão',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Cronograma e indicadores',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo específico se contratado',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Deslocamento e despesas de campo',
        marcada: false,
        condicional: true,
      },
      {
        nome: 'Coletas e análises laboratoriais',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'canil-gatil',
    nome: 'Autorização para canil/gatil comercial',
    categoria: 'Licenciamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/requerer-autorizacao-para-canil-gatil-comercial/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Análise de enquadramento e documentos',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Vistoria e registro fotográfico',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Memorial descritivo das instalações e do manejo',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Responsabilidade técnica dos documentos contratados',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização e protocolo do pedido',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — definir limite de horas',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
      {
        nome: 'Taxa de ART/RRT/TRT — conforme conselho e atribuições',
        marcada: false,
        condicional: true,
      },
    ],
  },
  {
    id: 'transporte-efluentes',
    nome: 'Cadastro de transportador de efluentes sanitários',
    categoria: 'Água e saneamento',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/registrar-empresa-de-transporte-de-efluentes-sanitarios/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Levantamento dos requisitos e documentos da empresa e da frota',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização da documentação e preenchimento do cadastro',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo e acompanhamento do pedido',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — definir limite de horas',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
    ],
  },
  {
    id: 'transporte-rcc',
    nome: 'Cadastro de transportador de resíduos da construção civil',
    categoria: 'Resíduos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/registrar-empresa-de-transporte-de-residuos-de-construcao-civil/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Levantamento dos requisitos e documentos da empresa e da frota',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Organização da documentação e preenchimento do cadastro',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Protocolo e acompanhamento do pedido',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Resposta a exigências — definir limite de horas',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Preço público municipal — conforme guia vigente',
        marcada: true,
        condicional: false,
      },
    ],
  },
  {
    id: 'mtr',
    nome: 'MTR — manifesto de transporte de resíduos',
    categoria: 'Resíduos',
    jurisdicao: 'Joinville / SAMA',
    consultadoEm: '2026-11-11',
    fonte:
      'https://www.joinville.sc.gov.br/servicos/emitir-manifesto-de-transporte-de-residuos-mtr/',
    nota: 'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.',
    etapas: [
      {
        nome: 'Conferência do cadastro do gerador, do transportador e do destinador',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Emissão dos manifestos no sistema',
        marcada: true,
        condicional: false,
        horasSugeridas: null,
      },
      {
        nome: 'Conferência dos certificados de destinação final (CDF)',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
      {
        nome: 'Rotina mensal de emissão — definir volume',
        marcada: false,
        condicional: true,
        horasSugeridas: null,
      },
    ],
    despesas: [
      {
        nome: 'Taxas do sistema, se houver',
        marcada: false,
        condicional: true,
      },
    ],
  },
]
