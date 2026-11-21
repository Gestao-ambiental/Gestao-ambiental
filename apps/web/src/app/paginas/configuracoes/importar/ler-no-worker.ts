// Abre o Worker da leitura (ADR-0043) para um arquivo e devolve o resultado. Um Worker por
// arquivo, encerrado ao terminar: nada do arquivo fica na memória da tela além da tabela lida.
import type { ResultadoDaLeitura } from './ler-planilha'

export function lerArquivoNoWorker(arquivo: File): Promise<ResultadoDaLeitura> {
  return arquivo.arrayBuffer().then(
    (bytes) =>
      new Promise<ResultadoDaLeitura>((resolver) => {
        const trabalhador = new Worker(new URL('./ler-planilha.worker.ts', import.meta.url), {
          type: 'module',
        })
        const encerrar = (resultado: ResultadoDaLeitura) => {
          trabalhador.terminate()
          resolver(resultado)
        }
        trabalhador.onmessage = (evento: MessageEvent<ResultadoDaLeitura>) => {
          encerrar(evento.data)
        }
        trabalhador.onerror = () => {
          encerrar({ ok: false, erro: 'arquivo_ilegivel' })
        }
        trabalhador.postMessage({ bytes, nomeArquivo: arquivo.name }, [bytes])
      }),
  )
}
