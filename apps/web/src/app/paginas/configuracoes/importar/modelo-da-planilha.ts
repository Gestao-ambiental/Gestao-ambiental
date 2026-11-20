// Modelo .xlsx da importação (ADR-0043), gerado no navegador: só o cabeçalho, sem linha de
// exemplo (09 Regras de negócio, linha 19: dado de exemplo nunca substitui dado ausente).
import { CAMPOS_DA_IMPORTACAO, type EntidadeDaImportacao } from '@gestao-ambiental/domain'
import { utils, write } from 'xlsx'

export function nomeDoModelo(entidade: EntidadeDaImportacao): string {
  return entidade === 'licenca' ? 'modelo-licencas.xlsx' : 'modelo-empreendimentos.xlsx'
}

export function gerarModeloDaPlanilha(entidade: EntidadeDaImportacao): Uint8Array<ArrayBuffer> {
  const rotulos = CAMPOS_DA_IMPORTACAO[entidade].map((c) => c.rotulo)
  const aba = utils.aoa_to_sheet([rotulos])
  aba['!cols'] = rotulos.map((r) => ({ wch: Math.max(14, r.length + 4) }))
  const livro = utils.book_new()
  utils.book_append_sheet(livro, aba, entidade === 'licenca' ? 'Licenças' : 'Empreendimentos')
  const bytes = write(livro, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
  return new Uint8Array(bytes)
}
