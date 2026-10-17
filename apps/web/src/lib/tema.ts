// Preferência de tema (ACC-06): claro, escuro ou do sistema. É apresentação, não regra de negócio.
// Guardada no navegador; com login (épico 2) a chave passa a incluir o usuário, para não mudar o
// tema de quem divide o aparelho. public/tema-inicial.js usa a mesma chave e os mesmos valores.

export type PreferenciaTema = 'claro' | 'escuro' | 'sistema'
export type TemaEfetivo = 'claro' | 'escuro'

export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ['claro', 'escuro', 'sistema']
const PADRAO: PreferenciaTema = 'sistema'

export function chaveTema(usuarioId?: string): string {
  return usuarioId ? `grama.tema:${usuarioId}` : 'grama.tema'
}

function ehPreferencia(valor: unknown): valor is PreferenciaTema {
  return typeof valor === 'string' && (PREFERENCIAS_TEMA as readonly string[]).includes(valor)
}

/** Lê a preferência salva. Valor ausente, inválido ou armazenamento bloqueado cai no padrão. */
export function lerPreferenciaTema(usuarioId?: string): PreferenciaTema {
  try {
    const salvo = window.localStorage.getItem(chaveTema(usuarioId))
    return ehPreferencia(salvo) ? salvo : PADRAO
  } catch {
    return PADRAO
  }
}

/** Salva a preferência. Se o navegador bloquear o armazenamento, vale só nesta sessão. */
export function salvarPreferenciaTema(preferencia: PreferenciaTema, usuarioId?: string): void {
  try {
    window.localStorage.setItem(chaveTema(usuarioId), preferencia)
  } catch {
    // sem armazenamento (janela privada, política do navegador): segue sem lembrar
  }
}

export function sistemaPrefereEscuro(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function resolverTema(preferencia: PreferenciaTema, prefereEscuro: boolean): TemaEfetivo {
  if (preferencia === 'sistema') return prefereEscuro ? 'escuro' : 'claro'
  return preferencia
}

export function aplicarTema(tema: TemaEfetivo): void {
  document.documentElement.classList.toggle('dark', tema === 'escuro')
}
