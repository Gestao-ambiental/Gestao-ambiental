// Tradução dos erros do banco (RPCs) e do Supabase Auth para mensagens de tela.
// As RPCs levantam códigos estáveis em `message` (ver a migration cria_acesso_e_equipe);
// o Auth informa `code` e `status`. Nunca mostramos texto técnico ao usuário.

const MENSAGENS_DO_BANCO: Record<string, string> = {
  sem_permissao: 'Você não tem permissão para esta ação.',
  nome_obrigatorio: 'Informe o nome',
  cnpj_invalido: 'CNPJ incompleto',
  cpf_invalido: 'CPF inválido',
  empreendimento_existente: 'Não foi possível salvar o empreendimento. Tente de novo.',
  unidade_existente: 'Não foi possível salvar a unidade. Tente de novo.',
  consultoria_existente: 'Não foi possível criar a consultoria. Tente de novo.',
  email_invalido: 'Informe um e-mail válido',
  papel_obrigatorio: 'Escolha o papel',
  ja_e_membro: 'Esta pessoa já faz parte da consultoria.',
  convite_pendente_existe: 'Já existe um convite pendente para este e-mail. Use “Reenviar”.',
  convite_invalido: 'Este convite já foi usado ou foi cancelado.',
  convite_indisponivel: 'Este convite já foi usado ou foi cancelado.',
  convite_expirado: 'Este convite expirou. Peça um novo à gestão.',
  convite_de_outra_conta: 'Este convite é para outro e-mail.',
  email_nao_confirmado: 'Confirme seu e-mail antes de aceitar o convite.',
  ultima_gestao: 'A consultoria precisa de pelo menos uma pessoa na Gestão.',
  membro_desligado: 'Esta pessoa foi desligada.',
  // Cadastro de licença (épico 4)
  conflito_de_versao:
    'Isto foi alterado em outro lugar depois que você abriu. Recarregue para ver a versão atual.',
  instrumento_ativo: 'Esta licença já está ativa: o cadastro não muda mais por aqui.',
  instrumento_existente: 'Não foi possível criar o rascunho. Tente de novo.',
  unidade_invalida: 'A unidade precisa ser deste empreendimento.',
  marco_sem_data: 'Preencha a data do marco escolhido.',
  data_futura: 'Emissão, assinatura e publicação não podem estar no futuro.',
  titulo_obrigatorio: 'Informe o título',
  natureza_obrigatoria: 'Escolha a natureza',
  agrupador_invalido: 'O subitem precisa ficar dentro de um agrupador.',
  agrupador_dentro_de_si: 'Um agrupador não pode ficar dentro dele mesmo.',
  agrupador_com_subitens:
    'Este agrupador tem subitens: mova ou descarte os subitens antes de mudar a natureza.',
  revisao_invalida: 'Revisão inválida.',
  natureza_sem_prazo: 'Só obrigação tem prazo.',
  recorrencia_obrigatoria: 'Escolha a recorrência.',
  contagem_indisponivel: 'Dias úteis ainda não estão disponíveis: use dias corridos.',
  primeira_data_obrigatoria: 'Informe a primeira data.',
  intervalo_invalido: 'Informe de quanto em quanto tempo (número inteiro maior que zero).',
  validade_obrigatoria: 'Confirme a validade no passo 2 antes de definir prazos periódicos.',
  primeira_data_apos_validade: 'A primeira data passa da validade da licença.',
  ocorrencias_demais: 'Mais de 1.200 entregas até a validade: confira o intervalo.',
  responsavel_invalido: 'O responsável precisa ser membro ativo da consultoria.',
  identificacao_incompleta: 'Falta tipo, marco ou validade na identificação (passo 2).',
  sem_condicionantes: 'Cadastre ao menos uma condicionante (passo 3).',
  condicionante_pendente: 'Há condicionantes para revisar (passo 3).',
  prazo_pendente: 'Há prazos pendentes de confirmação (passo 4).',
  chave_obrigatoria: 'Não foi possível ativar. Tente de novo.',
  caminho_invalido: 'Não foi possível anexar o PDF. Tente de novo.',
  arquivo_nao_encontrado: 'O PDF não chegou ao armazenamento. Envie de novo.',
  arquivo_nao_pdf: 'Este arquivo não é um PDF.',
  arquivo_grande_demais: 'O PDF passa de 25 MB.',
  versao_existente: 'Não foi possível anexar o PDF. Tente de novo.',
  versao_congelada: 'Esta condicionante já gerou entregas e não muda por aqui.',
  // Execução da ocorrência (épico 6)
  etapa_existente: 'Não foi possível salvar a etapa. Tente de novo.',
  evidencia_existente: 'Não foi possível enviar a evidência. Tente de novo.',
  aguardando_conferencia: 'Já há uma evidência aguardando conferência.',
  data_execucao_obrigatoria: 'Informe a data real de execução',
  data_execucao_futura: 'A data real de execução não pode estar no futuro',
  arquivo_tipo_invalido: 'Envie PDF, PNG ou JPEG.',
  ocorrencia_concluida: 'Ocorrência concluída. Para mudar algo, reabra com motivo.',
  ocorrencia_nao_concluida: 'Esta ocorrência não está concluída.',
  conferencia_independente:
    'Quem enviou a evidência não pode conferi-la. Outra pessoa precisa conferir.',
  evidencia_ja_conferida: 'Esta evidência já foi conferida. Recarregue para ver a decisão.',
  decisao_obrigatoria: 'Escolha aprovar ou devolver.',
  motivo_obrigatorio: 'Informe o motivo',
  evidencia_nao_aprovada: 'A evidência precisa estar aprovada para concluir.',
  justificativa_obrigatoria: 'Informe a justificativa',
  // Renovação de LAO (épico 7)
  antecedencia_invalida: 'Use um número inteiro de 0 ou mais.',
  plano_protocolado: 'A renovação já foi protocolada: o plano não muda mais.',
  numero_obrigatorio: 'Informe o número do protocolo',
  data_protocolo_obrigatoria: 'Informe a data do protocolo',
  data_protocolo_futura: 'A data do protocolo não pode estar no futuro',
  comprovante_obrigatorio: 'Anexe o comprovante',
  plano_nao_protocolado: 'O acompanhamento do órgão começa depois do protocolo.',
  // Extração por IA (épico 9)
  pdf_obrigatorio: 'Anexe o PDF da licença para a IA ler.',
  condicionantes_existentes:
    'Este rascunho já tem condicionantes: a IA só preenche rascunho sem itens. Siga pelo manual.',
  extracao_em_andamento: 'Já há uma extração em andamento para este rascunho. Aguarde.',
  ia_fora_do_plano:
    'A extração por IA não faz parte do plano desta consultoria. Siga pelo cadastro manual.',
  cargo_longo_demais: 'O cargo pode ter até 80 caracteres.',
  // Orçamentos (onda 5)
  orcamento_existente: 'Não foi possível criar o orçamento. Tente de novo.',
  objeto_obrigatorio: 'Diga o que está sendo orçado.',
  empreendimento_invalido: 'Escolha um empreendimento desta consultoria.',
  orcamento_nao_editavel:
    'Proposta enviada não é editada no lugar. Mudanças viram uma nova revisão.',
  orcamento_na_lixeira: 'Este orçamento está na lixeira. Restaure para editar.',
  texto_longo_demais: 'Texto longo demais. Encurte e tente de novo.',
  horas_pendentes: 'Informe as horas de todos os serviços antes de enviar ou aprovar.',
  preco_pendente:
    'O preço ainda tem pendência (preço do serviço, quantidade ou despesa a cotar). Resolva antes de enviar ou aprovar.',
  sem_itens: 'Inclua ao menos um serviço antes de enviar ou aprovar.',
  transicao_invalida: 'Essa mudança de situação não é permitida a partir da situação atual.',
  identidade_nao_salva: 'Salve os dados da consultoria antes de enviar a logo.',
  modelo_com_mesmo_nome: 'Já existe um modelo com esse nome. Escolha outro nome.',
  modelo_sem_itens: 'Salve ao menos um serviço antes de guardar como modelo.',
  nome_invalido: 'Informe um nome de até 120 caracteres.',
  orcamento_aprovado_nao_exclui:
    'Orçamento aprovado não vai para a lixeira: ele vira contrato, cobrança e tarefas.',
  validade_invalida: 'Validade: um número de 1 a 365 dias.',
  textos_demais: 'Use até 50 premissas e 50 exclusões.',
  lista_invalida: 'Não foi possível salvar o orçamento. Tente de novo.',
  parcelas_demais: 'Use até 60 parcelas.',
  item_invalido: 'Confira os itens: serviço, horas e valores.',
  equipe_invalida:
    'Confira a equipe: cada pessoa uma vez, membro ativo da consultoria, custo mensal e horas de 0 a 744.',
  equipe_sem_horas_faturaveis: 'A equipe precisa de horas no mês: informe as horas de cada pessoa.',
  despesa_invalida: 'Confira as despesas: descrição, valor e como é paga.',
  parcela_invalida: 'Confira as parcelas: marco, dias de 0 a 365 e percentual de 0 a 100.',
  base_invalida: 'Confira os valores: horas faturáveis precisam ser maiores que zero.',
  percentuais_invalidos: 'Margem, tributos e taxas somados precisam ficar abaixo de 100%.',
  // Primeiros passos do orçamento (ADR-0020)
  dados_invalidos: 'Confira os campos deste passo e tente de novo.',
  base_alterada:
    'Custos e taxas foram salvos por outra pessoa depois que esta configuração começou. Para não sobrescrever, recomece a partir dos valores atuais.',
  configuracao_incompleta: 'Ainda falta configurar algum passo. Veja a lista e complete antes.',
  operacao_invalida: 'Não foi possível salvar este passo. Recarregue e tente de novo.',
  contas_invalidas: 'Confira as contas do mês: nome e valor de cada uma.',
  profissao_invalida: 'Escolha a profissão na lista.',
  profissao_nao_pode_ficar_vazia: 'A profissão não pode ficar em branco. Escolha outra.',
  profissao_principal_obrigatoria: 'Escolha a formação principal antes das outras.',
  formacoes_demais: 'Informe no máximo 10 outras formações.',
  cargo_invalido: 'Escolha o cargo na lista.',
  genero_invalido: 'Escolha o gênero.',
  horas_de_venda_invalidas:
    'Confira a tabela de preços: profissão, serviço, unidade, preço e faixas de cada linha.',
  deslocamento_invalido:
    'Confira a visita técnica: consumo do carro e preço do combustível vão juntos (ou os dois em branco).',
  // Central administrativa (ADM-01)
  situacao_obrigatoria: 'Escolha a situação nova.',
  mesma_situacao: 'A consultoria já está nesta situação.',
  consultoria_inexistente: 'Esta consultoria não existe mais.',
  chave_reutilizada: 'Não foi possível mudar a situação. Feche e tente de novo.',
  // Central administrativa, fase 2 (ADR-0024)
  dois_fatores_necessarios: 'Confirme o código do aplicativo autenticador para continuar.',
  modulo_invalido: 'Não foi possível concluir. Tente de novo.',
  // Acesso de suporte (ADR-0025)
  acesso_de_suporte_somente_leitura: 'Acesso de suporte é somente leitura.',
  duracao_invalida: 'Escolha 2, 24 ou 48 horas.',
  autorizacao_ativa:
    'Já há um acesso do suporte autorizado. Encerre esse acesso antes de autorizar outro.',
  sem_autorizacao_de_suporte: 'Esta consultoria não tem acesso de suporte valendo.',
  suporte_em_consultoria_propria:
    'Você faz parte desta consultoria: entre por ela, sem acesso de suporte.',
  categoria_obrigatoria: 'Escolha a categoria',
  acesso_de_suporte_ativo:
    'Já há acesso de suporte valendo nesta consultoria. Use “Entrar como suporte”.',
  sem_acesso_de_emergencia: 'Não há acesso de emergência valendo.',
  // Planos e cobrança (ADR-0026)
  consultoria_somente_leitura: 'Somente leitura até o pagamento: ninguém cria nem edita.',
  orcamentos_fora_do_plano: 'Orçamentos fazem parte dos planos Equipe e Escala.',
  adicional_nao_confirmado: 'Isso passa do limite do plano. Confirme o valor adicional antes.',
  recurso_invalido: 'Não foi possível concluir. Tente de novo.',
  dias_de_teste_invalidos: 'Use de 0 a 365 dias úteis.',
  valor_obrigatorio: 'Escolha marcar ou desmarcar.',
  grupo_invalido: 'Não foi possível concluir. Tente de novo.',
  // Planos e parâmetros pela central
  valores_invalidos:
    'Confira os valores: preço, pessoas e empreendimentos acima de zero; anual de 1 a 12 mensalidades.',
  plano_inexistente: 'Este plano não existe.',
  // Lista de espera (ADR-0034)
  cadastro_inexistente: 'Este cadastro não está mais na lista de espera.',
  catalogo_incompleto: 'Não foi possível carregar os planos. Tente de novo.',
  // Resíduos, fase 1 (MTR e CDF)
  numero_documento_obrigatorio: 'Informe o número',
  emissao_obrigatoria: 'Informe a data de emissão',
  emissao_futura: 'A data de emissão não pode estar no futuro',
  situacao_invalida: 'Escolha a situação do MTR',
  transportador_obrigatorio: 'Informe o transportador',
  destinador_obrigatorio: 'Informe o destinador',
  numero_existente: 'Já existe um MTR com este número.',
  itens_obrigatorios: 'Inclua ao menos um resíduo',
  itens_demais: 'Use até 100 resíduos por MTR.',
  residuo_obrigatorio: 'Informe o código e a descrição do resíduo',
  unidade_de_residuo_invalida: 'Escolha a unidade',
  quantidade_invalida: 'Use uma quantidade maior que zero, com até 4 casas decimais.',
  item_existente: 'Não foi possível salvar os resíduos. Tente de novo.',
  mtr_existente: 'Não foi possível salvar o MTR. Tente de novo.',
  cdf_existente: 'Não foi possível salvar o CDF. Tente de novo.',
  registro_excluido: 'Este registro foi excluído.',
  item_ligado_a_cdf: 'Este resíduo está num CDF: tire-o do CDF antes de removê-lo do MTR.',
  mtr_com_cdf: 'Este MTR está num CDF: exclua ou edite o CDF antes.',
  periodo_invalido: 'Confira o período: o início vem antes do fim.',
  mtr_invalido: 'Um dos MTRs não é deste empreendimento ou foi excluído.',
  mtrs_demais: 'Use até 500 MTRs por CDF.',
  item_do_mtr_invalido: 'Um dos resíduos não é do MTR escolhido.',
  quantidade_sem_unidade: 'Informe a quantidade junto com a unidade',
  entidade_invalida: 'Não foi possível anexar o PDF. Tente de novo.',
  tipo_de_obrigacao_invalido: 'Obrigação inválida.',
  // Vistoria móvel (ADR-0033)
  vistoria_existente: 'Não foi possível agendar a vistoria. Tente de novo.',
  vistoria_nao_iniciada: 'Comece a vistoria antes de registrar.',
  vistoria_fechada: 'Esta vistoria não aceita mais registros. Recarregue para ver a situação.',
  itens_pendentes: 'Há itens sem resultado ou sem comentário.',
  comentario_obrigatorio: 'Informe o comentário',
  vistoria_ja_conferida: 'Esta vistoria já foi conferida. Recarregue para ver a decisão.',
  vistoria_nao_enviada: 'Esta vistoria não está aguardando conferência.',
  foto_existente: 'Não foi possível vincular a foto. Tente de novo.',
  arquivo_ja_vinculado: 'Esta foto já foi vinculada.',
  titulo_longo_demais: 'Use até 120 caracteres no título.',
  objetivo_longo_demais: 'Use até 1.000 caracteres no objetivo.',
  responsavel_obrigatorio: 'Escolha o responsável',
  data_obrigatoria: 'Informe a data',
  item_titulo_obrigatorio: 'Informe o título de cada item',
  item_longo_demais: 'Item: título até 120 e descrição até 300 caracteres.',
  resultado_obrigatorio: 'Escolha o resultado',
  comentario_longo_demais: 'Use até 1.000 caracteres no comentário.',
  observacao_longa_demais: 'Use até 2.000 caracteres na observação.',
  arquivo_invalido: 'Não foi possível ler o arquivo. Tente de novo.',
  captura_obrigatoria: 'Não foi possível ler a hora da foto. Tire de novo.',
  captura_no_futuro: 'A hora da foto está no futuro. Confira o relógio do aparelho.',
  legenda_longa_demais: 'Use até 200 caracteres na legenda.',
  local_invalido: 'Confira a localização da foto.',
}

