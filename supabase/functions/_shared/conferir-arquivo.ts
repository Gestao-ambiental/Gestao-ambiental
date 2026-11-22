// Edge Function conferir-arquivo: o servidor recalcula o SHA-256 do objeto guardado no Storage e
// grava se confere com o hash declarado no envio (conferencia_de_arquivo). Aprovar a evidência exige
// essa conferência (conferir_evidencia). As dependências vêm injetadas para testar com `deno test`.
//
// 1. Com o JWT de quem pediu: lê a versão (a RLS só mostra a membro ativo da consultoria). Se já foi
//    conferida, devolve o resultado gravado sem baixar de novo.
// 2. Com a service role: baixa o objeto, calcula o SHA-256 e grava (registrar_conferencia_de_arquivo).
//
// O envio não chama esta função de forma obrigatória: quem está sem sinal sobe o arquivo e a
// conferência roda depois (logo após o envio ou, no mais tardar, quando a Gestão vai aprovar).

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RespostaDoBanco<T> {
  dados: T | null
  erro: string | null
}

export interface VersaoParaConferir {
  caminho: string
  /** Resultado já gravado; nulo quando ainda não foi conferida. */
  confere: boolean | null
  sha256Calculado: string | null
}

export interface DependenciasDaConferenciaDeArquivo {
  /** Com o JWT de quem pediu: a versão e a conferência já gravada (RLS de membro ativo). */
  lerVersao: (autorizacao: string, versaoId: string) => Promise<RespostaDoBanco<VersaoParaConferir>>
  /** Service role: o conteúdo do objeto no bucket privado. */
  baixar: (caminho: string) => Promise<RespostaDoBanco<Uint8Array>>
  /** Service role: grava a conferência; devolve se confere. */
  registrar: (versaoId: string, sha256: string) => Promise<RespostaDoBanco<boolean>>
  /** Log da função; recebe só etapas e motivos, nunca o JWT. */
  log?: (linha: string) => void
}

function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export async function sha256Hex(dados: Uint8Array): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', dados as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function criarTratadorDaConferenciaDeArquivo(deps: DependenciasDaConferenciaDeArquivo) {
  const log = deps.log ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const autorizacao = pedido.headers.get('Authorization')
    if (!autorizacao) return responder({ erro: 'sem_permissao' }, 401)

    let versaoId = ''
    try {
      const corpo = (await pedido.json()) as { versaoId?: unknown }
      versaoId = typeof corpo.versaoId === 'string' ? corpo.versaoId : ''
    } catch {
      return responder({ erro: 'pedido_invalido' }, 400)
    }
    if (!UUID.test(versaoId)) return responder({ erro: 'pedido_invalido' }, 400)

    const versao = await deps.lerVersao(autorizacao, versaoId)
    if (versao.erro) {
      log(`conferir-arquivo: leitura da versão falhou: ${versao.erro}`)
      return responder({ erro: 'erro_interno' }, 500)
    }
    if (!versao.dados) return responder({ erro: 'sem_permissao' }, 403)
    if (versao.dados.confere !== null) {
      return responder({ confere: versao.dados.confere, sha256: versao.dados.sha256Calculado })
    }

    const arquivo = await deps.baixar(versao.dados.caminho)
    if (arquivo.erro || !arquivo.dados) {
      log(`conferir-arquivo: download falhou: ${arquivo.erro ?? 'vazio'}`)
      return responder({ erro: 'arquivo_nao_encontrado' }, 409)
    }

    const calculado = await sha256Hex(arquivo.dados)
    const gravado = await deps.registrar(versaoId, calculado)
    if (gravado.erro || gravado.dados === null) {
      log(`conferir-arquivo: gravação falhou: ${gravado.erro ?? 'sem resposta'}`)
      return responder({ erro: 'erro_interno' }, 500)
    }
    return responder({ confere: gravado.dados, sha256: calculado })
  }
}
