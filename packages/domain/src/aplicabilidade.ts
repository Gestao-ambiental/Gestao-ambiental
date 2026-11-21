// Aplicabilidade de normas (ADR-0050, LEG-05): diz se uma norma publicada alcança um empreendimento
// e por quê. É a mesma regra de private.empreendimentos_afetados (migration 20261121000000), que gera
// os aviso_norma; aqui serve para testar a regra e montar o rótulo do motivo na tela.
//
// (a) Norma municipal só alcança empreendimento com unidade no município dela.
// (b) Com critério de atividade ou prefixo: casa as atividades das licenças ativas (com licença) e as
//     gravadas no empreendimento (sem licença).
// (c) Senão, com critério de município: casa as unidades naquele município.
// (d) Senão, com critério de competência: 'estadual' casa licenças ativas do IMA; 'municipal' casa
//     licenças ativas com órgão preenchido que não é o IMA.
// (e) Critérios de tipo de licença, se houver, restringem as licenças pela sigla do tipo.
// Sem critério de atividade, município ou competência, ninguém é alcançado.

export type TipoDeCriterio =
  'atividade' | 'prefixo_atividade' | 'tipo_licenca' | 'municipio' | 'competencia' | 'tema'

export interface CriterioDeNorma {
  tipo: TipoDeCriterio
  valor: string
}

export interface AtividadeDoPerfil {
  /** Código CONSEMA, como "47.30.00". */
  codigo: string
  /** Licença em que a atividade está licenciada; null quando está gravada no empreendimento. */
  instrumentoId: string | null
}

export interface LicencaDoPerfil {
  id: string
  /** Sigla do tipo de instrumento (LAO, LAI, AuA...). */
  sigla: string | null
  orgao: string | null
  ativa: boolean
}

export interface PerfilDoEmpreendimento {
  atividades: AtividadeDoPerfil[]
  /** Códigos IBGE (7 dígitos) dos municípios das unidades do empreendimento. */
  municipios: string[]
  licencas: LicencaDoPerfil[]
}

export interface NormaParaAplicar {
  esfera: 'federal' | 'estadual' | 'municipal'
  municipioIbge: string | null
  criterios: CriterioDeNorma[]
}

export interface MotivoDaAplicabilidade {
  criterio: TipoDeCriterio
  valor: string
  /** Licença alcançada; null quando o motivo é do empreendimento (atividade gravada nele ou município). */
  instrumentoId: string | null
}

export interface ResultadoDaAplicabilidade {
  afeta: boolean
  motivos: MotivoDaAplicabilidade[]
}

const ORGAO_IMA = /\b(IMA|FATMA)\b/i

function ehOrgaoDoIma(orgao: string | null): boolean {
  return orgao !== null && ORGAO_IMA.test(orgao)
}

function casaAtividade(criterio: CriterioDeNorma, codigo: string): boolean {
  if (criterio.tipo === 'atividade') return codigo === criterio.valor
  return codigo.startsWith(`${criterio.valor}.`)
}

export function afetaOEmpreendimento(
  norma: NormaParaAplicar,
  perfil: PerfilDoEmpreendimento,
): ResultadoDaAplicabilidade {
  const nenhum: ResultadoDaAplicabilidade = { afeta: false, motivos: [] }

  // (a)
  if (norma.esfera === 'municipal') {
    if (norma.municipioIbge === null || !perfil.municipios.includes(norma.municipioIbge)) {
      return nenhum
    }
  }

  const deAtividade = norma.criterios.filter(
    (c) => c.tipo === 'atividade' || c.tipo === 'prefixo_atividade',
  )
  const deMunicipio = norma.criterios.filter((c) => c.tipo === 'municipio')
  const deCompetencia = norma.criterios.filter((c) => c.tipo === 'competencia')
  const siglas = norma.criterios
    .filter((c) => c.tipo === 'tipo_licenca')
    .map((c) => c.valor.toLowerCase())

  // (e) licenças que podem ser alcançadas: ativas e, havendo tipo de licença, só dessas siglas.
  const licencas = new Map(
    perfil.licencas
      .filter((l) => l.ativa)
      .filter(
        (l) => siglas.length === 0 || (l.sigla !== null && siglas.includes(l.sigla.toLowerCase())),
      )
      .map((l) => [l.id, l]),
  )

  const motivos: MotivoDaAplicabilidade[] = []
  const vistos = new Set<string>()
  function anotar(motivo: MotivoDaAplicabilidade) {
    const chave = `${motivo.criterio}|${motivo.valor}|${motivo.instrumentoId ?? ''}`
    if (vistos.has(chave)) return
    vistos.add(chave)
    motivos.push(motivo)
  }

  if (deAtividade.length > 0) {
    // (b)
    for (const atividade of perfil.atividades) {
      if (atividade.instrumentoId !== null && !licencas.has(atividade.instrumentoId)) continue
      for (const criterio of deAtividade) {
        if (casaAtividade(criterio, atividade.codigo)) {
          anotar({
            criterio: criterio.tipo,
            valor: criterio.valor,
            instrumentoId: atividade.instrumentoId,
          })
        }
      }
    }
  } else if (deMunicipio.length > 0) {
    // (c)
    for (const criterio of deMunicipio) {
      if (perfil.municipios.includes(criterio.valor)) {
        anotar({ criterio: 'municipio', valor: criterio.valor, instrumentoId: null })
      }
    }
  } else if (deCompetencia.length > 0) {
    // (d)
    for (const criterio of deCompetencia) {
      for (const licenca of licencas.values()) {
        const doIma = ehOrgaoDoIma(licenca.orgao)
        const casa =
          criterio.valor === 'estadual'
            ? doIma
            : criterio.valor === 'municipal' &&
              licenca.orgao !== null &&
              licenca.orgao.trim() !== '' &&
              !doIma
        if (casa)
          anotar({ criterio: 'competencia', valor: criterio.valor, instrumentoId: licenca.id })
      }
    }
  }

  return { afeta: motivos.length > 0, motivos }
}

/** Rótulo curto do motivo do aviso: "Atividade 47.30.00", "Município de Joinville", "Licenças do IMA". */
export function rotuloDoMotivo(
  motivo: { criterio: string; valor: string },
  nomeDoMunicipio?: string | null,
): string {
  const { criterio, valor } = motivo
  switch (criterio) {
    case 'atividade':
      return `Atividade ${valor}`
    case 'prefixo_atividade':
      return `Atividades ${valor}.*`
    case 'municipio':
      return nomeDoMunicipio ? `Município de ${nomeDoMunicipio}` : `Município ${valor}`
    case 'competencia':
      if (valor === 'estadual') return 'Licenças do IMA'
      if (valor === 'municipal') return 'Licenças municipais'
      return `Competência ${valor}`
    case 'tipo_licenca':
      return valor === 'renovacao' ? 'Licenças de renovação' : `Licenças ${valor}`
    case 'tema':
      return `Tema ${valor}`
    default:
      return valor
  }
}
