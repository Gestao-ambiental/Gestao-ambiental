// Relatório mensal ao cliente (P6, ADR-0052): o que o banco devolve em dados_para_relatorio_mensal
// vira valores dos campos e itens das listas do modelo, e o modelo-semente "Resumo para o cliente".
// O texto diz "Licenças e validades", nunca "em dia": o Grama não afirma regularidade.
import { formatarCnpj } from './cnpj'
import { ehDataCivil, formatarDataCivil } from './data-civil'
import type {
  ItemDoBloco,
  ListasDoModelo,
  NoDoDocumento,
  ValoresDosCampos,
} from './modelo-documento'

/** Dados crus que o banco devolve para o relatório do mês. */
export interface DadosParaRelatorioMensal {
  consultoria: string | null
  autor: string | null
  hoje: string | null
  /** Primeiro dia do mês (aaaa-mm-01). */
  mes: string
  empreendimento: { nome: string | null; cliente: string | null; cnpj: string | null }
  licencas: readonly { titulo: string | null; orgao: string | null; validade: string | null }[]
  entregas: readonly {
    codigo: string | null
    titulo: string | null
    licenca: string | null
    data: string | null
  }[]
  protocolos: readonly { data: string | null; titulo: string | null; detalhe: string | null }[]
  proximos: readonly {
    data: string | null
    tipo: string | null
    codigo: string | null
    titulo: string | null
    licenca: string | null
  }[]
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** "2026-11-01" → "novembro de 2026". */
export function mesPorExtenso(mes: string): string {
  const numero = Number(mes.slice(5, 7))
  const nome = MESES[numero - 1]
  return nome ? `${nome} de ${mes.slice(0, 4)}` : mes
}

function data(texto: string | null | undefined): string | undefined {
  return texto && ehDataCivil(texto) ? formatarDataCivil(texto) : undefined
}

function texto(valor: string | null | undefined): string | undefined {
  const limpo = valor?.trim() ?? ''
  return limpo.length > 0 ? limpo : undefined
}

function item(campos: Record<string, string | undefined>): ItemDoBloco {
  return Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined))
}

/** Valores dos campos e itens das listas, já formatados (dd/mm/aaaa, CNPJ com máscara). */
export function valoresDoRelatorioMensal(dados: DadosParaRelatorioMensal): {
  valores: ValoresDosCampos
  listas: ListasDoModelo
} {
  const e = dados.empreendimento
  const valores: ValoresDosCampos = {}
  const pares: [keyof ValoresDosCampos, string | undefined][] = [
    ['empreendimento.nome', texto(e.nome)],
    ['empreendimento.cliente', texto(e.cliente)],
    ['empreendimento.cnpj', e.cnpj ? texto(formatarCnpj(e.cnpj)) : undefined],
    ['relatorio.consultoria', texto(dados.consultoria)],
    ['relatorio.autor', texto(dados.autor)],
    ['relatorio.data', data(dados.hoje)],
    ['relatorio.mes', mesPorExtenso(dados.mes)],
  ]
  for (const [chave, valor] of pares) if (valor !== undefined) valores[chave] = valor
  return {
    valores,
    listas: {
      licencas: dados.licencas.map((l) =>
        item({ titulo: texto(l.titulo), orgao: texto(l.orgao), validade: data(l.validade) }),
      ),
      entregas: dados.entregas.map((l) =>
        item({
          codigo: texto(l.codigo),
          titulo: texto(l.titulo),
          licenca: texto(l.licenca),
          data: data(l.data),
        }),
      ),
      protocolos: dados.protocolos.map((l) =>
        item({ data: data(l.data), titulo: texto(l.titulo), detalhe: texto(l.detalhe) }),
      ),
      proximos: dados.proximos.map((l) =>
        item({
          data: data(l.data),
          codigo: texto(l.codigo),
          titulo: texto(l.titulo),
          licenca: texto(l.licenca),
        }),
      ),
    },
  }
}

const t = (text: string): NoDoDocumento => ({ type: 'text', text })
const campo = (chave: string): NoDoDocumento => ({ type: 'campo', attrs: { chave } })
const doItem = (chave: string): NoDoDocumento => ({ type: 'campo_do_item', attrs: { chave } })
const titulo = (nivel: number, ...conteudo: NoDoDocumento[]): NoDoDocumento => ({
  type: 'heading',
  attrs: { level: nivel },
  content: conteudo,
})
const paragrafo = (...conteudo: NoDoDocumento[]): NoDoDocumento => ({
  type: 'paragraph',
  content: conteudo,
})
const bloco = (lista: string, vazio: string, ...conteudo: NoDoDocumento[]): NoDoDocumento => ({
  type: 'bloco_repetido',
  attrs: { lista, vazio },
  content: conteudo,
})

export const NOME_DO_RESUMO_PARA_O_CLIENTE = 'Resumo para o cliente'

/** Modelo-semente "Resumo para o cliente": um parágrafo por item de cada lista. */
export function modeloResumoParaOCliente(): NoDoDocumento {
  return {
    type: 'doc',
    content: [
      titulo(1, t('Resumo de '), campo('relatorio.mes')),
      paragrafo(
        campo('empreendimento.nome'),
        t(' · '),
        campo('empreendimento.cliente'),
        t(' · CNPJ '),
        campo('empreendimento.cnpj'),
      ),
      titulo(2, t('Licenças e validades')),
      bloco(
        'licencas',
        'Nenhuma licença ativa cadastrada.',
        paragrafo(
          doItem('titulo'),
          t(' · '),
          doItem('orgao'),
          t(' · validade '),
          doItem('validade'),
        ),
      ),
      titulo(2, t('Entregas do mês')),
      bloco(
        'entregas',
        'Nenhuma entrega concluída no mês.',
        paragrafo(
          doItem('data'),
          t(' · '),
          doItem('codigo'),
          t(' '),
          doItem('titulo'),
          t(' · '),
          doItem('licenca'),
        ),
      ),
      titulo(2, t('Protocolos e respostas a exigências')),
      bloco(
        'protocolos',
        'Nenhum protocolo no mês.',
        paragrafo(doItem('data'), t(' · '), doItem('titulo'), t(' · '), doItem('detalhe')),
      ),
      titulo(2, t('Próximos 90 dias')),
      bloco(
        'proximos',
        'Nenhum prazo nos próximos 90 dias.',
        paragrafo(
          doItem('data'),
          t(' · '),
          doItem('codigo'),
          t(' '),
          doItem('titulo'),
          t(' · '),
          doItem('licenca'),
        ),
      ),
      paragrafo(
        t('Gerado por '),
        campo('relatorio.consultoria'),
        t(' em '),
        campo('relatorio.data'),
        t('.'),
      ),
    ],
  }
}
