// Acesso pago (ADR-0058): quem pode abrir uma consultoria e em que condição ela nasce.
// Espelho puro de public.abrir_consultoria: o banco decide, isto documenta e testa a regra.
//
// - Durante o beta, abrir consultoria exige convite do beta (da lista de espera ou da Central),
//   de uso único e para o e-mail convidado. Operador da Central não precisa.
// - O beta grátis vale só para a consultoria aberta com convite durante o beta.
// - Um teste por pessoa e por CNPJ: quem já foi Gestão de outra consultoria (não interna), o e-mail
//   que já ganhou teste e o CNPJ que já ganhou teste nascem sem teste, precisando de plano.

import { cnpjValido } from './documento'

export type AcessoDaConsultoriaNova = 'beta' | 'teste' | 'sem_teste'

export type ErroDaConsultoriaNova =
  'cnpj_obrigatorio' | 'cnpj_invalido' | 'convite_do_beta_obrigatorio'

export interface EntradaDaConsultoriaNova {
  /** Data civil de hoje no fuso da plataforma (aaaa-mm-dd). */
  hoje: string
  /** Último dia do beta (aaaa-mm-dd). */
  fimDoBeta: string
  cnpj: string
  operador: boolean
  temConviteDoBeta: boolean
  jaFoiGestao: boolean
  emailJaUsouTeste: boolean
  cnpjJaUsouTeste: boolean
}

export type CondicaoDaConsultoriaNova =
  | { permitido: false; erro: ErroDaConsultoriaNova }
  | { permitido: true; acesso: AcessoDaConsultoriaNova; usaConvite: boolean }

export function emBeta(hoje: string, fimDoBeta: string): boolean {
  return hoje <= fimDoBeta
}

export function condicaoDaConsultoriaNova(e: EntradaDaConsultoriaNova): CondicaoDaConsultoriaNova {
  if (e.cnpj.trim() === '') return { permitido: false, erro: 'cnpj_obrigatorio' }
  if (!cnpjValido(e.cnpj)) return { permitido: false, erro: 'cnpj_invalido' }
  const beta = emBeta(e.hoje, e.fimDoBeta)
  if (e.operador) return { permitido: true, acesso: beta ? 'beta' : 'teste', usaConvite: false }
  if (beta && !e.temConviteDoBeta) return { permitido: false, erro: 'convite_do_beta_obrigatorio' }
  const usaConvite = beta
  if (e.jaFoiGestao || e.emailJaUsouTeste || e.cnpjJaUsouTeste) {
    return { permitido: true, acesso: 'sem_teste', usaConvite }
  }
  return { permitido: true, acesso: beta ? 'beta' : 'teste', usaConvite }
}