// Códigos que a vistoria (ADR-0033) reaproveita com outro sentido: a tela de Campo usa estas
// mensagens no lugar das gerais (que falam de PDF, resíduo ou acesso de suporte).
const MENSAGENS_DA_VISTORIA: Record<string, string> = {
  duracao_invalida: 'Duração: de 5 a 1.440 minutos.',
  itens_obrigatorios: 'Inclua ao menos um item no checklist.',
  itens_demais: 'Use até 50 itens no checklist.',
  caminho_invalido: 'Não foi possível vincular a foto. Tente de novo.',
  arquivo_nao_encontrado: 'A foto não chegou ao armazenamento. Tente de novo.',
  arquivo_tipo_invalido: 'Envie a foto em JPEG ou PNG.',
  arquivo_grande_demais: 'A foto passa de 25 MB.',
  conferencia_independente:
    'Quem enviou a vistoria não pode conferi-la. Outra pessoa precisa conferir.',
}

const MENSAGENS_DO_AUTH: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Use pelo menos 8 caracteres',
  same_password: 'Use uma senha diferente da atual.',
  otp_expired: 'Este link expirou ou já foi usado.',
  // Dois fatores (ADR-0024)
  mfa_verification_failed: 'Código incorreto. Confira o aplicativo e tente de novo.',
  mfa_verification_rejected: 'Código incorreto. Confira o aplicativo e tente de novo.',
  mfa_challenge_expired: 'O código expirou. Digite o código novo do aplicativo.',
  mfa_factor_not_found: 'Os dois fatores desta conta mudaram. Recarregue a página.',
  insufficient_aal: 'Confirme o código do aplicativo autenticador para continuar.',
  mfa_totp_enroll_not_enabled: 'Dois fatores indisponíveis no momento. Tente mais tarde.',
  mfa_totp_verify_not_enabled: 'Dois fatores indisponíveis no momento. Tente mais tarde.',
  mfa_factor_name_conflict: 'Não foi possível ativar. Recarregue a página e tente de novo.',
}

