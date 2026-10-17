import type { RouteObject } from 'react-router'

import { AppShell } from './layout/AppShell'
import { LayoutPublico } from './layout/LayoutPublico'
import { ErroDeRota } from './paginas/ErroDeRota'
import { PaginaEntrar } from './paginas/PaginaEntrar'
import {
  PaginaAcompanhamentos,
  PaginaCalendario,
  PaginaEmpreendimentos,
  PaginaEquipe,
  PaginaNaoEncontrada,
  PaginaVisaoEquipe,
} from './paginas/paginas'

/** Rotas do app. A proteção por login entra no épico 2; hoje todas abrem o shell. */
export const rotas: RouteObject[] = [
  {
    element: <LayoutPublico />,
    errorElement: <ErroDeRota />,
    children: [{ path: '/entrar', element: <PaginaEntrar /> }],
  },
  {
    element: <AppShell />,
    errorElement: <ErroDeRota />,
    children: [
      { index: true, element: <PaginaVisaoEquipe /> },
      { path: 'calendario', element: <PaginaCalendario /> },
      { path: 'empreendimentos', element: <PaginaEmpreendimentos /> },
      { path: 'acompanhamentos', element: <PaginaAcompanhamentos /> },
      { path: 'configuracoes/equipe', element: <PaginaEquipe /> },
      { path: '*', element: <PaginaNaoEncontrada /> },
    ],
  },
]
