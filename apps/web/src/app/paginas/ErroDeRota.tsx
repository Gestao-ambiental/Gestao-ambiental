import { EstadoErro } from '@/components/estados'

/** Erro inesperado ao montar uma rota: mensagem neutra e recarregar. Detalhe técnico fica no console. */
export function ErroDeRota() {
  return (
    <div className="p-(--e-4) md:p-(--e-6)">
      <EstadoErro
        titulo="Algo deu errado nesta tela"
        aoTentarDeNovo={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
