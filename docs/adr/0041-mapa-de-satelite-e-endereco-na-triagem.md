# ADR-0041: Mapa de satélite e busca de endereço na triagem

- Situação: proposta (camada `camada/identidade-nova`)
- Data: 20/11/2026

## Contexto

O Eduardo pediu a triagem em etapas como o orçamento, o mapa de satélite no lugar do mapa de ruas e a opção de escrever o endereço. O app é comercial: cada fonte precisa permitir esse uso.

## Decisão

- **Etapas:** 1 Local, 2 Atividades e porte, 3 Resultado, com a trilha e o pé "Voltar / Continuar" do editor de orçamento, a etapa na URL (`?etapa=`) e um resumo ao lado (embaixo no celular) com local, município e habilitação, lote, restrições, atividades e enquadramento. A habilitação do município fica junto do município (resumo e resultado do local) e no resultado, onde decide quem licencia; é lembrada por município só no navegador.
- **Imagem:** ortofoto oficial de SC (SIGSC/SDE, aerolevantamento 2010-2012, 0,39 m), WMS `https://sigsc.sc.gov.br/sigserver/SIGSC/wms`, camada `OrtoRGB-Landsat-2012`. O metadado oficial diz "O acesso ao dado é livre"; não há licença explícita nem texto de atribuição, então usamos "Ortofoto: Governo de Santa Catarina/SDE, 2010-2012". Recusadas: Esri World Imagery (licença comercial restrita), Sentinel-2 cloudless 2017+ (não comercial; a de 2016 é livre, mas com 10 m não mostra o lote) e as ortofotos do SIMGeo Joinville (sem licença publicada).
- **Nomes por cima:** estilo vetorial "positron" do OpenFreeMap (uso comercial liberado, sem chave), só ruas, bairros e cidades, em branco com contorno, por `maplibre-gl` 6.16.0 e `@maplibre/maplibre-gl-leaflet` 0.1.4. Sem WebGL, fica só a foto.
- **Endereço:** Edge Function `buscar-endereco` com o Photon (photon.komoot.io, dados do OpenStreetMap), feito para busca enquanto se digita. O Nominatim proíbe autocompletar. Caixa e filtro de Santa Catarina, cache de 24 h por texto, 30 buscas por minuto por sessão, User-Agent do Grama, sem log do texto buscado e sem devolver o CEP do OpenStreetMap (pouco confiável). A tela espera 400 ms e 4 letras antes de buscar.
- **Inscrição imobiliária (20/11/2026):** o mesmo campo aceita a inscrição de Joinville ("13-20-23-7-239", com pontos, espaços ou zeros à esquerda; regra em `packages/domain`, repetida na função). A `buscar-endereco` consulta a camada de lotes do SIMGeo (`SEPUR/divisao_territorial_simgeo_v4/MapServer/4`, a mesma do `consultar-local`) só com `iq`, `quadra` e `lote`, devolve o centro e o contorno do lote, e o mapa desenha o contorno em lima. Não achou: "Inscrição não encontrada no SIMGeo de Joinville"; SIMGeo fora do ar: erro próprio (`simgeo_indisponivel`). Por enquanto, só Joinville.
- **CSP (`vercel.json`):** `img-src` ganha `https://sigsc.sc.gov.br` e perde `tile.openstreetmap.org`; `connect-src` ganha `https://tiles.openfreemap.org`; `worker-src 'self' blob:` para o MapLibre.

## Consequências

- Publicar `buscar-endereco` no Supabase depende de ok (sem segredo; só rede de saída para photon.komoot.io).
- A ortofoto é de 2010-2012: obra recente pode não aparecer. Vale pedir à SDE (geoprocessamento@sde.sc.gov.br) uma confirmação por escrito do uso comercial e do texto de atribuição, e à Prefeitura de Joinville (simgeo@joinville.sc.gov.br) a licença das ortofotos de 15 cm e da imagem de 2022.
- O Photon público é de uso justo, sem garantia. Com volume, a saída é instalar o Photon (Apache 2.0) ou um provedor com chave (ex.: Geoapify), decisão de uma pessoa.
