// Regras puras do domínio (ADR-0007): sem React, Supabase, rede, DOM ou relógio.
// Portadas de dist/domain.js do protótipo Nexo (commit c06f5b3); cada função cita o nome original.

export {
  adicionarDias,
  adicionarMeses,
  dataCivil,
  dataEHoraNoFuso,
  diaDaSemana,
  diferencaEmDias,
  ehDataCivil,
  formatarDataCivil,
  hojeNoFuso,
  nomeDoDiaDaSemana,
  semanaDe,
  ultimoDiaDoMes,
} from './data-civil'
export type { DataCivil, DataEHoraNoFuso } from './data-civil'

export {
  MAXIMO_OCORRENCIAS,
  MESES_POR_PERIODICIDADE,
  ocorrencias,
  primeiraOcorrenciaSugerida,
  sugerirDatasDeDependencia,
} from './recorrencia'
export type { Periodicidade } from './recorrencia'

export {
  ANTECEDENCIA_PREPARACAO_PADRAO_DIAS,
  DIAS_LIMITE_PROTOCOLO_LAO,
  antecedenciaPreparacao,
  datasRenovacaoLao,
  etapasRenovacaoLao,
} from './renovacao'
export type { DatasRenovacaoLao, EtapaRenovacaoLao } from './renovacao'

export { diaUtilAnterior, ehDiaUtil, prazoDeOficio } from './dias-uteis'
export type { PrazoDeOficio, UnidadePrazo } from './dias-uteis'
