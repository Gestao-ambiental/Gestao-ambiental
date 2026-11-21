// Páginas recortadas do DOEM de Joinville no SEI (20/11/2026), com a marcação que o servidor gera:
// lista de edições (cartões acaoCard), lista de documentos de uma edição (tabelaDocs, com tipo e
// unidade) e documento (publicacao_visualizar). As páginas são servidas em ISO-8859-1, como no SEI;
// por isso aqui não há caractere fora do Latin-1. A AuA é a 77/2026 publicada, com nomes trocados por
// "Fulano de Tal"; a IN SAMA 5/2026, a Portaria 410/2026 e a Resolução COMDEMA 4/2026 são exemplos
// montados para o teste.

function cartaoDeEdicao(numero: string, data: string, extraordinaria: boolean): string {
  const compacta = data.split('/').reverse().join('')
  return `
                <div class="card-jornal" onclick="acaoCard('${numero}', '${data}', '${extraordinaria ? '1' : '0'}', 'controlador_publicacoes.php?acao=md_pmj_doem_jornal_externo_individual&num_edicao=${numero}&id_orgao_publicacao=0', 'controlador_publicacoes.php?acao=md_pmj_doem_jornal_externo_imprimir_pdf&id_orgao_publicacao=0&num_edicao=${numero}&data_publicacao=${compacta}', '0', '0', '0')">
                    <span class="edicao-label">Edi&ccedil;&atilde;o N&ordm;</span>
                    <div class="edicao-numero">${numero}</div>
                    <div class="info-grupo">
                        <span class="data-pub">${data}</span>
                        <div style="min-height:16px;">${extraordinaria ? '<span class="badge-extra">Extraordin&aacute;ria</span>' : ''}</div>
                    </div>
                </div>`
}

export const LISTA_DE_EDICOES = `<!DOCTYPE html>
<html lang="pt-br"><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Di&aacute;rio Oficial - Joinville</title></head><body>
        <div class="resumo-busca">
            <div class="resumo-texto">Encontradas <strong>3391</strong> edi&ccedil;&otilde;es.</div>
        </div>
        <div class="container-cards" id="container-cards">${cartaoDeEdicao('3094', '19/11/2026', false)}${cartaoDeEdicao('3093', '18/11/2026', true)}${cartaoDeEdicao('3092', '18/11/2026', false)}
        </div>
</body></html>`

function linhaDeDocumento(
  tipo: string,
  unidade: string,
  idDocumento: string,
  protocolo: string,
): string {
  const url = `controlador_publicacoes.php?acao=publicacao_visualizar&id_documento=${idDocumento}&id_orgao_publicacao=0`
  const clique = `visualizarDocEAnexo('${url}', '${protocolo}', false, '${url}', true);`
  return `
                    <tr onclick="selecionarLinha(this, event)"
                        data-tipo="${tipo}"
                        data-unidade="${unidade}"
                        data-anexos='[]'>
                        <td onclick="${clique}" class="link-principal">
                            <!-- <a onclick="${clique}" class="link-principal"> -->
                                ${tipo} ${protocolo}                            <!-- </a> -->
                        </td>
                        <td onclick="${clique}" class="link-principal-2">
                            ${unidade}                        </td>
                        <td onclick="${clique}" class="link-principal-2">
                                                    </td>
                    </tr>`
}

