# Auditoria de usabilidade do módulo de orçamentos

Oi! Aqui é o Claude de novo. Implementei o que você especificou no ADR-0018 (fatias 2 a 6). O Eduardo quer agora **focar em usabilidade: tornar o orçamento mais fácil de usar**, sem abrir funcionalidade grande nova.

O fluxo continua o mesmo:

1. Você **audita e especifica**.
2. Você me devolve **um documento**.
3. **Eu implemento** (domínio, banco, telas e testes).

Portanto, **não escreva código nem migration**. Entregue a especificação no formato da seção 6.

Continue seguindo `PASSAGEM-CHATGPT.md`, `CLAUDE.md` e os ADRs 0015 (Fluent 2), 0016, 0017 e 0018. Quando algo for decisão de produto e não estiver decidido abaixo, **não decida sozinho**: coloque como pergunta para o Eduardo, com opções e uma recomendação.

---

## 1. Estado atual

- **Commit `1afce02`** (branch `local/orcamentos-fluent`): fatias 2 a 6 do ADR-0018. As seções 10 a 14 do ADR dizem o que foi feito em cada uma.
  - Unidades de cobrança: hora, m², hectare, diária, campanha e pacote.
  - Faixas progressivas e preço mínimo.
  - "Como recebe" no lugar do piso.
  - Modelos da consultoria e duplicar.
  - Situação manual com histórico.
  - Dados da proposta (logo e CNPJ), ART/RRT por serviço e texto de apresentação.
- **Ainda sem commit** (considere como estado atual):
  - **Celular:**
    - faixas presas à esquerda dentro da tabela que rola;
    - o link "Abrir empreendimento" só aparece no aviso de prospecto cadastrado;
    - margem menor da proposta a 375 px.
  - **Textos que confundiram no segundo teste:**
    - "Custo da hora técnica (R$)" no lugar de "Hora técnica (R$)";
    - "Custo médio por hora da equipe";
    - "Custo por hora de {profissão}";
    - "Contas do mês por hora: R$ X por hora. Já entra no custo de cada serviço do orçamento, pelas horas dele.";
    - "Sem dias no mês: fica fora da média e do rateio; a hora de custo vale" na linha da pessoa;
    - ajuda da alíquota ("imposto pago no mês ÷ faturamento do mês");
    - exemplo de horas no mês (40 h por semana ≈ 173 h);
    - "(jornada não informada em Custos e taxas)" no responsável;
    - no duplicar, "as estimativas das despesas, que não voltam a cotar".
- **Telas para ler** (rótulos exatos estão no código):
  - Custos e taxas: `apps/web/src/app/paginas/orcamentos/PaginaCustosETaxas.tsx`;
  - Orçamento: `PaginaOrcamento.tsx`;
  - Situação: `SituacaoDoOrcamento.tsx`;
  - Duplicar e salvar modelo: `DialogosDeCopia.tsx`;
  - Escolher modelo: `DialogoModelo.tsx`;
  - Dados da proposta: `PaginaDadosDaProposta.tsx`;
  - Proposta pronta: `PaginaProposta.tsx`;
  - Lista: `PaginaOrcamentos.tsx`.
- **Para ver funcionando:** a demo local roda com `./node_modules/.bin/pnpm --dir apps/web exec vite --config demo-local/vite.demo.config.ts` (porta 5199). Os dados ficam na memória da página: recarregar apaga o que foi salvo.

## 2. O que as pessoas acharam (segundo teste com os 20 donos)

Leia antes de começar:

- `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20-v2/sintese.md`: resumo, contagens e comparação com o primeiro teste.
- `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20-v2/results.json`: todas as respostas, inclusive "rotulos_confusos", "passo_mais_dificil" e "dificuldades".
- `pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20-v2/roteiro.md`: o que cada pessoa viu.

**Em uma frase:** a funcionalidade deixou de ser o problema. O atrito agora é entender e preencher Custos e taxas na primeira configuração (cerca de 59 minutos até a primeira proposta).

**Números:**

- facilidade 6,6 de 10, quando antes era 6,2;
- confiança no preço 6,4;
- "usaria: sim" 5, quando antes eram 2;
- 18 de 19 mandariam a proposta;
- o pedido parecido do mês seguinte leva cerca de 10 minutos com "Duplicar com os preços".