export const MENSAGEM_MUITAS_TENTATIVAS =
  'Muitas tentativas seguidas. Tente de novo em alguns minutos.'

const MENSAGEM_PADRAO = 'Não foi possível concluir. Verifique a conexão e tente de novo.'

interface ErroComCodigo {
  code?: unknown
  message?: unknown
  status?: unknown
}

function comoObjeto(erro: unknown): ErroComCodigo {
  return typeof erro === 'object' && erro !== null ? erro : {}
}

/** Código estável do erro: a mensagem da RPC ou o `code` do Auth. */
export function codigoDoErro(erro: unknown): string | undefined {
  const { code, message } = comoObjeto(erro)
  if (typeof message === 'string' && message in MENSAGENS_DO_BANCO) return message
  if (typeof code === 'string' && code in MENSAGENS_DO_AUTH) return code
  return undefined
}

/** O Auth recusou por limite de tentativas (rate limit nativo do Supabase, por IP). */
export function ehMuitasTentativas(erro: unknown): boolean {
  const { code, status } = comoObjeto(erro)
  return (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'too_many_requests'
  )
}

/** Mensagem de qualquer escrita recusada enquanto o operador navega como suporte. */
export const MENSAGEM_SUPORTE_SOMENTE_LEITURA = 'Acesso de suporte é somente leitura.'

