// Classes únicas dos controles nativos (select, textarea, input avulso). Use estas em vez de copiar
// classes em cada tela: o visual do campo muda num lugar só.

/** Base de qualquer campo: contorno inteiro, foco com borda verde de 2px. */
const classeCampoNucleo =
  'rounded-(--raio) border border-(--campo-borda) bg-(--campo) px-(--e-3) corpo text-(--tinta) outline-none transicao-estado ' +
  'hover:border-(--tinta-3) focus:border-(--campo-borda-ativa) focus:shadow-[0_0_0_1px_var(--campo-borda-ativa)] ' +
  'disabled:cursor-not-allowed disabled:bg-(--off) disabled:text-(--tinta-off) ' +
  'aria-invalid:border-(--atraso) aria-invalid:focus:shadow-[0_0_0_1px_var(--atraso)]'

/** Base de qualquer campo, em largura total. */
export const classeCampoBase = `${classeCampoNucleo} w-full`

/** Campo de uma linha (input, select): 36px, 44 no celular. */
export const classeCampo = `${classeCampoBase} h-(--controle) max-md:h-(--controle-toque)`

/** Seleção nativa com largura do conteúdo (filtros). */
export const classeSelecao = `${classeCampoNucleo} h-(--controle) max-md:h-(--controle-toque) w-auto max-w-[240px] shrink-0 cursor-pointer pr-(--e-2)`

/** Área de texto. */
export const classeAreaTexto = `${classeCampoBase} min-h-24 py-(--e-2)`
