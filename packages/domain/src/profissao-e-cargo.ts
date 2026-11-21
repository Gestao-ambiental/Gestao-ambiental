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

// --- Gênero da pessoa (ADR-0021 §7) ----------------------------------------------------------------
// Serve só para escrever a profissão junto do nome da pessoa (Equipe, Perfil, responsável,
// proposta). Custo por profissão e tabela de preços continuam na forma da lista (rotuloDaProfissao),
// para a mesma profissão não virar duas linhas.

export const GENEROS = [
  { codigo: 'feminino', rotulo: 'Feminino', grupo: 'Gênero' },
  { codigo: 'masculino', rotulo: 'Masculino', grupo: 'Gênero' },
  { codigo: 'nao_informar', rotulo: 'Prefiro não dizer', grupo: 'Gênero' },
] as const satisfies readonly ItemDaLista<string>[]

export type GeneroDaPessoa = (typeof GENEROS)[number]['codigo']

export function generoDoCodigo(valor: unknown): GeneroDaPessoa | null {
  return GENEROS.find((g) => g.codigo === valor)?.codigo ?? null
}

/** Forma feminina e forma com "(a)" de cada profissão; a masculina é o rótulo da lista. */
const FORMAS_DA_PROFISSAO: Record<CodigoProfissao, { feminino: string; neutro: string }> = {
  eng_ambiental: { feminino: 'Engenheira ambiental', neutro: 'Engenheiro(a) ambiental' },
  eng_sanitarista: { feminino: 'Engenheira sanitarista', neutro: 'Engenheiro(a) sanitarista' },
  eng_ambiental_sanitarista: {
    feminino: 'Engenheira ambiental e sanitarista',
    neutro: 'Engenheiro(a) ambiental e sanitarista',
  },
  eng_civil: { feminino: 'Engenheira civil', neutro: 'Engenheiro(a) civil' },
  eng_quimico: { feminino: 'Engenheira química', neutro: 'Engenheiro(a) químico(a)' },
  eng_florestal: { feminino: 'Engenheira florestal', neutro: 'Engenheiro(a) florestal' },
  eng_agronomo: { feminino: 'Engenheira agrônoma', neutro: 'Engenheiro(a) agrônomo(a)' },
  eng_minas: { feminino: 'Engenheira de minas', neutro: 'Engenheiro(a) de minas' },
  eng_agricola: { feminino: 'Engenheira agrícola', neutro: 'Engenheiro(a) agrícola' },
  eng_pesca: { feminino: 'Engenheira de pesca', neutro: 'Engenheiro(a) de pesca' },
  eng_seguranca_trabalho: {
    feminino: 'Engenheira de segurança do trabalho',
    neutro: 'Engenheiro(a) de segurança do trabalho',
  },
  eng_cartografo_agrimensor: {
    feminino: 'Engenheira cartógrafa e agrimensora',
    neutro: 'Engenheiro(a) cartógrafo(a) e agrimensor(a)',
  },
  geologo: { feminino: 'Geóloga', neutro: 'Geólogo(a)' },
  geografo: { feminino: 'Geógrafa', neutro: 'Geógrafo(a)' },
  meteorologista: { feminino: 'Meteorologista', neutro: 'Meteorologista' },
  arquiteto_urbanista: { feminino: 'Arquiteta e urbanista', neutro: 'Arquiteto(a) e urbanista' },
  biologo: { feminino: 'Bióloga', neutro: 'Biólogo(a)' },
  quimico: { feminino: 'Química', neutro: 'Químico(a)' },
  medico_veterinario: {
    feminino: 'Médica veterinária',
    neutro: 'Médico(a) veterinário(a)',
  },
  oceanografo: { feminino: 'Oceanógrafa', neutro: 'Oceanógrafo(a)' },
  arqueologo: { feminino: 'Arqueóloga', neutro: 'Arqueólogo(a)' },
  sociologo: { feminino: 'Socióloga', neutro: 'Sociólogo(a)' },
  antropologo: { feminino: 'Antropóloga', neutro: 'Antropólogo(a)' },
  economista: { feminino: 'Economista', neutro: 'Economista' },
  advogado: { feminino: 'Advogada', neutro: 'Advogado(a)' },
  gestor_ambiental: {
    feminino: 'Gestora ambiental (tecnóloga)',
    neutro: 'Gestor(a) ambiental (tecnólogo(a))',
  },
  ecologo: { feminino: 'Ecóloga', neutro: 'Ecólogo(a)' },
  tec_meio_ambiente: {
    feminino: 'Técnica em meio ambiente',
    neutro: 'Técnico(a) em meio ambiente',
  },
  tec_seguranca_trabalho: {
    feminino: 'Técnica em segurança do trabalho',
    neutro: 'Técnico(a) em segurança do trabalho',
  },
  tec_quimica: { feminino: 'Técnica em química', neutro: 'Técnico(a) em química' },
  tec_agrimensura: { feminino: 'Técnica em agrimensura', neutro: 'Técnico(a) em agrimensura' },
  tec_agricola: { feminino: 'Técnica agrícola', neutro: 'Técnico(a) agrícola' },
  tec_florestal: { feminino: 'Técnica florestal', neutro: 'Técnico(a) florestal' },
  outra_nao_tecnica: {
    feminino: 'Outra formação (não técnica)',
    neutro: 'Outra formação (não técnica)',
  },
}

