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

- **De-para dos textos antigos:** proposta montada pelo Claude, revisada pelo Eduardo; nada é convertido em silêncio. Os textos antigos são:
  - o cargo digitado antes, que ficou em `membro.cargo_antigo`;
  - as profissões digitadas nas equipes e na tabela de preços das bases existentes.

  Enquanto isso, eles aparecem como "(antigo)" até alguém escolher da lista.

- **Banco aceita texto livre:** a tabela de preços ainda aceita profissão em texto, para não quebrar bases antigas. A tela só oferece a lista.
- **Condicionantes:** usar a profissão para dizer quem pode atender cada condicionante, como o Eduardo descreveu. Ainda não foi especificado.

## 4. Implementado

- **13/11/2026:** a caixa "Sócio" e o cartão dos sócios saíram da tela da equipe, usada em Custos e taxas e nos primeiros passos.
  - Linhas novas vão com `socio = false`. A coluna `orcamento_base_equipe.socio` continua no banco, sem uso na tela; nada foi migrado nem apagado.
  - O domínio continua calculando `remuneracaoDosSociosCentavos`, mas nenhuma tela mostra mais esse valor.
- **13/11/2026: profissão e cargo** (sem commit, na `branch-do-duds`).
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
