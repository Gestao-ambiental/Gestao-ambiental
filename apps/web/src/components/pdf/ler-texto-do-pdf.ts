// Texto de um PDF escolhido no navegador (pdf.js, sem executar scripts do documento). Serve para
// ler o titular da licença antes de existir rascunho; o arquivo não sai do computador aqui.

/** Páginas lidas: o titular fica no começo da licença. */
const PAGINAS_LIDAS = 3

export async function lerTextoDoPdf(arquivo: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const dados = new Uint8Array(await arquivo.arrayBuffer())
  const tarefa = pdfjs.getDocument({ data: dados, enableXfa: false })
  const documento = await tarefa.promise
  try {
    const paginas: string[] = []
    for (let numero = 1; numero <= Math.min(documento.numPages, PAGINAS_LIDAS); numero++) {
      const conteudo = await (await documento.getPage(numero)).getTextContent()
      paginas.push(
        conteudo.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join(''),
      )
    }
    return paginas.join('\n')
  } finally {
    void tarefa.destroy()
  }
}