/**
 * Profissão escrita para a pessoa: feminina, masculina ou com "(a)" ("prefiro não dizer"). Sem
 * gênero informado, fica a forma da lista.
 */
export function rotuloDaProfissaoDaPessoa(
  codigo: CodigoProfissao,
  genero: GeneroDaPessoa | null,
): string {
  if (genero === 'feminino') return FORMAS_DA_PROFISSAO[codigo].feminino
  if (genero === 'nao_informar') return FORMAS_DA_PROFISSAO[codigo].neutro
  return rotuloDaProfissao(codigo)
}

// --- Formação em curso (ADR-0021 §8) ---------------------------------------------------------------
// Quem ainda está cursando (ex.: estagiário) escolhe a formação que cursa e marca "Ainda estou
// cursando". Junto do nome aparece "Estudante de <curso>". No custo por profissão, quem está
// cursando forma um grupo à parte com esse mesmo nome, para não baixar a hora dos formados.

const CURSO_DA_PROFISSAO: Record<CodigoProfissao, string> = {
  eng_ambiental: 'engenharia ambiental',
  eng_sanitarista: 'engenharia sanitária',
  eng_ambiental_sanitarista: 'engenharia ambiental e sanitária',
  eng_civil: 'engenharia civil',
  eng_quimico: 'engenharia química',
  eng_florestal: 'engenharia florestal',
  eng_agronomo: 'agronomia',
  eng_minas: 'engenharia de minas',
  eng_agricola: 'engenharia agrícola',
  eng_pesca: 'engenharia de pesca',
  eng_seguranca_trabalho: 'engenharia de segurança do trabalho',
  eng_cartografo_agrimensor: 'engenharia cartográfica e de agrimensura',
  geologo: 'geologia',
  geografo: 'geografia',
  meteorologista: 'meteorologia',
  arquiteto_urbanista: 'arquitetura e urbanismo',
  biologo: 'ciências biológicas',
  quimico: 'química',
  medico_veterinario: 'medicina veterinária',
  oceanografo: 'oceanografia',
  arqueologo: 'arqueologia',
  sociologo: 'ciências sociais',
  antropologo: 'antropologia',
  economista: 'ciências econômicas',
  advogado: 'direito',
  gestor_ambiental: 'gestão ambiental',
  ecologo: 'ecologia',
  tec_meio_ambiente: 'técnico em meio ambiente',
  tec_seguranca_trabalho: 'técnico em segurança do trabalho',
  tec_quimica: 'técnico em química',
  tec_agrimensura: 'técnico em agrimensura',
  tec_agricola: 'técnico agrícola',
  tec_florestal: 'técnico florestal',
  outra_nao_tecnica: 'outra formação (não técnica)',
}

/** "Estudante de engenharia ambiental"; igual para todo gênero. */
/** A área da formação, para agrupar (ex.: cores do calendário): "Engenharia ambiental", "Biologia". */
export function areaDaProfissao(codigo: CodigoProfissao): string {
  const curso = CURSO_DA_PROFISSAO[codigo]
  return curso.charAt(0).toUpperCase() + curso.slice(1)
}

export function rotuloDoCurso(codigo: CodigoProfissao): string {
  return `Estudante de ${CURSO_DA_PROFISSAO[codigo]}`
}

/** A formação principal junto do nome: em curso, "Estudante de …"; senão, no gênero da pessoa. */
export function rotuloDaFormacaoDaPessoa(
  codigo: CodigoProfissao,
  genero: GeneroDaPessoa | null,
  emCurso: boolean,
): string {
  return emCurso ? rotuloDoCurso(codigo) : rotuloDaProfissaoDaPessoa(codigo, genero)
}

/** Nome do grupo no custo por profissão: em curso fica à parte dos formados. */
export function rotuloDaProfissaoNoCusto(codigo: CodigoProfissao, emCurso: boolean): string {
  return emCurso ? rotuloDoCurso(codigo) : rotuloDaProfissao(codigo)
}

