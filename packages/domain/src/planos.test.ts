import { describe, expect, it } from 'vitest'

import {
  ADICIONAL_MENSAL_CENTAVOS,
  CATALOGO_PADRAO,
  PLANOS,
  adicionaisDoUso,
  cicloVigente,
  economiaDoAnual,
  ehDiaUtilNacional,
  ehPlanoMaior,
  equivalenteMensal,
  feriadosNacionais,
  fimDoTeste,
  inicioDoTeste,
  limitesDoPlano,
  pascoa,
  passagemDoLimite,
  planoVigente,
  primeiroVencimento,
  situacaoComercial,
  somarDiasUteis,
  testeAcabando,
  valorDoCiclo,
  valorMensalComAdicionais,
  type AssinaturaParaSituacao,
  type CatalogoComercial,
  type EntradaDaSituacao,
} from './planos'

describe('catálogo de planos (decisões do Eduardo)', () => {
  it('preços, pessoas, empreendimentos e módulos de cada plano', () => {
    expect(PLANOS.essencial).toMatchObject({
      mensalCentavos: 99_000,
      pessoas: 3,
      empreendimentos: 10,
      orcamentos: false,
      ia: false,
    })
    expect(PLANOS.equipe).toMatchObject({
      mensalCentavos: 129_000,
      pessoas: 10,
      empreendimentos: 30,
      orcamentos: true,
      ia: true,
    })
    expect(PLANOS.escala).toMatchObject({
      mensalCentavos: 299_000,
      pessoas: 25,
      empreendimentos: 100,
      orcamentos: true,
    })
    expect(ADICIONAL_MENSAL_CENTAVOS).toBe(2_000)
  })

  it('anual = 10 mensalidades, pago de uma vez; MRR do anual = ano / 12', () => {
    expect(valorDoCiclo('essencial', 'mensal')).toBe(99_000)
    expect(valorDoCiclo('essencial', 'anual')).toBe(990_000)
    expect(valorDoCiclo('equipe', 'anual')).toBe(1_290_000)
    expect(valorDoCiclo('escala', 'anual')).toBe(2_990_000)
    expect(equivalenteMensal('essencial', 'anual')).toBe(82_500)
    expect(equivalenteMensal('equipe', 'anual')).toBe(107_500)
    expect(equivalenteMensal('escala', 'anual')).toBe(249_167)
    expect(equivalenteMensal('equipe', 'mensal')).toBe(129_000)
    expect(economiaDoAnual('equipe')).toBe(258_000)
  })

  it('subir de plano é o plano mais caro', () => {
    expect(ehPlanoMaior('essencial', 'equipe')).toBe(true)
    expect(ehPlanoMaior('escala', 'equipe')).toBe(false)
    expect(ehPlanoMaior('equipe', 'equipe')).toBe(false)
  })
})

describe('dias úteis com feriados nacionais', () => {
  it('Páscoa e Sexta-feira Santa de vários anos', () => {
    const casos: [number, string, string][] = [
      [2019, '2019-04-21', '2019-04-19'],
      [2024, '2024-03-31', '2024-03-29'],
      [2025, '2025-04-20', '2025-04-18'],
      [2026, '2026-04-05', '2026-04-03'],
      [2027, '2027-03-28', '2027-03-26'],
      [2028, '2028-04-16', '2028-04-14'],
      [2038, '2038-04-25', '2038-04-23'],
    ]
    for (const [ano, domingo, sexta] of casos) {
      expect(pascoa(ano)).toBe(domingo)
      expect(feriadosNacionais(ano)).toContain(sexta)
      expect(ehDiaUtilNacional(sexta as `${number}-${number}-${number}`)).toBe(false)
    }
  })

  it('feriados fixos nacionais, incluindo 20/11', () => {
    expect(feriadosNacionais(2026)).toEqual([
      '2026-01-01',
      '2026-04-03',
      '2026-04-21',
      '2026-05-01',
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ])
  })

  it('Carnaval e Corpus Christi contam como dia útil (ponto facultativo)', () => {
    expect(ehDiaUtilNacional('2027-02-08')).toBe(true) // segunda de Carnaval
    expect(ehDiaUtilNacional('2027-02-09')).toBe(true) // terça de Carnaval
    expect(ehDiaUtilNacional('2027-05-27')).toBe(true) // Corpus Christi
    expect(ehDiaUtilNacional('2027-02-06')).toBe(false) // sábado
    expect(ehDiaUtilNacional('2027-02-07')).toBe(false) // domingo
  })

  it('soma dias úteis pulando fim de semana e feriado', () => {
    expect(somarDiasUteis('2027-05-07', 2)).toBe('2027-05-11') // sexta + 2 = terça
    expect(somarDiasUteis('2027-04-20', 2)).toBe('2027-04-23') // pula Tiradentes
    expect(somarDiasUteis('2027-03-25', 1)).toBe('2027-03-29') // pula a Sexta-feira Santa
    expect(somarDiasUteis('2027-03-25', 0)).toBe('2027-03-25')
    expect(() => somarDiasUteis('2027-03-25', -1)).toThrow()
  })
})

