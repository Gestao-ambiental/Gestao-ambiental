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
  MAXIMO_OCORRENCIAS,
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

export {
  ROTULO_DO_TIPO_DE_LINHA,
  TIPOS_COM_RESPONSAVEL,
  TIPOS_LINHA_DE_PRAZO,
  faixaDeAtraso,
  rotuloDaSituacaoDoPrazo,
  situacaoDoPrazo,
  tipoAceitaResponsavel,
} from './situacao-prazo'
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
  custoFixoPorHora,
  diferencaDasParcelas,
  distribuirPorMaiorResto,
  formatarCentavos,
  formatarDuracao,
  formatarPontosBase,
  formatarReais,
  lerDuracao,
  lerReais,
  formatarReaisDigitados,
  numeroDoOrcamento,
  situacaoDaMargem,
} from './orcamento'
export type {
  BaseDeCustos,
  ComposicaoDaEquipe,
  CustoDoItem,
  LinhaDaEquipe,
  SituacaoDaMargem,
} from './orcamento'

export { cargaDoMes, inicioDoMes, mesesDeExecucao, rotuloDoMes } from './carga-da-equipe'
export type {
  CargaDoMes,
  HorasComprometidas,
  JornadaDoMembro,
  ServicoComResponsavel,
} from './carga-da-equipe'

export {
  DIAS_MAXIMOS_NO_MES,
  FORMAS_DE_RECEBIMENTO,
  HORAS_MAXIMAS_DO_PROJETO,
  HORAS_MAXIMAS_POR_DIARIA,
  horaDeCustoPorMembro,
  linhasMensaisDaEquipe,
  resumoDaPessoa,
} from './remuneracao'
export type { FormaDeRecebimento, RemuneracaoDaPessoa, ResumoDaPessoa } from './remuneracao'

export {
  ESCALA_DA_QUANTIDADE,
  MAXIMO_DE_FAIXAS,
  MAXIMO_KM_POR_VISITA,
  MAXIMO_VISITAS,
  QUANTIDADE_MAXIMA,
  UNIDADES_COM_FAIXAS,
  UNIDADES_DE_COBRANCA,
  custoDoTerceiro,
  custoHoraPorProfissao,
  honorariosPelaTabela,
  mesmaProfissao,
  precificarOrcamento,
  problemaDasFaixas,
  profissaoObrigatoria,
  rateioPorConta,
  valorPorFaixas,
} from './preco-do-orcamento'

export {
  CONSUMO_MAXIMO_KM_POR_LITRO,
  MODOS_DE_DESLOCAMENTO,
  modoDeDeslocamento,
  valorDoKm,
} from './deslocamento'
export type { CombustivelDoKm, ModoDeDeslocamento } from './deslocamento'

export { datasDaProposta } from './validade-da-proposta'
export type { DatasDaProposta, MudancaDaProposta } from './validade-da-proposta'
export type {
  BaseDoPreco,
  DivisaoDoValor,
  EntradaDoPreco,
  FaixaDePreco,
  FormaDePreco,
  CustoDaProfissao,
  CustoDoMembro,
  HoraDeVenda,
  PendenciaDoPreco,
  PrecoDoOrcamento,
  TerceiroDoItem,
  UnidadeDeCobranca,
  VisitasDoOrcamento,
} from './preco-do-orcamento'

export {
  PASSO_DA_PENDENCIA,
  custosFixosDoRascunho,
  exibirConviteDeConfiguracao,
  horasDaEquipe,
  pendenciasDaConfiguracao,
  resumoDaConfiguracao,
  rotuloDoConviteDeConfiguracao,
} from './primeiros-passos-orcamento'
export type {
  ContaDoRascunho,
  DadosDaConfiguracao,
  EstadoDoConvite,
  ModoDoCusto,
  PassoContas,
  PassoEquipe,
  PassoPrecos,
  PassoTributos,
  PendenciaDaConfiguracao,
  PessoaDoRascunho,
  ResumoDaConfiguracao,
} from './primeiros-passos-orcamento'

