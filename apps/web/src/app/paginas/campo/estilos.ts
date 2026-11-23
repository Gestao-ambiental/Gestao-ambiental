// Classes das telas de Campo: celular primeiro, com uma mão e ao sol. Controles nativos usam
// `@/components/ui/estilos-campo`; aqui só o que é próprio do campo.

/** Painel do quadro: folha com regra de 1px, sem sombra. */
export const classePainel = 'rounded-(--raio-painel) border bg-(--folha)'

// Os dois botões da barra têm a mesma altura, a de toque (44px), em qualquer largura: o campo é
// usado com uma mão. Antes o principal tinha 48px no celular, ao lado do secundário de 44px.

/** Botão secundário da barra de ação: divide a largura no celular, tamanho natural no desktop. */
export const classeAcaoSecundaria =
  'h-(--controle-toque) min-h-(--controle-toque) flex-1 md:min-w-32 md:flex-none'

/** Botão principal da barra de ação: o maior alvo, à direita (polegar). */
export const classeAcaoPrincipal =
  'h-(--controle-toque) min-h-(--controle-toque) flex-[2] md:min-w-48 md:flex-none'
