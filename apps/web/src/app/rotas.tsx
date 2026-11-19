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
import { PaginaAcompanhamentos } from './paginas/acompanhamentos/PaginaAcompanhamentos'
import { PaginaPlanoRenovacao } from './paginas/acompanhamentos/PaginaPlanoRenovacao'
import { PaginaCalendario } from './paginas/calendario/PaginaCalendario'
import { PaginaChecklist } from './paginas/campo/PaginaChecklist'
import { PaginaDetalheVistoria } from './paginas/campo/PaginaDetalheVistoria'
import { PaginaEnvio } from './paginas/campo/PaginaEnvio'
import { PaginaFoto } from './paginas/campo/PaginaFoto'
import { PaginaMinhasVistorias } from './paginas/campo/PaginaMinhasVistorias'
import { PaginaOcorrencia } from './paginas/ocorrencia/PaginaOcorrencia'
import { PaginaNaoEncontrada } from './paginas/paginas'
import { PaginaPerfil } from './paginas/perfil/PaginaPerfil'
import { PaginaSeguranca } from './paginas/perfil/PaginaSeguranca'
import { PaginaVisaoEquipe } from './paginas/visao/PaginaVisaoEquipe'
import { PaginaResumoDoMes } from './indicadores/PaginaResumoDoMes'
import { PaginaPlano } from './plano/PaginaPlano'
import { RequerSessao } from './sessao/RequerSessao'

