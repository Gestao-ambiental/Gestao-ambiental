// Gerado por scripts/normas/espelhar-dominio-no-edge.mjs a partir de packages/domain/src. Não edite.

// Diferença entre duas versões do texto de uma norma (catálogo de normas, ADR-0050). Divide o texto
// em dispositivos (artigo, parágrafo, inciso, alínea) e diz o que foi incluído, revogado ou alterado.
// Texto sem estrutura de artigos só responde se mudou, sem contar espaços e quebras de linha.

export interface Dispositivo {
  /** Caminho estável do dispositivo: "art6", "art6.par2", "art6.par2.incI", "art6.incII.alia". */
  caminho: string
  /** Como se cita: "Art. 6º, § 2º, inciso I". */
  rotulo: string
  /** Texto do próprio dispositivo (sem os filhos), com espaços normalizados. */
  texto: string
}

export interface DispositivoAlterado {
  caminho: string
  rotulo: string
  antes: string
  depois: string
}

export type DiferencaDeNorma =
  | {
      estruturada: true
      incluidos: Dispositivo[]
      revogados: Dispositivo[]
      alterados: DispositivoAlterado[]
      iguais: number
    }
  | { estruturada: false; mudou: boolean }

/** Espaços, tabulações e quebras de linha viram um espaço só. */
function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

// Marcador no meio da linha, depois de fim de frase, passa para a linha de baixo.
const MARCADOR_NO_MEIO =
  /([.;:])[ \t]+(?=Art\.?\s*\d|§\s*\d|Par[áa]grafo\s+[úu]nico|[IVXLC]+\s*[-–—]\s|[a-z]\)\s)/g

// Sufixo de letra ("6º-A", "§ 2º-B", "I-A") vem colado ao número; "Art. 1º - A empresa" não é 1º-A.
const ARTIGO = /^Art\.?\s*(\d+)\s*(?:[º°o](?!\p{L}))?(?:-([A-Z])(?!\p{L}))?\s*[.\-–—]?\s*/u
const PARAGRAFO = /^§\s*(\d+)\s*(?:[º°o](?!\p{L}))?(?:-([A-Z])(?!\p{L}))?\s*[.\-–—]?\s*/u
const PARAGRAFO_UNICO = /^Par[áa]grafo\s+[úu]nico\s*[.\-–—:]?\s*/i
const INCISO = /^([IVXLC]+)(?:-([A-Z]))?\s*[-–—]\s*/
const ALINEA = /^([a-z])\)\s*/

function ordinal(numero: string): string {
  return Number(numero) <= 9 ? `${numero}º` : numero
}

interface Nivel {
  caminho: string
  rotulo: string
}

/**
 * Divide o texto em dispositivos, na ordem em que aparecem. O que vem antes do primeiro artigo
 * (ementa, preâmbulo) fica de fora. Caminho repetido (texto que transcreve outro artigo) ganha
 * sufixo "#2", "#3"...
 */