describe('teste grátis', () => {
  it('criada no beta: o teste começa em 01/02/2027 e dura 10 dias úteis', () => {
    expect(inicioDoTeste('2026-11-14', '2027-01-31')).toBe('2027-02-01')
    expect(fimDoTeste('2027-02-01', 10)).toBe('2027-02-12')
  })

  it('criada depois do beta: começa no dia da criação, que conta se for útil', () => {
    expect(inicioDoTeste('2027-03-24', '2027-01-31')).toBe('2027-03-24')
    // 24, 25, (26 Sexta-feira Santa), 29, 30, 31, 1, 2, 5, 6, 7
    expect(fimDoTeste('2027-03-24', 10)).toBe('2027-04-07')
    // Criada num sábado: o primeiro dia útil é a segunda.
    expect(fimDoTeste('2027-03-06', 1)).toBe('2027-03-08')
  })

  it('dias de teste ajustáveis: zero acaba na véspera', () => {
    expect(fimDoTeste('2027-03-24', 0)).toBe('2027-03-23')
    expect(fimDoTeste('2027-03-24', 15)).toBe('2027-04-14')
  })

  it('teste acabando: hoje ou nos próximos 3 dias úteis', () => {
    expect(testeAcabando('2027-04-07', '2027-04-02')).toBe(true) // sexta → 5, 6, 7
    expect(testeAcabando('2027-04-08', '2027-04-02')).toBe(false)
    expect(testeAcabando('2027-04-07', '2027-04-07')).toBe(true)
    expect(testeAcabando('2027-04-07', '2027-04-08')).toBe(false)
  })
})

describe('limites e adicionais', () => {
  it('cada pessoa ou empreendimento além do limite custa R$ 20 por mês', () => {
    expect(
      adicionaisDoUso({ pessoas: 5, empreendimentos: 12 }, limitesDoPlano('essencial')),
    ).toEqual({
      pessoas: 2,
      empreendimentos: 2,
      quantidade: 4,
      valorCentavos: 8_000,
    })
    expect(
      adicionaisDoUso({ pessoas: 3, empreendimentos: 10 }, limitesDoPlano('essencial'))
        .valorCentavos,
    ).toBe(0)
    expect(adicionaisDoUso({ pessoas: 50, empreendimentos: 500 }, null).valorCentavos).toBe(0)
    expect(
      valorMensalComAdicionais('essencial', 'mensal', { pessoas: 4, empreendimentos: 10 }),
    ).toBe(101_000)
    expect(valorMensalComAdicionais('equipe', 'anual', { pessoas: 11, empreendimentos: 31 })).toBe(
      111_500,
    )
  })

  it('passagem do limite: só quando a ação passa do limite do plano', () => {
    const limites = limitesDoPlano('equipe')
    expect(
      passagemDoLimite('pessoas', { pessoas: 9, empreendimentos: 0 }, 'equipe', 'mensal', limites),
    ).toBeNull()
    expect(
      passagemDoLimite(
        'pessoas',
        { pessoas: 10, empreendimentos: 31 },
        'equipe',
        'mensal',
        limites,
      ),
    ).toEqual({
      recurso: 'pessoas',
      quantidade: 11,
      limite: 10,
      adicionaisDepois: 4_000,
      mensalDepois: 133_000,
    })
    expect(
      passagemDoLimite(
        'empreendimentos',
        { pessoas: 1, empreendimentos: 30 },
        'equipe',
        'anual',
        limites,
      ),
    ).toMatchObject({ quantidade: 31, limite: 30, mensalDepois: 109_500 })
    // Sem limite (teste, beta, interna): nunca pergunta.
    expect(
      passagemDoLimite('pessoas', { pessoas: 99, empreendimentos: 0 }, null, null, null),
    ).toBeNull()
  })
})