**Lembrete:** é um painel virtual, um sinal direcional, não uma pesquisa estatística.

## 3. Pedido do Eduardo sobre a ART (prioridade 1)

Hoje, embaixo de **cada** serviço da tabela de itens, há uma lista "Sem ART/RRT / Com ART / Com RRT". Nas palavras dele:

> "acho que o negocio ali sem SEM ART/com ART ficou exagerado em todos os negocios, talvez ele poderia ser uma caixa de seleção inclusive, tá? ficaria mais clean, e uma caixa de seleção que aparece até como um item, pq normalmente vai ter uma ou duas ARTS no máximo por serviço"

**Interpretação:** num orçamento, normalmente há uma ou duas ARTs no total, então uma lista em cada linha é peso visual demais.

**Proponha a forma mais limpa e compare pelo menos estas opções:**

1. Uma caixa de seleção pequena por serviço ("ART"), sem a lista.
2. ART/RRT como **um item** do orçamento, como a visita técnica. Por exemplo, uma linha "ART do responsável técnico" que a pessoa marca para incluir.
3. Uma seção curta "ART/RRT deste orçamento", com até duas linhas (tipo, profissional, serviços que cobre).

**Considere também:**

- A **taxa de registro** da ART, que o conselho cobra. Hoje ela vira despesa ("ART do responsável técnico", incluída no preço) ou "outros custos". As notas do catálogo de serviços (`catalogo-servicos.ts`) pedem distinguir trabalho técnico de taxa de registro. A ART como item pode resolver as duas coisas juntas?
- **ART ou RRT:** CREA e CRBio usam ART; CAU usa RRT. A Gilmara (agrônoma) estranhou ver RRT. Precisa aparecer a escolha, ou dá para inferir? Não infira pela profissão sem regra clara; se for o caso, pergunte.
- **A proposta pronta**, que hoje mostra "Inclui ART" embaixo do serviço, e o **número da ART**, pedido por 2 pessoas no teste e que ainda não existe.
- **Migração do campo atual**, `orcamento_item.responsabilidade_tecnica` ('art' | 'rrt' | nulo).

## 4. Auditoria de usabilidade (prioridade 1)

Percorra o fluxo inteiro, do zero até o segundo orçamento:

1. Custos e taxas.
2. Dados da proposta.
3. Lista.
4. Novo orçamento.
5. Serviços.
6. Preço e margem.
7. Parcelas.
8. Proposta pronta.
9. Mudar situação.
10. Duplicar ou modelo.

Faça isso em **duas larguras**: notebook 1366 px e celular 375 px.

Para cada problema, diga:

- a tela e o rótulo exato;
- o que atrapalha;
- quem do teste citou e quantos;
- a proposta, com o texto exato.

**Pontos que já sabemos que pesam** (comece por eles):

1. **Tempo da primeira configuração (cerca de 59 min).** O que pode ficar opcional, para depois ou recolhido sem perder correção?
   - Ideias para avaliar:
     - um caminho mínimo ("comece só com a equipe e a tabela de preços");
     - uma lista "falta configurar" com o que é obrigatório para ter preço;
     - deixar as margens e taxas com o que já vem preenchido.
   - **Não** invente valores de mercado nem sugira alíquota ou piso: decisão do Eduardo.
2. **Custos e taxas é uma página longa**, com seis grupos. Avalie ordem, agrupamento, títulos e o que fica recolhido. Avalie também se "Calcular pela equipe" deveria ser o padrão em vez dos dois campos simples.
3. **Rótulos que confundiram** (veja "rotulos_confusos" no results.json). Confira se os textos novos da seção 1 resolvem, ou proponha melhores:
   - "Rateio por hora estimada" (17 pessoas);
   - "Hora técnica" (13);
   - "capacidade desconhecida" (10);
   - "Acréscimo sobre horas de venda e contas" (7);
   - "Margem desejada/mínima/que sobra" (7).

   A palavra "acréscimo" vem do ADR-0018. Se propuser trocar, deixe como pergunta.
4. **Tabela de itens do orçamento.** Está larga: Serviço, Horas, Hora de venda (com quantidade ou preço fechado embaixo), Responsável (com carga), Mês, Outros custos, Custo e Preço. No celular ela rola para o lado.
   - O ADR-0018 §2.4 já pedia **cartões por item a 375 px**. Especifique esses cartões: o que aparece fechado, o que expande e a ordem dos campos.
   - Diga também o que pode sair da linha no notebook. A coluna ainda se chama "Hora de venda", embora agora seja a linha da tabela de preços (hora, m², pacote…): proponha o nome.
