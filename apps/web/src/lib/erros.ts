// Tradução dos erros do banco (RPCs) e do Supabase Auth para mensagens de tela.
// As RPCs levantam códigos estáveis em `message` (ver a migration cria_acesso_e_equipe);
// o Auth informa `code` e `status`. Nunca mostramos texto técnico ao usuário.

const MENSAGENS_DO_BANCO: Record<string, string> = {
  sem_permissao: 'Você não tem permissão para esta ação.',
  nome_obrigatorio: 'Informe o nome da consultoria',
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