export function dividirEmDispositivos(texto: string): Dispositivo[] {
  const linhas = texto.replace(/\r\n?/g, '\n').replace(MARCADOR_NO_MEIO, '$1\n').split('\n')
  const dispositivos: Dispositivo[] = []
  const usados = new Map<string, number>()
  let artigo: Nivel | null = null
  let paragrafo: Nivel | null = null
  let inciso: Nivel | null = null
  // Em objeto para o TypeScript não estreitar o valor atribuído dentro de abrir() e fechar().
  const aberto: { atual: { caminho: string; rotulo: string; partes: string[] } | null } = {
    atual: null,
  }

  function abrir(niveis: Nivel[], resto: string): void {
    fechar()
    const base = niveis.map((n) => n.caminho).join('.')
    const vezes = (usados.get(base) ?? 0) + 1
    usados.set(base, vezes)
    aberto.atual = {
      caminho: vezes === 1 ? base : `${base}#${String(vezes)}`,
      rotulo: niveis.map((n) => n.rotulo).join(', '),
      partes: [resto],
    }
  }

  function fechar(): void {
    const atual = aberto.atual
    if (atual === null) return
    dispositivos.push({
      caminho: atual.caminho,
      rotulo: atual.rotulo,
      texto: normalizarEspacos(atual.partes.join(' ')),
    })
    aberto.atual = null
  }

  for (const bruta of linhas) {
    const linha = bruta.trim()
    let achado: RegExpExecArray | null

    if ((achado = ARTIGO.exec(linha)) !== null) {
      const [marcador, numero = '', letra] = achado
      artigo = {
        caminho: `art${numero}${letra ?? ''}`,
        rotulo: `Art. ${ordinal(numero)}${letra === undefined ? '' : `-${letra}`}`,
      }
      paragrafo = null
      inciso = null
      abrir([artigo], linha.slice(marcador.length))
      continue
    }
    if (artigo === null) continue

    if ((achado = PARAGRAFO.exec(linha)) !== null) {
      const [marcador, numero = '', letra] = achado
      paragrafo = {
        caminho: `par${numero}${letra ?? ''}`,
        rotulo: `§ ${ordinal(numero)}${letra === undefined ? '' : `-${letra}`}`,
      }
      inciso = null
      abrir([artigo, paragrafo], linha.slice(marcador.length))
    } else if ((achado = PARAGRAFO_UNICO.exec(linha)) !== null) {
      paragrafo = { caminho: 'parUnico', rotulo: 'Parágrafo único' }
      inciso = null
      abrir([artigo, paragrafo], linha.slice(achado[0].length))
    } else if ((achado = INCISO.exec(linha)) !== null) {
      const [marcador, romano = '', letra] = achado
      const nome = letra === undefined ? romano : `${romano}-${letra}`
      inciso = { caminho: `inc${romano}${letra ?? ''}`, rotulo: `inciso ${nome}` }
      abrir(
        paragrafo === null ? [artigo, inciso] : [artigo, paragrafo, inciso],
        linha.slice(marcador.length),
      )
    } else if ((achado = ALINEA.exec(linha)) !== null) {
      const [marcador, letra = ''] = achado
      const alinea = { caminho: `ali${letra}`, rotulo: `alínea ${letra}` }
      const pais = [artigo, paragrafo, inciso].filter((n): n is Nivel => n !== null)
      abrir([...pais, alinea], linha.slice(marcador.length))
    } else {
      aberto.atual?.partes.push(linha)
    }
  }
  fechar()
  return dispositivos
}

function contarArtigos(dispositivos: Dispositivo[]): number {
  return dispositivos.filter((d) => /^art[^.]*$/.test(d.caminho)).length
}

/** Dispositivo cujo texto traz "(Revogado)" ou "(Revogada pela ...)". */
function ehRevogado(texto: string): boolean {
  return /\(\s*revogad[oa]/i.test(texto)
}

/**
 * Compara duas versões do texto. Com ao menos 2 artigos nos dois lados, compara dispositivo a
 * dispositivo: novo caminho é incluído; caminho que sumiu ou cujo texto passou a dizer
 * "(Revogado)" é revogado (com o texto anterior); texto diferente é alterado. Sem essa estrutura,
 * só diz se o texto mudou, sem contar espaços e quebras de linha.
 */
export function compararVersoes(anterior: string, nova: string): DiferencaDeNorma {
  const antes = dividirEmDispositivos(anterior)
  const depois = dividirEmDispositivos(nova)
  if (contarArtigos(antes) < 2 || contarArtigos(depois) < 2) {
    return { estruturada: false, mudou: normalizarEspacos(anterior) !== normalizarEspacos(nova) }
  }

  const porCaminho = new Map(antes.map((d) => [d.caminho, d]))
  const vistos = new Set<string>()
  const incluidos: Dispositivo[] = []
  const revogados: Dispositivo[] = []
  const alterados: DispositivoAlterado[] = []
  let iguais = 0

  for (const novo of depois) {
    vistos.add(novo.caminho)
    const velho = porCaminho.get(novo.caminho)
    const revogadoAgora = ehRevogado(novo.texto)
    if (velho === undefined) {
      // Dispositivo que já nasce revogado nesta versão não é inclusão nem revogação.
      if (!revogadoAgora) incluidos.push(novo)
    } else if (revogadoAgora && !ehRevogado(velho.texto)) {
      revogados.push(velho)
    } else if (velho.texto === novo.texto || (revogadoAgora && ehRevogado(velho.texto))) {
      iguais += 1
    } else {
      alterados.push({
        caminho: novo.caminho,
        rotulo: novo.rotulo,
        antes: velho.texto,
        depois: novo.texto,
      })
    }
  }
  for (const velho of antes) {
    if (!vistos.has(velho.caminho) && !ehRevogado(velho.texto)) revogados.push(velho)
  }

  return { estruturada: true, incluidos, revogados, alterados, iguais }
}