describe('situação comercial', () => {
  const pos: Omit<EntradaDaSituacao, 'hoje'> = {
    criadaEm: '2027-03-24',
    fimDoBeta: '2027-01-31',
    diasDeTeste: 10,
    interna: false,
    assinatura: null,
    vencimentosEmAberto: [],
  }
  const equipe: AssinaturaParaSituacao = {
    plano: 'equipe',
    ciclo: 'mensal',
    planoAgendado: null,
    cicloAgendado: null,
    mudancaEm: null,
    validaAte: null,
  }

  it('beta: criada antes de 01/02/2027 não é cobrada nem bloqueada até 31/01/2027', () => {
    const beta = { ...pos, criadaEm: '2026-11-14' as const }
    expect(situacaoComercial({ ...beta, hoje: '2027-01-31' })).toMatchObject({
      situacao: 'beta',
      somenteLeitura: false,
      orcamentosLiberados: true,
      limites: null,
      betaAte: '2027-01-31',
      testeAte: '2027-02-12',
    })
    expect(situacaoComercial({ ...beta, hoje: '2027-02-05' }).situacao).toBe('teste')
    expect(situacaoComercial({ ...beta, hoje: '2027-02-13' })).toMatchObject({
      situacao: 'teste_encerrado',
      somenteLeitura: true,
      orcamentosLiberados: false,
    })
  })

  it('teste: tudo liberado, como o Escala; acabou sem plano, só leitura', () => {
    expect(situacaoComercial({ ...pos, hoje: '2027-04-07' })).toMatchObject({
      situacao: 'teste',
      somenteLeitura: false,
      orcamentosLiberados: true,
      betaAte: null,
    })
    expect(situacaoComercial({ ...pos, hoje: '2027-04-08' })).toMatchObject({
      situacao: 'teste_encerrado',
      somenteLeitura: true,
    })
    expect(situacaoComercial({ ...pos, diasDeTeste: 0, hoje: '2027-03-24' }).situacao).toBe(
      'teste_encerrado',
    )
  })

  it('conta interna nunca é bloqueada, nem com cobrança vencida', () => {
    expect(
      situacaoComercial({
        ...pos,
        interna: true,
        assinatura: equipe,
        vencimentosEmAberto: ['2027-01-01'],
        hoje: '2028-01-01',
      }),
    ).toMatchObject({
      situacao: 'interna',
      somenteLeitura: false,
      orcamentosLiberados: true,
      limites: null,
    })
  })

  it('assinatura em dia: limites e módulos do plano', () => {
    expect(situacaoComercial({ ...pos, assinatura: equipe, hoje: '2027-05-10' })).toMatchObject({
      situacao: 'ativa',
      planoVigente: 'equipe',
      orcamentosLiberados: true,
      limites: { pessoas: 10, empreendimentos: 30 },
    })
    expect(
      situacaoComercial({
        ...pos,
        assinatura: { ...equipe, plano: 'essencial' },
        hoje: '2027-05-10',
      }).orcamentosLiberados,
    ).toBe(false)
    // Assinou durante o teste: segue em teste (liberado) até o fim dele.
    expect(situacaoComercial({ ...pos, assinatura: equipe, hoje: '2027-03-30' }).situacao).toBe(
      'teste',
    )
  })

  it('atraso: aviso no dia seguinte ao vencimento; só leitura depois de 2 dias úteis', () => {
    const atrasada = { ...pos, assinatura: equipe, vencimentosEmAberto: ['2027-05-07' as const] }
    expect(situacaoComercial({ ...atrasada, hoje: '2027-05-07' }).situacao).toBe('ativa')
    expect(situacaoComercial({ ...atrasada, hoje: '2027-05-08' })).toMatchObject({
      situacao: 'em_atraso',
      somenteLeitura: false,
      emAtrasoDesde: '2027-05-07',
      bloqueioEm: '2027-05-12',
    })
    expect(situacaoComercial({ ...atrasada, hoje: '2027-05-11' }).situacao).toBe('em_atraso')
    expect(situacaoComercial({ ...atrasada, hoje: '2027-05-12' })).toMatchObject({
      situacao: 'bloqueada',
      somenteLeitura: true,
      orcamentosLiberados: false,
    })
    // Feriado no meio da tolerância (Tiradentes).
    expect(
      situacaoComercial({
        ...pos,
        assinatura: equipe,
        vencimentosEmAberto: ['2027-04-20'],
        hoje: '2027-04-23',
      }).situacao,
    ).toBe('em_atraso')
    expect(
      situacaoComercial({
        ...pos,
        assinatura: equipe,
        vencimentosEmAberto: ['2027-04-20'],
        hoje: '2027-04-24',
      }).situacao,
    ).toBe('bloqueada')
    // Pagou: sem vencimento em aberto, volta a ativa.
    expect(situacaoComercial({ ...pos, assinatura: equipe, hoje: '2027-05-20' }).situacao).toBe(
      'ativa',
    )
  })

  it('cancelada: vale até o fim do período pago, depois só leitura', () => {
    const cancelada = { ...pos, assinatura: { ...equipe, validaAte: '2027-06-30' as const } }
    expect(situacaoComercial({ ...cancelada, hoje: '2027-06-30' }).situacao).toBe('ativa')
    expect(situacaoComercial({ ...cancelada, hoje: '2027-07-01' })).toMatchObject({
      situacao: 'cancelada',
      somenteLeitura: true,
    })
  })

  it('descer de plano vale a partir do próximo ciclo', () => {
    const agendada: AssinaturaParaSituacao = {
      ...equipe,
      planoAgendado: 'essencial',
      mudancaEm: '2027-06-01',
    }
    expect(planoVigente(agendada, '2027-05-31')).toBe('equipe')
    expect(planoVigente(agendada, '2027-06-01')).toBe('essencial')
    expect(
      situacaoComercial({ ...pos, assinatura: agendada, hoje: '2027-06-01' }).orcamentosLiberados,
    ).toBe(false)
  })

  it('subir de plano e trocar de ciclo também valem só a partir do próximo ciclo', () => {
    const agendada: AssinaturaParaSituacao = {
      ...equipe,
      plano: 'essencial',
      planoAgendado: 'escala',
      cicloAgendado: 'anual',
      mudancaEm: '2027-06-01',
    }
    expect(situacaoComercial({ ...pos, assinatura: agendada, hoje: '2027-05-31' })).toMatchObject({
      planoVigente: 'essencial',
      cicloVigente: 'mensal',
      orcamentosLiberados: false,
      limites: { pessoas: 3, empreendimentos: 10 },
    })
    expect(situacaoComercial({ ...pos, assinatura: agendada, hoje: '2027-06-01' })).toMatchObject({
      planoVigente: 'escala',
      cicloVigente: 'anual',
      orcamentosLiberados: true,
      limites: { pessoas: 25, empreendimentos: 100 },
    })
    // Só o ciclo muda: o plano continua.
    const soCiclo = { ...equipe, cicloAgendado: 'anual' as const, mudancaEm: '2027-06-01' as const }
    expect(cicloVigente(soCiclo, '2027-06-01')).toBe('anual')
    expect(planoVigente(soCiclo, '2027-06-01')).toBe('equipe')
  })

  it('vence hoje: a faixa da Gestão avisa no próprio dia do vencimento, ainda sem atraso', () => {
    const vencendo = { ...pos, assinatura: equipe, vencimentosEmAberto: ['2027-05-07' as const] }
    expect(situacaoComercial({ ...vencendo, hoje: '2027-05-07' })).toMatchObject({
      situacao: 'ativa',
      venceHoje: true,
      emAtrasoDesde: null,
    })
    expect(situacaoComercial({ ...vencendo, hoje: '2027-05-06' }).venceHoje).toBe(false)
    expect(situacaoComercial({ ...vencendo, interna: true, hoje: '2027-05-07' }).venceHoje).toBe(
      false,
    )
  })

  it('beta com assinatura feita no beta: liberada, mostra o plano escolhido', () => {
    expect(
      situacaoComercial({ ...pos, criadaEm: '2026-12-01', assinatura: equipe, hoje: '2027-01-10' }),
    ).toMatchObject({
      situacao: 'beta',
      planoVigente: 'equipe',
      cicloVigente: 'mensal',
      limites: null,
    })
  })
})

