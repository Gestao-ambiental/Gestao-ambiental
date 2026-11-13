import { describe, expect, it } from 'vitest'

import {
  CARGOS,
  PROFISSOES,
  cargoDoCodigo,
  gruposDaLista,
  outrasProfissoes,
  profissaoDoCodigo,
  rotuloDaProfissao,
  rotuloDoCargo,
  sugerirCargo,
  sugerirProfissao,
  sugerirProfissaoPeloCargoAntigo,
} from './profissao-e-cargo'

describe('profissão e cargo (listas fixas do Grama)', () => {
  it('códigos e rótulos sem repetição', () => {
    for (const lista of [PROFISSOES, CARGOS]) {
      expect(new Set(lista.map((i) => i.codigo)).size).toBe(lista.length)
      expect(new Set(lista.map((i) => i.rotulo.toLowerCase())).size).toBe(lista.length)
    }
  })

  it('tem as profissões que o Eduardo citou e os cargos aprovados', () => {
    const rotulos = PROFISSOES.map((p) => p.rotulo)
    for (const nome of [
      'Engenheiro ambiental',
      'Engenheiro sanitarista',
      'Engenheiro ambiental e sanitarista',
      'Engenheiro civil',
      'Engenheiro químico',
      'Arquiteto e urbanista',
      'Geólogo',
      'Geógrafo',
      'Biólogo',
    ]) {
      expect(rotulos).toContain(nome)
    }
    expect(PROFISSOES).toHaveLength(34)
    expect(CARGOS.map((c) => c.rotulo)).toEqual([
      'Estagiário',
      'Auxiliar administrativo',
      'Técnico',
      'Assistente',
      'Analista júnior',
      'Analista pleno',
      'Analista sênior',
      'Especialista',
      'Coordenador',
      'Gerente',
      'Diretor',
    ])
  })

  it('código desconhecido não vira válido; rótulo pelo código', () => {
    expect(profissaoDoCodigo('eng_ambiental')).toBe('eng_ambiental')
    expect(profissaoDoCodigo('Eng Ambiental')).toBeNull()
    expect(cargoDoCodigo('estagiario')).toBe('estagiario')
    expect(cargoDoCodigo(null)).toBeNull()
    expect(rotuloDaProfissao('eng_ambiental_sanitarista')).toBe(
      'Engenheiro ambiental e sanitarista',
    )
    expect(rotuloDoCargo('analista_senior')).toBe('Analista sênior')
  })

  it('agrupa na ordem da lista', () => {
    const grupos = gruposDaLista(PROFISSOES)
    expect(grupos.map((g) => g.grupo)).toEqual([
      'Engenharias',
      'Geociências',
      'Outros conselhos',
      'Meio socioeconômico e outras áreas',
      'Nível técnico',
      'Outras',
    ])
    expect(grupos.reduce((n, g) => n + g.itens.length, 0)).toBe(PROFISSOES.length)
  })
})

describe('outras formações (além da principal)', () => {
  it('guarda só códigos da lista, sem repetir, sem a principal e na ordem em que vieram', () => {
    expect(
      outrasProfissoes('eng_ambiental_sanitarista', [
        'tec_quimica',
        'astronauta',
        'eng_ambiental_sanitarista',
        'eng_seguranca_trabalho',
        'tec_quimica',
      ]),
    ).toEqual(['tec_quimica', 'eng_seguranca_trabalho'])
  })

  it('sem principal não há outras', () => {
    expect(outrasProfissoes(null, ['tec_quimica'])).toEqual([])
  })
})