function paginaDaEdicao(linhas: string[]): string {
  // Sem charset declarado, como a página real da edição.
  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="" /><title>Di&aacute;rio Oficial Eletr&ocirc;nico do Munic&iacute;pio de Joinville</title></head><body>
    <div class="wrapper-doem">
        <div class="col-lista">
            <table class="infraTable" id="tabelaDocs">
                <thead><tr><th>Documento</th><th width="80px">Unidade</th><th width="60px">Anexo</th></tr></thead>
                <tbody>${linhas.join('')}
                </tbody>
            </table>
        </div>
    </div>
</body></html>`
}

export const ID = {
  instrucaoNormativa: '10000034500001',
  auA: '10000034434727',
  portariaDePessoal: '10000034457256',
  decretoDaSegov: '10000034415036',
  licencaDeInstalacao: '10000034434499',
  resolucaoComdema: '10000034500002',
}

/** Edição ordinária de 18/11: IN da SAMA, AuA, LAI, portaria de pessoal e decreto da SEGOV. */
export const EDICAO_3092 = paginaDaEdicao([
  linhaDeDocumento('Decreto', 'SEGOV.UAD', ID.decretoDaSegov, '31628217'),
  linhaDeDocumento('Instrução Normativa', 'SAMA.UNF', ID.instrucaoNormativa, '31700001'),
  linhaDeDocumento('Autorização Ambiental - AuA', 'SAMA.UAT', ID.auA, '31646646'),
  linhaDeDocumento(
    'Licença Ambiental de Instalação',
    'SAMA.UAT.AEE',
    ID.licencaDeInstalacao,
    '31646432',
  ),
  linhaDeDocumento('Portaria', 'SAMA.UGC', ID.portariaDePessoal, '31667665'),
  linhaDeDocumento('Extrato', 'SAMA.UGC.PAP', '10000032285413', '29655738'),
])

/** Edição extraordinária de 18/11: resolução do COMDEMA. */
export const EDICAO_3093 = paginaDaEdicao([
  linhaDeDocumento('Resolução', 'SAMA.UGC', ID.resolucaoComdema, '31700002'),
])

const TIMBRE =
  '<p><span>&nbsp; &nbsp; &nbsp;<img alt="Timbre" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" /></span></p>'

function documento(titulo: string, edicao: string, corpo: string): string {
  return `<!DOCTYPE html>\r
<html lang="pt-br" >\r
<head>\r
<title>SEI/PMJ - ${titulo}</title>\r
<meta name="robots" content="noindex" />\r
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />\r
<style>p { margin: 0; }</style>\r
</head>\r
<body class="infra-doc">\r
<div style="font-weight: 500; text-align: left; font-size: 9pt; border: 2px solid #777; position: absolute; left: 67%;">Módulo SEI - Diário Oficial Eletrônico do Município de Joinville nº ${edicao}<br />\r
Disponibilização: 18/11/2026<br />\r
Publicação: 18/11/2026<br />\r
</div>\r
${TIMBRE}\r
${corpo}\r
</body>\r
</html>`
}

export const DOCUMENTO_IN = documento(
  '31700001 - Instrução Normativa',
  '3092',
  `<p style="text-align: center;"><strong>Instrução Normativa SEI Nº 5/2026 - SAMA.UNF</strong></p>
<p>Estabelece os procedimentos para o licenciamento ambiental de atividades de baixo impacto no Município de Joinville.</p>
<p>A Secretaria de Meio Ambiente - SAMA, no uso das atribuições que lhe são conferidas pela Lei nº 9.219/2022,</p>
<p>Art. 1º O licenciamento ambiental das atividades de baixo impacto segue esta Instrução Normativa.</p>
<p>Art. 2º O requerimento é assinado pelo responsável técnico, inscrito no CPF 123.456.789-09, e pelo empreendedor.</p>
<p>Art. 3º Esta Instrução Normativa entra em vigor na data de sua publicação.</p>
<p>Fulano de Tal<br />Secretário de Meio Ambiente</p>`,
)

export const DOCUMENTO_PORTARIA_DE_PESSOAL = documento(
  '31667665 - Portaria',
  '3092',
  `<p><strong>Portaria SEI Nº 410/2026 - SAMA.UGC</strong></p>
<p>O Secretário de Meio Ambiente, no uso de suas atribuições, RESOLVE:</p>
<p>Art. 1º Designar o servidor Fulano de Tal, matrícula 12345, para exercer a função gratificada de coordenador.</p>`,
)

export const DOCUMENTO_RESOLUCAO_COMDEMA = documento(
  '31700002 - Resolução',
  '3093',
  `<p><strong>Resolução COMDEMA SEI Nº 4/2026 - SAMA.UGC</strong></p>
<p>Revoga a Resolução nº 2/2025 e dispõe sobre a supressão de vegetação em área urbana consolidada.</p>
<p>O Conselho Municipal do Meio Ambiente, no uso de suas atribuições,</p>
<p>Art. 1º A supressão de vegetação em área urbana consolidada depende de licenciamento ambiental.</p>
<p>Art. 2º Fica revogada a Resolução nº 2/2025.</p>`,
)

/** AuA SEI 77/2026 (DOEM 3094), recortada e com os nomes trocados. */
export const DOCUMENTO_AUA = documento(
  '31646646 - Autorização Ambiental - AuA',
  '3094',
  `<p style="text-align: center;"><strong>Autorização Ambiental - AuA SEI Nº 77/2026 - SAMA.UAT</strong></p>
<p>Licença válida por&nbsp; 48 meses , a contar da data da assinatura.</p>
<p>A&nbsp;Secretaria de Meio Ambiente - SAMA, pessoa jurídica de direito público interno, criada pela&nbsp;Lei Ordinária Municipal nº 9219, de 12/07/2022, confere a presente&nbsp;Autorização.</p>
<p>1-IDENTIFICAÇÃO DO REQUERENTE/EMPREENDIMENTO</p>
<p>Razão Social: EMPRESA DE TESTE LTDA</p>
<p>Código Enquadramento Resolução&nbsp;CONSEMA nº 251/2024: 12.80.00</p>
<p>Responsável&nbsp;Técnico: Fulano de Tal</p>`,
)
