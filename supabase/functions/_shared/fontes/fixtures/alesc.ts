// Páginas recortadas de leis.alesc.sc.gov.br (20/11/2026): o ato 16618 (Lei 14.675/2009, cabeçalho e
// dois artigos) e a busca por GET (?search=...&sort=data_desc), com a marcação dos cartões como o
// servidor gera. O nome de quem assina vem trocado por "Fulano de Tal". Os ids 13800 (Lei 14.262) e
// 54690 e 54688 (Leis 20.115 e 20.112) e a Lei 20.115 inteira são exemplos montados para o teste.

/** Ato 16618; `alteradaTambem` acrescenta leis ao fim de "Alterada pelas Leis". */
export function atoDaLei14675(alteradaTambem = ''): string {
  return `<!DOCTYPE html>
<html><head>
  <meta name="dc:subject" content="14675     Código Estadual do Meio Ambiente">
  <title>LEI Nº 14.675, de 13 de abril de 2009</title>
  <meta charset="utf-8"><style>body { font-size: 11pt; } .epigrafe { font-weight: bold; }</style></head><body>
  <p class="epigrafe">LEI Nº 14.675, de 13 de abril de 2009 </p>
  <a href="https://leis.alesc.sc.gov.br/ato-normativo/16618/compilado" target="_blank">Ver Versão compilada</a>
  <div class="procedencia">
   <p>Procedência: Governamental </p>
   <p>DO: <a href="https://acervo.arquivopublico.sc.gov.br/doe.pdf" target="_blank">18.585</a> de 14/04/09 </p>
   <p><br>
    <strong>Alterada pelas Leis</strong>: <a href="https://leis.alesc.sc.gov.br/html/2025/19291_2025_lei.html" target="_blank">19.291/2025</a>; <a href="https://leis.alesc.sc.gov.br/html/2025/19314_2025_lei.html" target="_blank">19.314/2025</a>; <a href="https://leis.alesc.sc.gov.br/html/2025/19677_2025_lei.html" target="_blank">19.677/2025</a>${alteradaTambem}</p>
<p>ADI TJSC <a href="https://eprocwebcon.tjsc.jus.br/x">5069066-65.2025.8.24.0000</a> - julgou parcialmente procedente o pedido quanto ao § 11 do art. 57-A, na redação da Lei Estadual n. 19.314/2025. (05/08/2026)</p>
<p><strong>Decretos</strong>: 2471/2009; 1486/2026; 1517/2026</p>
   <p>Fonte: ALESC/GCAN</p>
  </div>
  <div class="ementa"><p>Institui o Código Estadual do Meio Ambiente e estabelece outras providências.</p> </div>
  <div class="preambulo"><p><span style="font-weight: bold;">O GOVERNADOR DO ESTADO DE SANTA CATARINA</span>, </p>
  <p>Faço saber a todos os habitantes deste Estado que a Assembléia Legislativa decreta e eu sanciono a seguinte Lei: </p></div>
  <div class="titulo">
   <p>TÍTULO I </p>
   <p>das DISPOSIÇÕES GERAIS</p>
  </div>
  <div class="artigo">
   <p>Art. 1<s>º</s>
Esta Lei, ressalvada a competência da União e dos Municípios,
estabelece normas aplicáveis ao Estado de Santa Catarina, visando à
proteção e à melhoria da qualidade ambiental no seu território. </p>
   <p>Art. 2<s>º</s> Para os fins previstos nesta Lei entende-se por licenciamento ambiental o procedimento administrativo. </p>
  </div>
  <div class="fecho">
<p>Florianópolis, 13 de abril de 2009 </p>
  </div>
  <div class="assinatura">
   <p><strong>FULANO DE TAL</strong></p>
   <p>Governador do Estado </p>
  </div>
</body></html>`
}

