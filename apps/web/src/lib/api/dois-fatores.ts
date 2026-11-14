// Dois fatores (TOTP do Supabase Auth; ADR-0024). Obrigatório para a central administrativa,
// opcional para o resto. O segredo e o QR code só existem na tela de cadastro: nunca vão para log.

import { obterSupabase } from '@/lib/supabase'

export interface EstadoDoisFatores {
  /** A sessão atual já confirmou o segundo fator (aal2)? */
  sessaoConfirmada: boolean
  /** Fator TOTP verificado da conta; nulo quando a pessoa ainda não ativou. */
  fatorId: string | null
}

export interface NovoFator {
  fatorId: string
  /** Imagem do QR code pronta para <img src>. */
  qrCode: string
  /** Chave para digitar no aplicativo, se não der para ler o QR code. */
  segredo: string
}

/** O QR code vem como SVG; versões antigas do Auth já mandavam a URL data: pronta. */
function imagemDoQrCode(qrCode: string): string {
  return qrCode.startsWith('data:')
    ? qrCode
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`
}

export async function lerDoisFatores(): Promise<EstadoDoisFatores> {
  const { mfa } = obterSupabase().auth
  const [nivel, fatores] = await Promise.all([
    mfa.getAuthenticatorAssuranceLevel(),
    mfa.listFactors(),
  ])
  if (nivel.error) throw nivel.error
  if (fatores.error) throw fatores.error
  // `totp` só traz fatores verificados.
  const verificado = fatores.data.totp[0] ?? null
  return {
    sessaoConfirmada: nivel.data.currentLevel === 'aal2',
    fatorId: verificado?.id ?? null,
  }
}

/**
 * Começa o cadastro: descarta cadastros anteriores que ficaram pela metade (fator não verificado)
 * e cria um fator TOTP novo. Só vale depois de confirmar um código com `confirmarCodigo`.
 */
export async function iniciarCadastroDoisFatores(): Promise<NovoFator> {
  const { mfa } = obterSupabase().auth
  const lista = await mfa.listFactors()
  if (lista.error) throw lista.error
  for (const fator of lista.data.all) {
    if (fator.factor_type === 'totp' && fator.status === 'unverified') {
      const { error } = await mfa.unenroll({ factorId: fator.id })
      if (error) throw error
    }
  }
  const { data, error } = await mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return { fatorId: data.id, qrCode: imagemDoQrCode(data.totp.qr_code), segredo: data.totp.secret }
}

/** Confere o código de 6 dígitos do aplicativo. Deu certo: a sessão passa a aal2. */
export async function confirmarCodigo(fatorId: string, codigo: string): Promise<void> {
  const { error } = await obterSupabase().auth.mfa.challengeAndVerify({
    factorId: fatorId,
    code: codigo,
  })
  if (error) throw error
}

/** Remove o fator. O Auth exige sessão aal2 para isso (insufficient_aal se não). */
export async function removerDoisFatores(fatorId: string): Promise<void> {
  const { error } = await obterSupabase().auth.mfa.unenroll({ factorId: fatorId })
  if (error) throw error
}
