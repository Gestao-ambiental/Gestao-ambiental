// Importar planilha (ADR-0043): regras puras do navegador, sem SheetJS, rede ou DOM.
export {
  CAMPOS_DA_IMPORTACAO,
  SINONIMOS_DOS_CAMPOS,
  faltamObrigatorios,
  mapearCabecalhos,
  normalizarCabecalho,
  normalizarTextoDeComparacao,
  rotuloDoCampoDaImportacao,
} from './campos'
export type { CampoDaEntidade } from './campos'
export {
  colunaPareceCpf,
  descartarColunasDeCpf,
  numeroPareceCpf,
  tirarCpfDoTexto,
  valorPareceCpf,
} from './cpf'
export { celulaDeCsv, decodificarCsv, detectarSeparadorDoCsv } from './csv'
export { dataDoSerialDoExcel, lerDataDaPlanilha } from './datas'
export {
  chaveDaLicenca,
  chaveDoEmpreendimento,
  dadosVazios,
  linhasComErroEmCsv,
  marcarRepetidas,
  mensagemDoProblema,
  montarDadosDaLinha,
  podeDesfazer,
  validarLinha,
} from './linha'
export {
  LIMITE_DE_LINHAS,
  NOME_DA_UNIDADE_PADRAO,
  PRAZO_PARA_DESFAZER_HORAS,
  TAMANHO_DO_LOTE,
  TAMANHO_MAXIMO_DO_ARQUIVO,
  TEXTO_MAXIMO,
} from './tipos'
export type {
  CampoDaImportacao,
  CelulaLida,
  CodigoDeAvisoDaLinha,
  CodigoDeErroDaLinha,
  DadosDaLinha,
  EntidadeDaImportacao,
  GrupoDaLinha,
  LinhaLida,
  MapeamentoDeColunas,
  ProblemaDaLinha,
  TabelaLida,
} from './tipos'
