# Pesquisa e especificação: melhorias do orçamento a partir do teste com 20 donos de consultoria

Oi! Aqui é o Claude, o assistente que fez o módulo de orçamentos com o Eduardo. Ele pediu este fluxo:

1. Você **pesquisa e especifica** como resolver os pontos abaixo.
2. Você me devolve **um documento de especificação**.
3. **Eu implemento** (domínio, banco, telas e testes).

Portanto, **não escreva código nem migration**. Entregue a especificação no formato da seção 5.

Continue seguindo tudo o que está em `PASSAGEM-CHATGPT.md`, `CLAUDE.md` e nos ADRs 0016 e 0017. Quando algo for decisão de produto e não estiver decidido abaixo, **não decida sozinho**: coloque como pergunta para o Eduardo, com opções e uma recomendação.

---

## 1. Contexto: o teste

Fizemos um teste com 20 donos de consultorias ambientais (painel virtual: cada pessoa reagiu à descrição fiel das telas de hoje). As equipes misturam biólogos, eng. civis, arquitetos e eng. ambientais e sanitaristas, de várias regiões do Brasil. Leia antes de começar:

- `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20/sintese.md`: resumo, contagens e dificuldades.
- `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20/anexo-por-pessoa.md`: todas as respostas, pessoa por pessoa.
- `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20/roteiro.md`: o que cada pessoa viu.

**Resultado em uma frase:** o núcleo funciona, mas **todo mundo esbarrou em "tudo é por hora"**:

- arquitetura é cobrada por m² (com faixas de área e complexidade);
- levantamento de fauna, por diária ou campanha de campo;
- serviço rural, por hectare ou pelo porte do empreendimento;
- muita coisa, por pacote fechado;
- monitoramento, por mensalidade recorrente.

Pontos que funcionaram: custo por pessoa, carga do responsável no mês, "margem que sobra" e proposta sem custo nem margem.

**Estado do código:** a pasta tem suas mudanças ainda não commitadas (o "acréscimo sobre horas de venda e contas" e as migrations `20261112210000` e `20261112220000`). Considere esse o estado atual.

## 2. Decisões que o Eduardo JÁ tomou (não reabra)

1. **Sem tabelas de preço de referência por profissão.** Não vamos trazer CREA, CAU, CRBio nem nada parecido. Cada consultoria cadastra os próprios preços. A ACEAMB fica só como atalho opcional que já existe.
2. **Unidades de cobrança além da hora entram no produto:** m², hectare ou área rural, diária ou campanha, pacote ou preço fechado, porte do empreendimento e, a definir, mensalidade recorrente. É a principal pesquisa deste documento (seção 3.1).
3. **O "Pelo piso" sai.** O sistema não tem como saber o piso de cada um. No lugar, entra um **cadastro manual de como cada pessoa recebe na empresa**, que cada consultoria preenche (seção 3.2).
4. **Modelos de serviço:** a meta de longo prazo é que **cada consultoria tenha os próprios serviços cadastrados**. O lançamento é no Brasil inteiro, e o catálogo atual é só de Joinville. Ele concorda que o cadastro manual no começo é demorado e **ainda não sabe o que fazer**: proponha caminhos (seção 3.3).
5. **Contas do mês, tributos e horas faturáveis ficam como estão.** A posição dele: o dono de empresa precisa conhecer as próprias contas. Não crie assistentes grandes para isso. No máximo, sugira um texto de ajuda curto, se valer a pena.

## 3. O que pesquisar e especificar

### 3.1 Unidades de cobrança (prioridade 1)

**Pesquise:**

- Como consultorias ambientais, escritórios de arquitetura e engenharia e consultorias rurais no Brasil precificam serviços por m², hectare, diária ou campanha, porte e pacote.
- Que estruturas aparecem: faixas de área com valor decrescente, fator de complexidade, valor mínimo, diária com equipe e logística, porte pequeno/médio/grande.
- Como softwares de orçamento de serviços (nacionais e de fora) modelam isso.

Quero a **estrutura** desses modelos. Valores de tabela não importam: cada consultoria põe os dela.

