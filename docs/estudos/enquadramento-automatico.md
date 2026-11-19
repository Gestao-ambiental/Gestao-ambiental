# Enquadramento automático: do lote e do CNPJ à licença

Proposta para o Grama preencher a triagem de licenciamento sozinho. A pessoa aponta o lote no mapa
e informa o CNPJ. O sistema devolve quem licencia (município ou IMA), o que pedir (LAP/LAI/LAO, AuA,
CCA, DANC, renovação) e as restrições do terreno. Fontes pesquisadas e testadas em 19/11/2026.
O que não foi testado de verdade está marcado.

Base já pronta no PR da triagem (`docs/estudos/triagem-licenciamento-consema-250.md`):

- catálogo da CONSEMA 250/2024 (estadual) e da 251/2024 (impacto local, níveis I a III);
- `definirCompetencia` (município ou Estado);
- `enquadrarAtividade` e `concluirTriagem`.

## O que dá para automatizar e o que não dá

| Pergunta                                              | Fonte                                                                                                                    | Automatizável?                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Em que município está o lote                          | IMA `Limites_Administrativos/MapServer/168` (IBGE 2022), consulta por ponto                                              | **Sim**, testado (Joinville = 4209102) |
| Lote, inscrição imobiliária, bairro                   | SIMGeo Joinville `SEPUR/divisao_territorial_simgeo_v4/MapServer/4` (`iq`, `quadra`, `lote`)                              | **Sim**, testado, só Joinville         |
| Zoneamento (LOT, LC 470/2017)                         | SIMGeo `SEPUR/ordenamento_territorial_simgeo_v4/MapServer/49` (`sigla_z`)                                                | **Sim**, testado                       |
| APP e faixa não edificável                            | SIMGeo `SAMA/consulta_usos_aplicativo/MapServer/5` (`restricao`, `faixa`); fora de Joinville, IMA `Áreas_Protegidas/281` | **Sim**, testado                       |
| UC, zona de amortecimento, terra indígena, quilombola | IMA `Áreas_Protegidas` 204, 266, 187, 240 (SC inteira)                                                                   | **Sim**, testado                       |
| Inundação, risco geológico                            | SIMGeo `consulta_usos_aplicativo` 8 e 9                                                                                  | Sim (não testado campo a campo)        |
| Condomínio industrial ou empresa isolada              | Não há camada. Aproximação: setor SI do zoneamento + loteamento                                                          | **Parcial**: perguntar à pessoa        |
| CNAEs da empresa e endereço                           | BrasilAPI `/api/cnpj/v1/{cnpj}` (sem chave). Alternativa: dados abertos da Receita                                       | **Sim**, testado                       |
| Atividades CONSEMA a partir do CNAE                   | Não há tabela oficial CNAE → CONSEMA                                                                                     | **Sugestão** com confirmação da pessoa |
| CNAE dispensado pelo IMA                              | Resolução CGSIM-SC nº 3/2026 (Lei SC 19.481/2025), três listas                                                           | **Sim**, importando a lista            |
| Licença ativa no IMA                                  | consultas.ima.sc.gov.br/consulta (por CNPJ, devolve JSON)                                                                | **Não**: reCAPTCHA                     |
| Licença ativa na SAMA                                 | Painel Looker "Consulta licenças ambientais emitidas pela SAMA"                                                          | **Não**: sem API                       |
| Processo no SEI de Joinville                          | Pesquisa pública do SEI                                                                                                  | **Não**: CAPTCHA de imagem             |
| CTF/APP do IBAMA (inscrição e certificado)            | Dados abertos do IBAMA, CSV diário com CNPJ                                                                              | **Sim**, importando o arquivo          |

**Não vamos contornar CAPTCHA.** Onde ele existe, o fluxo é: um link que abre a consulta oficial
com instruções; a pessoa consulta e envia a licença em PDF. O Grama já extrai licença de PDF por IA
(épico 9). Com a licença lida (tipo, número, validade, atividade), o Grama decide entre:

- renovação de LAO;
- LAO corretiva;
- nova LAP, quando a ampliação muda o estudo (250/2024, Art. 11, I);
- LAI direta, quando muda só o porte (Art. 11, II);
- só um ofício, quando não muda o porte (Art. 11, §§1º e 2º).

Vale também pedir ao IMA e à SAMA, por LAI ou parceria, acesso aos dados de licenças.

