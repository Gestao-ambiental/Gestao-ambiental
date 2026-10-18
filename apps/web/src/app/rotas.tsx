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
import { PassoCondicionantes } from './paginas/licenca/PassoCondicionantes'
import { PassoDocumento, PassoDocumentoNovo } from './paginas/licenca/PassoDocumento'
import { PassoIdentificacao } from './paginas/licenca/PassoIdentificacao'
import { PassoPrazos } from './paginas/licenca/PassoPrazos'
import { PassoResponsaveis } from './paginas/licenca/PassoResponsaveis'
import { ErroDeRota } from './paginas/ErroDeRota'
import { PaginaCalendario } from './paginas/calendario/PaginaCalendario'
import { PaginaOcorrencia } from './paginas/ocorrencia/PaginaOcorrencia'
import { PaginaAcompanhamentos, PaginaNaoEncontrada } from './paginas/paginas'
import { PaginaVisaoEquipe } from './paginas/visao/PaginaVisaoEquipe'
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
          // Cadastro de licença: tela cheia, fora do shell (Protótipos 10 a 14).
          { path: 'licencas/nova', element: <PassoDocumentoNovo /> },
          { path: 'licencas/:id/documento', element: <PassoDocumento /> },
          { path: 'licencas/:id/identificacao', element: <PassoIdentificacao /> },
          { path: 'licencas/:id/condicionantes', element: <PassoCondicionantes /> },
          { path: 'licencas/:id/prazos', element: <PassoPrazos /> },
          { path: 'licencas/:id/responsaveis', element: <PassoResponsaveis /> },
          {
            element: <AppShell />,
            children: [
              { index: true, element: <PaginaVisaoEquipe /> },
              { path: 'calendario', element: <PaginaCalendario /> },
              { path: 'empreendimentos', element: <PaginaEmpreendimentos /> },
              { path: 'empreendimentos/:id', element: <PaginaEmpreendimento /> },
              { path: 'ocorrencias/:id', element: <PaginaOcorrencia /> },
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
