import { Link } from 'react-router'

import { EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'

import { Pagina } from './Pagina'

// Páginas sem conteúdo próprio.

export function PaginaNaoEncontrada() {
  return (
    <Pagina titulo="Página não encontrada">
      <EstadoVazio
        icone="search"
        titulo="Este endereço não existe"
        descricao="Confira o link ou volte para a Visão da equipe."
        acaoPrincipal={
          <Botao aparencia="primario" asChild>
            <Link to="/">Ir para a Visão da equipe</Link>
          </Botao>
        }
      />
    </Pagina>
  )
}