/** A lista de profissões escrita para o gênero escolhido (cadastro da conta e Perfil). */
export function profissoesParaOGenero(
  genero: GeneroDaPessoa | null,
): ItemDaLista<CodigoProfissao>[] {
  return PROFISSOES.map((p) => ({ ...p, rotulo: rotuloDaProfissaoDaPessoa(p.codigo, genero) }))
}

/** Até quantas formações além da principal (igual ao banco). */
export const MAXIMO_DE_OUTRAS_PROFISSOES = 10

/**
 * Outras formações além da principal (ADR-0021 §6), como o banco grava: só códigos da lista, sem
 * repetir, sem a principal e na ordem em que vieram. Sem principal, não há outras.
 */
export function outrasProfissoes(
  principal: CodigoProfissao | null,
  outras: readonly unknown[],
): CodigoProfissao[] {
  if (!principal) return []
  const vistas = new Set<CodigoProfissao>([principal])
  const resultado: CodigoProfissao[] = []
  for (const valor of outras) {
    const codigo = profissaoDoCodigo(valor)
    if (codigo && !vistas.has(codigo)) {
      vistas.add(codigo)
      resultado.push(codigo)
    }
  }
  return resultado
}

// --- De-para dos textos antigos (ADR-0021, seção "De-para proposto") ------------------------------
// Sugestão para o Eduardo revisar: nada é convertido em silêncio. "exata" quando o texto é o rótulo
// da lista a menos de acento, caixa, pontuação, conectivo (e, de, do, da, em), abreviação ("Eng.",
// "Téc.", "Jr.", "Sr.") ou feminino; "revisar" quando a sugestão supõe algo; nulo quando há mais de
// uma resposta possível (ex.: "Engenheiro", "Analista ambiental", "Sócia").

export type CertezaDaSugestao = 'exata' | 'revisar'

export interface SugestaoDaLista<Codigo extends string> {
  codigo: Codigo
  certeza: CertezaDaSugestao
}

const ABREVIACOES: Readonly<Record<string, string>> = {
  eng: 'engenheiro',
  engo: 'engenheiro',
  enga: 'engenheiro',
  tec: 'tecnico',
  jr: 'junior',
  sr: 'senior',
}

/** Feminino → masculino (as listas estão no masculino, como os conselhos registram). */
const FEMININOS: Readonly<Record<string, string>> = {
  engenheira: 'engenheiro',
  quimica: 'quimico',
  agronoma: 'agronomo',
  cartografa: 'cartografo',
  agrimensora: 'agrimensor',
  geologa: 'geologo',
  geografa: 'geografo',
  arquiteta: 'arquiteto',
  biologa: 'biologo',
  medica: 'medico',
  veterinaria: 'veterinario',
  oceanografa: 'oceanografo',
  arqueologa: 'arqueologo',
  sociologa: 'sociologo',
  antropologa: 'antropologo',
  advogada: 'advogado',
  gestora: 'gestor',
  tecnologa: 'tecnologo',
  ecologa: 'ecologo',
  tecnica: 'tecnico',
  estagiaria: 'estagiario',
  coordenadora: 'coordenador',
  diretora: 'diretor',
}

const CONECTIVOS = new Set(['e', 'de', 'do', 'da', 'dos', 'das', 'em'])

/** Texto comparável: sem acento, caixa, pontuação nem conectivo; abreviação e feminino resolvidos. */
function chaveDoTexto(texto: string): string {
  const palavras = texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[ªº°]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p !== '')
  return palavras
    .map((p, i) => {
      // "Técnico em química" é a área, não o feminino de "químico".
      if (p === 'quimica' && palavras[i - 1] === 'em') return p
      return ABREVIACOES[p] ?? FEMININOS[p] ?? p
    })
    .filter((p) => !CONECTIVOS.has(p))
    .join(' ')
}

function indicePorChave<C extends string>(lista: readonly ItemDaLista<C>[]): Map<string, C> {
  return new Map(lista.map((item) => [chaveDoTexto(item.rotulo), item.codigo]))
}

const PROFISSAO_POR_CHAVE: ReadonlyMap<string, CodigoProfissao> = indicePorChave(PROFISSOES)
const CARGO_POR_CHAVE: ReadonlyMap<string, CodigoCargo> = indicePorChave(CARGOS)

/**
 * Textos que quase certamente são uma profissão da lista, mas supõem algo: ficam para revisar.
 * Rótulos com parênteses também valem sem eles ("Gestor ambiental" → gestor ambiental (tecnólogo)).
 */
