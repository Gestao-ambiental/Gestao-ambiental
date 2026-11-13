// Profissão e cargo do membro (ADR-0021; listas aprovadas pelo Eduardo em 13/11/2026). Profissão: no
// que a pessoa é formada. Cargo: para o que foi contratada. Listas fixas do Grama, iguais para
// todas as consultorias: a pessoa escolhe, sem digitar. O banco tem os mesmos códigos e rótulos
// (domínios public.profissao_do_membro e public.cargo_do_membro; private.rotulo_da_profissao).

export interface ItemDaLista<Codigo extends string> {
  codigo: Codigo
  rotulo: string
  /** Grupo para organizar a caixa de seleção (optgroup). */
  grupo: string
}

export const PROFISSOES = [
  { codigo: 'eng_ambiental', rotulo: 'Engenheiro ambiental', grupo: 'Engenharias' },
  { codigo: 'eng_sanitarista', rotulo: 'Engenheiro sanitarista', grupo: 'Engenharias' },
  {
    codigo: 'eng_ambiental_sanitarista',
    rotulo: 'Engenheiro ambiental e sanitarista',
    grupo: 'Engenharias',
  },
  { codigo: 'eng_civil', rotulo: 'Engenheiro civil', grupo: 'Engenharias' },
  { codigo: 'eng_quimico', rotulo: 'Engenheiro químico', grupo: 'Engenharias' },
  { codigo: 'eng_florestal', rotulo: 'Engenheiro florestal', grupo: 'Engenharias' },
  { codigo: 'eng_agronomo', rotulo: 'Engenheiro agrônomo', grupo: 'Engenharias' },
  { codigo: 'eng_minas', rotulo: 'Engenheiro de minas', grupo: 'Engenharias' },
  { codigo: 'eng_agricola', rotulo: 'Engenheiro agrícola', grupo: 'Engenharias' },
  { codigo: 'eng_pesca', rotulo: 'Engenheiro de pesca', grupo: 'Engenharias' },
  {
    codigo: 'eng_seguranca_trabalho',
    rotulo: 'Engenheiro de segurança do trabalho',
    grupo: 'Engenharias',
  },
  {
    codigo: 'eng_cartografo_agrimensor',
    rotulo: 'Engenheiro cartógrafo e agrimensor',
    grupo: 'Engenharias',
  },
  { codigo: 'geologo', rotulo: 'Geólogo', grupo: 'Geociências' },
  { codigo: 'geografo', rotulo: 'Geógrafo', grupo: 'Geociências' },
  { codigo: 'meteorologista', rotulo: 'Meteorologista', grupo: 'Geociências' },
  { codigo: 'arquiteto_urbanista', rotulo: 'Arquiteto e urbanista', grupo: 'Outros conselhos' },
  { codigo: 'biologo', rotulo: 'Biólogo', grupo: 'Outros conselhos' },
  { codigo: 'quimico', rotulo: 'Químico', grupo: 'Outros conselhos' },
  { codigo: 'medico_veterinario', rotulo: 'Médico veterinário', grupo: 'Outros conselhos' },
  { codigo: 'oceanografo', rotulo: 'Oceanógrafo', grupo: 'Outros conselhos' },
  { codigo: 'arqueologo', rotulo: 'Arqueólogo', grupo: 'Meio socioeconômico e outras áreas' },
  { codigo: 'sociologo', rotulo: 'Sociólogo', grupo: 'Meio socioeconômico e outras áreas' },
  { codigo: 'antropologo', rotulo: 'Antropólogo', grupo: 'Meio socioeconômico e outras áreas' },
  { codigo: 'economista', rotulo: 'Economista', grupo: 'Meio socioeconômico e outras áreas' },
  { codigo: 'advogado', rotulo: 'Advogado', grupo: 'Meio socioeconômico e outras áreas' },
  {
    codigo: 'gestor_ambiental',
    rotulo: 'Gestor ambiental (tecnólogo)',
    grupo: 'Meio socioeconômico e outras áreas',
  },
  { codigo: 'ecologo', rotulo: 'Ecólogo', grupo: 'Meio socioeconômico e outras áreas' },
  { codigo: 'tec_meio_ambiente', rotulo: 'Técnico em meio ambiente', grupo: 'Nível técnico' },
  {
    codigo: 'tec_seguranca_trabalho',
    rotulo: 'Técnico em segurança do trabalho',
    grupo: 'Nível técnico',
  },
  { codigo: 'tec_quimica', rotulo: 'Técnico em química', grupo: 'Nível técnico' },
  { codigo: 'tec_agrimensura', rotulo: 'Técnico em agrimensura', grupo: 'Nível técnico' },
  { codigo: 'tec_agricola', rotulo: 'Técnico agrícola', grupo: 'Nível técnico' },
  { codigo: 'tec_florestal', rotulo: 'Técnico florestal', grupo: 'Nível técnico' },
  { codigo: 'outra_nao_tecnica', rotulo: 'Outra formação (não técnica)', grupo: 'Outras' },
] as const satisfies readonly ItemDaLista<string>[]

export type CodigoProfissao = (typeof PROFISSOES)[number]['codigo']

export const CARGOS = [
  { codigo: 'estagiario', rotulo: 'Estagiário', grupo: 'Cargos' },
  { codigo: 'auxiliar_administrativo', rotulo: 'Auxiliar administrativo', grupo: 'Cargos' },
  { codigo: 'tecnico', rotulo: 'Técnico', grupo: 'Cargos' },
  { codigo: 'assistente', rotulo: 'Assistente', grupo: 'Cargos' },
  { codigo: 'analista_junior', rotulo: 'Analista júnior', grupo: 'Cargos' },
  { codigo: 'analista_pleno', rotulo: 'Analista pleno', grupo: 'Cargos' },
  { codigo: 'analista_senior', rotulo: 'Analista sênior', grupo: 'Cargos' },
  { codigo: 'especialista', rotulo: 'Especialista', grupo: 'Cargos' },
  { codigo: 'coordenador', rotulo: 'Coordenador', grupo: 'Cargos' },
  { codigo: 'gerente', rotulo: 'Gerente', grupo: 'Cargos' },
  { codigo: 'diretor', rotulo: 'Diretor', grupo: 'Cargos' },
] as const satisfies readonly ItemDaLista<string>[]

export type CodigoCargo = (typeof CARGOS)[number]['codigo']

/** Código válido da lista, ou nulo (código desconhecido nunca vira um válido em silêncio). */
export function profissaoDoCodigo(valor: unknown): CodigoProfissao | null {
  return PROFISSOES.find((p) => p.codigo === valor)?.codigo ?? null
}

export function cargoDoCodigo(valor: unknown): CodigoCargo | null {
  return CARGOS.find((c) => c.codigo === valor)?.codigo ?? null
}

export function rotuloDaProfissao(codigo: CodigoProfissao): string {
  return PROFISSOES.find((p) => p.codigo === codigo)?.rotulo ?? codigo
}

export function rotuloDoCargo(codigo: CodigoCargo): string {
  return CARGOS.find((c) => c.codigo === codigo)?.rotulo ?? codigo
}

/** Itens agrupados, na ordem da lista, para montar os optgroups. */
export function gruposDaLista<C extends string>(
  lista: readonly ItemDaLista<C>[],
): { grupo: string; itens: ItemDaLista<C>[] }[] {
  const grupos: { grupo: string; itens: ItemDaLista<C>[] }[] = []
  for (const item of lista) {
    const atual = grupos.at(-1)
    if (atual?.grupo === item.grupo) atual.itens.push(item)
    else grupos.push({ grupo: item.grupo, itens: [item] })
  }
  return grupos
}
