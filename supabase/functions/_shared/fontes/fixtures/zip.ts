// ZIP montado à mão para os testes do INLABS (sem pacote externo): entradas guardadas (método 0)
// ou com deflate (método 8, pelo CompressionStream nativo).

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface Entrada {
  nome: Uint8Array
  dados: Uint8Array
  original: Uint8Array
  metodo: 0 | 8
}

function montar(entradas: Entrada[]): Uint8Array<ArrayBuffer> {
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let deslocamento = 0
  for (const e of entradas) {
    const local = new Uint8Array(30 + e.nome.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(8, e.metodo, true)
    v.setUint32(14, crc32(e.original), true)
    v.setUint32(18, e.dados.length, true)
    v.setUint32(22, e.original.length, true)
    v.setUint16(26, e.nome.length, true)
    local.set(e.nome, 30)
    const cd = new Uint8Array(46 + e.nome.length)
    const c = new DataView(cd.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(10, e.metodo, true)
    c.setUint32(16, crc32(e.original), true)
    c.setUint32(20, e.dados.length, true)
    c.setUint32(24, e.original.length, true)
    c.setUint16(28, e.nome.length, true)
    c.setUint32(42, deslocamento, true)
    cd.set(e.nome, 46)
    partes.push(local, e.dados)
    central.push(cd)
    deslocamento += local.length + e.dados.length
  }
  const tamanhoCentral = central.reduce((soma, p) => soma + p.length, 0)
  const fim = new Uint8Array(22)
  const f = new DataView(fim.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, entradas.length, true)
  f.setUint16(10, entradas.length, true)
  f.setUint32(12, tamanhoCentral, true)
  f.setUint32(16, deslocamento, true)
  const todas = [...partes, ...central, fim]
  const saida = new Uint8Array(todas.reduce((soma, p) => soma + p.length, 0))
  let i = 0
  for (const p of todas) {
    saida.set(p, i)
    i += p.length
  }
  return saida
}

export function zipGuardado(arquivos: Record<string, string>): Uint8Array<ArrayBuffer> {
  const codificar = new TextEncoder()
  return montar(
    Object.entries(arquivos).map(([nome, texto]) => {
      const dados = codificar.encode(texto)
      return { nome: codificar.encode(nome), dados, original: dados, metodo: 0 }
    }),
  )
}

export async function zipComDeflate(
  arquivos: Record<string, string>,
): Promise<Uint8Array<ArrayBuffer>> {
  const codificar = new TextEncoder()
  const entradas: Entrada[] = []
  for (const [nome, texto] of Object.entries(arquivos)) {
    const original = codificar.encode(texto)
    const fluxo = new Blob([original]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const dados = new Uint8Array(await new Response(fluxo).arrayBuffer())
    entradas.push({ nome: codificar.encode(nome), dados, original, metodo: 8 })
  }
  return montar(entradas)
}
