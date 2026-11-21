# ADR-0052: Relatório mensal ao cliente (P6)

- Situação: proposta (camada `camada/relatorio-ao-cliente`)
- Data: 21/11/2026
- Relaciona: ADR-0036 (modelos de documento), ADR-0040 (relatório no Grama), ADR-0041 (base das oito funções)

## Contexto

A consultoria manda ao cliente, todo mês, um resumo do que fez e do que vem. Hoje isso é montado à mão. O estudo das 8 funções (P6, v1) pede o resumo gerado pelo Grama, sem dar acesso ao cliente.

## Decisão

- RPC `dados_para_relatorio_mensal(p_empreendimento_id, p_mes)`, só para a Gestão (`sem_permissao` para a Equipe e outra consultoria). Devolve:
  - licenças ativas e outros vencimentos, com validade;
  - entregas concluídas no mês (código, título, licença e data), **sem** notas, horas, custo nem nomes da equipe;
  - protocolos de renovação e respostas a exigências do mês;
  - os próximos 90 dias, das fontes de `private.linhas_de_prazo`.
- As respostas a exigências vêm de `private.relatorio_exigencias_do_mes`, vazia nesta camada; a camada de exigências (P3) a redefine ao ser juntada, com o mesmo retorno.
- `modelo-documento.ts` ganha **blocos repetíveis**: o nó `bloco_repetido` (`attrs.lista`, `attrs.vazio`) repete o conteúdo para cada item da lista (`licencas`, `entregas`, `protocolos`, `proximos`); dentro dele, `campo_do_item` puxa um dado do item. Bloco sem itens vira um parágrafo com o texto de vazio.
- Modelo-semente "Resumo para o cliente" no domínio (`modeloResumoParaOCliente`). O texto diz "Licenças e validades", nunca "em dia": o Grama não afirma regularidade.
- Ação no "…" do Empreendimento, só Gestão: "Gerar relatório do mês" › mês (vem o anterior), com "Baixar .docx" e "Escrever no Grama".
- Sem link nem login de cliente (v2).

## Consequências

- Migration `20261121170000_relatorio_ao_cliente.sql` e pgTAP 720.
- O editor de modelos ainda não insere blocos; o "Resumo para o cliente" sai do domínio, pronto. Inserir blocos no editor fica para depois.