5. **Repetições e cliques:**
   - Confirmação em toda mudança de situação: o Wellington achou que atrasa. Avalie confirmar só o que tem efeito (aprovar, reabrir).
   - Despesas que se repetem.
   - "Salvar" manual: avalie salvamento automático do rascunho, já que dois pediram por internet ruim no campo. Só proponha se for seguro com `row_version`.
6. **Leitura:** letra pequena no histórico e nos textos de ajuda (Edgar).
7. **Ajuda no lugar certo:** onde vale um exemplo numérico curto, por exemplo margem × markup, que a Carolina pediu. Exemplos com números de demonstração deixam claro que são exemplo, nunca valor sugerido.
8. **Os pedidos pontuais de usabilidade do Anexo A**, que também entram nesta auditoria.

## Anexo A. Pedidos pontuais de usabilidade (tratar na auditoria)

Saíram do segundo teste e estão em `results.json`. Para cada um, diga se resolve agora e como; se não valer, diga por quê.

| Pedido | Quem | Onde |
|---|---|---|
| "Detalhar contas do mês" parece "trabalho de contador": lançar conta por conta cansa | Ronaldo (também Tainá e Lívia, que travaram por não saber os valores) | Custos e taxas · Contas do mês |
| Avisar a margem abaixo da mínima já em Custos e taxas, e não só depois de montar o orçamento inteiro | Paulo | Custos e taxas · Margens |
| "Resultado da equipe" mais visual (barra ou gráfico), para confiar sem conferir na mão | Beatriz | Custos e taxas · Resultado da equipe |
| Mostrar a memória de cálculo da hora de custo, com a fórmula aplicada ("sem isso não assino preço") | Marcos | Custos e taxas · Hora de custo |
| Horas faturáveis de quem alterna campo e escritório variam de mês a mês | Patrícia | Custos e taxas · Horas no mês |
| "Tempo por unidade" pede horas por hectare, mas no campo se pensa em dias | Gilmara | Tabela de preços · Tempo por unidade |
| "Empreendimento" soa urbano: no rural se fala "propriedade" | Gilmara | Lista, novo orçamento, proposta |
| "Revisão" soa "termo de escritório da cidade" | Gilmara | Mudar situação |
| O objeto da proposta fica raso para estudo técnico; quer citar metodologia e legislação | Antônio | Parcelas · Objeto / proposta pronta |
| Porte do empreendimento (ex.: número de matrizes) visível junto do serviço na proposta | Henrique | Proposta pronta |
| Destacar mais o "Inclui ART", que é a primeira pergunta do cliente | Fernanda | Proposta pronta (junto com a seção 3) |
| Letra maior no total e no "Objeto" | Edgar, Beatriz | Proposta pronta |
| "Reabrir como revisão" mais visível | Tainá | Mudar situação |
| Ao duplicar para outro mês, deixar claro que a carga da equipe é recalculada | Antônio | Duplicar |
| Atalho de teclado para adicionar serviço | Wellington | Serviços |
| Lançar 16 pessoas uma a uma é demorado (equipe grande) | Aline | Custos e taxas · Calcular pela equipe |

Também vale olhar o primeiro teste (`pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20/sintese.md`). A maior parte dele já foi resolvida no ADR-0018, mas confirme se sobrou algo de usabilidade.

## Anexo B. Funções que faltam (só classificar, não especificar)

O foco agora é usabilidade. Para cada item abaixo, diga só **agora, depois ou nunca**, com uma frase de motivo. Ligue com o ADR-0016 ou o ADR-0018 quando já estiver lá. Não especifique nenhum deles neste documento.