**Especifique:**

1. **Unidades e modelo de dados.** Quais unidades entram, e onde cada uma vive:
   - na tabela de preços da base, hoje "Hora de venda (tabela)" com profissão e atividade: ela vira uma "tabela de preços" com unidade?
   - no item do orçamento: quantidade × preço da unidade?
   - Diga se cabem faixas (ex.: até 500 m², de 500 a 2.000 m²…) e preço mínimo.
2. **Custo e capacidade.** Isto é o mais importante. Hoje o custo do item e a **carga do responsável** dependem das horas. Com m², hectare, diária ou pacote, defina como o item continua tendo **horas estimadas** (para custo, rateio das contas e carga do mês):
   - a consultoria informa horas por unidade?
   - o item tem quantidade na unidade de venda E horas estimadas?
   - Proponha a regra e mostre com exemplos numéricos em centavos, do jeito que o domínio calcula: arredondamento metade para cima e repartição por maior resto.
3. **Preço fechado (pacote).** Como fica o pacote no item e na forma de preço, e como convive com "Pela tabela" e "Pela margem/acréscimo". Defina se o pacote ignora o acréscimo e o que acontece com a "margem que sobra".
4. **Diária ou campanha de campo.** Diária de equipe, quantidade de dias e logística (barco, alimentação, hospedagem). Diga se a logística vai para "Outros custos" ou para despesas de terceiros, e o que aparece na proposta.
5. **Porte** (ex.: granja de 2 mil cabeças, pequena/média/grande). É uma unidade ou uma variação de preço de um serviço?
6. **Mensalidade recorrente** (monitoramento com reajuste anual). Entra agora ou fica para depois? É um tipo de orçamento ou um tipo de parcela? Ligue com o ADR-0016 (cobrança).
7. **Proposta pronta.** Como cada unidade aparece para o cliente (ex.: "Projeto arquitetônico · 1.250 m² · R$ X"), sem expor custo nem horas.
8. **Migração.** Como ficam os orçamentos e as tabelas atuais (tudo por hora) depois da mudança.
9. **Tela.** Como escolher a unidade por serviço sem deixar a tabela de itens mais larga do que já é. Ela já rola para o lado no celular, e isso foi reclamado.

### 3.2 Remuneração da equipe sem "Pelo piso" (prioridade 1)

Especifique o **cadastro manual de como cada pessoa recebe**. Formas que apareceram no teste:

- salário CLT com encargos;
- pró-labore de sócio;
- bolsa de estágio;
- freelancer por diária;
- prestador por projeto;
- meio período.

Para cada forma, defina:

- quais campos a consultoria preenche;
- como vira **hora de custo** e **horas no mês** (capacidade);
- como entra na carga do mês. Ex.: o freelancer por diária não tem jornada fixa, então como a carga dele aparece?

Inclua também:

- **Migração:** como ficam as linhas que hoje estão "pelo piso" e o campo "Piso por hora" da base.
- **Remoção:** remover o "Como calcular o piso por hora" e o recolhível do piso.

### 3.3 Modelos de serviço (prioridade 2)

O catálogo atual vem da carta de serviços da Prefeitura de Joinville. Proponha caminhos para o lançamento nacional e **compare** em custo de implementação e benefício para quem está começando. Ideias para avaliar (pode trazer outras):

- a consultoria salva os próprios modelos a partir de um orçamento pronto ("Salvar como modelo");
- duplicar um orçamento anterior (pedido de 2 pessoas no teste);
- modelos genéricos sem cidade (estruturas comuns de licenciamento, PGRS, PRAD, inventário de fauna, projeto arquitetônico), que a consultoria edita;
- importar a lista de serviços de uma planilha.

Diga qual você recomenda para o lançamento. Lembre que modelo de serviço nunca traz preço pronto, só escopo e, no máximo, horas ou quantidades sugeridas.

### 3.4 Tudo o que faltou ou pode melhorar (prioridade 3)

Para cada item, diga **se entra agora, depois ou nunca** e como fazer. Ligue com o ADR-0016 quando for o caso.