export {
  CARGOS,
  GENEROS,
  MAXIMO_DE_OUTRAS_PROFISSOES,
  areaDaProfissao,
  PROFISSOES,
  cargoDoCodigo,
  generoDoCodigo,
  gruposDaLista,
  outrasProfissoes,
  profissoesParaOGenero,
  rotuloDaProfissaoDaPessoa,
  rotuloDaFormacaoDaPessoa,
  rotuloDaProfissaoNoCusto,
  profissaoDoCodigo,
  rotuloDaProfissao,
  rotuloDoCargo,
  sugerirCargo,
  sugerirProfissaoPeloCargoAntigo,
  sugerirProfissao,
} from './profissao-e-cargo'
export type {
  CertezaDaSugestao,
  CodigoCargo,
  CodigoProfissao,
  GeneroDaPessoa,
  ItemDaLista,
  SugestaoDaLista,
} from './profissao-e-cargo'

export {
  CONSELHOS,
  UFS,
  conselhoDoCodigo,
  conselhoSugerido,
  descreverRegistro,
  ehUf,
  profissoesComRegistro,
  rotuloDaSituacaoDoRegistro,
  rotuloDoConselho,
  situacaoDoRegistro,
} from './registro-profissional'
export type { CodigoConselho, SituacaoDoRegistro, Uf } from './registro-profissional'

export {
  DIAS_SEM_USO_PARA_ALERTA,
  INTERVALO_DE_REGISTRO_MINUTOS,
  JANELA_DE_USO_DIAS,
  MINUTOS_PARA_AGORA,
  MODULOS_DE_USO,
  ROTULO_DO_MODULO_DE_USO,
  classificarUltimoUso,
  diasDesde,
  ehModuloDeUso,
  moduloDaRota,
  podeRegistrarUso,
  precisaDeAlertaDeSemUso,
  rotuloDoAlertaDeSemUso,
  rotuloDoUltimoUso,
  usandoAgora,
} from './uso-da-plataforma'
export type { ClasseDoUltimoUso, ConsultoriaParaAlerta, ModuloDeUso } from './uso-da-plataforma'

export {
  CATEGORIAS_DE_EMERGENCIA,
  DURACAO_DA_EMERGENCIA_HORAS,
  DURACOES_DE_SUPORTE_HORAS,
  LIMITE_DO_MOTIVO_DE_SUPORTE,
  ROTULO_DA_CATEGORIA_DE_EMERGENCIA,
  ehCategoriaDeEmergencia,
  ehDuracaoDeSuporte,
  rotuloDaDuracaoDeSuporte,
  rotuloDoFimDoSuporte,
  suporteValendo,
} from './acesso-de-suporte'
export type { CategoriaDeEmergencia, DuracaoDeSuporte } from './acesso-de-suporte'

export {
  ADICIONAL_MENSAL_CENTAVOS,
  CATALOGO_PADRAO,
  CODIGOS_DE_PLANO,
  DIAS_DE_TESTE_PADRAO,
  DIAS_UTEIS_DE_TOLERANCIA,
  DIAS_UTEIS_TESTE_ACABANDO,
  FIM_DO_BETA_PADRAO,
  MENSALIDADES_NO_ANUAL,
  MOEDA,
  PLANOS,
  RECURSOS_DO_PLANO,
  ROTULO_DA_FORMA,
  ROTULO_DA_SITUACAO_COMERCIAL,
  ROTULO_DO_CICLO,
  ROTULO_DO_RECURSO,
  SITUACOES_COMERCIAIS,
  adicionaisDoUso,
  cicloVigente,
  economiaDoAnual,
  ehCicloDoPlano,
  ehCodigoPlano,
  ehDiaUtilNacional,
  ehFormaDePagamento,
  ehPlanoMaior,
  ehRecursoDoPlano,
  ehSituacaoComercial,
  equivalenteMensal,
  feriadosNacionais,
  fimDoTeste,
  inicioDoTeste,
  limitesDoPlano,
  pascoa,
  passagemDoLimite,
  planoVigente,
  primeiroVencimento,
  recursoLiberado,
  situacaoComercial,
  somarDiasUteis,
  testeAcabando,
  valorDoCiclo,
  valorMensalComAdicionais,
} from './planos'
export type {
  Adicionais,
  AssinaturaParaSituacao,
  CatalogoComercial,
  CicloDoPlano,
  CodigoPlano,
  ConfiguracaoComercial,
  EntradaDaSituacao,
  FormaDePagamento,
  Limites,
  PassagemDoLimite,
  Plano,
  RecursoDoLimite,
  RecursoDoPlano,
  SituacaoComercial,
  SituacaoComercialCodigo,
  Uso,
} from './planos'

export { cpfValido, mascararDocumento, normalizarDocumento, tipoDoDocumento } from './documento'
export type { TipoDeDocumento } from './documento'

