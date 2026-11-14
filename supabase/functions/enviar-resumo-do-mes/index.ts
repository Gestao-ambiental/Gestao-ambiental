// Edge Function enviar-resumo-do-mes (ADR-0027): resumo do mês anterior para a Gestão de cada
// consultoria não arquivada, chamada pelo GitHub Actions no dia 1 (.github/workflows/resumo-do-mes.yml)
// com o header x-cron-token; e o "Enviar resumo de teste para mim" da central (JWT do operador).
// verify_jwt = false (supabase/config.toml): quem protege é o CRON_TOKEN e, no teste, o banco.
// Segredos: CRON_TOKEN, RESEND_API_KEY e AVISO_REMETENTE. Nunca em log, nem e-mails e números.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoResumo, type LinhaDoResumo } from '../_shared/resumo-do-mes.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }

interface LinhaDoBanco {
  consultoria_id: string
  consultoria_nome: string
  mes_do_resumo: string
  mes: string
  horas_total: number
  reais_centavos: number | null
  horas_estimadas: boolean
  juntando_dados: boolean
  prazo_previstas: number
  prazo_cumpridas: number
  renovacoes_vencendo: number
  renovacoes_protegidas: number
}

function converter(linhas: LinhaDoBanco[] | null): LinhaDoResumo[] {
  return (linhas ?? []).map((l) => ({
    consultoriaId: l.consultoria_id,
    consultoriaNome: l.consultoria_nome,
    mesDoResumo: l.mes_do_resumo,
    mes: l.mes,
    horasTotal: Number(l.horas_total),
    reaisCentavos: l.reais_centavos === null ? null : Number(l.reais_centavos),
    horasEstimadas: l.horas_estimadas,
    juntandoDados: l.juntando_dados,
    prazoPrevistas: Number(l.prazo_previstas),
    prazoCumpridas: Number(l.prazo_cumpridas),
    renovacoesVencendo: Number(l.renovacoes_vencendo),
    renovacoesProtegidas: Number(l.renovacoes_protegidas),
  }))
}

const admin = () => createClient(url, servico, opcoes)

Deno.serve(
  criarTratadorDoResumo({
    env: (nome) => Deno.env.get(nome),
    fetch,
    async resumosPendentes() {
      const { data, error } = await admin().rpc('resumos_do_mes_pendentes', {})
      if (error) throw new Error('pendentes')
      return converter(data as LinhaDoBanco[] | null)
    },
    async emailsDaGestao(consultoriaId) {
      const { data, error } = await admin()
        .from('membro')
        .select('email')
        .eq('consultoria_id', consultoriaId)
        .eq('papel', 'gestao')
        .eq('situacao', 'ativo')
      if (error) throw new Error('membro')
      return (data as { email: string }[]).map((m) => m.email).filter((e) => e.includes('@'))
    },
    async registrarEnvio(consultoriaId, mes, destinatarios) {
      const { data, error } = await admin().rpc('registrar_envio_do_resumo', {
        p_consultoria_id: consultoriaId,
        p_mes: mes,
        p_destinatarios: destinatarios,
      })
      if (error) throw new Error('registrar')
      return data === true
    },
    async resumoDeTeste(autorizacao, consultoriaId) {
      const usuario = createClient(url, anonima, {
        ...opcoes,
        global: { headers: { Authorization: autorizacao } },
      })
      const { data, error } = await usuario.rpc('central_resumo_do_mes', {
        p_consultoria_id: consultoriaId,
      })
      if (error) return { linhas: [], email: null, erro: error.message }
      const jwt = autorizacao.replace(/^Bearer\s+/i, '')
      const { data: conta } = await usuario.auth.getUser(jwt)
      return {
        linhas: converter(data as LinhaDoBanco[] | null),
        email: conta.user?.email ?? null,
        erro: null,
      }
    },
  }),
)
