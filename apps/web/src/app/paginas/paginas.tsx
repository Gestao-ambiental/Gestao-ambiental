import { Link } from 'react-router'

import { EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'

import { Pagina } from './Pagina'

// Páginas dos épicos 2 a 9, por enquanto só com o estado vazio.

export function PaginaVisaoEquipe() {
  return (
    <Pagina titulo="Visão da equipe">
      <EstadoVazio
        icone="list"
        titulo="Nenhum prazo para mostrar"
        descricao="Quando a consultoria tiver licenças com condicionantes ativas, os prazos da equipe aparecem aqui."
      />
    </Pagina>
  )
}

export function PaginaCalendario() {
  return (
    <Pagina titulo="Calendário">
      <EstadoVazio
        icone="calendar"
        titulo="Calendário vazio"
        descricao="As entregas e os limites de protocolo aparecem aqui, dia a dia."
      />
    </Pagina>
  )
}

export function PaginaAcompanhamentos() {
  return (
    <Pagina titulo="Acompanhamentos">
      <EstadoVazio
        icone="inbox"
        titulo="Nada para acompanhar"
        descricao="Conferências pendentes e renovações em andamento aparecem aqui."
      />
    </Pagina>
  )
}

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
