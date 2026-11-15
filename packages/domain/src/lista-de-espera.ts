// Lista de espera do site (ADR-0032). Mesma regra da RPC entrar_lista_de_espera: e-mail em
// minúsculas ou WhatsApp só com dígitos e DDI 55. Serve para a central mostrar e montar o link.

export type TipoDeContato = 'email' | 'whatsapp'

export interface ContatoNormalizado {
  tipo: TipoDeContato
  valor: string
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const WHATSAPP = /^55[1-9][0-9][0-9]{8,9}$/

/** Normaliza o contato digitado; devolve null quando não é e-mail nem celular brasileiro. */
export function normalizarContato(texto: string): ContatoNormalizado | null {
  const bruto = texto.trim()
  if (bruto.includes('@')) {
    const valor = bruto.toLowerCase()
    return valor.length <= 254 && EMAIL.test(valor) ? { tipo: 'email', valor } : null
  }
  let digitos = bruto.replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`
  return WHATSAPP.test(digitos) ? { tipo: 'whatsapp', valor: digitos } : null
}

/** "5547999991234" → "+55 (47) 99999-1234"; o e-mail volta como está. */
export function formatarContato(contato: ContatoNormalizado): string {
  if (contato.tipo === 'email') return contato.valor
  const ddd = contato.valor.slice(2, 4)
  const numero = contato.valor.slice(4)
  const corte = numero.length - 4
  return `+55 (${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}

/** Link para responder: mailto ou wa.me. */
export function linkDoContato(contato: ContatoNormalizado): string {
  return contato.tipo === 'email' ? `mailto:${contato.valor}` : `https://wa.me/${contato.valor}`
}

/**
 * Convite para o beta por WhatsApp (ADR-0034): wa.me com a mensagem pronta e o link de criar conta.
 */
export function linkDoConviteNoWhatsapp(
  numero: string,
  nome: string,
  linkDeCriarConta: string,
): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome
  const mensagem = `Olá, ${primeiroNome}! Aqui é do Grama. Você se inscreveu na lista de espera e o beta está aberto para você. Crie sua conta: ${linkDeCriarConta}`
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}
