// "Exportar .ics" do Calendário (ADR-0047, EQ-06): o recorte visível (período e filtros, com
// resíduos e tarefas) vira um arquivo de eventos de dia inteiro, gerado no navegador pelo domínio.
import {
  ROTULO_DA_OBRIGACAO_RESIDUO,
  gerarIcs,
  type DataCivil,
  type EventoIcs,
} from '@gestao-ambiental/domain'

import type { EventoDoCalendario } from '@/lib/api/prazos'
import type { PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'

import { ROTULO_DO_TIPO } from './itens-do-calendario'

const DOMINIO_DO_UID = 'gramaapp.com.br'

function noPeriodo(data: DataCivil, inicio: DataCivil, fim: DataCivil): boolean {
  return data >= inicio && data <= fim
}

function linhas(...partes: (string | null | undefined)[]): string | null {
  const presentes = partes.filter((parte): parte is string => Boolean(parte?.trim()))
  return presentes.length > 0 ? presentes.join('\n') : null
}

/** Evento do banco ou tarefa de serviço. O prazo oficial é a ocorrência (como no feed). */
export function eventoIcsDoCalendario(evento: EventoDoCalendario): EventoIcs {
  const tipo = evento.tipo === 'prazo' ? 'ocorrencia' : evento.tipo
  const rotulo = evento.codigo ?? ROTULO_DO_TIPO[evento.tipo]
  return {
    uid: `${tipo}-${evento.id}@${DOMINIO_DO_UID}`,
    data: evento.data,
    resumo: `${rotulo} · ${evento.empreendimentoNome || evento.titulo}`,
    descricao: linhas(
      evento.titulo,
      evento.licenca ? `Licença: ${evento.licenca}` : null,
      evento.responsavelNome ? `Responsável: ${evento.responsavelNome}` : null,
    ),
  }
}

/** Prazo de obrigação de resíduos: uma obrigação tem vários prazos, então o dia entra no uid. */
export function eventoIcsDoResiduo(prazo: PrazoDeObrigacaoNoCalendario): EventoIcs {
  return {
    uid: `residuo-${prazo.obrigacaoId}-${prazo.prazo}@${DOMINIO_DO_UID}`,
    data: prazo.prazo,
    resumo: `${ROTULO_DA_OBRIGACAO_RESIDUO[prazo.tipo]} · ${prazo.empreendimentoNome}`,
    descricao: linhas(prazo.referencia),
  }
}

/** Eventos do recorte, na ordem do dia (estável entre tipos do mesmo dia). */
export function eventosIcsDoRecorte(
  eventos: readonly EventoDoCalendario[],
  residuos: readonly PrazoDeObrigacaoNoCalendario[],
  inicio: DataCivil,
  fim: DataCivil,
): EventoIcs[] {
  const todos = [
    ...eventos.filter((e) => noPeriodo(e.data, inicio, fim)).map(eventoIcsDoCalendario),
    ...residuos.filter((r) => noPeriodo(r.prazo, inicio, fim)).map(eventoIcsDoResiduo),
  ]
  return todos
    .map((evento, indice) => ({ evento, indice }))
    .sort((a, b) =>
      a.evento.data === b.evento.data
        ? a.indice - b.indice
        : a.evento.data < b.evento.data
          ? -1
          : 1,
    )
    .map(({ evento }) => evento)
}

export function nomeDoArquivoIcs(inicio: DataCivil, fim: DataCivil): string {
  return `grama-calendario-${inicio}-a-${fim}.ics`
}

/** Gera o .ics do recorte e baixa pelo navegador (link temporário). */
export function exportarIcs(
  eventos: readonly EventoIcs[],
  inicio: DataCivil,
  fim: DataCivil,
  agora: Date = new Date(),
): void {
  const conteudo = gerarIcs(eventos, { nome: 'Grama', agora })
  const arquivo = new Blob([conteudo], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(arquivo)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeDoArquivoIcs(inicio, fim)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
