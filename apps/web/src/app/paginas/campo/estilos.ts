// Classes das telas de Campo: celular primeiro, alvos de toque de 44px (WCAG 2.2, 2.5.8 com folga).

export const classeAlvo = 'h-11 min-h-11'

export const classeCampoBase =
  'w-full rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) px-(--e-2) corpo text-(--tinta) outline-none transicao-estado focus:border-b-(--campo-borda-ativa) focus:bg-(--campo-foco) disabled:cursor-not-allowed disabled:bg-(--off) disabled:text-(--tinta-off)'

export const classeAreaTexto = `${classeCampoBase} min-h-20 py-(--e-15)`

export const classeSelect = `${classeCampoBase} h-(--controle)`

export const classeCartao = 'rounded-(--raio-painel) border bg-(--folha)'
