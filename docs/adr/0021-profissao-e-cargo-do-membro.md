# ADR-0021 — Profissão e cargo do membro

**Situação:** decisões do Eduardo de 13/11/2026, tomadas ao ver o passo 1 dos primeiros passos (ADR-0020). A implementação de profissão e cargo aguarda as listas (seção 3).

## 1. Contexto

A profissão hoje é texto livre em dois lugares: na linha da equipe (Custos e taxas e primeiros passos) e na tabela de preços. O cargo existe no membro (`membro.cargo`), também como texto livre. Erro de digitação ("Eng Ambiental" e "Eng. ambiental") separa a mesma profissão em duas.

A profissão vai valer para o sistema inteiro, por exemplo para dizer quem pode atender cada condicionante. Profissão e cargo são coisas diferentes:

- **Profissão:** no que a pessoa é formada (ex.: engenheiro ambiental, biólogo).
- **Cargo:** para o que a pessoa foi contratada (ex.: estagiário, assistente, analista).

Um engenheiro ambiental contratado como estagiário tem as atribuições de estagiário.

## 2. Decisões do Eduardo (13/11/2026)

1. **A profissão fica no membro**, junto do cargo. Ela é cadastrada uma vez por pessoa, na tela Equipe, e o orçamento e as outras partes do sistema usam a mesma informação.
2. **A lista de profissões é fixa, mantida pelo Grama**, igual para todas as consultorias. Nos campos de profissão, a pessoa só escolhe da lista, sem digitar.
3. **O cargo também vira caixa de seleção**, sem texto livre.
4. **A caixa "Sócio" sai de tudo:** dos primeiros passos e de Custos e taxas, junto com o cartão "Remuneração dos sócios (pró-labore)". Ela não mudava nenhum cálculo. O pró-labore continua como forma de receber.

## 3. Listas aprovadas pelo Eduardo (13/11/2026)

O Eduardo passou as primeiras profissões e pediu uma pesquisa das que prestam consultoria ambiental. A proposta saiu dos termos de referência de EIA/RIMA (meios físico, biótico e socioeconômico) e das atribuições ambientais do CONFEA, e foi aprovada como está. As duas listas são fixas do Grama, no masculino, como os conselhos registram. Os códigos estão em `packages/domain/src/profissao-e-cargo.ts` e no banco.

- **Profissões (34):**
  - **Engenharias:** ambiental; sanitarista; ambiental e sanitarista; civil; químico; florestal; agrônomo; de minas; agrícola; de pesca; de segurança do trabalho; cartógrafo e agrimensor.
  - **Geociências:** geólogo, geógrafo e meteorologista.
  - **Outros conselhos:** arquiteto e urbanista, biólogo, químico, médico veterinário e oceanógrafo.
  - **Meio socioeconômico e outras áreas:** arqueólogo, sociólogo, antropólogo, economista, advogado, gestor ambiental (tecnólogo) e ecólogo.
  - **Nível técnico:** técnico em meio ambiente, em segurança do trabalho, em química e em agrimensura; técnico agrícola; técnico florestal.
  - **Outra formação (não técnica).**
- **Cargos (11):** estagiário, auxiliar administrativo, técnico, assistente, analista júnior, analista pleno, analista sênior, especialista, coordenador, gerente e diretor.

## 3b. Pendente

- **De-para dos textos antigos:** proposta montada pelo Claude (seção 5), revisada pelo Eduardo; nada é convertido em silêncio. Os textos antigos são:
  - o cargo digitado antes, que ficou em `membro.cargo_antigo`;
  - as profissões digitadas nas equipes e na tabela de preços das bases existentes.

  Enquanto isso, eles aparecem como "(antigo)" até alguém escolher da lista.

- **Banco aceita texto livre:** a tabela de preços ainda aceita profissão em texto, para não quebrar bases antigas. A tela só oferece a lista.
- **Condicionantes:** usar a profissão para dizer quem pode atender cada condicionante, como o Eduardo descreveu. Ainda não foi especificado.

## 4. Implementado

- **13/11/2026:** a caixa "Sócio" e o cartão dos sócios saíram da tela da equipe, usada em Custos e taxas e nos primeiros passos.
  - Linhas novas vão com `socio = false`. A coluna `orcamento_base_equipe.socio` continua no banco, sem uso na tela; nada foi migrado nem apagado.
  - O domínio continua calculando `remuneracaoDosSociosCentavos`, mas nenhuma tela mostra mais esse valor.