| Função | Quem pediu (segundo teste) |
|---|---|
| Unidades de nicho: porte (matrizes, UA, cabeças), por amostra ou ponto de coleta, metro linear de rede, laudo ou parecer avulso, por propriedade ou módulo fiscal, por espécie ou armadilha. Avalie também uma unidade livre ("por ___", com o nome digitado pela consultoria). | Henrique, Thiago, Juliana, Marcos, Diego, Gilmara, Tainá |
| Pacote único com várias profissões; hectare com pacote de relatório | Aline, Thiago, Paulo |
| Custo real de quem recebe "Por projeto" separado do preço fechado do pacote, para ver a margem desse serviço | Juliana |
| Exportar memória de cálculo e relatório de custo × preço (Excel ou PDF interno) | Marcos, Juliana, Diego, Tainá, Aline |
| Enviar a proposta por e-mail ou WhatsApp, ou link para o cliente assinar | Juliana, Fernanda, Carolina |
| Anexar a ART (PDF) à proposta e mostrar o número da ART/RRT | Juliana, Carolina, Marcos, Aline |
| Contrato mensal recorrente com cobrança do mês seguinte | Patrícia |
| Suporte, tutorial ou passo a passo guiado na primeira configuração | Edgar, Gilmara, Lívia, Renata, Tainá |
| Funcionar sem internet no campo | Tainá, Wellington |
| Permissões por usuário (quem vê custo e margem, quem muda preço) | Marcos, Paulo |
| Desconto comercial explícito na proposta | Diego |
| Lembrete de reajuste da tabela de preços | Carolina, Diego |
| Importar a planilha de custos ou a tabela de preços | Wellington, Aline |
| Painel de carga da equipe toda, com orçamentos em aprovação | Paulo |
| Contingência para campanha de campo sujeita a clima | Antônio |
| Personalizar cor e fonte da proposta | Thiago |
| Integração com CRM ou CAR | Juliana, Gilmara |
| Referência de piso dos conselhos ou de margem mínima do setor | Aline, Antônio. **Já decidido: não entra sem fonte real; não reabra**, só registre. |

## 5. Restrições

- **Decisões que o Eduardo já tomou (não reabra):**
  - sem tabela de preço de referência por profissão;
  - sem piso;
  - cada consultoria cadastra os próprios preços;
  - contas, tributos e horas faturáveis o dono informa (no máximo ajuda curta);
  - só "aprovado" conta na carga;
  - modelo sem preço;
  - duplicar pergunta sobre os preços.
- **Nada de regra de negócio só no front.** O que mudar regra (por exemplo, a ART como item com taxa) passa pelo domínio e pelo banco, com o mesmo centavo nos dois.
- **Interface:**
  - Fluent 2 e tokens existentes; não invente cor;
  - corpo 14 px;
  - estados vazio, carregando, erro e sem permissão;
  - 375 px sem rolagem da página;
  - tema escuro;
  - WCAG 2.2 AA: teclado em tudo, foco visível, nome acessível, informação nunca só pela cor;
  - sem emoji.
- **Não abra a pasta irmã de pesquisa privada.** Use só os arquivos citados aqui e os dados fictícios da demo.

## 6. O que você me devolve

Um único arquivo `docs/adr/0019-usabilidade-do-orcamento.md`, em português, com:

1. **Resumo da auditoria:** os 10 problemas que mais pesam, em ordem, com quem do teste citou.
2. **ART/RRT (seção 3):** as opções comparadas e a recomendada, com:
   - o que muda na tela de serviços e na proposta pronta;
   - o que muda no domínio e no banco, se mudar; nesse caso, um rascunho de SQL e exemplos em centavos;
   - a migração do campo atual.
3. **Mudanças de usabilidade (seção 4).** Cada uma com:
   - tela;
   - antes e depois, com os rótulos exatos;
   - comportamento em 1366 px e em 375 px;
   - acessibilidade;
   - esforço (pequeno, médio ou grande).
4. **Cartões por item no celular:** a especificação completa.
5. **Caminho mínimo da primeira configuração:** o que é obrigatório para ter preço, o que fica para depois e como a tela mostra isso.
6. **Pedidos pontuais (Anexo A):** um por linha, com "resolve agora" (e como) ou o motivo de não resolver.
7. **Funções que faltam (Anexo B):** a tabela com "agora", "depois" ou "nunca" e uma frase de motivo para cada uma.
8. **Fatias de implementação**, em ordem, uma por PR. Cada uma com o que entra e como testar. Comece pelas pequenas e de maior efeito.
9. **Perguntas para o Eduardo:** tudo o que é decisão de produto, com opções e a sua recomendação.

Quando terminar, avise o Eduardo que o arquivo está pronto. Ele me passa e eu implemento fatia por fatia.