/**
 * Apelidos que valem como exatos (decisão do Eduardo, 13/11/2026): o CAU registra a profissão só como
 * "arquiteto e urbanista", então "Arquiteto"/"Arquiteta" não deixa dúvida.
 */
const PROFISSAO_EXATA_POR_APELIDO: ReadonlyMap<string, CodigoProfissao> = new Map<
  string,
  CodigoProfissao
>([[chaveDoTexto('Arquiteto'), 'arquiteto_urbanista']])

const PROFISSAO_A_REVISAR: ReadonlyMap<string, CodigoProfissao> = new Map<string, CodigoProfissao>([
  // Ordem trocada, como no curso "Engenharia Sanitária e Ambiental".
  [chaveDoTexto('Engenheiro sanitarista e ambiental'), 'eng_ambiental_sanitarista'],
  [chaveDoTexto('Agrônomo'), 'eng_agronomo'],
  [chaveDoTexto('Veterinário'), 'medico_veterinario'],
  // Abreviação usada em bases antigas. "Arq." fica de fora: pode ser arquiteto ou arqueólogo.
  [chaveDoTexto('Bio.'), 'biologo'],
  ...PROFISSOES.flatMap((p) => {
    const semParenteses = p.rotulo.replace(/\s*\(.*\)\s*/g, ' ').trim()
    return semParenteses === p.rotulo ? [] : [[chaveDoTexto(semParenteses), p.codigo] as const]
  }),
])

/**
 * Sugestão de profissão da lista para um texto digitado antes (equipe e tabela de preços). Nulo
 * quando o texto não basta para escolher ("Engenheiro", "Eng.", "Técnico", "Arq.").
 */
export function sugerirProfissao(
  texto: string | null | undefined,
): SugestaoDaLista<CodigoProfissao> | null {
  if (!texto) return null
  const codigo = profissaoDoCodigo(texto.trim())
  if (codigo) return { codigo, certeza: 'exata' }
  const chave = chaveDoTexto(texto)
  if (chave === '') return null
  const exata = PROFISSAO_POR_CHAVE.get(chave) ?? PROFISSAO_EXATA_POR_APELIDO.get(chave)
  if (exata) return { codigo: exata, certeza: 'exata' }
  const revisar = PROFISSAO_A_REVISAR.get(chave)
  return revisar ? { codigo: revisar, certeza: 'revisar' } : null
}

/**
 * Cargo antigo que na verdade é uma profissão (ex.: "Engenheira ambiental"): sugere a profissão,
 * sempre para revisar (decisão do Eduardo, 13/11/2026). Quem chama só usa quando a pessoa ainda
 * não tem profissão.
 */
export function sugerirProfissaoPeloCargoAntigo(
  texto: string | null | undefined,
): SugestaoDaLista<CodigoProfissao> | null {
  const sugestao = sugerirProfissao(texto)
  return sugestao ? { codigo: sugestao.codigo, certeza: 'revisar' } : null
}

const NIVEIS_DE_ANALISTA: Readonly<Record<string, CodigoCargo>> = {
  junior: 'analista_junior',
  pleno: 'analista_pleno',
  senior: 'analista_senior',
}

/**
 * Sugestão de cargo da lista para o cargo digitado antes (`membro.cargo_antigo`). Analista sem
 * nível e sócio não têm sugestão: a escolha é de quem conhece a pessoa.
 */
export function sugerirCargo(
  texto: string | null | undefined,
): SugestaoDaLista<CodigoCargo> | null {
  if (!texto) return null
  const codigo = cargoDoCodigo(texto.trim())
  if (codigo) return { codigo, certeza: 'exata' }
  const chave = chaveDoTexto(texto)
  if (chave === '') return null
  const exata = CARGO_POR_CHAVE.get(chave)
  if (exata) return { codigo: exata, certeza: 'exata' }

  const palavras = chave.split(' ')
  // Sócio não é cargo da lista (a caixa "Sócio" saiu, ADR-0021, decisão 4).
  if (palavras.some((p) => p === 'socio' || p === 'socia')) return null
  if (palavras[0] === 'analista') {
    const niveis = palavras.flatMap((p) => NIVEIS_DE_ANALISTA[p] ?? [])
    return niveis.length === 1 && niveis[0] ? { codigo: niveis[0], certeza: 'revisar' } : null
  }
  // Cargo da lista com complemento ("Técnico de campo", "Gerente de projetos"): revisar.
  for (const [chaveDoCargo, cargo] of CARGO_POR_CHAVE) {
    if (chave.startsWith(`${chaveDoCargo} `)) return { codigo: cargo, certeza: 'revisar' }
  }
  return null
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
