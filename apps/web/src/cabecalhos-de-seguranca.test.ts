// Cabeçalhos de segurança do vercel.json que afetam o que o app consegue fazer no navegador.

import { describe, expect, it } from 'vitest'

// ?raw do Vite: o app não tem tipos do Node, e assim o teste independe da pasta de onde roda.
import vercelJson from '../../../vercel.json?raw'

interface Configuracao {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const configuracao = JSON.parse(vercelJson) as Configuracao

function cabecalho(nome: string): string {
  const valor = configuracao.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key.toLowerCase() === nome.toLowerCase())?.value
  if (!valor) throw new Error(`${nome} ausente no vercel.json`)
  return valor
}

describe('Permissions-Policy', () => {
  it('deixa o próprio site usar a localização (GPS da vistoria em PaginaFoto)', () => {
    // Com geolocation=() o navegador recusa navigator.geolocation sem perguntar, e a vistoria
    // sempre cai em "localização negada" em produção.
    expect(cabecalho('Permissions-Policy')).toMatch(/geolocation=\(self\)/)
  })

  it('continua sem câmera e microfone por API: a foto usa o input de arquivo com capture', () => {
    expect(cabecalho('Permissions-Policy')).toMatch(/camera=\(\)/)
    expect(cabecalho('Permissions-Policy')).toMatch(/microphone=\(\)/)
  })
})