/**
 * Rotas do app. Públicas: entrar, senha, criar conta e convite. Com login e sem consultoria:
 * escolher e criar consultoria e a central administrativa (/admin, ADM-01: o operador pode não ser
 * membro de nenhuma consultoria). O resto exige login e um vínculo ativo escolhido (ACC-04).
 * Proteger rota é apresentação: quem decide o acesso aos dados é a RLS.
 *
 * Central administrativa, cadastro de licença, orçamentos e resíduos usam `lazy`: o código só é
 * baixado quando a rota abre, e o pacote inicial fica menor. Campo, login e o shell vêm direto.
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
        path: 'admin',
        lazy: () =>
          import('./paginas/central/LayoutCentral').then((m) => ({ Component: m.LayoutCentral })),
        children: [
          {
            index: true,
            lazy: () =>
              import('./paginas/central/PaginaCentral').then((m) => ({
                Component: m.PaginaCentral,
              })),
          },
          {
            path: 'consultorias/:id',
            lazy: () =>
              import('./paginas/central/PaginaCentralConsultoria').then((m) => ({
                Component: m.PaginaCentralConsultoria,
              })),
          },
          {
            path: 'financeiro',
            lazy: () =>
              import('./paginas/central/PaginaCentralFinanceiro').then((m) => ({
                Component: m.PaginaCentralFinanceiro,
              })),
          },
          {
            path: 'valor',
            lazy: () =>
              import('./paginas/central/PaginaCentralValor').then((m) => ({
                Component: m.PaginaCentralValor,
              })),
          },
          {
            path: 'parametros',
            lazy: () =>
              import('./paginas/central/PaginaCentralParametros').then((m) => ({
                Component: m.PaginaCentralParametros,
              })),
          },
          {
            path: 'lista-de-espera',
            lazy: () =>
              import('./paginas/central/PaginaCentralListaDeEspera').then((m) => ({
                Component: m.PaginaCentralListaDeEspera,
              })),
          },
        ],
      },
      {
        element: <RequerConsultoria />,
        children: [
          // Cadastro de licença: tela cheia, fora do shell (Protótipos 10 a 14).
          {
            path: 'licencas/nova',
            lazy: () =>
              import('./paginas/licenca/PassoDocumento').then((m) => ({
                Component: m.PassoDocumentoNovo,
              })),
          },
          {
            path: 'licencas/:id/documento',
            lazy: () =>
              import('./paginas/licenca/PassoDocumento').then((m) => ({
                Component: m.PassoDocumento,
              })),
          },
          {
            path: 'licencas/:id/identificacao',
            lazy: () =>
              import('./paginas/licenca/PassoIdentificacao').then((m) => ({
                Component: m.PassoIdentificacao,
              })),
          },
          {
            path: 'licencas/:id/condicionantes',
            lazy: () =>
              import('./paginas/licenca/PassoCondicionantes').then((m) => ({
                Component: m.PassoCondicionantes,
              })),
          },
          {
            path: 'licencas/:id/prazos',
            lazy: () =>
              import('./paginas/licenca/PassoPrazos').then((m) => ({ Component: m.PassoPrazos })),
          },
          {
            path: 'licencas/:id/responsaveis',
            lazy: () =>
              import('./paginas/licenca/PassoResponsaveis').then((m) => ({
                Component: m.PassoResponsaveis,
              })),
          },
          // Proposta pronta (ORC-05): tela cheia, para imprimir ou salvar PDF sem o menu.
          {
            path: 'orcamentos/:id/proposta',
            lazy: () =>
              import('./paginas/orcamentos/PaginaProposta').then((m) => ({
                Component: m.PaginaProposta,
              })),
          },
          {
            element: <AppShell />,
            children: [
              { index: true, element: <PaginaVisaoEquipe /> },
              { path: 'calendario', element: <PaginaCalendario /> },
              { path: 'empreendimentos', element: <PaginaEmpreendimentos /> },
              { path: 'empreendimentos/:id', element: <PaginaEmpreendimento /> },
              {
                path: 'empreendimentos/:id/residuos',
                lazy: () =>
                  import('./paginas/residuos/registro/PaginaMtrs').then((m) => ({
                    Component: m.PaginaMtrs,
                  })),
              },
              { path: 'ocorrencias/:id', element: <PaginaOcorrencia /> },
              // Vistoria móvel (ADR-0033): celular primeiro.
              { path: 'campo', element: <PaginaMinhasVistorias /> },
              { path: 'campo/:id', element: <PaginaDetalheVistoria /> },
              { path: 'campo/:id/checklist', element: <PaginaChecklist /> },
              { path: 'campo/:id/itens/:itemId/foto', element: <PaginaFoto /> },
              { path: 'campo/:id/envio', element: <PaginaEnvio /> },
              { path: 'acompanhamentos', element: <PaginaAcompanhamentos /> },
              { path: 'renovacoes/:instrumentoId', element: <PaginaPlanoRenovacao /> },
              // Resíduos, fase 1 (sem integração com o IMA; ADR-0028): abas da área.
              {
                path: 'residuos',
                lazy: () =>
                  import('./paginas/residuos/LayoutResiduos').then((m) => ({
                    Component: m.LayoutResiduos,
                  })),
                children: [
                  {
                    index: true,
                    lazy: () =>
                      import('./paginas/residuos/PaginaResiduosPorEmpreendimento').then((m) => ({
                        Component: m.PaginaResiduosPorEmpreendimento,
                      })),
                  },
                  {
                    path: 'conferencia',
                    lazy: () =>
                      import('./paginas/residuos/painel').then((m) => ({
                        Component: m.PaginaConferenciaResiduos,
                      })),
                  },
                  {
                    path: 'painel',
                    lazy: () =>
                      import('./paginas/residuos/painel').then((m) => ({
                        Component: m.PaginaPainelResiduos,
                      })),
                  },
                  {
                    path: 'prazos',
                    lazy: () =>
                      import('./paginas/residuos/prazos/PaginaObrigacoesResiduos').then((m) => ({
                        Component: m.PaginaObrigacoesResiduos,
                      })),
                  },
                ],
              },
              {
                path: 'orcamentos',
                lazy: () =>
                  import('./paginas/orcamentos/PaginaOrcamentos').then((m) => ({
                    Component: m.PaginaOrcamentos,
                  })),
              },
              {
                path: 'orcamentos/primeiros-passos',
                lazy: () =>
                  import('./paginas/orcamentos/PaginaPrimeirosPassos').then((m) => ({
                    Component: m.PaginaPrimeirosPassos,
                  })),
              },
              {
                path: 'orcamentos/:id',
                lazy: () =>
                  import('./paginas/orcamentos/PaginaOrcamento').then((m) => ({
                    Component: m.PaginaOrcamento,
                  })),
              },
              { path: 'resumo-do-mes', element: <PaginaResumoDoMes /> },
              { path: 'configuracoes/equipe', element: <PaginaEquipe /> },
              {
                path: 'configuracoes/custos',
                lazy: () =>
                  import('./paginas/orcamentos/PaginaCustosETaxas').then((m) => ({
                    Component: m.PaginaCustosETaxas,
                  })),
              },
              {
                path: 'configuracoes/proposta',
                lazy: () =>
                  import('./paginas/orcamentos/PaginaDadosDaProposta').then((m) => ({
                    Component: m.PaginaDadosDaProposta,
                  })),
              },
              { path: 'configuracoes/plano', element: <PaginaPlano /> },
              { path: 'perfil', element: <PaginaPerfil /> },
              { path: 'seguranca', element: <PaginaSeguranca /> },
              { path: '*', element: <PaginaNaoEncontrada /> },
            ],
          },
        ],
      },
    ],
  },
]
