// Classes das telas de Campo: celular primeiro, com uma mão e ao sol. Controles nativos usam
// `@/components/ui/estilos-campo`; aqui só o que é próprio do campo.

/** Painel do quadro: folha com regra de 1px, sem sombra. */
export const classePainel = 'rounded-(--raio-painel) border bg-(--folha)'

/** Botão secundário da barra de ação: divide a largura no celular, tamanho natural no desktop. */
export const classeAcaoSecundaria = 'h-11 min-h-11 flex-1 md:min-w-32 md:flex-none'

/** Botão principal da barra de ação: o maior alvo, à direita (polegar). */
export const classeAcaoPrincipal =
  'h-12 min-h-12 flex-[2] md:h-11 md:min-h-11 md:min-w-48 md:flex-none'