export {
  documentoDoTitularParaGravar,
  formatarDocumentoDoTitular,
  rotuloDoDocumentoDoTitular,
  situacaoDoDocumentoDoTitular,
} from './documento-do-titular'
export type { SituacaoDoDocumento } from './documento-do-titular'

export {
  DIAS_DE_RENOVACAO_PROTEGIDA,
  DIAS_UTEIS_DE_NAO_PLANEJADA,
  DIAS_UTEIS_DE_URGENCIA,
  MESES_DE_METRICAS,
  antecedenciaEmDiasUteis,
  diasUteisEntre,
  ehNaoPlanejada,
  ehNoPrazo,
  ehUrgencia,
  picoSobreMedia,
  proporcao,
  renovacaoProtegida,
  variacao,
} from './metricas-de-valor'

export {
  BLOCO_DE_ACOMPANHAMENTO_SEGUNDOS,
  CONDICIONANTES_MANUAIS_PARA_MEDIR,
  CONDICIONANTES_PARA_MOSTRAR_HORAS,
  DIAS_DE_VALIDADE_DA_LINHA_DE_BASE,
  DIAS_PARA_ADIAR_LINHA_DE_BASE,
  DIAS_PARA_MOSTRAR_HORAS,
  JANELA_DE_INTERACAO_SEGUNDOS,
  MESES_DO_RESUMO,
  TIPOS_DE_TAREFA,
  adiarLinhaDeBase,
  calcularHorasPoupadas,
  contaComoTempoAtivo,
  ehRotaDeAcompanhamento,
  errosDaLinhaDeBase,
  formatarHoras,
  juntandoDados,
  mesesDoResumo,
  precisaResponderLinhaDeBase,
  semanasParaAcompanhamento,
} from './horas-poupadas'
export type {
  EntradaDasHorasPoupadas,
  HorasPoupadas,
  LinhaDeBase,
  TipoDeTarefa,
} from './horas-poupadas'

export {
  ANO_INICIAL_DA_DMR_TRIMESTRAL,
  CASAS_DA_QUANTIDADE,
  DIAS_PARA_COBRAR_CDF,
  QUANTIDADE_MAXIMA_RESIDUO,
  ROTULO_DA_OBRIGACAO_RESIDUO,
  ROTULO_DA_PENDENCIA_DE_RESIDUO,
  ROTULO_DA_SITUACAO_DO_MTR,
  ROTULO_DA_UNIDADE_DE_RESIDUO,
  SITUACOES_DO_MTR,
  TIPOS_DE_OBRIGACAO_RESIDUO,
  UNIDADES_DE_RESIDUO,
  conferirCdfMtr,
  converterQuantidade,
  ehSituacaoMtr,
  ehTipoObrigacaoResiduo,
  ehUnidadeResiduo,
  formatarQuantidade,
  lerQuantidade,
  mesmoTipoDeUnidade,
  prazosDaObrigacaoResiduo,
  proximosPrazosDaObrigacaoResiduo,
  quantidadeValida,
  unidadeDoPainel,
} from './residuos'
export type {
  ItemParaConferir,
  MtrParaConferir,
  PendenciaDeResiduo,
  PrazoDeObrigacaoResiduo,
  RecebidoNoCdf,
  SituacaoMtr,
  TipoObrigacaoResiduo,
  UnidadeResiduo,
} from './residuos'
export {
  METODOS_DE_ACEITE,
  ROTULO_DA_SITUACAO_DA_TAREFA,
  ROTULO_DO_METODO_DE_ACEITE,
  SITUACOES_DA_TAREFA,
  ehSituacaoDaTarefa,
  errosDoAceite,
  errosDoRoteiro,
  horasDoCampo,
  minutosDasHoras,
  prazoInternoSugerido,
  proximasSituacoesDaTarefa,
  roteiroInicial,
  rotuloDaAcaoDaTarefa,
} from './tarefas-de-servico'
export type {
  AceiteDigitado,
  ItemParaTarefa,
  MetodoDeAceite,
  SituacaoDaTarefa,
  TarefaDoRoteiro,
} from './tarefas-de-servico'
export {
  formatarContato,
  linkDoContato,
  linkDoConviteNoWhatsapp,
  normalizarContato,
} from './lista-de-espera'
export type { ContatoNormalizado, TipoDeContato } from './lista-de-espera'