- **13/11/2026: profissão e cargo** (commit `442c5f5`, na `branch-do-duds`).
  - **Banco** (migration `20261113150000_profissao_e_cargo_do_membro.sql`):
    - domínios `profissao_do_membro` e `cargo_do_membro` com os códigos das listas;
    - `membro.profissao` e `membro.cargo` novos; o texto antigo foi para `membro.cargo_antigo`;
    - `definir_profissao_e_cargo` no lugar de `definir_cargo`, com a mesma regra de antes (a própria pessoa ou a Gestão; outra consultoria não);
    - `salvar_base_de_custos` virou uma camada que troca a profissão de cada pessoa da equipe pela do membro, quando definida, e chama a função de sempre (agora `private.salvar_base_de_custos_completa`). Vale também para a publicação dos primeiros passos;
    - pgTAP: a `180` foi reescrita para a regra nova e a `300` é nova.
  - **Telas:**
    - Perfil e Equipe têm duas caixas de seleção (profissão e cargo), sem texto livre; a Equipe ganhou a coluna "Profissão e cargo" e a ação "Profissão e cargo" no menu de cada pessoa;
    - na equipe do orçamento (Custos e taxas e primeiros passos), a profissão vem do cadastro da pessoa, só para leitura, com o link "Definir em Equipe" quando falta;
    - na tabela de preços, a profissão é escolhida da lista;
    - o atalho ACEAMB passou a usar "Engenheiro ambiental e sanitarista".

## 5. De-para (respostas do Eduardo em 13/11/2026; nada convertido ainda)

**Situação:** proposta de 13/11/2026, nada aplicado. Não há migration de conversão nem mudança de tela.

### 5.1 Como a sugestão é feita

As funções puras `sugerirProfissao(texto)` e `sugerirCargo(texto)` (`packages/domain/src/profissao-e-cargo.ts`) devolvem `{ codigo, certeza }` ou nulo:

- **exata:** o texto é o rótulo da lista, a menos de acento, caixa, pontuação, conectivo (e, de, do, da, em), abreviação ("Eng.", "Eng", "Engª", "Téc.", "Jr.", "Sr.") ou feminino ("Bióloga" → Biólogo, "Estagiária" → Estagiário). "Química" depois de "em" é a área ("Técnica em química" → Técnico em química), não o feminino de químico.
- **revisar:** a sugestão supõe algo. São só estes casos:
  - profissão: "Arquiteto(a)" → Arquiteto e urbanista; "Bio." → Biólogo; "Eng. sanitarista e ambiental" (ordem trocada) → Engenheiro ambiental e sanitarista; "Agrônomo(a)" → Engenheiro agrônomo; "Veterinário(a)" → Médico veterinário; rótulo sem os parênteses ("Gestor ambiental" → Gestor ambiental (tecnólogo); "Outra formação" → Outra formação (não técnica));
  - cargo: cargo da lista com complemento ("Técnico de campo" → Técnico, "Gerente de projetos" → Gerente); analista com um nível só ("Analista ambiental pleno" → Analista pleno).
- **nulo:** o texto não basta para escolher. Exemplos: "Engenheiro", "Eng.", "Técnico" e "Arq." (arquiteto ou arqueólogo) na profissão; analista sem nível, "Sócio(a)" e "Auxiliar" no cargo.

### 5.2 Textos antigos encontrados

Fontes: testes de tela e de domínio, comentários de ADRs e migrations, o pgTAP 180 antes da reescrita e a demo local. Os textos reais das bases de staging e produção ainda não foram levantados; antes de aplicar, é preciso listar os valores distintos de `membro.cargo_antigo`, `orcamento_base_equipe.profissao` e `horas_venda[].profissao` e passar cada um pelas funções.

| Texto antigo                                  | Sugestão                           | Certeza | Motivo                                                                                |
| --------------------------------------------- | ---------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Eng. ambiental e sanitarista                  | Engenheiro ambiental e sanitarista | exata   | Abreviação "Eng."; era o texto do atalho ACEAMB até 13/11                             |
| Eng. ambiental; Eng Ambiental; eng. ambiental | Engenheiro ambiental               | exata   | Abreviação, pontuação e caixa (ver pergunta 2)                                        |
| Eng. civil                                    | Engenheiro civil                   | exata   | Abreviação "Eng."                                                                     |
| Biólogo; Bióloga; biólogo; biologo            | Biólogo                            | exata   | Acento, caixa e feminino                                                              |
| Arquiteto e urbanista                         | Arquiteto e urbanista              | exata   | Já é o rótulo                                                                         |
| Arquiteta                                     | Arquiteto e urbanista              | revisar | O CAU registra só "arquiteto e urbanista", mas o texto não diz urbanista (pergunta 4) |
| Bio.                                          | Biólogo                            | revisar | Abreviação fora do padrão (pergunta 5)                                                |
| Arq.                                          | sem sugestão                       | nulo    | Pode ser arquiteto ou arqueólogo (pergunta 5)                                         |
| Engenheiro; Eng.                              | sem sugestão                       | nulo    | Falta a modalidade (pergunta 3)                                                       |
| Diretor                                       | Diretor                            | exata   | Já é o rótulo                                                                         |
| Estagiária                                    | Estagiário                         | exata   | Feminino                                                                              |
| Técnico de campo                              | Técnico                            | revisar | Cargo da lista com complemento (pergunta 6)                                           |
| Analista ambiental                            | sem sugestão                       | nulo    | Falta o nível: júnior, pleno ou sênior (pergunta 1)                                   |
| Sócia                                         | sem sugestão                       | nulo    | Sócio não é cargo da lista (decisão 4) (pergunta 7)                                   |