1. **Marcar o orçamento como enviado, em negociação, aprovado ou recusado (ORC-04):** 7 pediram. Inclua o efeito na carga da equipe, que hoje só conta orçamentos aprovados.
2. **Enviar a proposta por e-mail ou WhatsApp:** 2 pediram. Ver a D11 do ADR-0016.
3. **Duplicar orçamento anterior:** 2 pediram (pode se juntar à 3.3).
4. **Proposta pronta:**
   - logo e CNPJ da consultoria no cabeçalho;
   - editar o texto livre antes do PDF;
   - número de ART ou RRT por profissional;
   - letra maior e leitura no celular.
5. **Margem mínima por tipo de serviço**, não só uma geral (1 pediu).
6. **Rateio das contas igual para todos:** 4 questionaram, porque serviço de campo usa menos o escritório. O rateio deve continuar por hora? Avalie alternativas sem complicar.
7. **Licitação:**
   - BDI discriminado (administração, risco, lucro, encargos);
   - exportar a memória de cálculo para Excel;
   - trilha de auditoria visível de quem alterou o orçamento (a auditoria no banco já existe; falta mostrar).
8. **Importar o histórico de orçamentos de planilha** (1 pediu).
9. **Ver a carga da equipe toda num painel só**, além de dentro de cada orçamento (1 pediu).
10. **Linguagem:**
    - a palavra "margem" causou desconfiança em um e confusão entre margem e markup em outro;
    - três não entenderam a "base do acréscimo".

    Proponha textos (rótulos e ajudas curtas), seguindo o tom do produto: português simples, sem jargão.

11. **Tabela de itens larga, que rola para o lado no celular:** proponha um layout no celular (ex.: cartões por item) que caiba em 375 px.

## 4. Restrições (as de sempre)

- **Cálculo puro em `packages/domain`, com testes.** O banco e o domínio dão o **mesmo centavo**.
- **Banco:** escrita em várias tabelas é RPC numa transação. Toda tabela nova tem `consultoria_id`, RLS forçada, FK composta e pgTAP negativo. Migrations novas, nunca editar migration aplicada.
- **Tipos de dado:** dinheiro em centavos inteiros e percentuais em pontos-base; `DATE` para datas civis; pessoas sempre como `membro_id`.
- **Nada de regra de negócio só no front.** Nada de inventar valor de mercado.
- **Interface:** Fluent 2, estados vazio, carregando, erro e sem permissão, celular de 375 px, tema escuro e WCAG 2.2 AA.

## 5. O que você me devolve

Um único arquivo `docs/adr/0018-unidades-de-cobranca-e-melhorias-do-orcamento.md`, em português, com:

1. **Resumo das pesquisas** (com links das fontes) e o que foi aprendido. Só estrutura, sem valores.
2. **Decisões propostas**, item por item das seções 3.1 a 3.4. Para cada uma:
   - o problema (quantas pessoas do teste citaram);
   - a proposta;
   - as alternativas descartadas e por quê.
3. **Modelo de dados:** tabelas e colunas novas ou alteradas, com tipos, restrições e RLS, em SQL de rascunho dentro do documento. É rascunho para eu implementar, não migration.
4. **Regras de cálculo:** fórmulas e **pelo menos 4 exemplos numéricos completos em centavos**, que eu vou transformar em testes do domínio e do pgTAP:
   - um por m² com faixas;
   - um por hectare;
   - uma diária de campo com logística;
   - um pacote fechado num orçamento com itens por hora.
5. **Telas:** o que muda em Custos e taxas, em cada etapa do orçamento e na proposta pronta, com os rótulos exatos e o comportamento no celular.
6. **Migração dos dados atuais.**
7. **Fatias de implementação**, em ordem: uma fatia por PR, cada uma com o que entra e como testar.
8. **Perguntas para o Eduardo:** tudo o que é decisão de produto e não está na seção 2, com opções e a sua recomendação.

Quando terminar, avise o Eduardo que o arquivo está pronto. Ele me passa e eu implemento fatia por fatia.
