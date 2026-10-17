import type { RouteObject } from 'react-router'

import { RequerConsultoria } from './consultoria/RequerConsultoria'
import { AppShell } from './layout/AppShell'
import { LayoutPublico } from './layout/LayoutPublico'
import { PaginaConvite } from './paginas/acesso/PaginaConvite'
import { PaginaCriarConsultoria } from './paginas/acesso/PaginaCriarConsultoria'
import { PaginaCriarConta } from './paginas/acesso/PaginaCriarConta'
import { PaginaEntrar } from './paginas/acesso/PaginaEntrar'
import { PaginaEscolherConsultoria } from './paginas/acesso/PaginaEscolherConsultoria'
import { PaginaRecuperarSenha } from './paginas/acesso/PaginaRecuperarSenha'
import { PaginaRedefinirSenha } from './paginas/acesso/PaginaRedefinirSenha'
import { PaginaEmpreendimento } from './paginas/empreendimentos/PaginaEmpreendimento'
import { PaginaEmpreendimentos } from './paginas/empreendimentos/PaginaEmpreendimentos'
import { PaginaEquipe } from './paginas/equipe/PaginaEquipe'
import { ErroDeRota } from './paginas/ErroDeRota'
import {
  PaginaAcompanhamentos,
  PaginaCalendario,
  PaginaNaoEncontrada,
  PaginaVisaoEquipe,
} from './paginas/paginas'
import { RequerSessao } from './sessao/RequerSessao'

/**
 * Rotas do app. Públicas: entrar, senha, criar conta e convite. Com login e sem consultoria:
 * escolher e criar consultoria. O resto exige login e um vínculo ativo escolhido (ACC-04).
 * Proteger rota é apresentação: quem decide o acesso aos dados é a RLS.
 */
export const rotas: RouteObject[] = [
  {
    element: <LayoutPublico />,
    errorElement: <ErroDeRota />,
    children: [
      { path: '/entrar', element: <PaginaEntrar /> },
      { path: '/recuperar-senha', element: <PaginaRecuperarSenha /> },
      { path: '/redefinir-senha', element: <PaginaRedefinirSenha /> },
      { path: '/criar-conta', element: <PaginaCriarConta /> },
      { path: '/convite', element: <PaginaConvite /> },
      {
        element: <RequerSessao />,
        children: [
          { path: '/escolher-consultoria', element: <PaginaEscolherConsultoria /> },
          { path: '/criar-consultoria', element: <PaginaCriarConsultoria /> },
        ],
      },
    ],
  },
  {
    element: <RequerSessao />,
    errorElement: <ErroDeRota />,
    children: [
      {
        element: <RequerConsultoria />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <PaginaVisaoEquipe /> },
              { path: 'calendario', element: <PaginaCalendario /> },
              { path: 'empreendimentos', element: <PaginaEmpreendimentos /> },
              { path: 'empreendimentos/:id', element: <PaginaEmpreendimento /> },
              { path: 'acompanhamentos', element: <PaginaAcompanhamentos /> },
              { path: 'configuracoes/equipe', element: <PaginaEquipe /> },
              { path: '*', element: <PaginaNaoEncontrada /> },
            ],
          },
        ],
      },
    ],
  },
]
