# Contatos com os órgãos antes da coleta de normas

Textos prontos para o Eduardo enviar antes de ligar os coletores em produção (ADR-0050, decisão 13). Nada foi enviado. Os campos entre colchetes são para preencher.

Em todos os textos, o `User-Agent` dos coletores é o mesmo: `Grama-coletor/1.0 (+[endereço do site do Grama])`.

## 1. SEA · Diário Oficial de SC (GEDOF)

- **Para:** diariooficial@sea.sc.gov.br
- **Quando:** antes de ligar a coleta do DOE-SC (pacote L2).
- **Tipo:** aviso de cortesia. O portal não publica termos de uso e os dados abertos do DOE estão sob CC-BY.

**Assunto:** Aviso de coleta automática de atos do DOE-SC (Grama)

> Prezados, bom dia.
>
> Sou o Eduardo, do Grama, um sistema para consultorias ambientais de Santa Catarina acompanharem licenças, condicionantes e as normas que as afetam.
>
> Queremos avisar, por cortesia, que o Grama vai consultar o portal do Diário Oficial de SC (portal.doe.sea.sc.gov.br) para identificar atos normativos ambientais publicados, principalmente do IMA e da SEMAE/CONSEMA. Como vamos fazer:
>
> - duas consultas por dia útil (uma depois da edição e outra no fim do dia, para as edições extras), fora do horário de pico;
> - no máximo 1 requisição por segundo, com `User-Agent` identificado (`Grama-coletor/1.0`);
> - guardamos só atos normativos e metadados da publicação (edição, data e link). Retiramos qualquer CPF antes de gravar e não guardamos atos de pessoal.
>
> Se houver alguma orientação, limite de uso ou canal preferido para esse tipo de consulta, seguiremos. Agradecemos a ciência.
>
> Atenciosamente,
> Eduardo · Grama
> [contato]

## 2. CIGA · Dados abertos do DOM-SC

- **Para:** dom@consorciociga.gov.br
- **Quando:** antes do pacote L9. Sem o aceite, o Grama não coleta o DOM-SC.
- **Tipo:** pedido de aceite. O robots.txt do site do DOM-SC proíbe robôs, o do portal de dados abertos bloqueia `/api/` e a licença dos dados não está informada.

**Assunto:** Pedido de autorização para uso dos dados abertos do DOM-SC (Grama)

> Prezados, bom dia.
>
> Sou o Eduardo, do Grama, um sistema para consultorias ambientais de Santa Catarina acompanharem licenças, condicionantes e as normas que as afetam.
>
> Gostaríamos de usar os dados abertos do DOM-SC (dados.ciga.sc.gov.br) para identificar atos normativos ambientais dos municípios, como instruções normativas, resoluções e portarias de órgãos ambientais municipais. Como faríamos:
>
> - baixar os arquivos ZIP publicados nas páginas `/dataset`, três vezes por dia, depois de cada janela, sem usar a `/api/` (respeitando o robots.txt e o intervalo de 10 segundos);
> - `User-Agent` identificado (`Grama-coletor/1.0`), fora do horário de pico;
> - guardar só os atos normativos ambientais e seus metadados (município, entidade, data e link). Retiramos qualquer CPF antes de gravar e não guardamos atos de pessoal.
>
> Pedimos a autorização do CIGA para esse uso e, se houver, a licença dos dados ou condições a seguir. Também ficamos à disposição para ajustar a frequência.
>
> Atenciosamente,
> Eduardo · Grama
> [contato]

## 3. Imprensa Nacional · INLABS (DOU)

### 3.1 Cadastro no INLABS

- **Onde:** https://inlabs.in.gov.br, com e-mail e senha. O acesso é gratuito e o INLABS é o canal oficial para download automatizado do DOU.
- **Quem:** o Eduardo cria a conta com um e-mail do Grama (não pessoal). A senha vai só para o segredo da Edge Function no Supabase, nunca para o repositório nem para o front.
- **Quando:** antes do pacote L8. No teste de 20/11/2026 o INLABS estava em manutenção; antes de implementar, ler os termos de uso e o esquema do XML.
- **Uso previsto:** um download diário das seções DO1 e DO1E, até 1 requisição por segundo, com o ZIP original guardado no Storage.

### 3.2 Pedido opcional: leiturajornal como reserva

- **Para:** [canal de atendimento da Imprensa Nacional; o endereço não consta nas notas do estudo]
- **Quando:** só se o INLABS ficar fora do ar com frequência. Sem autorização escrita, o Grama não usa o leiturajornal: o robots.txt de www.in.gov.br proíbe robôs e o termo de uso pede permissão expressa por escrito.

**Assunto:** Pedido de autorização para consulta automatizada ao leiturajornal como reserva do INLABS (Grama)

> Prezados, bom dia.
>
> Sou o Eduardo, do Grama, um sistema para consultorias ambientais de Santa Catarina acompanharem licenças, condicionantes e as normas que as afetam.
>
> Usamos o INLABS para receber diariamente os atos do DOU (seção 1) e identificar normas ambientais de órgãos como MMA, CONAMA, IBAMA e ICMBio. Quando o INLABS está em manutenção, ficamos sem a edição do dia.
>
> Pedimos autorização, por escrito, para consultar a página leiturajornal (www.in.gov.br/leiturajornal) só nesses dias, como reserva. Como faríamos:
>
> - uma consulta por seção e por dia, apenas nos dias em que o INLABS não estiver disponível;
> - no máximo 1 requisição por segundo, fora do horário de pico, com `User-Agent` identificado (`Grama-coletor/1.0`);
> - guardar só atos normativos e metadados (órgão, tipo, data, edição e link). Retiramos qualquer CPF antes de gravar.
>
> Sem a autorização, seguimos apenas com o INLABS. Agradecemos a atenção.
>
> Atenciosamente,
> Eduardo · Grama
> [contato]
