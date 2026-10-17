// PROVISÓRIO até o login e a seleção de consultoria (ACC-01 e ACC-04, épico 2).
// Sem sessão ainda, o shell mostra dados fixos do piloto só para desenhar o layout.
// Nada aqui é autoridade: quem decide acesso é a RLS do banco.

export interface ConsultoriaResumo {
  id: string
  nome: string
  sigla: string
  papel: 'Gestão' | 'Equipe'
}

export const CONSULTORIAS_PROVISORIAS: readonly ConsultoriaResumo[] = [
  { id: 'filtroville', nome: 'Filtroville Consultoria Ambiental', sigla: 'FV', papel: 'Gestão' },
]

export const USUARIO_PROVISORIO = {
  nome: 'Eduardo Karnopp',
  email: 'eduardo@filtroville.test',
  iniciais: 'EK',
} as const
