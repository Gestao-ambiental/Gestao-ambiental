import { Pagina } from './Pagina'

/** /entrar: só o layout público por enquanto. O formulário de login é do épico 2 (ACC-01). */
export function PaginaEntrar() {
  return (
    <Pagina titulo="Entrar">
      <p className="text-muted-foreground">O acesso com e-mail e senha será adicionado aqui.</p>
    </Pagina>
  )
}