describe('primeiro vencimento de uma assinatura nova', () => {
  it('assinou no teste (ou no beta): vence no dia seguinte ao fim do teste', () => {
    expect(primeiroVencimento('2027-03-25', '2027-04-07')).toBe('2027-04-08')
    expect(primeiroVencimento('2026-12-10', '2027-02-12')).toBe('2027-02-13')
  })
  it('assinou depois do teste: vence hoje', () => {
    expect(primeiroVencimento('2027-04-08', '2027-04-07')).toBe('2027-04-08')
    expect(primeiroVencimento('2027-05-20', '2027-04-07')).toBe('2027-05-20')
  })
})

describe('catálogo vindo do banco (editado pela central)', () => {
  const editado: CatalogoComercial = {
    planos: {
      ...CATALOGO_PADRAO.planos,
      equipe: { ...CATALOGO_PADRAO.planos.equipe, mensalCentavos: 139_000, pessoas: 12 },
    },
    configuracao: {
      ...CATALOGO_PADRAO.configuracao,
      adicionalMensalCentavos: 2_500,
      mensalidadesNoAnual: 11,
      diasUteisDeTolerancia: 0,
    },
  }

  it('sem catálogo, as constantes de sempre', () => {
    expect(CATALOGO_PADRAO.planos).toBe(PLANOS)
    expect(valorDoCiclo('equipe', 'anual', CATALOGO_PADRAO)).toBe(valorDoCiclo('equipe', 'anual'))
  })

  it('valores, adicionais e limites usam o catálogo recebido', () => {
    expect(valorDoCiclo('equipe', 'mensal', editado)).toBe(139_000)
    expect(valorDoCiclo('equipe', 'anual', editado)).toBe(1_529_000)
    expect(equivalenteMensal('equipe', 'anual', editado)).toBe(127_417)
    expect(economiaDoAnual('equipe', editado)).toBe(139_000)
    expect(limitesDoPlano('equipe', editado)).toEqual({ pessoas: 12, empreendimentos: 30 })
    expect(
      adicionaisDoUso(
        { pessoas: 14, empreendimentos: 30 },
        limitesDoPlano('equipe', editado),
        editado,
      ).valorCentavos,
    ).toBe(5_000)
    expect(
      valorMensalComAdicionais('equipe', 'mensal', { pessoas: 13, empreendimentos: 0 }, editado),
    ).toBe(141_500)
    expect(
      passagemDoLimite(
        'pessoas',
        { pessoas: 12, empreendimentos: 0 },
        'equipe',
        'mensal',
        limitesDoPlano('equipe', editado),
        editado,
      ),
    ).toMatchObject({ quantidade: 13, limite: 12, adicionaisDepois: 2_500, mensalDepois: 141_500 })
    expect(ehPlanoMaior('equipe', 'escala', editado)).toBe(true)
  })

  it('a tolerância do atraso vem da configuração', () => {
    const entrada: EntradaDaSituacao = {
      hoje: '2027-05-10',
      criadaEm: '2027-03-24',
      fimDoBeta: '2027-01-31',
      diasDeTeste: 10,
      interna: false,
      assinatura: {
        plano: 'equipe',
        ciclo: 'mensal',
        planoAgendado: null,
        cicloAgendado: null,
        mudancaEm: null,
        validaAte: null,
      },
      vencimentosEmAberto: ['2027-05-07'],
    }
    expect(situacaoComercial(entrada).situacao).toBe('em_atraso')
    expect(situacaoComercial(entrada, editado)).toMatchObject({
      situacao: 'bloqueada',
      limites: { pessoas: 12, empreendimentos: 30 },
    })
  })
})
