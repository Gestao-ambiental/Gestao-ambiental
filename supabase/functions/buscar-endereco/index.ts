// Edge Function buscar-endereco (triagem de licenciamento).
//
// Recebe { texto } de quem está logado e devolve sugestões de endereço em Santa Catarina, pelo
// Photon (OpenStreetMap), com cache e limite por sessão. Sem segredos e sem banco; nada do texto
// buscado vai para o log. As regras ficam em _shared/busca-de-endereco.ts.

import { criarTratadorDaBuscaDeEndereco } from '../_shared/busca-de-endereco.ts'

Deno.serve(criarTratadorDaBuscaDeEndereco({ fetch }))
