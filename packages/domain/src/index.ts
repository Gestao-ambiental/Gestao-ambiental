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
  dataPorExtenso,
  lerDataDigitada,
  mascararData,
  montarData,
  nomeDoMes,
  semanasDoMes,
} from './calendario'
export type { LeituraDeData } from './calendario'

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
  DIAS_AVISO_PROTOCOLO,
  DIAS_LIMITE_PROTOCOLO_LAO,
  antecedenciaPreparacao,
  datasRenovacaoLao,
  etapasRenovacaoLao,
  INTERVALOS_ACOMPANHAMENTO,
  proximoAcompanhamento,
  rotuloDaSituacaoDaRenovacao,
  rotuloDoIntervalo,
  situacaoDaRenovacao,
} from './renovacao'
export type { DatasRenovacaoLao, EtapaRenovacaoLao, SituacaoDaRenovacao } from './renovacao'

export { diaUtilAnterior, ehDiaUtil, prazoDeOficio } from './dias-uteis'
export type { PrazoDeOficio, UnidadePrazo } from './dias-uteis'

export {
  VALIDADE_CONVITE_DIAS,
  consultoriaInicial,
  impedimentoDoVinculo,
  situacaoDoConvite,
} from './acesso'
export type {
  ImpedimentoDoVinculo,
  PapelMembro,
  SituacaoConvite,
  SituacaoConviteGravada,
  SituacaoMembro,
  VinculoResumo,
} from './acesso'

export { formatarCnpj, mascararCnpj, normalizarCnpj, situacaoDoCnpj } from './cnpj'

export {
  ErroDePrazo,
  RECORRENCIAS,
  datasDoPrazo,
  descreverRecorrencia,
  ehLao,
  proximaEntrega,
  proximaValidade,
  situacaoDaLicenca,
  situacaoMaisUrgente,
  sugerirPrimeiraData,
} from './prazo'
export type { LicencaResumo, Prazo, Recorrencia, SituacaoDaLicenca, UnidadeCiclo } from './prazo'

export { recorrenciaSugerida } from './recorrencia-sugerida'
export type { RecorrenciaSugerida } from './recorrencia-sugerida'

export { faixaDeAtraso, rotuloDaSituacaoDoPrazo, situacaoDoPrazo } from './situacao-prazo'
export type { FaixaDeAtraso, SituacaoDoPrazo, TipoLinhaDePrazo } from './situacao-prazo'

export { dataForaDoCiclo, janelaDoCiclo, proximaAcao, situacaoExibida } from './ocorrencia'
export type {
  JanelaDoCiclo,
  SituacaoDaEvidencia,
  SituacaoExibida,
  SituacaoGravadaDaOcorrencia,
} from './ocorrencia'
export { TOTAL_PASSOS_CADASTRO, passoDoRascunho } from './progresso-cadastro'
export type { EstadoDoRascunho } from './progresso-cadastro'

export {
  ErroDeOrcamento,
  HORAS_DISPONIVEIS_MAXIMAS_MES,
  HORAS_MAXIMAS_DO_ITEM,
  MAXIMO_LINHAS_DA_EQUIPE,
  MAXIMO_PARCELAS,
  MINUTOS_MAXIMOS_DO_ITEM,
  PONTOS_BASE_TOTAL,
  PRECO_MAXIMO_CENTAVOS,
  acrescimoEquivalente,
  aplicarPontosBase,
  composicaoDaEquipe,
  custoDoItem,
  custoFixoPorHora,
  diferencaDasParcelas,
  distribuirPorMaiorResto,
  formatarCentavos,
  formatarDuracao,
  formatarPontosBase,
  formatarReais,
  lerDuracao,
  lerReais,
  numeroDoOrcamento,
  precoAutomaticoDoItem,
  precoSugerido,
  resultadoDoPreco,
  situacaoDaMargem,
} from './orcamento'
export type {
  BaseDeCustos,
  ComposicaoDaEquipe,
  CustoDoItem,
  LinhaDaEquipe,
  PercentuaisDoPreco,
  ResultadoDoPreco,
  SituacaoDaMargem,
} from './orcamento'

export {
  MAXIMO_CONTAS_DO_MES,
  MAXIMO_KM_POR_VISITA,
  MAXIMO_VISITAS,
  SEM_VISITAS,
  custoDasVisitas,
  precificarOrcamento,
  rateioPorConta,
} from './preco-do-orcamento'
export type {
  BaseDoPreco,
  DivisaoDoValor,
  EntradaDoPreco,
  PendenciaDoPreco,
  PrecoDoOrcamento,
  VisitasDoOrcamento,
} from './preco-do-orcamento'