export {
  GRUPOS_DA_VISTORIA,
  ITENS_SUGERIDOS,
  LIMITES_DA_VISTORIA,
  RESULTADOS_DO_ITEM,
  ROTULO_DA_PENDENCIA,
  ROTULO_DA_SITUACAO_DA_VISTORIA,
  ROTULO_DO_GRUPO,
  ROTULO_DO_RESULTADO,
  SEM_LOCAL,
  aceitaRegistro,
  conferirLocalizacao,
  descreverLocal,
  exigeComentario,
  grupoDaVistoria,
  localDoAparelho,
  localManual,
  pendenciasDoEnvio,
  progressoDaVistoria,
  rotuloDaPrecisao,
  rotuloDoDiaDaVistoria,
} from './vistoria'
export type {
  GrupoDaVistoria,
  ItemDaVistoria,
  LocalDaFoto,
  MotivoDaPendencia,
  OrigemDoLocal,
  PendenciaDoEnvio,
  ProblemaDoLocal,
  ProgressoDaVistoria,
  ResultadoDoItem,
  SituacaoDaVistoria,
} from './vistoria'
export { CATALOGO_CONSEMA_250 } from './catalogo-consema-250'
export { CATALOGO_CONSEMA_251 } from './catalogo-consema-251'
export {
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_ESTUDO,
  ROTULO_DO_PORTE,
  SEMPRE_ESTADUAIS,
  atendeCondicao,
  buscarAtividades,
  concluirTriagem,
  definirCompetencia,
  descreverCondicao,
  enquadrarAtividade,
  lerNumeroDigitado,
  parametrosDaAtividade,
} from './triagem-licenciamento'
export type {
  AtividadeDeImpactoLocal,
  AtividadeLicenciavel,
  CatalogoDeAtividades,
  CatalogoDeImpactoLocal,
  Competencia,
  ConclusaoDaTriagem,
  CondicaoDePorte,
  EstudoAmbiental,
  FaixaDePorte,
  ItemDaTriagem,
  Medidas,
  Modalidade,
  NivelMunicipal,
  Porte,
  Potencial,
  ResultadoDoEnquadramento,
} from './triagem-licenciamento'
export {
  dentroDeSantaCatarina,
  formatarCoordenadas,
  lerCoordenadas,
  metrosQuadradosParaHectares,
} from './local-do-empreendimento'
export type { Coordenadas } from './local-do-empreendimento'
export {
  FONTE_DA_TAXA_IMA,
  INSTRUCAO_NORMATIVA_GERAL,
  TAXA_DA_AUA,
  TAXA_DA_AUA_SUINOCULTURA,
  calcularTaxaDoIma,
  informacoesDoIma,
  urlDaInstrucaoNormativa,
} from './taxa-do-ima'
export type { FaseDaLicenca, InformacoesDoIma, TaxaDoIma, ValorDaFase } from './taxa-do-ima'
export { DADOS_DO_SIMULADOR_IMA, INSTRUCOES_NORMATIVAS_IMA } from './dados-simulador-ima'
export type { DadosDoSimuladorIma, InstrucaoNormativaIma } from './dados-simulador-ima'

export {
  BLOCO_SEM_ITENS,
  CAMPOS_DO_MODELO,
  GRUPOS_DE_CAMPO,
  LIMITE_DO_CONTEUDO,
  LISTAS_DO_MODELO,
  camposUsados,
  ehChaveDaLista,
  documentoVazio,
  ehChaveDoCampo,
  marcadorSemValor,
  nomeDoArquivoDoRelatorio,
  preencherModelo,
  problemaDoConteudo,
  rotuloDoCampo,
  valoresDoRelatorio,
} from './modelo-documento'
export type {
  ChaveDaLista,
  ChaveDoCampo,
  DadosParaRelatorio,
  GrupoDeCampo,
  ItemDoBloco,
  ListasDoModelo,
  MarcaDoTexto,
  ModeloPreenchido,
  NoDoDocumento,
  ProblemaDoConteudo,
  ValoresDosCampos,
} from './modelo-documento'
export {
  arrumarNome,
  lerTitularDaLicenca,
  nomeDaUnidadeSugerido,
  titularEncontrado,
} from './titular-da-licenca'
export type { TitularDaLicenca } from './titular-da-licenca'

export { idsRenovados, rotuloDaSituacaoDoAlvara, situacaoDoAlvara } from './alvara'
export type { SituacaoDoAlvara } from './alvara'
export { OBJETO_INICIAL, objetoAindaAutomatico, objetoAutomatico } from './objeto-do-orcamento'

