// Tradução dos erros do banco (RPCs) e do Supabase Auth para mensagens de tela.
// As RPCs levantam códigos estáveis em `message` (ver a migration cria_acesso_e_equipe);
// o Auth informa `code` e `status`. Nunca mostramos texto técnico ao usuário.

const MENSAGENS_DO_BANCO: Record<string, string> = {
  sem_permissao: 'Você não tem permissão para esta ação.',
  nome_obrigatorio: 'Informe o nome',
  cnpj_invalido: 'CNPJ incompleto',
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
    'Este rascunho foi salvo em outro lugar depois que você abriu. Recarregue para ver a versão atual.',
  instrumento_ativo: 'Esta licença já está ativa: o cadastro não muda mais por aqui.',
  instrumento_existente: 'Não foi possível criar o rascunho. Tente de novo.',
  unidade_invalida: 'A unidade precisa ser deste empreendimento.',
  marco_sem_data: 'Preencha a data do marco escolhido.',
  titulo_obrigatorio: 'Informe o título',
  natureza_obrigatoria: 'Escolha a natureza',
  agrupador_invalido: 'O subitem precisa ficar dentro de um agrupador.',
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
}

const MENSAGENS_DO_AUTH: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Use pelo menos 8 caracteres',
  same_password: 'Use uma senha diferente da atual.',
  otp_expired: 'Este link expirou ou já foi usado.',
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

export function mensagemDoErro(erro: unknown, padrao = MENSAGEM_PADRAO): string {
  if (ehMuitasTentativas(erro)) return MENSAGEM_MUITAS_TENTATIVAS
  const codigo = codigoDoErro(erro)
  if (!codigo) return padrao
  return MENSAGENS_DO_BANCO[codigo] ?? MENSAGENS_DO_AUTH[codigo] ?? padrao
}

/** Erro de permissão do servidor (RLS ou RPC): a tela mostra "sem permissão", não "erro". */
export function ehSemPermissao(erro: unknown): boolean {
  const { code, message } = comoObjeto(erro)
  return code === '42501' || message === 'sem_permissao'
}
