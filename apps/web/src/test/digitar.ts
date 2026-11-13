// Digitação tecla a tecla, como uma pessoa, para os campos de reais com ponto de milhar.

import type { UserEvent } from '@testing-library/user-event'

/**
 * Digita `texto` no campo esperando um quadro de tela entre as teclas. Os campos de reais
 * (`reaisDigitados`) põem o ponto de milhar e acertam o cursor no quadro seguinte; o
 * `usuario.type` sem pausa digita mais rápido que um quadro e a tecla seguinte cai no lugar
 * errado, coisa que uma pessoa não consegue fazer.
 */
export async function digitarReais(
  usuario: UserEvent,
  campo: HTMLElement,
  texto: string,
): Promise<void> {
  await usuario.click(campo)
  for (const tecla of texto) {
    await usuario.keyboard(tecla)
    await new Promise<void>((resolver) => {
      requestAnimationFrame(() => {
        resolver()
      })
    })
  }
}