export {
  ESFERAS_DE_NORMA,
  ORGAOS_RECONHECIDOS,
  TIPOS_DE_NORMA,
  chaveDaNorma,
  lerIdentificadorDeNorma,
  lerTodosOsIdentificadores,
  normalizarNumeroDaNorma,
  tituloCurtoDaNorma,
} from './norma'
export type { DadosDaChaveDaNorma, EsferaNorma, IdentificadorDeNorma, TipoNorma } from './norma'
export { compararVersoes, dividirEmDispositivos } from './diferenca-de-norma'
export type { DiferencaDeNorma, Dispositivo, DispositivoAlterado } from './diferenca-de-norma'
export { classificarAto } from './classificar-ato'
export type { AcaoDoAto, ClassificacaoDoAto } from './classificar-ato'
export { avaliarAtoDoDiario } from './filtro-de-ato'
export type { AtoDoDiario, AvaliacaoDoAto, MotivoDoFiltro } from './filtro-de-ato'
export { MARCADOR_DE_CPF, contemCpf, removerCpf } from './sem-cpf'
export {
  HORIZONTES_DA_RENOVACAO,
  HORIZONTE_PADRAO_DA_RENOVACAO,
  dentroDoHorizonte,
  ehHorizonteDaRenovacao,
  fimDoHorizonte,
  objetoDaRenovacao,
  orgaoEhIma,
  taxaSugeridaDaRenovacao,
} from './renovacao-orcamento'
export type { AtividadeDaLicenca, HorizonteDaRenovacao } from './renovacao-orcamento'
export { afetaOEmpreendimento, rotuloDoMotivo } from './aplicabilidade'
export type {
  AtividadeDoPerfil,
  CriterioDeNorma,
  LicencaDoPerfil,
  MotivoDaAplicabilidade,
  NormaParaAplicar,
  PerfilDoEmpreendimento,
  ResultadoDaAplicabilidade,
  TipoDeCriterio,
} from './aplicabilidade'
export {
  ROTULO_DA_SITUACAO_DO_REQUISITO,
  requisitoPedeAtencao,
  situacaoDoRequisito,
} from './situacao-requisito'
export type { RequisitoParaSituacao, SituacaoDoRequisito } from './situacao-requisito'
export { agruparPendencias, linhasDaMatrizLegal } from './matriz-legal'
export type {
  LinhaDaMatriz,
  PendenciasDoEmpreendimento,
  RequisitoDaMatriz,
  RequisitoDoEmpreendimento,
} from './matriz-legal'
export { chavesCitadas, chavesDaCitacao } from './base-legal'
export { dobrarLinhaIcs, escaparTextoIcs, gerarIcs } from './ics'
export type { EventoIcs, OpcoesDoIcs } from './ics'
export {
  coresDasAreas,
  coresSemRepetir,
  hashEstavel,
  iniciaisDe,
  QUANTIDADE_DE_CORES,
} from './cores-por-categoria'
export { lerInscricaoImobiliaria } from './inscricao-imobiliaria'
export { ROTULO_DA_MUDANCA, linhaDaMudanca, pedeEmailNaHora } from './aviso-de-norma'
export type { MudancaNoResumo, TipoDeMudancaDeNorma } from './aviso-de-norma'
export {
  LICENCAS_DA_MODALIDADE,
  MODALIDADES,
  despesaDaTaxa,
  ehModalidade,
  nomeDosValoresDaModalidade,
  objetoDoOrcamentoDaTriagem,
} from './triagem-orcamento'
export type { DespesaDaTaxa, TaxaDaAtividade } from './triagem-orcamento'
export {
  horasDaExecucao,
  minutosDoLancamentoValidos,
  situacaoDaParcela,
  situacaoFinanceira,
} from './execucao-do-orcamento'
export type {
  HorasDaExecucao,
  HorasDoItem,
  ParcelaDaExecucao,
  SituacaoDaParcela,
  SituacaoFinanceira,
} from './execucao-do-orcamento'
export {
  PESOS_DO_RISCO,
  gravidadeDoRisco,
  motivosDoRisco,
  ordenarClientesEmRisco,
} from './painel-do-dono'
export type { ClienteEmRisco, ContagensDeRisco } from './painel-do-dono'
export {
  NOME_DO_RESUMO_PARA_O_CLIENTE,
  mesPorExtenso,
  modeloResumoParaOCliente,
  valoresDoRelatorioMensal,
} from './relatorio-mensal'
export type { DadosParaRelatorioMensal } from './relatorio-mensal'
