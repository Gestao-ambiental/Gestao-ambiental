// Contrato do motor (especificação 0.1). O vocabulário é o do método: atividade, carteira, plano.
// Licença, condicionante e ocorrência são assunto de quem monta a carteira.

/** Data civil `AAAA-MM-DD`. */
export type Data = string

export type Antecipabilidade = 'fixa' | 'antecipavel' | 'parcial'

/** (a) só pelo prazo, (b) pela folga sem gravidade, (c) método completo, (d) método sem antecipabilidade. */
export type Estrategia =
  'so_prazo' | 'folga_sem_gravidade' | 'metodo_completo' | 'metodo_sem_antecipacao'

export const ESTRATEGIAS: readonly Estrategia[] = [
  'so_prazo',
  'folga_sem_gravidade',
  'metodo_completo',
  'metodo_sem_antecipacao',
]

export interface Dependencia {
  /** Atividade que precisa terminar antes. */
  id: string
  /** Dias mínimos entre o fim dela e o início desta. */
  defasagemDias: number
}

export interface Atividade {
  id: string
  /** Licença ou empreendimento de origem; só agrupa relatórios. */
  grupo?: string
  rotulo?: string
  /** Data oficial de entrega. Dispensável só quando outra atividade depende desta. */
  prazo?: Data | null
  /** Dias corridos de trabalho da equipe. */
  duracaoDias: number
  /** Dias corridos aguardando terceiros, depois do trabalho. Não consome horas. */
  esperaDias: number
  /** Horas da equipe, gastas dentro da duração. */
  esforcoHoras: number
  /** `id` de um nível de `Parametros.niveis`. */
  gravidade: string
  antecipabilidade: Antecipabilidade
  /** Primeira data em que o trabalho pode começar. Padrão: hoje. */
  inicioMaisCedo?: Data | null
  /** Só em `fixa`: início imposto por uma janela. */
  inicioFixo?: Data | null
  /** Só em `parcial`: parte das horas e da duração que pode ser feita antes (entre 0 e 1). */
  fracaoAntecipavel?: number | null
  dependeDe?: Dependencia[]
}

export interface Carteira {
  atividades: Atividade[]
}

export interface Nivel {
  id: string
  rotulo: string
  margemDias: number
}

export interface Parametros {
  versao: string
  /** Do menos grave ao mais grave. */
  niveis: Nivel[]
  /** Níveis que entram na métrica de antecedência. */
  niveisGraves: string[]
  /** Margem igual para todas na estratégia (b). */
  margemUnicaDias: number
  /** Antecedência do aviso de vencimento na estratégia (a). */
  alertaDias: number
  /** Tamanho de cada tentativa de antecipação. */
  passoNivelamentoDias: number
  /** Meses a partir do mês de hoje. Padrão: até o mês do último prazo. */
  horizonteMeses?: number | null
}

export type Estado = 'planejada' | 'iniciar_ja' | 'inviavel'

export type CodigoDeAviso =
  | 'margem_nao_cabe'
  | 'prazo_nao_cabe'
  | 'inicio_fixo_tardio'
  | 'esforco_sem_duracao'
  | 'fora_do_horizonte'

export type CodigoDeAvisoGeral = 'nivelamento_interrompido'

/** Parcelas da conta da data recomendada; a tela monta a frase. */
export interface Explicacao {
  prazo: Data | null
  margemDias: number
  esperaDias: number
  duracaoDias: number
  /** Atividade sucessora que limitou o fim desta, quando não foi o próprio prazo. */
  limitadaPor: string | null
}

export interface ItemDoPlano {
  atividadeId: string
  /** Último início que ainda cumpre o prazo. */
  inicioLimite: Data
  /** Último início que preserva a margem. */
  inicioRecomendado: Data
  /** `inicioLimite − hoje`. */
  folgaDias: number
  /** `inicioLimite − inicioRecomendado`. */
  margemEfetivaDias: number
  /** `inicioRecomendado − hoje`. */
  diasAteInicio: number
  estado: Estado
  inicioPlanejado: Data
  fimPlanejado: Data
  /** Dias que o nivelamento adiantou. Zero fora da estratégia (c). */
  antecipadaDias: number
  /** Só em `parcial`: início da parte que não se move. */
  inicioParteFixa: Data | null
  /** Antecessoras pendentes, quando a atividade está em triagem. */
  bloqueadaPor: string[]
  avisos: CodigoDeAviso[]
  explicacao: Explicacao
}

export interface CargaDoMes {
  /** `AAAA-MM`. */
  mes: string
  horas: number
  horasSemNivelamento: number
}

export interface Metricas {
  picoHoras: number
  mesDoPico: string
  mediaHoras: number
  coeficienteVariacao: number
  zonaCritica: number
  atrasadas: number
  antecedenciaGravesMediana: number | null
  antecedenciaGravesMinima: number | null
  horasForaDoHorizonte: number
}

export interface Plano {
  versaoMotor: string
  versaoParametros: string
  estrategia: Estrategia
  hoje: Data
  itens: ItemDoPlano[]
  /** `id` das atividades `inviavel` e `iniciar_ja`, já ordenados. */
  triagem: string[]
  cargaMensal: CargaDoMes[]
  metricas: Metricas
  avisos: CodigoDeAvisoGeral[]
}

export type CodigoDeErro =
  | 'id_duplicado'
  | 'data_invalida'
  | 'valor_invalido'
  | 'gravidade_desconhecida'
  | 'prazo_ausente'
  | 'dependencia_inexistente'
  | 'dependencia_ciclica'
  | 'fracao_invalida'
  | 'parametro_invalido'

export interface ErroDeValidacao {
  codigo: CodigoDeErro
  atividadeId?: string
  campo?: string
  detalhe?: string
}

export type Resultado = { ok: true; plano: Plano } | { ok: false; erros: ErroDeValidacao[] }