## Fluxo proposto

1. **Lote.**
   - A pessoa marca o ponto no mapa ou digita a inscrição imobiliária.
   - Uma Edge Function consulta as camadas por ponto (ou pelo polígono do lote) e devolve município,
     lote e IQ, zoneamento e restrições.
   - Para APP, a consulta usa um raio de 30 m ou o polígono do lote, não só o ponto.
2. **Município.**
   - Pelo código IBGE, o Grama sabe o nível de habilitação (tabela mantida pela Gestão do Grama a
     partir das resoluções CONSEMA de habilitação).
   - Com isso, `definirCompetencia` decide entre 251 e 250.
3. **CNPJ.**
   - A Edge Function consulta a BrasilAPI.
   - Ela traz CNAE principal e secundários, situação cadastral e endereço, e confere se o endereço
     bate com o município do lote.
   - Marca os CNAEs da lista de dispensa do IMA (CGSIM-SC nº 3/2026).
4. **Sugestão de atividades CONSEMA.**
   - Mapeamento curado por divisão CNAE (2 dígitos) → grupos do Anexo VI.
   - Dentro do grupo, a ordem vem da semelhança entre a descrição do CNAE (e as atividades da CNAE no
     IBGE) e a do item CONSEMA.
   - A pessoa confirma. Cada confirmação vira mapeamento curado (`cnae_consema`, origem "sugerido" ou
     "confirmado").
5. **Parâmetros.**
   - O porte não sai do CNPJ: área útil, produção etc. são perguntados.
   - A área do lote vinda do SIMGeo pode sugerir AU(3).
6. **Resultado.**
   - Órgão, modalidade, estudo e restrições do terreno.
   - Caminho de CCA (abaixo do porte, Art. 14) ou DANC (atividade fora do Anexo VI, Art. 15).
   - Tudo marcado como triagem.

## Regras e cuidados

- **Onde roda:** rede externa só por Edge Function (regra do projeto), com cache, timeout e
  `outFields` explícitos. Algumas camadas do SIMGeo trazem `nom_propri` e `usuario_ad`, que são dados
  pessoais e não devem ser pedidos nem gravados.
- **Sem CPF:** a consulta de CNPJ não grava sócios (`qsa`).
- **Uso dos dados públicos:** o SIMGeo não publica licença de uso. Confirmar o uso comercial com
  simgeo@joinville.sc.gov.br e citar a fonte. O IMA declara `AccessConstraints NONE` no GeoServer.
- **Limite da BrasilAPI:** não há limite oficial publicado, então é preciso cache por CNPJ.
  Alternativa robusta: hospedar a base aberta da Receita.
- **Fora do ar no teste:** SIGSC (estadual), INCRA direto e FUNAI direto (403). O espelho do IMA
  cobre terra indígena e quilombola.

## Fatias sugeridas

1. **Feito neste PR.** Competência pela 251/2024, com o nível do município escolhido à mão na tela.
2. **Consulta de lote** (Edge Function `consultar-lote` + mapa na triagem):
   - município pelo ponto, lote/IQ, zoneamento, APP e áreas protegidas;
   - testes Deno com respostas gravadas.
3. **Consulta de CNPJ** (Edge Function `consultar-cnpj`):
   - CNAEs, situação e endereço;
   - lista de dispensa do IMA;
   - sugestão de atividades CONSEMA a confirmar.
4. **Habilitação dos municípios:** tabela por código IBGE com o nível da 251/2024 e a resolução de
   origem. Joinville primeiro.
5. **Licenças existentes:** links para as consultas do IMA e da SAMA, envio da licença em PDF
   (extração já existente) e regras do Art. 11. Também a importação diária do CTF/APP do IBAMA.

## Pontos a confirmar com produto

- O nível de habilitação de Joinville na 251/2024 e a resolução de habilitação.
- A leitura cumulativa dos níveis da 251: o município no nível N licencia o que está listado até N.
  O texto diz "em ordem crescente de complexidade". O nível II não traz 17.21.00, 71.11.02 e
  71.11.03, que estão no I e no III.
- Quando várias atividades caem em órgãos diferentes, o Grama aponta o Estado se alguma for estadual
  (um órgão licencia o empreendimento inteiro). Falta confirmar com a regra de "maior impacto".
- Se o setor SI do zoneamento indica uso industrial (LC 470/2017).