// Modo suporte (ADR-0025): ligado por RequerConsultoria enquanto o operador navega uma consultoria
// como suporte. Algumas RPCs de escrita recusam antes de gravar, com sem_permissao (exigem autor);
// as demais chegam à barreira do banco (acesso_de_suporte_somente_leitura). Em modo suporte as duas
// viram a mesma mensagem. É só apresentação: quem recusa é o banco.
let modoSuporte = false

export function definirModoSuporte(ligado: boolean): void {
  modoSuporte = ligado
}

export function mensagemDoErro(erro: unknown, padrao = MENSAGEM_PADRAO): string {
  if (ehMuitasTentativas(erro)) return MENSAGEM_MUITAS_TENTATIVAS
  if (modoSuporte && ehSemPermissao(erro)) return MENSAGEM_SUPORTE_SOMENTE_LEITURA
  const codigo = codigoDoErro(erro)
  if (!codigo) return padrao
  return MENSAGENS_DO_BANCO[codigo] ?? MENSAGENS_DO_AUTH[codigo] ?? padrao
}

/** Como mensagemDoErro, com as mensagens próprias da vistoria para os códigos reaproveitados. */
export function mensagemDoErroDaVistoria(erro: unknown, padrao = MENSAGEM_PADRAO): string {
  const { message } = comoObjeto(erro)
  if (typeof message === 'string' && Object.hasOwn(MENSAGENS_DA_VISTORIA, message))
    return MENSAGENS_DA_VISTORIA[message] ?? padrao
  return mensagemDoErro(erro, padrao)
}

/**
 * A central recusou porque a sessão ainda não confirmou o segundo fator (aal1). Usa o mesmo código
 * 42501 de permissão, mas a tela pede o código em vez de mostrar "sem permissão" (ADR-0024).
 */
export function ehDoisFatoresNecessarios(erro: unknown): boolean {
  return comoObjeto(erro).message === 'dois_fatores_necessarios'
}

/** Erro de permissão do servidor (RLS ou RPC): a tela mostra "sem permissão", não "erro". */
export function ehSemPermissao(erro: unknown): boolean {
  if (ehDoisFatoresNecessarios(erro)) return false
  const { code, message } = comoObjeto(erro)
  // Só leitura por atraso e orçamento ou IA fora do plano usam 42501, mas têm mensagem própria
  // (ADR-0026).
  if (
    message === 'consultoria_somente_leitura' ||
    message === 'orcamentos_fora_do_plano' ||
    message === 'ia_fora_do_plano'
  )
    return false
  return code === '42501' || message === 'sem_permissao'
}