### 5.3 Perguntas para o Eduardo

1. **"Analista ambiental" sem nível.** Opções: (a) sem sugestão, a Gestão escolhe o nível de cada pessoa na Equipe; (b) sugerir Analista pleno, para revisar; (c) sugerir Analista júnior, para revisar. **Recomendação:** (a). O nível muda conforme a pessoa, e o texto antigo continua aparecendo como "(antigo)" até alguém escolher.
2. **"Eng. ambiental" na tabela de preços.** O texto bate com Engenheiro ambiental, mas pode ter sido digitado para quem é formado em ambiental e sanitarista. Isso pesa no preço: a hora técnica por profissão só é encontrada quando o texto da hora de venda é igual ao da profissão da equipe (`mesmaProfissao`), que agora vem do membro. Opções: (a) converter pelo texto (Engenheiro ambiental); (b) em cada base, mostrar a sugestão ao lado das profissões da equipe e a Gestão confirma. **Recomendação:** (b).
3. **"Engenheiro" ou "Eng." sozinho.** Opções: (a) sem sugestão, a Gestão escolhe; (b) sugerir a engenharia da equipe quando houver só uma. **Recomendação:** (a). Até agora esses textos só apareceram nos testes.
4. **"Arquiteto(a)" → Arquiteto e urbanista.** Opções: (a) tratar como exata; (b) manter para revisar. **Recomendação:** (a), porque o CAU só registra "arquiteto e urbanista".
5. **Abreviações "Bio." e "Arq.".** Opções: (a) "Bio." → Biólogo para revisar e "Arq." sem sugestão (como está); (b) as duas sem sugestão. **Recomendação:** (a).
6. **"Técnico de campo".** Opções: (a) Técnico, para revisar (como está); (b) Assistente; (c) sem sugestão. **Recomendação:** (a).
7. **"Sócia"/"Sócio" como cargo.** Opções: (a) sem sugestão, cada sócio escolhe o próprio cargo (como está); (b) sugerir Diretor, para revisar. **Recomendação:** (a). A decisão 4 tirou "Sócio" do sistema, e um sócio pode ter qualquer cargo.
8. **Cargo antigo que é uma profissão** (ex.: "Engenheira ambiental" digitado como cargo). Opções: (a) sugerir a profissão do membro a partir do cargo antigo, para revisar, e deixar o cargo sem sugestão; (b) ignorar. **Recomendação:** (a), só quando a pessoa ainda não tem profissão.

### 5.4 Respostas do Eduardo (13/11/2026)

O Eduardo aceitou as oito recomendações acima:

- **1, 3, 5, 6 e 7:** ficam como a função já fazia. "Analista ambiental", "Engenheiro"/"Eng.", "Arq." e "Sócio/Sócia" ficam sem sugestão. "Bio." e "Técnico de campo" ficam para revisar.
- **2:** "Eng. ambiental" da tabela de preços não é convertido pelo texto. Em cada base, a Gestão confirma, com a sugestão ao lado das profissões da equipe.
- **4:** "Arquiteto"/"Arquiteta" passa a ser **exata** (Arquiteto e urbanista).
- **8:** `sugerirProfissaoPeloCargoAntigo` sugere a profissão a partir do cargo antigo, sempre para revisar. Só vale quando a pessoa ainda não tem profissão.

**Ainda falta para converter de verdade:**

1. Listar os valores distintos de cada consultoria:
   - `membro.cargo_antigo`;
   - `orcamento_base_equipe.profissao`;
   - `horas_venda[].profissao`.
2. A tela de revisão em que a Gestão confirma as sugestões.
3. A RPC que grava só o que foi confirmado.

Nada disso foi feito.

