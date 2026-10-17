import { EstadoErro } from '@/components/estados'

/** Erro inesperado ao montar uma rota: mensagem neutra e recarregar. Detalhe técnico fica no console. */
export function ErroDeRota() {
  return (
    <div className="p-4 md:p-6">
      <EstadoErro
        titulo="Algo deu errado nesta tela"
        aoTentarDeNovo={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
