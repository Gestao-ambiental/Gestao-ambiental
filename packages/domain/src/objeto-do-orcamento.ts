// "O que será orçado" sem pedir na criação (pedido do Eduardo, 20/11/2026). O banco exige o objeto;
// o Grama preenche sozinho com o modelo escolhido ou o primeiro serviço, e quem quiser muda na
// proposta. Depois de mudado à mão, o objeto não é mais trocado.

/** Objeto do rascunho recém-criado, antes de ter modelo ou serviço. */
export const OBJETO_INICIAL = 'Serviços ambientais'

/** Limite do objeto na proposta (o resto é cortado com reticências). */
const LIMITE = 200

function limpar(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim()
}

function cortar(texto: string): string {
  return texto.length <= LIMITE ? texto : `${texto.slice(0, LIMITE - 1).trimEnd()}…`
}

/** O objeto que o Grama sugere: o modelo aplicado, senão o primeiro serviço com nome. */
export function objetoAutomatico(entrada: {
  modelo?: string | null
  servicos: readonly string[]
}): string {
  const modelo = limpar(entrada.modelo)
  if (modelo) return cortar(modelo)
  const servico = entrada.servicos.map(limpar).find((s) => s !== '')
  return servico ? cortar(servico) : OBJETO_INICIAL
}

/**
 * O objeto salvo ainda é o automático? Sim quando é o inicial ou o primeiro serviço salvo. Um
 * objeto escrito à mão (ou o nome de um modelo, que só o próprio modelo põe) fica como está.
 */
export function objetoAindaAutomatico(objeto: string, servicosSalvos: readonly string[]): boolean {
  const atual = limpar(objeto)
  if (atual === '' || atual === OBJETO_INICIAL) return true
  const servico = servicosSalvos.map(limpar).find((s) => s !== '')
  return servico !== undefined && cortar(servico) === atual
}
