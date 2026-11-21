// Web Worker da importação (ADR-0043): só embrulha lerPlanilha, para a leitura do arquivo (e o
// SheetJS) rodar fora da tela. Recebe { bytes, nomeArquivo } e devolve o ResultadoDaLeitura.
import { lerPlanilha, type ResultadoDaLeitura } from './ler-planilha'

interface Pedido {
  bytes: ArrayBuffer
  nomeArquivo: string
}

// O app compila com os tipos do DOM (janela); aqui o escopo é o do Worker.
const escopo = self as unknown as {
  onmessage: ((evento: MessageEvent<Pedido>) => void) | null
  postMessage: (mensagem: ResultadoDaLeitura) => void
}

escopo.onmessage = (evento) => {
  void lerPlanilha(evento.data.bytes, evento.data.nomeArquivo)
    .catch((): ResultadoDaLeitura => ({ ok: false, erro: 'arquivo_ilegivel' }))
    .then((resultado) => {
      escopo.postMessage(resultado)
    })
}
