// Classes das telas de Campo: celular primeiro, alvos de toque de 44px (WCAG 2.2, 2.5.8 com folga).

export const classeAlvo = 'h-11 min-h-11'

export const classeCampoBase =
  'w-full rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none transicao-estado focus:border-b-(--border-input-active) focus:bg-(--surface-input-focus) disabled:cursor-not-allowed disabled:bg-(--surface-disabled) disabled:text-(--text-disabled)'

export const classeAreaTexto = `${classeCampoBase} min-h-20 py-(--space-075)`

export const classeSelect = `${classeCampoBase} h-(--size-control)`

export const classeCartao = 'rounded-(--radius-large) border bg-(--surface)'