describe('de-para dos textos antigos (sugestão para revisar, nunca conversão silenciosa)', () => {
  const exata = (codigo: string) => ({ codigo, certeza: 'exata' })
  const revisar = (codigo: string) => ({ codigo, certeza: 'revisar' })

  it('todo rótulo e todo código das listas volta como sugestão exata de si mesmo', () => {
    for (const p of PROFISSOES) {
      expect(sugerirProfissao(p.rotulo)).toEqual(exata(p.codigo))
      expect(sugerirProfissao(p.codigo)).toEqual(exata(p.codigo))
      expect(sugerirProfissao(p.rotulo.toUpperCase())).toEqual(exata(p.codigo))
    }
    for (const c of CARGOS) {
      expect(sugerirCargo(c.rotulo)).toEqual(exata(c.codigo))
      expect(sugerirCargo(c.codigo)).toEqual(exata(c.codigo))
    }
  })

  it('profissão: acento, caixa, pontuação, "Eng." e feminino não mudam a profissão', () => {
    expect(sugerirProfissao('Eng. ambiental e sanitarista')).toEqual(
      exata('eng_ambiental_sanitarista'),
    )
    expect(sugerirProfissao('Eng. ambiental')).toEqual(exata('eng_ambiental'))
    expect(sugerirProfissao('Eng Ambiental')).toEqual(exata('eng_ambiental'))
    expect(sugerirProfissao(' eng. ambiental ')).toEqual(exata('eng_ambiental'))
    expect(sugerirProfissao('Engª ambiental')).toEqual(exata('eng_ambiental'))
    expect(sugerirProfissao('Engenheira ambiental')).toEqual(exata('eng_ambiental'))
    expect(sugerirProfissao('Eng. civil')).toEqual(exata('eng_civil'))
    expect(sugerirProfissao('Engenheira química')).toEqual(exata('eng_quimico'))
    expect(sugerirProfissao('Eng. de minas')).toEqual(exata('eng_minas'))
    expect(sugerirProfissao('Biólogo')).toEqual(exata('biologo'))
    expect(sugerirProfissao(' Biólogo ')).toEqual(exata('biologo'))
    expect(sugerirProfissao('Bióloga')).toEqual(exata('biologo'))
    expect(sugerirProfissao('biólogo')).toEqual(exata('biologo'))
    expect(sugerirProfissao('Geóloga')).toEqual(exata('geologo'))
    expect(sugerirProfissao('Médica veterinária')).toEqual(exata('medico_veterinario'))
    expect(sugerirProfissao('Arquiteta e urbanista')).toEqual(exata('arquiteto_urbanista'))
    expect(sugerirProfissao('Arquiteto urbanista')).toEqual(exata('arquiteto_urbanista'))
  })

  it('profissão: "química" depois de "em" é a área, não o feminino de químico', () => {
    expect(sugerirProfissao('Técnica em química')).toEqual(exata('tec_quimica'))
    expect(sugerirProfissao('Téc. em química')).toEqual(exata('tec_quimica'))
    expect(sugerirProfissao('Química')).toEqual(exata('quimico'))
    // Decisão do Eduardo (13/11/2026): o CAU só registra "arquiteto e urbanista".
    expect(sugerirProfissao('Arquiteta')).toEqual(exata('arquiteto_urbanista'))
    expect(sugerirProfissao('Arquiteto')).toEqual(exata('arquiteto_urbanista'))
  })

  it('cargo antigo que é profissão vira sugestão de profissão, sempre para revisar', () => {
    expect(sugerirProfissaoPeloCargoAntigo('Engenheira ambiental')).toEqual(
      revisar('eng_ambiental'),
    )
    expect(sugerirProfissaoPeloCargoAntigo('Bióloga')).toEqual(revisar('biologo'))
    expect(sugerirProfissaoPeloCargoAntigo('Analista ambiental')).toBeNull()
    expect(sugerirProfissaoPeloCargoAntigo('Sócia')).toBeNull()
  })

  it('profissão: sugestões que supõem algo ficam para revisar', () => {
    expect(sugerirProfissao('Bio.')).toEqual(revisar('biologo'))
    expect(sugerirProfissao('Eng. sanitarista e ambiental')).toEqual(
      revisar('eng_ambiental_sanitarista'),
    )
    expect(sugerirProfissao('Agrônoma')).toEqual(revisar('eng_agronomo'))
    expect(sugerirProfissao('Veterinário')).toEqual(revisar('medico_veterinario'))
    expect(sugerirProfissao('Gestora ambiental')).toEqual(revisar('gestor_ambiental'))
  })

  it('profissão: texto que não basta para escolher fica sem sugestão', () => {
    for (const texto of [
      'Engenheiro',
      'Engenheira',
      'Eng.',
      'Eng',
      'Arq.',
      'Técnico',
      'Analista ambiental',
      'Eng. amb.',
      '',
      '   ',
      null,
      undefined,
    ]) {
      expect(sugerirProfissao(texto)).toBeNull()
    }
  })

  it('cargo: acento, caixa, abreviação e feminino', () => {
    expect(sugerirCargo('Diretor')).toEqual(exata('diretor'))
    expect(sugerirCargo('Diretora')).toEqual(exata('diretor'))
    expect(sugerirCargo('Estagiária')).toEqual(exata('estagiario'))
    expect(sugerirCargo('estagiario')).toEqual(exata('estagiario'))
    expect(sugerirCargo('Técnica')).toEqual(exata('tecnico'))
    expect(sugerirCargo('Coordenadora')).toEqual(exata('coordenador'))
    expect(sugerirCargo('Analista Jr.')).toEqual(exata('analista_junior'))
    expect(sugerirCargo('analista senior')).toEqual(exata('analista_senior'))
  })

  it('cargo da lista com complemento fica para revisar', () => {
    expect(sugerirCargo('Técnico de campo')).toEqual(revisar('tecnico'))
    expect(sugerirCargo('Gerente de projetos')).toEqual(revisar('gerente'))
    expect(sugerirCargo('Diretora técnica')).toEqual(revisar('diretor'))
    expect(sugerirCargo('Analista ambiental pleno')).toEqual(revisar('analista_pleno'))
  })

  it('cargo ambíguo fica sem sugestão: analista sem nível, sócio, texto solto', () => {
    for (const texto of [
      'Analista ambiental',
      'Analista',
      'Analista júnior/sênior',
      'Sócia',
      'Sócio',
      'Sócio-diretor',
      'Engenheiro ambiental',
      'Auxiliar',
      '',
      null,
    ]) {
      expect(sugerirCargo(texto)).toBeNull()
    }
  })
})