/** Lei 20.115/2026 (exemplo), com um CPF no texto para conferir a remoção. */
export const ATO_DA_LEI_20115 = `<!DOCTYPE html>
<html><head><title>LEI Nº 20.115, DE 25 DE NOVEMBRO DE 2026</title><meta charset="utf-8"></head><body>
  <p class="epigrafe">LEI Nº 20.115, DE 25 DE NOVEMBRO DE 2026</p>
  <div class="procedencia">
   <p>Procedência: Dep. Fulano de Tal</p>
   <p>Fonte: ALESC/GCAN</p>
  </div>
  <div class="ementa"><p>Dispõe sobre a destinação de resíduos sólidos da construção civil no Estado de Santa Catarina.</p></div>
  <div class="artigo">
   <p>Art. 1<s>º</s> A destinação de resíduos sólidos observa o licenciamento ambiental.</p>
   <p>Art. 2<s>º</s> O cadastro do gerador traz o CPF 123.456.789-09 do responsável.</p>
  </div>
</body></html>`

const LUPA = '<svg aria-hidden="true" viewBox="0 0 512 512"><path d="M416 208"></path></svg>'

function cartao(href: string, titulo: string, resumo: string): string {
  return `<div class=" mb-3 card"><div class="card-body"><div class="card-title h5"><span class="external-link-wrapper"><a href="${href}">${titulo}</a><span class="external-link-icon"><a target="_blank" class="text-secondary" aria-label="Abrir em uma nova guia" href="${href}">${LUPA}</a></span></span></div><p class="m-0 text-muted fst-italic text-truncate" style="line-clamp:2">${resumo}</p></div></div>`
}

function paginaDaBusca(termo: string, cartoes: string[]): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charSet="utf-8"/><title>Legislação / Pesquisa da Legislação Estadual</title></head><body><div id="__next"><div class="row mt-4 mb-3"><div class="col"><h5>Resultados da Pesquisa</h5><div><span class="badge bg-info-subtle text-info-emphasis fw-normal me-1">Palavras-chave<!-- -->: <span class="fw-bold">${termo}</span></span></div></div><div class="col"><div class="d-flex justify-content-end mb-2 text-muted fs-6"><span>Foram encontrados <!-- -->${String(cartoes.length)}<!-- --> resultados. Exibindo página <!-- -->1<!-- --> de <!-- -->1<!-- -->.</span></div></div></div>${cartoes.join('')}</div><script id="__NEXT_DATA__" type="application/json">{"props":{}}</script></body></html>`
}

/** Busca "14.262": a primeira lei só cita a 14.262; a segunda é ela. */
export const BUSCA_DA_LEI_14262 = paginaDaBusca('14.262', [
  cartao(
    '/ato-normativo/legislativo/20658',
    'LEI Nº 17.893, DE 23 DE JANEIRO DE 2020',
    'Altera a Lei nº <strong>14.262</strong>, de 2007, que dispõe sobre a Taxa de Prestação de Serviços Ambientais',
  ),
  cartao(
    '/ato-normativo/legislativo/13800',
    'LEI Nº 14.262, DE 21 DE DEZEMBRO DE 2007',
    'Dispõe sobre a Taxa de Prestação de Serviços Ambientais',
  ),
])

/** Busca "meio ambiente": uma lei depois da carga (nova), uma já no catálogo e duas de antes. */
export const BUSCA_MEIO_AMBIENTE = paginaDaBusca('meio ambiente', [
  cartao(
    '/ato-normativo/legislativo/54690',
    'LEI Nº 20.115, DE 25 DE NOVEMBRO DE 2026',
    'Dispõe sobre a destinação de resíduos sólidos da construção civil',
  ),
  cartao(
    '/ato-normativo/legislativo/54688',
    'LEI Nº 20.112, DE 24 DE NOVEMBRO DE 2026',
    'Institui o Dia Estadual do <strong>Meio</strong> <strong>Ambiente</strong> Escolar',
  ),
  cartao(
    '/ato-normativo/legislativo/54667',
    'LEI Nº 20.101, DE 13 DE NOVEMBRO DE 2026',
    'Altera a Lei nº 14.675, de 2009',
  ),
  cartao(
    '/ato-normativo/legislativo/54456',
    'LEI Nº 20.059, DE 14 DE AGOSTO DE 2026',
    'I – adotará como base para o cálculo do índice “IPM <strong>Ambiental</strong>” definitivo',
  ),
])

/** Página de resultados sem nenhum cartão. */
export const BUSCA_VAZIA = paginaDaBusca('nada', [])