## 6. Outras formações (decisões do Eduardo em 13/11/2026)

O Eduardo é engenheiro ambiental e sanitarista e técnico em química, e em breve será também engenheiro de segurança do trabalho. Uma profissão só não cabe.

- **Uma principal e outras:** `membro.profissao` continua sendo a principal. É ela que aparece no orçamento, na equipe da base de custos e no custo por profissão. As outras ficam em `membro.outras_profissoes`, com os códigos da mesma lista fixa, até 10.
- **Só formações concluídas.** A formação em curso entra quando for concluída. O banco não tem como conferir isso; o rótulo da tela diz "Outras formações concluídas".
- **Regras no banco:** sem principal não há outras; a principal não se repete nas outras; nenhuma se repete. Escolher como principal uma das outras tira essa das outras.
- **RPC:** `definir_profissao_e_cargo` ganhou `p_outras_profissoes` (nulo mantém as atuais). Migration `20261113160000_outras_formacoes_do_membro.sql`; pgTAP `310_outras_formacoes.test.sql`, com o teste negativo de outra consultoria.
- **Profissão no passo 1:** na equipe dos primeiros passos (e em Custos e taxas) a Gestão escolhe a profissão principal na própria linha. Grava no cadastro da pessoa na hora, como na Equipe; não faz parte do rascunho.

## 7. Gênero e formação no cadastro da conta (decisões do Eduardo em 13/11/2026)

Quem cria conta informa a formação (profissão principal) e o gênero, para a profissão aparecer certa junto do nome ("Helena · Engenheira ambiental").

- **Gênero:** Feminino, Masculino ou Prefiro não dizer. "Prefiro não dizer" escreve a profissão com "(a)": "Engenheiro(a) ambiental". Fica em `membro.genero` (domínio `public.genero_da_pessoa`); nulo quer dizer que a pessoa ainda não respondeu.
- **Onde muda:** só junto do nome da pessoa (Equipe, Perfil, responsável, proposta), com `rotuloDaProfissaoDaPessoa`. Custo por profissão, tabela de preços e a equipe da base de custos continuam com a forma da lista, para a mesma profissão não virar duas linhas.
- **Cadastro:** formação e gênero vão nos metadados da conta do Auth. O gatilho `membro_preencher_formacao` copia os dois para o vínculo quando ele é criado (criar consultoria ou aceitar convite), se ainda estiverem vazios. Valor fora das listas é ignorado.
- **Contas que já existiam:** no próximo acesso, uma tela pede formação e gênero antes de seguir. A RPC `completar_cadastro` grava os dois em todos os vínculos ativos da própria pessoa; `definir_meu_genero` muda só o gênero. A Gestão não muda o gênero de ninguém.
- Migration `20261113170000_genero_e_formacao_no_cadastro.sql`; pgTAP `320_genero_e_formacao_no_cadastro.test.sql`, com os testes negativos.
- **Profissão principal não se apaga** (Eduardo, 13/11/2026): depois de preenchida, só troca por outra. `definir_profissao_e_cargo` recusa com `profissao_nao_pode_ficar_vazia` (migration `20261113172000_profissao_principal_nao_apaga.sql`), e as telas tiram a opção "Não informada" de quem já tem profissão. Assim a tela de completar cadastro aparece uma vez só.

## 8. Formação em curso (decisão do Eduardo em 13/11/2026)

Para o estagiário que ainda não é formado: a pessoa escolhe a formação que está cursando e marca "Ainda estou cursando".

- **Banco:** `membro.profissao_em_curso` (padrão falso). Vem do cadastro da conta (metadado `profissao_em_curso`), de `completar_cadastro(…, p_em_curso)` e de `definir_profissao_e_cargo(…, p_profissao_em_curso)` (nulo mantém). Migration `20261113173000_formacao_em_curso.sql`.
- **Junto do nome:** "Estudante de <curso>" (ex.: "Estudante de engenharia ambiental"), igual para todo gênero (`rotuloDoCurso`, `rotuloDaFormacaoDaPessoa`). Ao se formar, desmarca e vira a profissão normal.
- **Custo por profissão:** quem cursa forma um grupo à parte com o nome do curso (`rotuloDaProfissaoNoCusto`; no banco, `private.rotulo_do_curso` no salvar da base, migration `20261113195000_custo_de_quem_cursa.sql`). O salário de estagiário não baixa a hora técnica dos formados. Nos serviços em que a pessoa é responsável, vale a hora dela, como antes.
- **Outras formações** continuam só as concluídas (§6).
- pgTAP `330_formacao_em_curso.test.sql`, com o teste negativo de outra consultoria.
